require('dotenv').config();
if (!globalThis.crypto) { globalThis.crypto = require('node:crypto').webcrypto; }
// Final restart for admin account synchronization fix



// ─── STARTUP ENV VALIDATION ───────────────────────────────────────────────────
// Fail fast with a clear message rather than mysterious DB errors at query time.
(function validateEnv() {
    const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0) {
        console.error(
            `\n❌ [STARTUP] Missing required environment variables: ${missing.join(', ')}\n` +
            `   → Check your .env file. Server cannot start without DB configuration.\n`
        );
        process.exit(1);
    }
})();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const xiboService = require('./src/services/xibo.service');
const statsService = require('./src/services/stats.service');
const screenMonitor = require('./src/services/screen.monitor');
const { logActivity, ACTION, MODULE } = require('./src/services/activity-logger.service');
const { hasPermission } = require('./src/middleware/access.middleware');
const { dbRun, dbAll, dbGet } = require('./src/db/database');

const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

// Trust proxy for Nginx/Apache reverse proxies
app.set('trust proxy', 1);

// Enable gzip compression for better performance
app.use(compression());

app.use(cors({
    origin: (origin, callback) => {
        const allowed = process.env.ALLOWED_ORIGINS 
            ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
            : ['https://signtral.info', 'https://www.signtral.info'];
        
        // In development, also allow localhost if not explicitly in ALLOWED_ORIGINS
        if (process.env.NODE_ENV !== 'production') {
            if (!allowed.includes('http://localhost:3000')) allowed.push('http://localhost:3000');
            if (!allowed.includes('http://127.0.0.1:3000')) allowed.push('http://127.0.0.1:3000');
        }

        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

const cookieParser = require('cookie-parser');
app.use(cookieParser());
const { getAuth } = require('./src/auth.js');
let authHandler = null;
getAuth().then(({ handler }) => { authHandler = handler; }).catch(console.error);
app.all('/api/auth/*splat', (req, res, next) => {
    if (authHandler) return authHandler(req, res);
    next(new Error("Auth handler not ready"));
});

const io = new Server(server, { 
    cors: { 
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
        methods: ["GET", "POST"]
    } 
});
app.set('io', io);

app.get('/xibo/clean', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const pRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
            headers, params: { name: 'SCREEN_1_MAIN_LOOP', embed: 'widgets' }
        });
        const pl = (pRes.data||[])[0];
        if(!pl) return res.send('Playlist not found');

        const widgets = pl.widgets || [];
        let deleted = 0;
        for (const w of widgets) {
            if (!w.name.includes('Slot 4:')) {
                await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${w.widgetId}`, { headers }).catch(() => {});
                deleted++;
            }
        }
        res.send(`Deleted ${deleted} widgets. Try diagnosing again.`);
    } catch(err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

app.get('/xibo/diag2', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const plIdx = req.query.pid || 5;
        // Fetch playlist details
        const r1 = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
            headers, params: { playlistId: plIdx, embed: 'widgets' }
        });
        // Fetch layout details
        const layoutName = `SCREEN_1_MAIN_LAYOUT`;
        const lRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, {
            headers, params: { name: layoutName }
        });
        res.json({
            targetPlaylist: (r1.data||[])[0],
            mainLayout: (lRes.data||[])[0] || 'not found'
        });
    } catch(err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

app.get('/xibo/force_publish', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = 1;
        let msgs = [];

        // 1. Publish all active slot playlists
        const { dbAll } = require('./src/db/database');
        const localSlots = await dbAll('SELECT slot_number, playlist_id FROM slots WHERE displayId = ? AND mediaId IS NOT NULL', [displayId]);
        for (const slot of localSlots) {
            if (slot.playlist_id) {
                await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/publish/${slot.playlist_id}`, 'publish=1', { headers }).catch(e => msgs.push(`Playlist ${slot.playlist_id} publish error`));
                msgs.push(`Published Playlist ${slot.playlist_id}`);
            }
        }

        // 2. Publish Main Loop Playlist
        const mlRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LOOP`} });
        if (mlRes.data && mlRes.data.length > 0) {
            await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/publish/${mlRes.data[0].playlistId}`, 'publish=1', { headers }).catch(e => msgs.push('Main loop publish error'));
            msgs.push(`Published Main Loop ${mlRes.data[0].playlistId}`);
        }

        // 3. Publish Layout
        const lRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LAYOUT`} });
        if (lRes.data && lRes.data.length > 0) {
            await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/publish/${lRes.data[0].layoutId}`, 'publish=1', { headers }).catch(e => msgs.push('Layout publish error'));
            msgs.push(`Published Layout ${lRes.data[0].layoutId}`);
        }

        // 4. Collect Now
        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${displayId}/action/collectNow`, '', { headers }).catch(() => {});

        res.json({ success: true, msgs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/xibo/force_sync', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = req.query.id || 3; // Default to Screen 01 (ID 3)
        
        let logs = [];
        
        // Step 1: Fetch Main Loop Playlist
        const mlResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
            headers, params: { name: `SCREEN_${displayId}_MAIN_LOOP`, embed: 'widgets' }
        });
        const mainLoop = mlResp.data[0];
        if (!mainLoop) return res.json({ error: 'Main loop not found' });
        logs.push(`Main Loop ID: ${mainLoop.playlistId}`);

        // Step 2: Clear existing widgets
        const existingWidgets = mainLoop?.widgets || [];
        logs.push(`Found ${existingWidgets.length} existing widgets.`);
        for (const w of existingWidgets) {
            await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${w.widgetId}`, { headers })
                .catch(e => logs.push(`Delete Error: ${e.response?.data?.message || e.message}`));
        }

        // Step 3: Assign active media directly from DB
        const { dbAll } = require('./src/db/database');
        const localSlots = await dbAll('SELECT slot_number, mediaId FROM slots WHERE displayId = ? AND mediaId IS NOT NULL ORDER BY slot_number ASC', [displayId]);
        logs.push(`Found ${localSlots.length} local slots with active media.`);
        for (const slot of localSlots) {
            await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/library/assign/${mainLoop.playlistId}`, 
                `media[0]=${slot.mediaId}&duration=13&useDuration=1`,
                { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
            ).catch(e => logs.push(`Assign Error slot ${slot.slot_number}: ${e.response?.data?.message || e.message}`));
            logs.push(`Assigned Media ${slot.mediaId} to slot ${slot.slot_number}`);
        }

        // Step 4: Find or create a Fullscreen Layout wrapping the Main Loop
        const layoutName = `SCREEN_${displayId}_MAIN_LAYOUT`;
        let layoutData = null;
        const lRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { name: layoutName } });
        layoutData = (lRes.data || [])[0];
        let campaignId = layoutData?.campaignId;

        // Fetch Screen Orientation
        const { dbGet } = require('./src/db/database');
        const screenInfo = await dbGet('SELECT orientation FROM screens WHERE xibo_display_id = ?', [displayId]);
        const resId = (screenInfo && screenInfo.orientation && screenInfo.orientation.toLowerCase() === 'portrait') ? 3 : 1;

        if (layoutData && Number(layoutData.resolutionId) !== Number(resId)) {
            logs.push(`Resolution mismatch (${layoutData.resolutionId} != ${resId}). Deleting old layout ${layoutData.layoutId}...`);
            await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${layoutData.layoutId}`, { headers }).catch(() => {});
            layoutData = null; // Force recreation
        }

        if (!layoutData) {
            logs.push(`Creating fullscreen layout: ${layoutName} (resId: ${resId})`);
            const fsParams = new URLSearchParams();
            fsParams.append('name', layoutName);
            fsParams.append('resolutionId', resId);
            fsParams.append('playlistId', mainLoop.playlistId);
            const fsRes = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/fullscreen`, fsParams.toString(), {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            }).catch(e => { logs.push(`Layout create error: ${e.response?.data?.message || e.message}`); return null; });
            if (fsRes?.data) {
                campaignId = fsRes.data.campaignId;
                layoutData = fsRes.data;
                logs.push(`Created layout ${fsRes.data.layoutId}, campaignId: ${campaignId}`);
                
                // Rename the layout so our future searches find it
                await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${layoutData.layoutId}`, `name=${layoutName}`, {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                }).catch(() => {});
            }
        } else {
            logs.push(`Found existing layout ${layoutData.layoutId}, campaignId: ${campaignId}`);
        }

        // Step 5: Publish the layout
        if (layoutData?.layoutId) {
            await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/publish/${layoutData.layoutId}`, 'publish=1', {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            }).catch(e => logs.push(`Publish error: ${e.response?.data?.message || e.message}`));
            logs.push(`Published layout ${layoutData.layoutId}`);
        }

        // Step 6: Get the display's displayGroupId
        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers, params: { displayId } });
        const display = (dRes.data || []).find(d => Number(d.displayId) === Number(displayId));
        const displayGroupId = display?.displayGroupId || displayId;
        logs.push(`Display Group ID: ${displayGroupId}`);

        // Step 7: Create schedule if missing
        if (campaignId) {
            const schedRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId } });
            const existing = (schedRes.data || []).find(s => Number(s.campaignId) === Number(campaignId));
            if (!existing) {
                logs.push(`No schedule found — creating one for campaign ${campaignId}...`);
                const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
                const schedParams = new URLSearchParams();
                schedParams.append('eventTypeId', 1);
                schedParams.append('campaignId', campaignId);
                schedParams.append('displayGroupIds[]', displayGroupId);
                schedParams.append('fromDt', now);
                schedParams.append('toDt', '2036-01-01 00:00:00');
                schedParams.append('isPriority', 1);
                schedParams.append('displayOrder', 1);
                const sched = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, schedParams.toString(), {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                }).catch(e => { logs.push(`Schedule error: ${e.response?.data?.message || e.message}`); return null; });
                if (sched?.data) logs.push(`✅ Schedule created: EventID ${sched.data.eventId}`);
            } else {
                logs.push(`Schedule already exists: EventID ${existing.eventId}`);
            }
        }

        // Step 8: Trigger collect now
        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${displayGroupId}/action/collectNow`, '', {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});
        logs.push(`Triggered collectNow on group ${displayGroupId}`);

        res.json({ success: true, logs });
    } catch(err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

app.get('/xibo/reset_layout', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = req.query.id || 3;
        let logs = [];

        // Step 1: Delete the broken existing layout
        const lRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LAYOUT` } });
        const oldLayout = (lRes.data || [])[0];
        if (oldLayout) {
            // First delete any schedule pointing at this campaign
            const dRes2 = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers, params: { displayId } });
            const display = (dRes2.data || []).find(d => Number(d.displayId) === Number(displayId));
            const dgId = display?.displayGroupId || displayId;
            const schedRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId: dgId } });
            for (const s of (schedRes.data || [])) {
                await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule/${s.eventId}`, { headers }).catch(() => {});
                logs.push(`Deleted schedule EventID ${s.eventId}`);
            }
            // Delete the layout
            await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${oldLayout.layoutId}`, { headers })
                .catch(e => logs.push(`Layout delete error: ${e.response?.data?.message || e.message}`));
            logs.push(`Deleted old layout ${oldLayout.layoutId}`);
        }

        // Step 2: Get main loop playlist ID
        const mlRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LOOP` } });
        const mainLoop = (mlRes.data || [])[0];
        if (!mainLoop) return res.json({ error: 'Main loop not found — cannot create layout' });
        logs.push(`Main Loop: ${mainLoop.playlistId}`);

        // Step 3: Create fresh fullscreen layout wrapping the playlist
        const fsParams = new URLSearchParams();
        fsParams.append('id', mainLoop.playlistId);
        fsParams.append('type', 'playlist');
        fsParams.append('backgroundColor', '#000000');
        const fsRes = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/fullscreen`, fsParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(e => { logs.push(`Create error: ${e.response?.data?.message || e.message}`); return null; });
        
        if (!fsRes?.data) return res.json({ error: 'Failed to create new layout', logs });
        const newLayout = fsRes.data;
        logs.push(`Created layout ${newLayout.layoutId}, campaignId: ${newLayout.campaignId}, status: ${newLayout.publishedStatus}`);

        // Rename the new layout to the expected name
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${newLayout.layoutId}`, `name=SCREEN_${displayId}_MAIN_LAYOUT`, {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(e => logs.push(`Rename error: ${e.message}`));

        // Step 4: Publish the new layout
        const pubRes = await axios.put(
            `${xiboService.baseUrl}${xiboService._apiPrefix}/layout/publish/${newLayout.layoutId}`,
            new URLSearchParams({ publish: 1 }).toString(),
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        ).catch(e => ({ error: e.response?.data }));
        logs.push(`Publish result: publishedStatus=${pubRes?.data?.publishedStatus || JSON.stringify(pubRes?.error)}`);

        // Step 5: Create schedule
        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers, params: { displayId } });
        const display = (dRes.data || []).find(d => Number(d.displayId) === Number(displayId));
        const dgId = display?.displayGroupId || displayId;
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const sParams = new URLSearchParams();
        sParams.append('eventTypeId', 1);
        sParams.append('campaignId', newLayout.campaignId);
        sParams.append('displayGroupIds[]', dgId);
        sParams.append('fromDt', now);
        sParams.append('toDt', '2036-01-01 00:00:00');
        sParams.append('isPriority', 1);
        sParams.append('displayOrder', 1);
        const schedRes2 = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, sParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(e => ({ error: e.response?.data }));
        logs.push(`Schedule: EventID=${schedRes2?.data?.eventId || JSON.stringify(schedRes2?.error)}`);
        
        // Step 6: CollectNow
        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${dgId}/action/collectNow`, '', {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});
        logs.push(`CollectNow triggered`);

        res.json({ success: true, logs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/xibo/publish_now', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = req.query.id || 3;
        let logs = [];

        // Get layout
        const lRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LAYOUT` } });
        const layout = (lRes.data || [])[0];
        if (!layout) return res.json({ error: 'Layout not found' });
        logs.push(`Layout ID: ${layout.layoutId}, current status: ${layout.publishedStatus}`);

        // Try multiple publish approaches
        // Approach 1: PUT with form data
        const r1 = await axios.put(
            `${xiboService.baseUrl}${xiboService._apiPrefix}/layout/publish/${layout.layoutId}`,
            new URLSearchParams({ publish: 1 }).toString(),
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        ).catch(e => ({ error: e.response?.data }));
        logs.push(`Publish attempt 1: ${JSON.stringify(r1?.data || r1?.error)}`);

        // Approach 2: POST to checkout/publish (Xibo v4 workflow)
        const r2 = await axios.post(
            `${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${layout.layoutId}/publish`,
            '',
            { headers }
        ).catch(e => ({ error: e.response?.data }));
        logs.push(`Publish attempt 2: ${JSON.stringify(r2?.data || r2?.error)}`);

        // Check new status
        const lRes2 = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LAYOUT` } });
        const layout2 = (lRes2.data || [])[0];
        logs.push(`New layout status: ${layout2?.publishedStatus}, isValid: ${layout2?.isValid}`);

        // Get displayGroupId and force collect
        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers, params: { displayId } });
        const display = (dRes.data || []).find(d => Number(d.displayId) === Number(displayId));
        const dgId = display?.displayGroupId || displayId;
        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${dgId}/action/collectNow`, '', {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});
        logs.push(`CollectNow triggered on group ${dgId}`);

        res.json({ success: true, logs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/xibo/clean_schedules', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = req.query.id || 3;
        const campaignId = req.query.campaignId || 8;
        let logs = [];

        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayId=${displayId}`, { headers });
        const dgId = (dRes.data || [])[0]?.displayGroupId || displayId;

        const sRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId: dgId } });
        const schedules = sRes.data || [];
        logs.push(`Found ${schedules.length} schedules. DELETING ALL.`);

        for (const s of schedules) {
            await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule/${s.eventId}`, { headers }).catch(e => logs.push(`Delete Err: ${e.message}`));
            logs.push(`Deleted EventID: ${s.eventId}`);
        }

        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const sParams = new URLSearchParams();
        sParams.append('eventTypeId', 1);
        sParams.append('campaignId', campaignId);
        sParams.append('displayGroupIds[]', dgId);
        sParams.append('fromDt', now);
        sParams.append('toDt', '2036-01-01 00:00:00');
        sParams.append('isPriority', 1);
        sParams.append('displayOrder', 1);
        const schedRes = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, sParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        logs.push(`New EventID created: ${schedRes.data.eventId}`);

        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${dgId}/action/collectNow`, '', {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});
        logs.push(`CollectNow triggered.`);

        res.json({ success: true, logs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/xibo/display_status', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = req.query.id || 3;

        // Display info
        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers, params: { displayId } });
        const display = (dRes.data || []).find(d => Number(d.displayId) === Number(displayId));

        // Get displayGroupId first (needed for schedule queries)
        const displayGroupId = display?.displayGroupId || displayId;

        // Layout status - search by campaignId from active schedule
        const sRes2 = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId } });
        const activeSchedule = (sRes2.data || [])[0];
        let layout = null;
        if (activeSchedule?.campaignId) {
            const lRes2 = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { campaignId: activeSchedule.campaignId } });
            layout = (lRes2.data || [])[0];
        }
        if (!layout) {
            const lRes3 = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers });
            layout = (lRes3.data || []).find(l => l.layout?.includes(`SCREEN_${displayId}`) || l.name?.includes(`SCREEN_${displayId}`));
        }

        // Schedule
        const sRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId } });

        // Media validity check
        const { dbAll } = require('./src/db/database');
        const activeSlots = await dbAll('SELECT slot_number, mediaId FROM slots WHERE displayId = ? AND mediaId IS NOT NULL', [displayId]);
        const mediaSummary = [];
        for (const s of activeSlots) {
            const mRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/library`, { headers, params: { mediaId: s.mediaId } }).catch(() => null);
            if (mRes?.data?.[0]) {
                const m = mRes.data[0];
                mediaSummary.push({ slot: s.slot_number, mediaId: s.mediaId, name: m.name, valid: m.valid, mediaType: m.mediaType, fileSize: m.fileSize });
            }
        }

        res.json({
            display: display ? {
                id: display.displayId, status: display.status,
                loggedIn: display.loggedIn, currentLayout: display.currentLayout,
                storageAvailable: display.storageAvailable, statusDescription: display.statusDescription
            } : 'not found',
            layout: layout ? {
                id: layout.layoutId, status: layout.status, isValid: layout.isValid,
                publishedStatus: layout.publishedStatus, campaignId: layout.campaignId,
                statusMessage: layout.statusMessage
            } : 'not found',
            schedules: (sRes.data || []).map(s => ({ eventId: s.eventId, eventTypeId: s.eventTypeId, campaignId: s.campaignId, fromDt: s.fromDt, toDt: s.toDt })),
            mediaSummary
        });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/xibo/diagnose', async (req, res) => {
    try {
        const xiboService = require('./src/services/xibo.service');
        const headers = await xiboService.getHeaders();
        const displayId = req.query.displayId || 1;
        
        // Get Displays
        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers }).catch(e => e.response);
        const display = (dRes.data || []).find(d => Number(d.displayId) === Number(displayId));
        
        // Get Schedule for display group
        const syncId = display ? (display.displayGroupId || displayId) : displayId;
        const sRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId: syncId } }).catch(e => e.response);
        
        // Check XMR status
        const xmrStatus = display ? display.xmrRegistered : null;

        // Get Main Loop Playlist
        const pRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, { headers, params: { name: `SCREEN_${displayId}_MAIN_LOOP`, embed: 'widgets' } }).catch(e => e.response);
        const playlist = (pRes.data || [])[0];

        res.json({
            display: display || 'Not Found',
            xmrStatus,
            schedules: sRes.data || [],
            mainLoopPlaylist: playlist || 'Not Found'
        });
    } catch(err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

const PORT = process.env.PORT || 3000;

// ─── LAZY ENV ACCESSORS ───────────────────────────────────────────────────────
// These always reflect the CURRENT process.env, which gets reloaded by the
// .env watcher below. Use these getters instead of cached constants so that
// changing XIBO_BASE_URL (or swapping Xibo applications) takes effect instantly.
const getXiboBaseUrl    = () => xiboService.baseUrl;
const getXiboClientId   = () => xiboService.clientId;
const getXiboSecret     = () => xiboService.clientSecret;

// Legacy global aliases (now backed by XiboService)
Object.defineProperty(global, 'XIBO_BASE_URL',    { get: getXiboBaseUrl,  configurable: true });
Object.defineProperty(global, 'XIBO_CLIENT_ID',   { get: getXiboClientId, configurable: true });
Object.defineProperty(global, 'XIBO_CLIENT_SECRET',{ get: getXiboSecret,  configurable: true });

// ─── .ENV AUTO-RELOAD WATCHER ─────────────────────────────────────────────────
// When you save a new XIBO_BASE_URL, CLIENT_ID, or CLIENT_SECRET in .env, the
// watcher re-runs dotenv, flushes the old OAuth token, and the *next* API call
// automatically re-authenticates with the new credentials — zero restarts needed.
(function watchEnvFile() {
    if (process.env.NODE_ENV === 'production') return; // Skip watcher in production
    const envPath = path.resolve(__dirname, '.env');
    let debounceTimer = null;

    const reload = () => {
        try {
            // Re-read .env into process.env (override = true replaces stale values)
            require('dotenv').config({ path: envPath, override: true });

            // Flush the cached OAuth token so XiboService re-authenticates
            xiboService.invalidateToken();

            // Re-run a health check to confirm the new credentials work,
            // then auto-discover all IDs (placeholder media, screen playlists)
            // so SCREEN_X_PLAYLIST_ID / PLACEHOLDER_MEDIA_ID are never stale.
            xiboService.getAccessToken()
                .then(async () => {
                    console.log(`[ENV Watcher] ✅ .env reloaded — Xibo re-authenticated with ${getXiboBaseUrl()}`);
                    // Auto-discover: gets placeholder media ID + all screen playlist IDs
                    const discovered = await xiboService.autoDiscoverConfig();
                    if (discovered.placeholder_media_id) {
                        process.env.PLACEHOLDER_MEDIA_ID = String(discovered.placeholder_media_id);
                        console.log(`[ENV Watcher] 🔍 Auto-set PLACEHOLDER_MEDIA_ID=${discovered.placeholder_media_id} ("${discovered.placeholder_media_name}")`);
                    }
                    for (const sp of (discovered.screen_playlists || [])) {
                        process.env[sp.envKey] = String(sp.playlistId);
                        console.log(`[ENV Watcher] 🔍 Auto-set ${sp.envKey}=${sp.playlistId}`);
                    }
                    if (discovered.warnings?.length) {
                        discovered.warnings.forEach(w => console.warn(`[ENV Watcher] ⚠️  ${w}`));
                    }
                })
                .catch(err => console.error(`[ENV Watcher] ❌ .env reloaded but Xibo auth FAILED: ${err.message}`));

        } catch (err) {
            console.error('[ENV Watcher] Failed to reload .env:', err.message);
        }
    };

    try {
        fs.watch(envPath, (eventType) => {
            if (eventType !== 'change') return;
            // Debounce: editors can fire multiple events on a single save
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log('[ENV Watcher] 🔍 .env file changed — reloading environment...');
                reload();
            }, 300);
        });
        console.log(`[ENV Watcher] 👁  Watching ${envPath} for credential changes.`);
    } catch (err) {
        console.warn('[ENV Watcher] Could not watch .env file:', err.message);
    }
})();

// ─── STARTUP XIBO HEALTH CHECK ────────────────────────────────────────────────
// Validates that the current Xibo credentials work on every server start.
// Non-blocking — server continues to boot even if Xibo is unreachable.
(async function startupXiboCheck() {
    if (!getXiboBaseUrl() || !getXiboClientId()) {
        console.warn('[Xibo] ⚠️  XIBO_BASE_URL or XIBO_CLIENT_ID not set in .env — Xibo features disabled.');
        return;
    }
    try {
        await xiboService.getAccessToken();
        console.log(`[Xibo] ✅ Connected to Xibo CMS at ${getXiboBaseUrl()}`);
    } catch (err) {
        console.error(`[Xibo] ❌ Could not connect to Xibo: ${err.message}`);
        console.error(`[Xibo]    → Check XIBO_BASE_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET in .env`);
    }
})();



// helmet sets security-related HTTP headers in one call.
// We configure a Content Security Policy (CSP) to harden against XSS attacks.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://unpkg.com", 
                "https://cdn.socket.io", 
                "https://cdn.jsdelivr.net",
                "https://www.google-analytics.com"
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://fonts.googleapis.com", 
                "https://unpkg.com"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'", "https://cms.signtral.info", "https://api.signtral.info", "wss://signtral.info", "ws://localhost:3000"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    }
}));



app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// 100 requests per 15 minutes per IP on all /api/ routes.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: 'draft-7', // Return RateLimit headers
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    skip: (req) => {
        // Skip rate limiting for the auth routes so login is never locked out
        return req.path.startsWith('/api/auth');
    }
});

// --- Portal Routes (Serve HTML with correct Content-Type) ---

// 1. Web App / Homepage
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Admin Portal
app.get('/admin', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// 3. Brand Portal
app.get('/brand', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'brandportal', 'index.html'));
});

// 4. Partner Portal
app.get('/partner', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'partnerportal', 'index.html'));
});

app.get('/health', (req, res) => res.json({ status: 'OK', uptime: process.uptime() }));



const authRoutes = require('./src/routes/auth.routes');
// Legacy auth routes are temporarily kept for any fallback, but most frontends should use /api/auth
app.use('/auth', authRoutes);

/**
 * authenticateToken
 * Specific middleware for API Bearer token validation or session validation.
 * Keeps /health, /status, and /api/auth public.
 */
const authenticateToken = async (req, res, next) => {
    const publicPaths = ['/health', '/status', '/api/auth'];
    if (publicPaths.some(p => req.path.startsWith(p))) return next();

    try {
        const { auth } = await getAuth();
        const { fromNodeHeaders } = await import('better-auth/node');
        
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });
        
        if (!session) return res.status(401).json({ error: 'Unauthorized' });

        req.user = session.user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

const apiRoutes = require('./src/routes/api.routes');
// Apply rate limiter to all /api routes
app.use('/api', apiLimiter, authenticateToken, apiRoutes);

const screenRoutes = require('./src/routes/screen.routes');
app.use('/api/screens', authenticateToken, screenRoutes);

const campaignRoutes = require('./src/routes/campaign.routes');
app.use('/api/campaigns', authenticateToken, campaignRoutes);

const creativeRoutes = require('./src/routes/creative.routes');
app.use('/api/creative', authenticateToken, creativeRoutes);

// Mount Protected Admin APIs
const adminRoutes = require('./src/routes/admin.routes');
const { authMiddleware } = require('./src/middleware/auth.middleware');
app.use('/admin/api', apiLimiter, authMiddleware, adminRoutes);

// Protect Xibo proxy routes
app.use('/xibo', apiLimiter, authMiddleware);

// Mount Brand & Partner routes
const brandRoutes = require('./src/routes/brand.routes');
const partnerRoutes = require('./src/routes/partner.routes');

// API prefixes
app.use('/api/brand', apiLimiter, authMiddleware, brandRoutes);
app.use('/api/partner', apiLimiter, authMiddleware, partnerRoutes);

// Portal prefixes (compatibility)
app.use('/brandportal/api', apiLimiter, authMiddleware, hasPermission('own_creative:manage'), (req, res, next) => {
    if (!req.user.brand_id && req.user.role === 'Brand') return res.status(400).json({ error: 'No brand assigned to this user' });
    next();
}, brandRoutes);

app.use('/partnerportal/api', apiLimiter, authMiddleware, hasPermission('own_screens:manage'), (req, res, next) => {
    if (!req.user.partner_id && req.user.role === 'Partner') return res.status(400).json({ error: 'No partner assigned to this user' });
    next();
}, partnerRoutes);


// Set up Multer for temp file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Use xiboService for authentication
async function authHeader() {
  return await xiboService.getHeaders();
}

/**
 * Diagnostic Route for Permissions
 */
app.get('/xibo/diag', async (req, res) => {
  try {
    const health = await xiboService.getHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: 'Diagnostic Failed', detail: err.message });
  }
});

app.get('/xibo/diag/module/:type', async (req, res) => {
    try {
        const headers = await authHeader();
        const resp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/module`, { headers });
        const module = (resp.data || []).find(m => m.type === req.params.type);
        res.json(module || { error: 'Module not found' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Routes ──────────────────────────────────────────────────────────────────


/**
 * GET /xibo/library
 * Returns a list of images and videos from the CMS media library.
 */
app.get('/xibo/library', async (req, res) => {
  try {
    const data = await xiboService.getLibrary();
    const items = data
      .filter(item => ['image', 'video'].includes(item.mediaType))
      .map(item => ({
        mediaId: item.mediaId,
        name: item.name,
        type: item.mediaType,
        size: item.fileSize,
        duration: item.duration,
      }));

    res.json(items);
  } catch (err) {
    console.error('[GET /xibo/library]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /xibo/library/download/:mediaId
 * Proxy for downloading a media item or its thumbnail from Xibo.
 */
app.get('/xibo/library/download/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { thumbnail } = req.query;
    const headers = await xiboService.getHeaders();
    
    // Redirecting directly to Xibo download endpoint often fails due to auth, 
    // so we stream it through the server.
    const url = `${xiboService.baseUrl}${xiboService._apiPrefix}/library/download/${mediaId}${thumbnail ? '?thumbnail=1' : ''}`;
    
    const response = await axios({
      method: 'get',
      url,
      headers,
      responseType: 'stream'
    });

    res.set('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (err) {
    console.error('[GET /xibo/library/download]', err.message);
    res.status(err.response?.status || 500).send(err.message);
  }
});

/**
 * GET /xibo/displays/locations
 * Returns displayId -> location info map for enriching stats records.
 */
app.get('/xibo/displays/locations', async (req, res) => {
  try {
    let rawDisplays = [];
    try {
        rawDisplays = await xiboService.getDisplays();
    } catch (e) {
        console.warn('[Xibo] Displays locations unreachable:', e.message);
        return res.json({}); 
    }
    
    // Handle syncing object { syncing: true, data: [] } or raw array
    const displays = rawDisplays.data || (Array.isArray(rawDisplays) ? rawDisplays : []);
    const isSyncing = rawDisplays.syncing || false;

    const { dbAll } = require('./src/db/database');
    const localScreens = await dbAll('SELECT xibo_display_id, latitude, longitude, address FROM screens WHERE xibo_display_id IS NOT NULL');
    
    const map = {};
    for (const d of displays) {
      const local = localScreens.find(s => String(s.xibo_display_id) === String(d.displayId));
      
      let lat = d.latitude || (local ? local.latitude : null);
      let lng = d.longitude || (local ? local.longitude : null);
      let address = d.address || (local ? local.address : '');

      if (lat === 0 && lng === 0) {
          lat = local ? local.latitude : null;
          lng = local ? local.longitude : null;
      }

      // Build a human-readable location string
      let location = address || '';
      if (!location && lat && lng) {
        location = lat.toFixed(4) + ', ' + lng.toFixed(4);
      }
      if (!location && d.timeZone) {
          location = d.timeZone.replace(/_/g, ' ');
      } else if (!location) {
          location = 'Unknown';
      }

      map[d.displayId] = {
        id: d.displayId,
        name: d.display,
        address: address,
        lat: lat,
        lng: lng,
        timezone: d.timeZone || '',
        device: [d.brand, d.model].filter(Boolean).join(' ') || d.clientType || '',
        location, 
        online: d.loggedIn === 1 || d.loggedIn === true,
        lastAccessed: d.lastAccessed || null,
        clientAddress: d.clientAddress || '',
        displayGroupId: d.displayGroupId || null,
        resolution: d.resolution || ''
      };
    }
    res.set('Cache-Control', 'no-store');
    res.json({
        syncing: isSyncing,
        data: map
    });
  } catch (err) {
    console.error('[GET /xibo/displays/locations]', err.message);
    res.status(500).json({ error: err.message });
  }
});



// --- Simple Caches for Rate Limit Resilience ---
let displaysCache = null;
let displaysCacheTime = 0;
let statsCache = null;
let statsCacheTime = 0;
const CACHE_TTL = 60000; // 60 seconds
const DISPLAYS_CACHE_TTL = 30000; // 30 seconds

app.get('/xibo/displays', async (req, res) => {
    // Check Cache
    const now = Date.now();
    if (displaysCache && (now - displaysCacheTime < DISPLAYS_CACHE_TTL)) {
        return res.json(displaysCache);
    }

    try {
        const headers = await authHeader();
        
        // 1. Get all displays
        const response = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, { headers });
        
        // 2. Batch fetch ALL playlists that follow our naming convention
        // This avoids N separate API calls for N displays.
        const allPlaylistsResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
            headers,
            params: { name: 'SCREEN_', length: 1000 }
        });
        const allPlaylists = allPlaylistsResp.data || [];

        const displays = response.data.map((d) => {
            // Find MAIN_LOOP or legacy PLAYLIST in the pre-fetched list
            const mainLoopName = `SCREEN_${d.displayId}_MAIN_LOOP`;
            const legacyName = `SCREEN_${d.displayId}_PLAYLIST`;
            
            const playlist = allPlaylists.find(p => (p.playlist === mainLoopName || p.name === mainLoopName)) 
                          || allPlaylists.find(p => (p.playlist === legacyName || p.name === legacyName));
            
            const playlistId = playlist ? playlist.playlistId : null;

            // Custom Online Logic: 
            // In Xibo v4, d.loggedIn is the most direct indicator.
            const lastAccessedTime = d.lastAccessed ? new Date(d.lastAccessed + ' UTC').getTime() : 0;
            const isOnline = Number(d.loggedIn) === 1 || (Date.now() - lastAccessedTime < 24 * 60 * 60 * 1000);

            return {
                displayId: d.displayId,
                displayGroupId: d.displayGroupId,
                name: d.display,
                isOnline: isOnline,
                playlistId: playlistId
            };
        });
        
        // Update Cache
        displaysCache = displays;
        displaysCacheTime = Date.now();

        res.json(displays);
    } catch (err) {
        console.error('[GET /xibo/displays]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /xibo/stats/live (Phase 5: Live Now Playing)
 * Returns the most recent play for each display from the last 15 mins.
 */
app.get('/xibo/stats/live', async (req, res) => {
    try {
        const snapshot = await statsService.getLiveSnapshot();
        res.json({ success: true, snapshot });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /xibo/stats/weekly
 * Returns aggregated plays per day over the last 7 days for the chart.
 */
app.get('/xibo/stats/weekly', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const result = await statsService.getWeeklyStats();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /xibo/stats/recent
 * Returns all recent plays, merging Xibo API stats with local logs.
 */
app.get('/xibo/stats/recent', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const result = await statsService.getRecentStats();
    res.json(result);
  } catch (err) {
    console.error('[GET /xibo/stats/recent]', err.message);
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /xibo/stats
 * Params: mediaId
 * Returns play count and history timestamps.
 */
app.get('/xibo/stats', async (req, res) => {
  const { mediaId } = req.query;
  if (!mediaId) return res.status(400).json({ error: 'mediaId is required.' });
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const result = await statsService.getMediaStats(mediaId);
    res.json(result);
  } catch (err) {
    console.error('[GET /xibo/stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /xibo/stats/media-summary
 * Returns a system-wide summary of play counts for all media.
 */
app.get('/xibo/stats/media-summary', async (req, res) => {
    try {
        const summary = await statsService.getAllMediaStats();
        res.json(summary);
    } catch (err) {
        console.error('[GET /xibo/stats/media-summary]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /xibo/stats/diag
 * Deep diagnostic for PoP stats synchronization.
 */
app.get('/xibo/stats/diag', async (req, res) => {
    try {
        const stats = {
            timestamp: new Date().toISOString(),
            database: 'Checking...',
            xibo: 'Checking...',
            aggregationTask: 'Checking...',
            rawHitsSample: 0
        };

        // 1. DB Check
        try {
            await dbGet('SELECT 1');
            stats.database = 'Connected ✅';
        } catch (e) { stats.database = `Error: ${e.message} ❌`; }

        // 2. Xibo Check
        try {
            const xinfo = await xiboService.getAccessToken();
            stats.xibo = 'Authenticated ✅';
        } catch (e) { stats.xibo = `Auth Failed: ${e.message} ❌`; }

        // 3. Xibo Task Check
        try {
            const headers = await xiboService.getHeaders();
            const tres = await axios.get(`${xiboService.baseUrl}/api/task`, { headers, params: { length: 50 } });
            const allTasks = tres.data || [];
            stats.taskNames = allTasks.map(t => t.name);
            const agg = allTasks.find(t => 
                t.name?.toLowerCase().includes('aggregation') || 
                t.class?.toLowerCase().includes('aggregation') ||
                t.name?.toLowerCase().includes('stats')
            );
            stats.aggregationTask = agg ? (agg.isActive ? 'Active ✅' : 'Inactive ⚠️') : 'Not Found ❌';
        } catch (e) { stats.aggregationTask = `Error: ${e.message}`; }

        // 4. Raw Hits Check (last 24 hours) — More breadth to catch data gaps
        try {
            const now = new Date();
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const pad = (n) => n.toString().padStart(2, '0');
            const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            
            const raw = await xiboService.getStats('raw', { fromDt: fmt(twentyFourHoursAgo), toDt: fmt(now), length: 100 });
            stats.rawHitsSample = (Array.isArray(raw) ? raw : (raw.data || [])).length;
            
            // 5. Display Config Check — Full debug
            const displays = await xiboService.getDisplays();
            const allD = Array.isArray(displays) ? displays : (displays.data || []);
            stats.displayStatsConfig = allD.map(d => ({
                id: d.displayId,
                name: d.display,
                statsEnabled: d.statsEnabled,
                auditUntil: d.auditUntil,
                isLoggedIn: d.isLoggedIn,
                lastAccessed: d.lastAccessed,
                inc: Object.keys(d) // See all keys available
            }));
        } catch (e) { stats.rawHitsSample = `Error: ${e.message}`; }

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /xibo/displays/:displayId/sync
 (Phase 5: Force Sync)
 * Triggers a collectNow and re-enables auditing/stats.
 */
app.post('/xibo/displays/:displayId/sync', async (req, res) => {
    const { displayId } = req.params;
    try {
        const result = await statsService.forceSync(displayId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rate-limit guard: only run the heavy sync once every 55 seconds
let _forceSyncLastRun = 0;
let _forceSyncInProgress = null;

/**
 * POST /xibo/displays/force-sync-all
 * Correct Xibo v4 implementation:
 *   - displayGroup collectNow (display-level returns 404 in v4)
 *   - requestscreenshot to wake display
 *   - Server-side rate-limited to once per 55s to prevent multi-tab hammering
 */
app.post('/xibo/displays/force-sync-all', async (req, res) => {
    const now = Date.now();
    const COOLDOWN_MS = 55 * 1000; // 55 seconds

    // If a sync ran recently, return the cached result immediately
    if (now - _forceSyncLastRun < COOLDOWN_MS) {
        const nextIn = Math.ceil((COOLDOWN_MS - (now - _forceSyncLastRun)) / 1000);
        return res.json({ success: true, synced: 1, cached: true, nextSyncIn: nextIn, message: `Already synced recently. Next sync in ${nextIn}s.` });
    }

    // If a sync is already in-flight, wait for it
    if (_forceSyncInProgress) {
        try {
            const result = await _forceSyncInProgress;
            return res.json({ ...result, cached: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
    // Run the actual sync work, tracked in _forceSyncInProgress
    _forceSyncInProgress = (async () => {
        const rawDisplays = await xiboService.getDisplays();
        const displays = rawDisplays.data || (Array.isArray(rawDisplays) ? rawDisplays : []);
        const headers  = await xiboService.getHeaders();
        const results  = [];

        await Promise.all(displays.map(async (d) => {
            const dId = d.displayId;
            try {
                // 1. Extend auditing to 2027
                await xiboService.updateDisplayAuditing(dId, '2027-12-31 00:00:00');

                // 2. collectNow via displayGroup (correct v4 endpoint)
                if (d.displayGroupId) {
                    await axios.post(
                        `${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${d.displayGroupId}/action/collectNow`,
                        new URLSearchParams(),
                        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
                    ).catch(e => console.warn(`[force-sync-all] displaygroup collectNow ${dId}:`, e.response?.status));
                }

                // 3. Wake display with screenshot request
                await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/display/requestscreenshot/${dId}`, null, { headers }).catch(() => {});

                results.push({ displayId: dId, name: d.display, status: 'ok' });
            } catch (e) {
                results.push({ displayId: dId, name: d.display, status: 'error', error: e.message });
            }
        }));

        // 5. Clear all server caches
        statsService.invalidateCache();

        console.log(`[force-sync-all] Synced ${results.length} display(s). Caches cleared.`);
        return { success: true, synced: results.length, results };
    })();

    try {
        const result = await _forceSyncInProgress;
        _forceSyncLastRun = Date.now(); // stamp AFTER success
        res.json(result);
    } catch (err) {
        console.error('[POST /xibo/displays/force-sync-all]', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        _forceSyncInProgress = null;
    }
});

// --- Routes End ---



/**
 * POST /xibo/upload
 * The 5-step flow for Xibo v4.4.0
 */
app.get('/xibo/upload-log', (req, res) => {
  const logPath = path.join(__dirname, 'upload_log.json');
  if (fs.existsSync(logPath)) {
    try {
      const data = fs.readFileSync(logPath, 'utf8');
      res.json(JSON.parse(data));
    } catch (err) {
      res.status(500).json({ error: 'Failed to parse upload_log.json' });
    }
  } else {
    res.json([]);
  }
});

let testCache = null;
let testCacheTime = 0;

app.get('/xibo/stats/test', async (req, res) => {
  if (testCache && (Date.now() - testCacheTime < CACHE_TTL)) {
    return res.json(testCache);
  }

  try {
    const headers = await authHeader();
    
    // 1. Fetch Stats as before
    const [mediaRes, layoutRes, tasksRes, logsRes] = await Promise.all([
      axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/stats`, {
        headers,
        params: { type: 'media', fromDt: '2026-01-01 00:00:00', toDt: '2027-12-31 00:00:00', length: 10 }
      }).catch(e => ({ data: { data: [], error: e.message } })),
      
      axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/stats`, {
        headers,
        params: { type: 'layout', fromDt: '2026-01-01 00:00:00', toDt: '2027-12-31 00:00:00', length: 10 }
      }).catch(e => ({ data: { data: [], error: e.message } })),
      
      axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/task`, {
        headers,
        params: { length: 150 }
      }).catch(e => ({ data: [], error: e.message })),

      axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/log`, {
        headers,
        params: { category: 'XTR', length: 20 }
      }).catch(e => ({ data: [], error: e.message }))
    ]);

    // 2. Analyze Health
    const tasks = tasksRes.data || [];
    const logs = logsRes.data || [];
    
    const aggregationTask = tasks.find(t => t.class?.includes('Aggregation') || t.name?.includes('Aggregation'));
    const cronErrors = logs.filter(l => l.message.includes('CRON syntax error'));
    
    const health = {
        aggregationTaskActive: !!aggregationTask,
        aggregationTaskStatus: aggregationTask?.status || 'MISSING',
        cronErrorCount: cronErrors.length,
        recentCronErrors: cronErrors.map(l => l.message.substring(0, 100)),
        maintenanceStatus: tasks.find(t => t.name === 'Regular Maintenance')?.lastRunStatus || 'Unknown'
    };

    const result = {
      health,
      mediaStatsCount: (mediaRes.data.data || mediaRes.data || []).length,
      layoutStatsCount: (layoutRes.data.data || layoutRes.data || []).length,
      diagnostics: {
        mediaError: mediaRes.data.error || null,
        layoutError: layoutRes.data.error || null,
        taskError: tasksRes.error || null,
        logError: logsRes.error || null
      }
    };

    testCache = result;
    testCacheTime = Date.now();

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/xibo/upload', upload.single('file'), async (req, res) => {
  const { adName, displayGroupId, playImmediately, startDt, endDt } = req.body;
  const file = req.file;

  if (!adName || !file || !displayGroupId) {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'adName, file, and displayGroupId are required.' });
  }

  const cleanup = () => {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
  };

  try {
    const headers = await authHeader();
    let mediaId, layoutId, campaignId, playlistId, schedId;

    // ── Step 1: Upload file (POST /api/library) ──
    try {
      const ts = Date.now();
      let safeName = file.originalname || 'media.mp4';
      const ext = safeName.split('.').pop() || 'mp4';
      const prefix = `Ad_${ts}_`;
      if (prefix.length + safeName.length > 95) {
          safeName = safeName.substring(0, 85 - prefix.length) + "." + ext;
      }
      const uniqueFileName = prefix + safeName;
      const form = new FormData();
      form.append('files', fs.createReadStream(file.path), {
        filename: uniqueFileName,
        contentType: file.mimetype,
      });
      form.append('name', uniqueFileName);

      const uploadResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/library`, form, {
        headers: { ...headers, ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const fileResult = (uploadResp.data.files || [])[0] || uploadResp.data;
      if (fileResult.error) throw new Error(`Library upload failed: ${fileResult.error}`);
      mediaId = fileResult.mediaId;
      if (!mediaId) throw new Error(`Upload returned no mediaId: ${JSON.stringify(uploadResp.data)}`);
      
      // Additional Step: Enable Stat tracking for this specific media
      await xiboService.setStatCollection('media', mediaId, true);

      // --- PIPELINE FIX: Link media to brand for Proof of Play ---
      if (req.user && req.user.brand_id) {
          await require('./src/db/database').dbRun(
              'REPLACE INTO media_brands (mediaId, brand_id) VALUES (?, ?)',
              [mediaId, req.user.brand_id]
          );
          console.log(`[POST /xibo/upload] Linked mediaId ${mediaId} to brand ${req.user.brand_id}`);
      }

      console.log('Step 1 complete - mediaId:', mediaId, '| filename:', uniqueFileName);
    } catch (err) {
      console.log('Step 1 FAILED', err.response?.status, err.response?.data);
      throw err;
    }

    // ── Step 2-4: Create Fullscreen Layout & Assign Media ──
    try {
      const layoutParams = new URLSearchParams();
      layoutParams.append('id', mediaId);
      layoutParams.append('type', 'media');
      layoutParams.append('backgroundColor', '#000000');
      // layoutParams.append('layoutDuration', '30'); // Optional

      const layoutResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/fullscreen`, layoutParams, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      layoutId = layoutResp.data.layoutId;
      campaignId = layoutResp.data.campaignId;
      if (!layoutId) throw new Error('Fullscreen layout creation failed (no layoutId returned).');
      console.log('Step 2-4 complete - layoutId:', layoutId, 'campaignId:', campaignId);

      // Additional Step: Enable Stat tracking for this layout
      await xiboService.setStatCollection('layout', layoutId, true);

      // ── Step 4.5: Publish the Layout (MANDATORY for Xibo v4 to make it live) ──
      try {
        console.log(`[POST /xibo/upload] Publishing Layout ${layoutId}...`);
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/publish/${layoutId}`, 
            new URLSearchParams({ publish: 1 }), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log(`[POST /xibo/upload] Step 4.5 complete - layout published.`);
      } catch (pubErr) {
        console.error(`[POST /xibo/upload] Step 4.5 ERROR: Layout publish failed:`, pubErr.response?.status, pubErr.response?.data);
        throw new Error(`Failed to publish layout: ${pubErr.response?.data?.message || pubErr.message}`);
      }
    } catch (err) {
      console.log('Step 2-4 FAILED', err.response?.status, err.response?.data);
      throw err;
    }

    let finalFromDt, finalToDt;

    // ── Step 5: Schedule ──
    try {
      const schedParams = new URLSearchParams();
      schedParams.append('eventTypeId', '1'); // 1 = Campaign (Ensures the schedule honors the 1-year window without prematurely ending)
      schedParams.append('campaignId', campaignId);
      schedParams.append('displayGroupIds[]', displayGroupId);
      if (playImmediately === 'true' || playImmediately === 'on' || playImmediately === true) {
        // Format to YYYY-MM-DD HH:mm:ss precisely as requested
        const now = new Date();
        const nextYear = new Date(now);
        nextYear.setFullYear(now.getFullYear() + 1);

        const pad = n => n.toString().padStart(2, '0');
        const formatLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        
        finalFromDt = formatLocal(now);       // fromDt = now
        finalToDt = formatLocal(nextYear);    // toDt = 1 year from now
      } else {
        finalFromDt = (startDt || '').replace('T', ' ');
        finalToDt = (endDt || '').replace('T', ' ');
      }
      
      console.log('Scheduling with:', { fromDt: finalFromDt, toDt: finalToDt, displayGroupId, campaignId });
      
      schedParams.append('fromDt', finalFromDt);
      schedParams.append('toDt', finalToDt);
      
      schedParams.append('isPriority', '0');
      schedParams.append('displayOrder', '1');

      const scheduleResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, schedParams, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      schedId = scheduleResp.data.eventId || scheduleResp.data.scheduleId;
      if (!schedId) throw new Error('Schedule failed (no eventId returned).');
      console.log('Step 5 complete - scheduled, schedId:', schedId);
    } catch (err) {
      console.log('Step 5 FAILED', err.response?.status, err.response?.data);
      throw err;
    }

    // Step 6: Request Screenshot + Collect Now ──
    // Use the dynamic displayGroupId to find the specific displayId for waking it up
    let dynamicDisplayId = process.env.DISPLAY_ID || 3; // Use ENV fallback
    try {
        const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayGroupId=${displayGroupId}`, { headers });
        if(dRes.data && dRes.data.length > 0) {
            dynamicDisplayId = dRes.data[0].displayId;
        } else {
            // If displayGroupId lookup fails, try to find ANY display to wake it up
            const rawAll = await xiboService.getDisplays();
            const allDisplays = rawAll.data || (Array.isArray(rawAll) ? rawAll : []);
            if (allDisplays.length > 0) {
                dynamicDisplayId = allDisplays[0].displayId;
            }
        }
    } catch(e) {
        console.warn(`[POST /xibo/upload] Could not determine dynamicDisplayId, using fallback: ${dynamicDisplayId}`);
    }

    // Step 1: Screenshot request to wake display
    try {
      const ssResp = await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/display/requestscreenshot/${dynamicDisplayId}`, null, { headers });
      console.log(`Step 1 complete - requestscreenshot: ${ssResp.status}`, ssResp.data);
    } catch (err) {
      console.error('Step 1 FAILED (requestscreenshot)', err.response?.status, err.response?.data || err.message);
    }
    // Step 2: Force collect via display group action (using the dynamic displayGroupId passed from the frontend)
    try {
      const cnResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${displayGroupId}/action/collectNow`, new URLSearchParams(), { 
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } 
      });
      console.log(`Step 2 complete - collectNow: ${cnResp.status}`, cnResp.data);
    } catch (err) {
      console.error('Step 2 FAILED (collectNow)', err.response?.status, err.response?.data || err.message);
    }

    // Step 7 - Keep auditing enabled on display so new stats are picked up
    try {
      const auditDate = new Date();
      auditDate.setFullYear(auditDate.getFullYear() + 1);
      const auditingUntil = auditDate.toISOString().slice(0,19).replace('T',' ');
      
      // Use the robust updateDisplayAuditing from XiboService
      await xiboService.updateDisplayAuditing(dynamicDisplayId, auditingUntil);
    } catch (err) {
      console.error('Step 7 FAILED (auditing update)', err.message);
    }
    
    // Additional Step: Fallback local tracking
    try {
      const logPath = path.join(__dirname, 'upload_log.json');
      let logs = [];
      if (fs.existsSync(logPath)) {
        logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      }
      
      // Get display name (displayGroupId translates to same name usually)
      let screenName = "Unknown";
      try {
        const displaysRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayGroupId=${displayGroupId}`, { headers });
        if (displaysRes.data && displaysRes.data.length > 0) {
           screenName = displaysRes.data[0].display;
        }
      } catch(e) {}

      logs.push({
        adName: adName,
        mediaId: mediaId,
        scheduledAt: finalFromDt,
        displayName: screenName,
        scheduledUntil: finalToDt
      });
      fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
    } catch (err) {
      console.error('Failed to log to local upload_log.json', err);
    }

    cleanup();
    res.json({
      success: true,
      message: 'Ad layout created and scheduled successfully.',
      details: { mediaId, layoutId, campaignId, schedId }
    });

  } catch (err) {
    cleanup();
    if (mediaId && !schedId) {
        console.warn(`[POST /xibo/upload] Rolling back orphaned mediaId: ${mediaId}`);
        axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/library/${mediaId}`, { headers: await authHeader() }).catch(e => console.error("Media rollback failed:", e.message));
        if (layoutId) {
           console.warn(`[POST /xibo/upload] Rolling back orphaned layoutId: ${layoutId}`);
           axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${layoutId}`, { headers: await authHeader() }).catch(e => console.error("Layout rollback failed:", e.message));
        }
    }
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('[POST /xibo/upload] Flow aborted at:', err.message);
    res.status(500).json({ error: String(detail) });
  }
});

// --- Dynamic Discovery Helpers ---

/**
 * Helper: Find or verify the specific playlist for a display's slot.
 * Returns the playlistId for SCREEN_{id}_SLOT_{slot}_PLAYLIST
 */
async function getSlotPlaylistForDisplay(displayId, slotId) {
    const headers = await authHeader();
    const playlistName = `SCREEN_${displayId}_SLOT_${slotId}_PLAYLIST`;
    
    try {
        const pResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
            headers,
            params: { name: playlistName } // Xibo v4 uses 'name' for filtering
        });

        const exactMatch = pResp.data?.find(p => (p.playlist === playlistName || p.name === playlistName));

        if (exactMatch) {
            return exactMatch.playlistId;
        }


        // Auto-create if not found
        console.log(`Playlist ${playlistName} not found. Creating it...`);
        const createResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, 
            `name=${encodeURIComponent(playlistName)}&isDynamic=0`,
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        const newPlaylistId = createResp.data.playlistId;
        if (newPlaylistId) {
            console.log(`Created new playlist: ${playlistName} (ID: ${newPlaylistId})`);
            return newPlaylistId;
        }
    } catch (err) {
        const errorData = err.response?.data;
        
        // Handle 409 Conflict: If it exists, try to find it again
        if (err.response?.status === 409 || (errorData && errorData.error === 409)) {
            console.log(`Playlist ${playlistName} already exists (409). Searching again...`);
            const retryResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
                headers: await authHeader(),
                params: { name: playlistName }
            });
            const found = retryResp.data?.find(p => (p.playlist === playlistName || p.name === playlistName));
            if (found) return found.playlistId;
        }

        console.error(`Error in getSlotPlaylistForDisplay for ${playlistName}:`, errorData || err.message);
    }

    throw new Error(`Failed to resolve or create playlist ${playlistName}.`);
}



/**
 * GET /xibo/displays/available
 * Returns all Xibo displays (authorized or not) for the Add Screen picker.
 */
app.get('/xibo/displays/available', async (req, res) => {
    try {
        const response = await xiboService.getDisplays();
        const dataArr = response.data || (Array.isArray(response) ? response : []);
        const displays = dataArr.map(d => ({
            displayId: d.displayId,
            name: d.display,
            licensed: d.licensed,
            license: d.license,
            clientType: d.clientType,
            model: d.model || d.manufacturer || '',
            resolution: d.resolution || '',
            lastAccessed: d.lastAccessed || null,
            loggedIn: d.loggedIn,
        }));
        res.json(displays);
    } catch (err) {
        console.error('[GET /xibo/displays/available]', err.message);
        const isConnErr = err.message.includes('Xibo Authentication Failed') || err.message.includes('404');
        res.status(isConnErr ? 503 : 500).json({ 
            error: err.message,
            code: isConnErr ? 'XIBO_CONNECT_ERROR' : 'INTERNAL_ERROR'
        });
    }
});

/**
 * POST /xibo/displays
 * Registers a Xibo display into the app by displayId + new name.
 * Authorizes unauthorized displays, renames already-authorized ones.
 */
app.post('/xibo/displays', async (req, res) => {
    const { name, displayId } = req.body;
    if (!name || !displayId) {
        return res.status(400).json({ error: 'Name and Display ID are required.' });
    }
    try {
        const result = await xiboService.registerDisplay(parseInt(displayId, 10), name);
        res.json({ success: true, display: result });
    } catch (err) {
        console.error('[POST /xibo/displays]', err.message);
        res.status(500).json({ error: String(err.message) });
    }
});

/**
 * PUT /xibo/displays/:displayId/location
 * Manually update a display's location in Xibo.
 */
app.put('/xibo/displays/:displayId/location', async (req, res) => {
  const { displayId } = req.params;
  const { latitude, longitude, address } = req.body;
  try {
    const result = await xiboService.updateDisplayLocation(displayId, { latitude, longitude, address });
    res.json({ success: !!result, data: result });
  } catch (err) {
    console.error(`[PUT /xibo/displays/${displayId}/location]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Slot-Based Advertising System ──────────────────────────────────────────

const MAX_SLOTS = 20;
const SLOT_DURATION_LIMIT = 13;

/**
 * Helper: Map Widgets to 20 Slots
 * Groups widgets based on their displayOrder and determines slot index.
 */
/**
 * Fetch all available slots (playlists) for a specific display.
 * Maps widget data from Xibo to a local 20-slot structure.
 * @param {number|string} displayId The Xibo display ID.
 * @returns {Promise<Array>} Array of slot objects.
 */
async function getSlotsForDisplay(displayId) {
  if (!displayId || displayId === 'null' || displayId === 'undefined') {
      return [];
  }
  try {
    const headers = await authHeader();
    const slots = [];

    const rawData = await xiboService.getPlaylists({
        name: `SCREEN_${displayId}_SLOT_`, 
        embed: 'widgets', 
        length: 100 
    });
    const allPlaylists = rawData.filter(p => {
        const pName = p.playlist || p.name;
        return p && pName && typeof pName === 'string' && pName.startsWith(`SCREEN_${displayId}_SLOT_`);
    });
    
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const slotPlaylistName = `SCREEN_${displayId}_SLOT_${i}_PLAYLIST`;
        const playlist = allPlaylists.find(p => (p.playlist === slotPlaylistName || p.name === slotPlaylistName));
        
        const slotData = {
            slot: i,
            totalDuration: 0,
            media: [],
            playlistId: playlist?.playlistId || null
        };

        if (playlist && playlist.widgets) {
            playlist.widgets.forEach(w => {
                const mediaId = w.mediaIds?.[0] || w.mediaId;
                slotData.media.push({
                    widgetId: w.widgetId,
                    mediaId: mediaId,
                    name: w.name,
                    type: w.type,
                    duration: w.duration,
                    thumbnail: mediaId ? `/xibo/proxy/thumbnail/${mediaId}` : null
                });
                slotData.totalDuration += (w.duration || 0);
            });
        }
        slots.push(slotData);
    }

    // --- PIPELINE: Fetch local DB mapping for locked brands ---
    const { dbAll } = require('./src/db/database');
    const localSlots = await dbAll(`
        SELECT s.slot_number, s.brand_id, b.name as brand_name
        FROM slots s
        LEFT JOIN brands b ON s.brand_id = b.id
        WHERE s.displayId = ? AND s.brand_id IS NOT NULL
    `, [displayId]);

    if (localSlots && localSlots.length > 0) {
        slots.forEach(slot => {
            const match = localSlots.find(ls => Number(ls.slot_number) === Number(slot.slot));
            if (match) {
                slot.lockedBrandId = match.brand_id;
                slot.lockedBrandName = match.brand_name;
            }
        });
    }

    return slots;
  } catch (err) {
    console.error('[getSlotsForDisplay ERROR]', err.message);
    throw err;
  }
}


/**
 * GET /xibo/proxy/thumbnail/:mediaId
 * Proxy for Xibo Library thumbnails (requires auth)
 */
app.get('/xibo/proxy/thumbnail/:mediaId', async (req, res) => {
    const { mediaId } = req.params;
    const headers = await authHeader();
    
    try {
        const library = await xiboService.getLibrary();
        const media = library.find(m => String(m.mediaId) === String(mediaId));
        
        // INTERCEPT VIDEOS: Force local FFmpeg extraction to avoid Xibo's Red X placeholder
        if (media && media.mediaType === 'video') {
            const fs = require('fs');
            const path = require('path');
            const cacheDir = path.join(__dirname, 'thumbnail_cache');
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
            
            const cacheFile = path.join(cacheDir, `${mediaId}.jpg`);
            
            // Serve from disk cache if available
            if (fs.existsSync(cacheFile)) {
                res.set('Content-Type', 'image/jpeg');
                return res.sendFile(cacheFile);
            }
            
            const videoUrl = `${xiboService.baseUrl}${xiboService._apiPrefix}/library/download/${mediaId}`;
            const videoStream = await axios({
                method: 'get',
                url: videoUrl,
                headers,
                responseType: 'stream'
            });
            
            const ffmpegPath = require('ffmpeg-static');
            const ffmpeg = require('fluent-ffmpeg');
            ffmpeg.setFfmpegPath(ffmpegPath);
            
            res.set('Content-Type', 'image/jpeg');
            
            const cmd = ffmpeg(videoStream.data)
                .outputOptions(['-vframes 1', '-ss 00:00:00.100'])
                .format('image2')
                .on('end', () => {
                    if (videoStream.data.destroy) videoStream.data.destroy();
                })
                .on('error', (ffmpegErr) => {
                    console.error('[FFmpeg] Error generating thumbnail:', ffmpegErr.message);
                    if (videoStream.data.destroy) videoStream.data.destroy();
                    if (!res.headersSent) res.status(404).send('Not Found');
                });
                
            cmd.pipe(res, { end: true });
            return;
        }
    } catch (err) {
        console.warn('[Thumbnail Proxy] Error intercepting video:', err.message);
    }
    
    // Fallback for images / documents (pass through to Xibo)
    try {
        const response = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/library/thumbnail/${mediaId}?w=300&h=300`, {
            headers,
            responseType: 'arraybuffer'
        });
        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (err) {
        res.status(404).send('Not Found');
    }
});


/**
 * Core Logic: Ensure the display has a dedicated 'Main Loop' playlist containing all slot sub-playlists.
 * Synchronizes Xibo structure with local slot-based management.
 * @param {number|string} displayId The Xibo display ID.
 * @param {number|string} displayGroupId The display group ID for scheduling (fallback to displayId).
 */
async function synchronizeMainLoop(displayId, displayGroupId) {
    const headers = await authHeader();
    const mainLoopName = `SCREEN_${displayId}_MAIN_LOOP`;
    
    // 1. Get or Create Main Loop Playlist
    // Use a custom name for Main Loop instead of the default Slot template
    let mainLoopId = null;
    const pSearch = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
        headers,
        params: { name: mainLoopName }
    });
    const foundMain = pSearch.data?.find(p => (p.playlist === mainLoopName || p.name === mainLoopName));
    
    if (foundMain) {
        mainLoopId = foundMain.playlistId;
    } else {
        console.log(`Creating Main Loop: ${mainLoopName}`);
        const createResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, 
            `name=${encodeURIComponent(mainLoopName)}&isDynamic=0`,
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        mainLoopId = createResp.data.playlistId;
    }

    if (!mainLoopId) throw new Error("Could not find or create Main Loop playlist.");

    // 2. Refresh Main Loop with Sub-Playlist widgets (Robustness Upgrade)
    const mlResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
        headers,
        params: { name: mainLoopName, embed: 'widgets' }
    });
    const mainLoop = mlResp.data?.find(p => (p.playlist === mainLoopName || p.name === mainLoopName));
    const existingWidgets = mainLoop?.widgets || [];

    // Clean up non-subplaylist widgets (legacy library assignments) and map existing subplaylists
    const subPlaylistMap = new Map();
    for (const w of existingWidgets) {
        if (w.type === 'subplaylist') {
            const match = (w.name || '').match(/Slot\s*(\d+)/i);
            if (match) {
                subPlaylistMap.set(parseInt(match[1], 10), w.widgetId);
            } else {
                await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${w.widgetId}`, { headers }).catch(() => {});
            }
        } else {
            // Delete legacy library media widgets
            await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${w.widgetId}`, { headers }).catch(() => {});
        }
    }

    // 3. Ensure all 20 slots exist as sub-playlists in the Main Loop
    const MAX_SLOTS = 20;
    let createdCount = 0;
    for (let i = 1; i <= MAX_SLOTS; i++) {
        if (subPlaylistMap.has(i)) continue;

        const slotPlaylistName = `SCREEN_${displayId}_SLOT_${i}_PLAYLIST`;
        const sSearch = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
            headers,
            params: { name: slotPlaylistName }
        });
        const slotPlaylist = sSearch.data?.find(p => (p.playlist === slotPlaylistName || p.name === slotPlaylistName));
        
        if (!slotPlaylist) {
            // Provision empty playlist if missing
            console.warn(`[synchronizeMainLoop] Slot Playlist ${slotPlaylistName} not found. Robustness check failed for this slot.`);
            continue;
        }

        try {
            // Add Sub-Playlist widget to Main Loop
            const spRes = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/subplaylist/${mainLoopId}`, 
                "", 
                { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const widgetId = spRes.data.widgetId;

            // Link widget to the specific slot playlist
            const putParams = new URLSearchParams();
            putParams.set('subPlaylists', JSON.stringify([{ playlistId: slotPlaylist.playlistId, spots: 1 }]));
            putParams.set('name', `Slot ${i}`);
            await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${widgetId}`, 
                putParams.toString(), 
                { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            console.log(`[synchronizeMainLoop] Linked Slot ${i} Sub-Playlist to Main Loop for Display ${displayId}`);
            createdCount++;
        } catch (err) {
            console.error(`[synchronizeMainLoop] Failed to link Slot ${i}:`, err.response?.data || err.message);
        }
    }
    
    // Auto-Publish the Main Loop so Xibo pushes updates to the displays
    if (mainLoopId) {
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/publish/${mainLoopId}`, 'publish=1', { headers }).catch(() => {});
    }

    // Trigger immediate collection on the screen if belonging to a group
    if (displayGroupId) {
        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${displayGroupId}/action/collectNow`, 
            new URLSearchParams(), 
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        ).catch(() => {});
    }

    // Resolve syncId (displayGroupId for the display)
    let syncId = displayGroupId;
    if (!syncId || syncId === 'undefined' || syncId === 'null') {
        try {
            const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayId=${displayId}`, { headers });
            if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                syncId = dRes.data[0].displayGroupId;
            } else {
                syncId = displayId;
            }
        } catch(e) { syncId = displayId; }
    }

    // First: Ensure the playlist is wrapped in a Layout (Campaign), because 
    // native Playlist scheduling (eventTypeId: 8) isn't supported on all players.
    const layoutName = `SCREEN_${displayId}_MAIN_LAYOUT`;
    let mainCampaignId = null;

    const lRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout`, { headers, params: { name: layoutName } }).catch(() => ({data:[]}));
    let mainLayout = (lRes.data || []).find(l => l.layout === layoutName || l.name === layoutName);

    const { dbGet } = require('./src/db/database');
    const screenInfo = await dbGet('SELECT orientation FROM screens WHERE xibo_display_id = ?', [displayId]);
    const resId = (screenInfo && screenInfo.orientation && screenInfo.orientation.toLowerCase() === 'portrait') ? 3 : 1;

    if (mainLayout && Number(mainLayout.resolutionId) !== Number(resId)) {
        console.log(`Resolution mismatch (${mainLayout.resolutionId} != ${resId}). Deleting old layout ${mainLayout.layoutId}...`);
        await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${mainLayout.layoutId}`, { headers }).catch(() => {});
        mainLayout = null; // Force recreation
    }

    if (!mainLayout) {
        console.log(`Creating wrapper layout: ${layoutName}...`);
        const fsParams = new URLSearchParams();
        fsParams.append('id', mainLoopId);
        fsParams.append('type', 'playlist');
        fsParams.append('backgroundColor', '#000000');
        fsParams.append('resolutionId', resId);

        const fsRes = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/fullscreen`, fsParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(e => { console.error('Fullscreen layout err:', e.response?.data); return null; });
        
        if (fsRes && fsRes.data) {
            mainCampaignId = fsRes.data.campaignId;
            mainLayout = fsRes.data;
            console.log(`Created layout ${fsRes.data.layoutId}, campaignId: ${mainCampaignId}`);
            
            // Rename the layout so our future searches find it
            await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/${mainLayout.layoutId}`, `name=${layoutName}`, {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            }).catch(() => {});
        }
    } else {
        mainCampaignId = mainLayout.campaignId;
    }

    if (!mainCampaignId) {
        console.error(`Failed to resolve Campaign ID for ${layoutName}. Cannot schedule.`);
        return;
    }

    // Always publish the layout to ensure updated media is live
    if (mainLayout?.layoutId) {
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/layout/publish/${mainLayout.layoutId}`, 'publish=1', {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});
    }

    // Check if a schedule for this campaign already exists
    const schedResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, { headers, params: { displayGroupId: syncId } }).catch(() => ({data: []}));
    const existingSchedule = (schedResp.data || []).find(s =>
        Number(s.eventTypeId) === 1 &&
        Number(s.campaignId) === Number(mainCampaignId)
    );

    if (!existingSchedule) {
        console.log(`Scheduling Layout ${layoutName} for Display ${displayId} on Group ${syncId}...`);
        const now = new Date();
        const start = now.toISOString().replace('T', ' ').substring(0, 19);

        const schedParams = new URLSearchParams();
        schedParams.append('eventTypeId', 1);
        schedParams.append('campaignId', mainCampaignId);
        schedParams.append('displayGroupIds[]', syncId);
        schedParams.append('fromDt', start);
        schedParams.append('toDt', '2036-01-01 00:00:00');
        schedParams.append('isPriority', 1);
        schedParams.append('displayOrder', 1);

        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/schedule`, schedParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).then(r => {
            const msg = `Schedule created: EventID ${r.data.eventId} (Campaign ${mainCampaignId})\n`;
            console.log(msg);
            fs.appendFileSync(path.join(__dirname, 'sched_debug.log'), msg);
        }).catch(e => {
            const errMessage = e.response?.data?.message || e.message;
            if (errMessage.includes('pending conversion')) {
                console.log(`[Status] Media pending conversion for display ${displayId}. Auto-sync will retry.`);
            } else {
                console.error('Schedule failed:', errMessage);
            }
        });
    } else {
        console.log(`Schedule already exists for Campaign ${mainCampaignId} (EventID: ${existingSchedule.eventId})`);
    }

    // Always trigger display sync to push updated slot content immediately
    await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${syncId}/action/collectNow`, '', {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => {});
}


/**
 * GET /xibo/slots/display/:displayId
 * Dynamic discovery of playlist for a specific Display
 */
app.get('/xibo/slots/display/:displayId', async (req, res) => {
  const { displayId } = req.params;

  try {
    const slots = await getSlotsForDisplay(displayId);
    res.json(slots);
  } catch (err) {
    console.error('[GET /xibo/slots/display]', err.message);
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /xibo/slots/add
 * Adds media to a specific slot for a dynamic display
 */
app.post('/xibo/slots/add', upload.single('file'), async (req, res) => {
    const { displayId, displayGroupId, slotId, duration } = req.body;
    const file = req.file;
  
    if (!displayId || !slotId || !file) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Display, Slot, and File are required.' });
    }
  
    const isReplace = req.body.replace === 'true' || req.body.replace === true;
    let uploadedMediaId = null;
  
    try {
      const headers = await authHeader();
      const requestedDuration = parseInt(duration, 10) || SLOT_DURATION_LIMIT;
      const playlistId = await getSlotPlaylistForDisplay(displayId, slotId);

      // 1. Handle Replace
      if (isReplace) {
          console.log(`Replace mode: Deleting existing widgets in slot ${slotId} (Playlist: ${playlistId})`);
          // Get current widgets
          const pResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
              headers, params: { playlistId, embed: 'widgets' }
          });
          const widgets = pResp.data?.[0]?.widgets || [];
          await Promise.all(widgets.map(w => 
              axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${w.widgetId}`, { headers })
                  .catch(e => console.warn(`Failed to delete widget ${w.widgetId} during replace:`, e.message))
          ));
      } else {
          // Duration Validation (Only if not replacing)
          const currentSlots = await getSlotsForDisplay(displayId);
          const targetSlot = currentSlots.find(s => String(s.slot) === String(slotId));
          if (targetSlot && (targetSlot.totalDuration + requestedDuration > SLOT_DURATION_LIMIT)) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            return res.status(400).json({ error: `Slot ${slotId} is full. Max 13s allowed. Use Replace.` });
          }
      }

      // 2. Upload to Library
      const form = new FormData();
      const ts = Date.now();
      let safeName = file.originalname || 'media.mp4';
      const ext = safeName.split('.').pop() || 'mp4';
      const prefix = `S${slotId}_${ts}_`;
      if (prefix.length + safeName.length > 95) {
          safeName = safeName.substring(0, 85 - prefix.length) + "." + ext;
      }
      const uniqueFileName = prefix + safeName;
      form.append('files', fs.createReadStream(file.path), { filename: uniqueFileName });
      form.append('name', uniqueFileName);
  
      const libResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/library`, form, {
        headers: { ...headers, ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const fileResult = (libResp.data.files || [])[0] || libResp.data;
      if (fileResult.error) throw new Error(`Library upload failed: ${fileResult.error}`);
      const mediaId = fileResult.mediaId;
      uploadedMediaId = mediaId;

      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  
      if (!mediaId) throw new Error(`Library upload returned no mediaId: ${JSON.stringify(libResp.data)}`);

      // 2b. *** Enable Media Stats Collection (Proof of Play) for this item ***
      // Without this, Xibo defaults to 'Inherit' which may be Off at display/profile level.
      let autoLinkedBrandId = null;
      try {
        await xiboService.setStatCollection('media', mediaId, true);
        console.log(`[Slots] Enabled stat collection for mediaId=${mediaId}`);

        // --- PIPELINE FIX: Link media to brand assigned to this slot ---
        const { dbGet, dbRun } = require('./src/db/database');
        await dbRun('UPDATE slots SET mediaId = ?, duration = ?, status = "Assigned" WHERE displayId = ? AND slot_number = ?', [mediaId, requestedDuration, displayId, slotId]);
        
        const slotRecord = await dbGet('SELECT brand_id FROM slots WHERE displayId = ? AND slot_number = ?', [displayId, slotId]);
        if (slotRecord && slotRecord.brand_id) {
            await dbRun('REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")', [mediaId, slotRecord.brand_id]);
            autoLinkedBrandId = slotRecord.brand_id;
            console.log(`[Slots] Linked mediaId ${mediaId} to brand ${slotRecord.brand_id} via slot ${slotId}`);
        } else if (req.user && req.user.brand_id) {
            // Fallback for brand portal direct uploads
            await dbRun('REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")', [mediaId, req.user.brand_id]);
            autoLinkedBrandId = req.user.brand_id;
        }
      } catch (statErr) {
        // Non-fatal — log and continue. Stats may still work via widget-level stats.
        console.warn(`[Slots] Could not enable stat for mediaId=${mediaId}:`, statErr.message);
      }

  
      // 2. Add as Widget (Corrected format: media[0])
      const widgetResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/library/assign/${playlistId}`, `media[0]=${mediaId}&duration=${requestedDuration}&useDuration=1`, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
  
      const widgetId = widgetResp.data?.[0]?.widgetId;
      
      // 3. Rename to 'Slot X'
      if (widgetId) {
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${widgetId}`, `name=Slot ${slotId}: ${file.originalname}`, {
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      }
  
      // 4. Instant Sync & Scheduling
      let syncId = displayGroupId;
      if (!syncId || syncId === 'undefined' || syncId === 'null') {
          try {
              const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayId=${displayId}`, { headers });
              if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                  syncId = dRes.data[0].displayGroupId;
              } else {
                  syncId = displayId;
              }
          } catch(e) { syncId = displayId; }
      }
      await synchronizeMainLoop(displayId, syncId);
      await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${syncId}/action/collectNow`, null, { headers }).catch(() => {});
      await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});
  
      // Invalidate widget cache so next stats query picks up the new slot mapping
      statsService.invalidateWidgetCache();
      
      logActivity({
          action: isReplace ? ACTION.UPDATE : ACTION.UPLOAD,
          module: MODULE.SLOT,
          description: `Media uploaded and ${isReplace ? 'replaced' : 'added'} to Slot ${slotId} on Display ${displayId} (mediaId: ${mediaId})`,
          req
      });

      res.json({ success: true, widgetId, mediaId, autoLinkedBrandId });

    } catch (err) {
      if (uploadedMediaId) {
          console.warn(`[POST /xibo/slots/add] Rolling back orphaned mediaId: ${uploadedMediaId}`);
          axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/library/${uploadedMediaId}`, { headers: await authHeader() }).catch(e => console.error("Media rollback failed:", e.message));
      }
      console.error('[POST /xibo/slots/add]', err.message);
      res.status(500).json({ error: err.message });
    }
});

/**
 * POST /xibo/slots/assign
 * Assigns an EXISTING media file (by mediaId) to a specific slot.
 */
app.post('/xibo/slots/assign', async (req, res) => {
    const { displayId, displayGroupId, slotId, mediaId, duration, brandId } = req.body;
    
    if (!displayId || !slotId || !mediaId) {
        return res.status(400).json({ error: 'Display, Slot, and Media ID are required.' });
    }

    const isReplace = req.body.replace === 'true' || req.body.replace === true;

    try {
        const headers = await authHeader();
        const requestedDuration = parseInt(duration, 10) || SLOT_DURATION_LIMIT;
        const playlistId = await getSlotPlaylistForDisplay(displayId, slotId);

        // 1. Handle Replace
        if (isReplace) {
            const pResp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
                headers, params: { playlistId, embed: 'widgets' }
            });
            const widgets = pResp.data?.[0]?.widgets || [];
            await Promise.all(widgets.map(w => 
                axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${w.widgetId}`, { headers })
                    .catch(e => console.warn(`Failed to delete widget ${w.widgetId} during replace:`, e.message))
            ));
        } else {
            // Duration Validation
            const currentSlots = await getSlotsForDisplay(displayId);
            const targetSlot = currentSlots.find(s => String(s.slot) === String(slotId));
            if (targetSlot && (targetSlot.totalDuration + requestedDuration > SLOT_DURATION_LIMIT)) {
                return res.status(400).json({ error: `Slot ${slotId} is full. Max 13s allowed. Use Replace.` });
            }
        }

        // 2. Enable Stats Collection & Brand Association
        try {
            await xiboService.setStatCollection('media', mediaId, true);
            
            const { dbGet, dbRun } = require('./src/db/database');
            await dbRun('UPDATE slots SET mediaId = ?, duration = ?, status = "Assigned" WHERE displayId = ? AND slot_number = ?', [mediaId, requestedDuration, displayId, slotId]);
            
            const targetBrandId = brandId || (await dbGet('SELECT brand_id FROM slots WHERE displayId = ? AND slot_number = ?', [displayId, slotId]))?.brand_id;
            
            if (targetBrandId) {
                await dbRun('REPLACE INTO media_brands (mediaId, brand_id) VALUES (?, ?)', [mediaId, targetBrandId]);
                console.log(`[Slots] Linked assigned mediaId ${mediaId} to brand ${targetBrandId}`);
            }
        } catch (statErr) {
            console.warn(`[Slots] Could not enable stat/brand for assigned mediaId=${mediaId}:`, statErr.message);
        }

        // 3. Add as Widget
        const widgetResp = await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/library/assign/${playlistId}`, `media[0]=${mediaId}&duration=${requestedDuration}&useDuration=1`, {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const widgetId = widgetResp.data?.[0]?.widgetId;

        // 4. Rename Widget
        if (widgetId) {
            await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${widgetId}`, `name=Slot ${slotId}: Brand Creative`, {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
        }

        // 5. Instant Sync
        let syncId = displayGroupId;
        if (!syncId || syncId === 'undefined' || syncId === 'null') {
            try {
                const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayId=${displayId}`, { headers });
                if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                    syncId = dRes.data[0].displayGroupId;
                } else {
                    syncId = displayId;
                }
            } catch(e) { syncId = displayId; }
        }
        await synchronizeMainLoop(displayId, syncId);
        await axios.post(`${xiboService.baseUrl}${xiboService._apiPrefix}/displaygroup/${syncId}/action/collectNow`, null, { headers }).catch(() => {});
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});

        statsService.invalidateWidgetCache();

        logActivity({
            action: brand_id ? ACTION.ASSIGN : ACTION.SYNC,
            module: MODULE.SLOT,
            description: brand_id 
                ? `Existing media ID ${mediaId} assigned to Slot ${slotId} for Brand ${brand_id} on Display ${displayId}`
                : `Media ID ${mediaId} assigned to Slot ${slotId} on Display ${displayId}`,
            req
        });

        res.json({ success: true, widgetId });
    } catch (err) {
        console.error('[POST /xibo/slots/assign]', err.message);
        res.status(500).json({ error: err.message });
    }
});


/**
 * DELETE /xibo/slots/media/:widgetId
 */
app.delete('/xibo/slots/media/:widgetId', async (req, res) => {
  const { widgetId } = req.params;
  const { displayId, displayGroupId, slotId } = req.query;
  
  try {
    const headers = await authHeader();
    
    // 1. Delete the widget from Xibo CMS
    await axios.delete(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist/widget/${widgetId}`, { headers });
    
    // 2. Clear local database state for this slot
    // This prevents background sync scripts from re-assigning media to this slot.
    if (displayId && slotId) {
        const { dbRun } = require('./src/db/database');
        await dbRun(
            "UPDATE slots SET status='Available', mediaId=NULL, xibo_widget_id=NULL, brand_id=NULL WHERE displayId=? AND slot_number=?",
            [displayId, slotId]
        );
        console.log(`[DELETE] Cleared slot ${slotId} for display ${displayId} in database.`);
    }

    // 3. Sync Main Loop and refresh display
    if (displayId) {
        let syncId = displayGroupId;
        if (!syncId || syncId === 'undefined' || syncId === 'null') {
            try {
                const dRes = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display?displayId=${displayId}`, { headers });
                if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                    syncId = dRes.data[0].displayGroupId;
                } else {
                    syncId = displayId;
                }
            } catch(e) { syncId = displayId; }
        }
        await synchronizeMainLoop(displayId, syncId);
        await axios.put(`${xiboService.baseUrl}${xiboService._apiPrefix}/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});
    }

    res.json({ success: true });

    logActivity({
        action: ACTION.DELETE,
        module: MODULE.SLOT,
        description: `Media (widget: ${widgetId}) removed from Slot ${slotId || 'Unknown'} on Display ${displayId || 'Unknown'}`,
        req
    });
  } catch (err) {
    console.error('[DELETE /xibo/slots/media]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ─── Periodic Background Jobs ────────────────────────────────────────────────
 */

const LOCATION_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
const STATS_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * syncDisplayLocations
 * Delegates periodic location synchronization to ScreenService.
 */
async function syncDisplayLocations() {
  const screenService = require('./src/services/screen.service');
  await screenService.syncAllLocations();
}

/**
 * syncDisplayStats
 * Every 5 minutes: wake all online displays via collectNow + requestscreenshot.
 * Delegates provisioning and local record sync to ScreenService.
 */
async function syncDisplayStats() {
  console.log(`[${new Date().toISOString()}] [StatsSync] Triggering sync...`);
  try {
    const screenService = require('./src/services/screen.service');
    const headers = await authHeader();
    const rawDisplays = await xiboService.getDisplays();
    const displays = rawDisplays.data || (Array.isArray(rawDisplays) ? rawDisplays : []);
    
    await xiboService.getClockOffset(); // --- TIME SYNC: Refresh drift calculation ---
    await screenService.syncDisplays();
    await xiboService.verifyGlobalStatsTask(); // --- PoP SELF-HEALING: Ensure Aggregation Task is Active ---
    
    await Promise.all(displays.map(async (d) => {
      try {
        // --- PoP WAKE-UP FIX: Send high-priority XMR command to force hit-collection ---
        await xiboService.forceCollectDisplayStats(d.displayId, d.displayGroupId);

        // --- ROBUSTNESS: Verify Main Loop integrity (Sub-Playlist Check) ---
        // Only verify for online displays to keep API noise low.
        if (d.loggedIn || d.loggedIn === 1) {
            const mainLoopName = `SCREEN_${d.displayId}_MAIN_LOOP`;
            const mlSearch = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/playlist`, {
                headers, params: { name: mainLoopName, embed: 'widgets' }
            });
            const mainLoop = mlSearch.data?.find(p => (p.playlist === mainLoopName || p.name === mainLoopName));
            const subPlaylistCount = (mainLoop?.widgets || []).filter(w => w.type === 'subplaylist').length;
            
            if (subPlaylistCount < 20) {
                console.log(`[StatsSync] Resilience Fix: Rebuilding loop for Display ${d.display} (${subPlaylistCount}/20 slots ok)`);
                await synchronizeMainLoop(d.displayId, d.displayGroupId).catch(e => console.warn(`[StatsSync] Loop rebuild failed for ${d.display}:`, e.message));
            }
        }

        console.log(`[StatsSync] Signal sent to display ${d.display} (ID: ${d.displayId})`);
      } catch (e) {
        console.warn(`[StatsSync] Could not wake/verify display ${d.display}:`, e.message);
      }
    }));
    
    const statsService = require('./src/services/stats.service');
    statsService.invalidateWidgetCache();
    if (app.get('io')) app.get('io').emit('stats_updated', { time: Date.now() });

    console.log(`[${new Date().toISOString()}] [StatsSync] Done.`);
  } catch (err) {
    console.error('[StatsSync] JOB FAILED:', err.message);
  }
}

/**
 * syncDisplayStatsToLocalDB
 * Every 60 seconds: fetch 30 days of logs from Xibo and sync to local DB daily_media_stats.
 * This powers the high-performance local dashboard.
 */
async function syncDisplayStatsToLocalDB() {
  const statsService = require('./src/services/stats.service');
  await statsService.syncAllStats();
}

// ─── BACKGROUND JOB REGISTRATION ─────────────────────────────────────────────

setInterval(syncDisplayLocations, LOCATION_SYNC_INTERVAL);
setTimeout(syncDisplayLocations, 30000);

setInterval(syncDisplayStats, STATS_SYNC_INTERVAL);
setTimeout(syncDisplayStats, 10000);

setInterval(syncDisplayStatsToLocalDB, 60 * 1000); // Sync to DB every minute
setTimeout(syncDisplayStatsToLocalDB, 15000);    // Initial sync after 15s

// --- PROACTIVE MONITORING ---
screenMonitor.start();

// Mount services to app settings for background access
app.set('screenService', require('./src/services/screen.service'));
app.set('statsService', require('./src/services/stats.service'));
app.set('xiboService', xiboService);

server.listen(PORT, () => {
    console.log(`🚀 Xibo CMS Server running on http://localhost:${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    if (XIBO_BASE_URL) {
        console.log(`   Xibo API    : ${XIBO_BASE_URL}`);
    } else {
        console.warn(`   ⚠️  XIBO_BASE_URL not set in .env — Xibo features disabled.`);
    }
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
// Must be defined AFTER all routes. Express 5 catches async errors automatically.
// In production, stack traces are hidden from clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    // Always log the full error server-side
    console.error(`[ERROR] ${req.method} ${req.path} → ${statusCode}:`, err.message);
    if (!isProduction) console.error(err.stack);

    res.status(statusCode).json({
        error: err.message || 'Internal Server Error',
        // Only expose stack trace in non-production environments
        ...(isProduction ? {} : { stack: err.stack })
    });
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
const shutdown = (signal) => {
    console.log(`\n[${new Date().toISOString()}] 🛑 ${signal} received. Starting graceful shutdown...`);
    
    // Stop background monitors first
    if (screenMonitor && typeof screenMonitor.stop === 'function') {
        screenMonitor.stop();
        console.log('[Shutdown] Screen monitor stopped.');
    }

    server.close(() => {
        console.log('[Shutdown] HTTP server closed.');
        // Additional cleanup like DB closing can be done here
        process.exit(0);
    });

    // Force exit after 10s if server doesn't close
    setTimeout(() => {
        console.error('[Shutdown] Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

