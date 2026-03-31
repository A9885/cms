require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const xiboService = require('./src/services/xibo.service');
const statsService = require('./src/services/stats.service');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

const PORT = process.env.PORT || 3000;

const XIBO_BASE_URL   = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
const XIBO_CLIENT_ID  = process.env.XIBO_CLIENT_ID;
const XIBO_CLIENT_SECRET = process.env.XIBO_CLIENT_SECRET;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Root Redirect to Admin Portal
app.get('/', (req, res) => {
    res.redirect('/admin/');
});

// Auth & Cookies
const cookieParser = require('cookie-parser');
app.use(cookieParser());
const authRoutes = require('./src/routes/auth.routes');
app.use('/auth', authRoutes);

// Mount Protected Admin APIs
// Mount Protected Admin APIs
const adminRoutes = require('./src/routes/admin.routes');
const { authMiddleware } = require('./src/middleware/auth.middleware');
app.use('/admin/api', authMiddleware, adminRoutes);

// Protect Xibo proxy routes
app.use('/xibo', authMiddleware);

// Mount Protected Brand APIs
const brandRoutes = require('./src/routes/brand.routes');
app.use('/brandportal/api', authMiddleware, (req, res, next) => {
    if (req.user.role !== 'Brand' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: 'Access denied' });
    if (!req.user.brand_id && req.user.role === 'Brand') return res.status(400).json({ error: 'No brand assigned to this user' });
    next();
}, brandRoutes);

// Mount Protected Partner APIs
const partnerRoutes = require('./src/routes/partner.routes');
app.use('/partnerportal/api', authMiddleware, (req, res, next) => {
    if (req.user.role !== 'Partner' && req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: 'Access denied' });
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
async function getAccessToken() {
  return await xiboService.getAccessToken();
}

async function authHeader() {
  return await xiboService.getHeaders();
}

/**
 * Diagnostic Route for Permissions
 */
app.get('/xibo/diag', async (req, res) => {
  const results = {};
  const endpoints = [
    { name: 'About', path: '/api/about' },
    { name: 'Displays', path: '/api/display' },
    { name: 'Library', path: '/api/library' },
    { name: 'User Me', path: '/api/user/me' },
    { name: 'Stats', path: '/api/stats' }
  ];

  try {
    const headers = await authHeader();
    for (const endpoint of endpoints) {
      try {
        const resp = await axios.get(`${XIBO_BASE_URL}${endpoint.path}`, { 
          headers,
          params: { length: 1 } // keep it small
        });
        results[endpoint.name] = { status: resp.status, data: 'OK' };
      } catch (err) {
        results[endpoint.name] = { 
          status: err.response?.status || 'Error', 
          message: err.message,
          data: err.response?.data
        };
      }
    }
    res.json({
        cms: XIBO_BASE_URL,
        auth: 'Authenticated Successfully',
        results
    });
  } catch (err) {
    res.status(500).json({ error: 'Auth Failed', detail: err.message });
  }
});

app.get('/xibo/diag/module/:type', async (req, res) => {
    try {
        const headers = await authHeader();
        const resp = await axios.get(`${XIBO_BASE_URL}/api/module`, { headers });
        const module = resp.data.find(m => m.type === req.params.type);
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
 * GET /xibo/displays/locations
 * Returns displayId -> location info map for enriching stats records.
 */
app.get('/xibo/displays/locations', async (req, res) => {
  try {
    const displays = await xiboService.getDisplays();
    const map = {};
    for (const d of displays) {
      // Build a human-readable location string
      let location = d.address || '';
      if (!location && d.latitude && d.longitude) {
        location = d.latitude.toFixed(4) + ', ' + d.longitude.toFixed(4);
      }
      if (!location) location = d.timeZone || 'Unknown';

      map[d.displayId] = {
        name: d.display,
        address: d.address || '',
        lat: d.latitude || null,
        lng: d.longitude || null,
        timezone: d.timeZone || '',
        device: [d.brand, d.model].filter(Boolean).join(' ') || d.clientType || '',
        location, // resolved readable string
        online: d.loggedIn === 1 || d.loggedIn === true,
        lastAccessed: d.lastAccessed || null,
        clientAddress: d.clientAddress || '',
        displayGroupId: d.displayGroupId || null,
        resolution: d.resolution || ''
      };
    }
    res.set('Cache-Control', 'no-store');
    res.json(map);
  } catch (err) {
    console.error('[GET /xibo/displays/locations]', err.message);
    res.status(500).json({ error: err.message });
  }
});



// --- Simple Cache for Rate Limit Resilience ---
let statsCache = null;
let statsCacheTime = 0;
const CACHE_TTL = 60000; // 60 seconds

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

/**
 * POST /xibo/displays/force-sync-all
 * Correct Xibo v4 implementation:
 *   - displayGroup collectNow (display-level returns 404 in v4)
 *   - requestscreenshot to wake display
 *   - XTR StatsMigration + StatsArchive + ReportSchedule to force aggregation
 */
app.post('/xibo/displays/force-sync-all', async (req, res) => {
    try {
        const displays = await xiboService.getDisplays();
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
                        `${XIBO_BASE_URL}/api/displaygroup/${d.displayGroupId}/action/collectNow`,
                        new URLSearchParams(),
                        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
                    ).catch(e => console.warn(`[force-sync-all] displaygroup collectNow ${dId}:`, e.response?.status));
                }

                // 3. Wake display with screenshot request
                await axios.put(`${XIBO_BASE_URL}/api/display/requestscreenshot/${dId}`, null, { headers }).catch(() => {});

                results.push({ displayId: dId, name: d.display, status: 'ok' });
            } catch (e) {
                results.push({ displayId: dId, name: d.display, status: 'error', error: e.message });
            }
        }));

        // 4. Trigger XTR tasks to force Xibo Cloud to aggregate raw play logs
        //    IDs confirmed from diagnostic: 11=StatsMigration, 4=StatsArchive, 10=ReportSchedule
        const xtrTasks = [
            { id: 11, name: 'StatsMigration'  },
            { id: 4,  name: 'StatsArchive'    },
            { id: 10, name: 'ReportSchedule'  },
        ];
        for (const t of xtrTasks) {
            await axios.post(`${XIBO_BASE_URL}/api/task/${t.id}/run`, null, { headers })
                .then(() => console.log(`[force-sync-all] ✅ XTR ${t.name} triggered`))
                .catch(e => console.warn(`[force-sync-all] ⚠️ XTR ${t.name}:`, e.response?.status, e.response?.data || e.message));
        }

        // 5. Clear all server caches
        statsService.invalidateWidgetCache();
        if (statsService._statResultCache) statsService._statResultCache.clear();

        console.log(`[POST /xibo/displays/force-sync-all] Synced ${results.length} displays + triggered XTR aggregation`);
        res.json({ success: true, synced: results.length, results });
    } catch (err) {
        console.error('[POST /xibo/displays/force-sync-all]', err.message);
        res.status(500).json({ error: err.message });
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
      axios.get(`${XIBO_BASE_URL}/api/stats`, {
        headers,
        params: { type: 'media', fromDt: '2026-01-01 00:00:00', toDt: '2027-12-31 00:00:00', length: 10 }
      }).catch(e => ({ data: { data: [], error: e.message } })),
      
      axios.get(`${XIBO_BASE_URL}/api/stats`, {
        headers,
        params: { type: 'layout', fromDt: '2026-01-01 00:00:00', toDt: '2027-12-31 00:00:00', length: 10 }
      }).catch(e => ({ data: { data: [], error: e.message } })),
      
      axios.get(`${XIBO_BASE_URL}/api/task`, {
        headers,
        params: { length: 150 }
      }).catch(e => ({ data: [], error: e.message })),

      axios.get(`${XIBO_BASE_URL}/api/log`, {
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

      const uploadResp = await axios.post(`${XIBO_BASE_URL}/api/library`, form, {
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
              'INSERT OR REPLACE INTO media_brands (mediaId, brand_id) VALUES (?, ?)',
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

      const layoutResp = await axios.post(`${XIBO_BASE_URL}/api/layout/fullscreen`, layoutParams, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      layoutId = layoutResp.data.layoutId;
      campaignId = layoutResp.data.campaignId;
      if (!layoutId) throw new Error('Fullscreen layout creation failed (no layoutId returned).');
      console.log('Step 2-4 complete - layoutId:', layoutId, 'campaignId:', campaignId);

      // Additional Step: Enable Stat tracking for this layout
      await xiboService.setStatCollection('layout', layoutId, true);
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

      const scheduleResp = await axios.post(`${XIBO_BASE_URL}/api/schedule`, schedParams, {
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
        const dRes = await axios.get(`${XIBO_BASE_URL}/api/display?displayGroupId=${displayGroupId}`, { headers });
        if(dRes.data && dRes.data.length > 0) {
            dynamicDisplayId = dRes.data[0].displayId;
        } else {
            // If displayGroupId lookup fails, try to find ANY display to wake it up
            const allDisplays = await xiboService.getDisplays();
            if (allDisplays.length > 0) {
                dynamicDisplayId = allDisplays[0].displayId;
            }
        }
    } catch(e) {
        console.warn(`[POST /xibo/upload] Could not determine dynamicDisplayId, using fallback: ${dynamicDisplayId}`);
    }

    // Step 1: Screenshot request to wake display
    try {
      const ssResp = await axios.put(`${XIBO_BASE_URL}/api/display/requestscreenshot/${dynamicDisplayId}`, null, { headers });
      console.log(`Step 1 complete - requestscreenshot: ${ssResp.status}`, ssResp.data);
    } catch (err) {
      console.error('Step 1 FAILED (requestscreenshot)', err.response?.status, err.response?.data || err.message);
    }
    // Step 2: Force collect via display group action (using the dynamic displayGroupId passed from the frontend)
    try {
      const cnResp = await axios.post(`${XIBO_BASE_URL}/api/displaygroup/${displayGroupId}/action/collectNow`, new URLSearchParams(), { 
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
        const displaysRes = await axios.get(`${XIBO_BASE_URL}/api/display?displayGroupId=${displayGroupId}`, { headers });
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
        axios.delete(`${XIBO_BASE_URL}/api/library/${mediaId}`, { headers: await authHeader() }).catch(e => console.error("Media rollback failed:", e.message));
        if (layoutId) {
           console.warn(`[POST /xibo/upload] Rolling back orphaned layoutId: ${layoutId}`);
           axios.delete(`${XIBO_BASE_URL}/api/layout/${layoutId}`, { headers: await authHeader() }).catch(e => console.error("Layout rollback failed:", e.message));
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
        const pResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
            headers,
            params: { name: playlistName } // Xibo v4 uses 'name' for filtering
        });

        const exactMatch = pResp.data?.find(p => (p.playlist === playlistName || p.name === playlistName));

        if (exactMatch) {
            return exactMatch.playlistId;
        }


        // Auto-create if not found
        console.log(`Playlist ${playlistName} not found. Creating it...`);
        const createResp = await axios.post(`${XIBO_BASE_URL}/api/playlist`, 
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
            const retryResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
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


async function getPlaylistForDisplay(displayId) {
    const headers = await authHeader();
    
    // For the main loop
    const pResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
        headers,
        params: { name: `SCREEN_${displayId}_MAIN_LOOP` }
    });
    if (pResp.data && pResp.data.length > 0) {
        return pResp.data[0].playlistId;
    }

    // Fallback to legacy name if MAIN_LOOP doesn't exist yet
    const legacyResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
        headers,
        params: { name: `SCREEN_${displayId}_PLAYLIST` }
    });
    if (legacyResp.data && legacyResp.data.length > 0) {
        return legacyResp.data[0].playlistId;
    }

    throw new Error(`Main Loop Playlist (SCREEN_${displayId}_MAIN_LOOP) not found.`);
}


app.get('/xibo/displays', async (req, res) => {
    try {
        const headers = await authHeader();
        const response = await axios.get(`${XIBO_BASE_URL}/api/display`, { headers });
        
        const displays = await Promise.all(response.data.map(async (d) => {
            let playlistId = null;
            try {
                playlistId = await getPlaylistForDisplay(d.displayId);
            } catch (e) {
                // Not finding a playlist for a display is okay in the list view
                // It just means that screen won't be manageable yet
            }

            // Custom Online Logic: 
            // In Xibo v4, d.loggedIn is the most direct indicator.
            // We'll also consider it online if lastAccessed is within the last 24 hours to be safe.
            const lastAccessedTime = d.lastAccessed ? new Date(d.lastAccessed + ' UTC').getTime() : 0;
            const now = Date.now();
            const isOnline = Number(d.loggedIn) === 1 || (now - lastAccessedTime < 24 * 60 * 60 * 1000);

            return {
                displayId: d.displayId,
                displayGroupId: d.displayGroupId,
                name: d.display,
                isOnline: isOnline,
                playlistId: playlistId
            };
        }));
        
        res.json(displays);
    } catch (err) {
        console.error('[GET /xibo/displays]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /xibo/displays/available
 * Returns all Xibo displays (authorized or not) for the Add Screen picker.
 */
app.get('/xibo/displays/available', async (req, res) => {
    try {
        const headers = await authHeader();
        const response = await axios.get(`${XIBO_BASE_URL}/api/display`, { headers });
        const displays = (response.data || []).map(d => ({
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
        res.status(500).json({ error: err.message });
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
  try {
    const headers = await authHeader();
    const slots = [];

    const allPlaylistsResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
        headers,
        params: { name: `SCREEN_${displayId}_SLOT_`, embed: 'widgets', length: 100 }
    });

    const rawData = allPlaylistsResp.data || [];
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
    try {
        const { mediaId } = req.params;
        const headers = await authHeader();
        const response = await axios.get(`${XIBO_BASE_URL}/api/library/thumbnail/${mediaId}?w=200&h=150`, {
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
    const pSearch = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
        headers,
        params: { name: mainLoopName }
    });
    const foundMain = pSearch.data?.find(p => (p.playlist === mainLoopName || p.name === mainLoopName));
    
    if (foundMain) {
        mainLoopId = foundMain.playlistId;
    } else {
        console.log(`Creating Main Loop: ${mainLoopName}`);
        const createResp = await axios.post(`${XIBO_BASE_URL}/api/playlist`, 
            `name=${encodeURIComponent(mainLoopName)}&isDynamic=0`,
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        mainLoopId = createResp.data.playlistId;
    }

    if (!mainLoopId) throw new Error("Could not find or create Main Loop playlist.");

    // 2. Refresh Main Loop with widgets
    const mlResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
        headers,
        params: { name: mainLoopName, embed: 'widgets' }
    });
    const mainLoop = mlResp.data?.find(p => (p.playlist === mainLoopName || p.name === mainLoopName));
    const existingWidgets = mainLoop?.widgets || [];

    // 3. Ensure all 20 slot playlists are linked as sub-playlists
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const index = i;
        const slotPlaylistId = await getSlotPlaylistForDisplay(displayId, index);
        const widgetName = `Slot ${index}`;

        const alreadyLinked = existingWidgets.find(w => {
            if (w.name && w.name.startsWith(`Slot ${index}:`)) return true;
            const opts = w.widgetOptions || [];
            const spOpt = opts.find(o => o.option === 'subPlaylists');
            if (spOpt && spOpt.value) {
                try {
                    const linked = JSON.parse(spOpt.value);
                    return linked.some(l => l.playlistId === slotPlaylistId);
                } catch (e) {}
            }
            return false;
        });
        
        if (!alreadyLinked) {
            try {
                const createResp = await axios.post(`${XIBO_BASE_URL}/api/playlist/widget/subplaylist/${mainLoopId}`, 
                    "", 
                    { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                const wId = createResp.data.widgetId;
                if (wId) {
                    const putParams = new URLSearchParams();
                    putParams.set('name', `${widgetName}: Link`);
                    putParams.set('subPlaylists', JSON.stringify([{ playlistId: slotPlaylistId, spots: 1 }]));
                    
                    await axios.put(`${XIBO_BASE_URL}/api/playlist/widget/${wId}`, 
                        putParams.toString(),
                        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                }
            } catch (err) {
                console.warn(`Failed to link slot ${index}:`, err.response?.data || err.message);
            }
        }
    }

    // 4. Clean orphan widgets from Main Loop, then schedule it as a Playlist event (eventTypeId 8)
    // This is the approach that actually works on this Xibo version to cycle all slot content.

    // Remove any orphan sub-playlist widgets (not named "Slot X: Link")
    const mlRefreshResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
        headers, params: { name: mainLoopName, embed: 'widgets' }
    });
    const mlRefreshed = mlRefreshResp.data?.find(p => (p.playlist === mainLoopName || p.name === mainLoopName));
    const allWidgets = mlRefreshed?.widgets || [];
    const orphanWidgets = allWidgets.filter(w => w.name && !w.name.match(/^Slot \d+: Link$/));
    for (const ow of orphanWidgets) {
        await axios.delete(`${XIBO_BASE_URL}/api/playlist/widget/${ow.widgetId}`, { headers }).catch(() => {});
    }
    if (orphanWidgets.length > 0) {
        console.log(`Cleaned ${orphanWidgets.length} orphan widgets from ${mainLoopName}`);
    }

    // Resolve syncId (displayGroupId for the display)
    let syncId = displayGroupId;
    if (!syncId || syncId === 'undefined' || syncId === 'null') {
        try {
            const dRes = await axios.get(`${XIBO_BASE_URL}/api/display?displayId=${displayId}`, { headers });
            if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                syncId = dRes.data[0].displayGroupId;
            } else {
                syncId = displayId;
            }
        } catch(e) { syncId = displayId; }
    }

    // Check if a Playlist-type schedule already exists for this display group
    const schedResp = await axios.get(`${XIBO_BASE_URL}/api/schedule`, { headers, params: { displayGroupId: syncId } });
    const existingPlaylistSchedule = (schedResp.data || []).find(s =>
        Number(s.eventTypeId) === 8 &&
        (s.campaign?.includes(mainLoopName) || s.campaign?.includes(`_${mainLoopId}`))
    );

    if (!existingPlaylistSchedule) {
        // Delete any stale single-image layout schedules before creating the correct one
        const staleLayoutSchedules = (schedResp.data || []).filter(s => Number(s.eventTypeId) === 1);
        for (const stale of staleLayoutSchedules) {
            await axios.delete(`${XIBO_BASE_URL}/api/schedule/${stale.eventId}`, { headers }).catch(() => {});
            console.log(`Removed stale layout schedule EventID: ${stale.eventId}`);
        }

        console.log(`Scheduling Main Loop Playlist for Display ${displayId} on Group ${syncId}...`);
        const now = new Date();
        const start = now.toISOString().replace('T', ' ').substring(0, 19);

        const schedParams = new URLSearchParams();
        schedParams.append('eventTypeId', 8);        // 8 = Playlist event type
        schedParams.append('playlistId', mainLoopId);
        schedParams.append('displayGroupIds[]', syncId);
        schedParams.append('fromDt', start);
        schedParams.append('toDt', '2036-01-01 00:00:00');
        schedParams.append('isPriority', 1);
        schedParams.append('displayOrder', 1);

        await axios.post(`${XIBO_BASE_URL}/api/schedule`, schedParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).then(r => {
            const msg = `Schedule created: EventID ${r.data.eventId} (playlist_${mainLoopName})\n`;
            console.log(msg);
            fs.appendFileSync(path.join(__dirname, 'sched_debug.log'), msg);
        }).catch(e => {
            console.error('Schedule failed:', e.response?.data?.message || e.message);
        });
    } else {
        console.log(`Main Loop already scheduled (EventID: ${existingPlaylistSchedule.eventId})`);
    }

    // Always trigger display sync to push updated slot content immediately
    await axios.post(`${XIBO_BASE_URL}/api/displaygroup/${syncId}/action/collectNow`, '', {
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
          const pResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, {
              headers, params: { playlistId, embed: 'widgets' }
          });
          const widgets = pResp.data?.[0]?.widgets || [];
          await Promise.all(widgets.map(w => 
              axios.delete(`${XIBO_BASE_URL}/api/playlist/widget/${w.widgetId}`, { headers })
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
  
      const libResp = await axios.post(`${XIBO_BASE_URL}/api/library`, form, {
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
      try {
        await xiboService.setStatCollection('media', mediaId, true);
        console.log(`[Slots] Enabled stat collection for mediaId=${mediaId}`);

        // --- PIPELINE FIX: Link media to brand assigned to this slot ---
        const { dbGet, dbRun } = require('./src/db/database');
        const slotRecord = await dbGet('SELECT brand_id FROM slots WHERE displayId = ? AND slot_number = ?', [displayId, slotId]);
        if (slotRecord && slotRecord.brand_id) {
            await dbRun('INSERT OR REPLACE INTO media_brands (mediaId, brand_id) VALUES (?, ?)', [mediaId, slotRecord.brand_id]);
            console.log(`[Slots] Linked mediaId ${mediaId} to brand ${slotRecord.brand_id} via slot ${slotId}`);
        } else if (req.user && req.user.brand_id) {
            // Fallback for brand portal direct uploads
            await dbRun('INSERT OR REPLACE INTO media_brands (mediaId, brand_id) VALUES (?, ?)', [mediaId, req.user.brand_id]);
        }
      } catch (statErr) {
        // Non-fatal — log and continue. Stats may still work via widget-level stats.
        console.warn(`[Slots] Could not enable stat for mediaId=${mediaId}:`, statErr.message);
      }

  
      // 2. Add as Widget (Corrected format: media[0])
      const widgetResp = await axios.post(`${XIBO_BASE_URL}/api/playlist/library/assign/${playlistId}`, `media[0]=${mediaId}&duration=${requestedDuration}&useDuration=1`, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
  
      const widgetId = widgetResp.data?.[0]?.widgetId;
      
      // 3. Rename to 'Slot X'
      if (widgetId) {
        await axios.put(`${XIBO_BASE_URL}/api/playlist/widget/${widgetId}`, `name=Slot ${slotId}: ${file.originalname}`, {
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      }
  
      // 4. Instant Sync & Scheduling
      let syncId = displayGroupId;
      if (!syncId || syncId === 'undefined' || syncId === 'null') {
          try {
              const dRes = await axios.get(`${XIBO_BASE_URL}/api/display?displayId=${displayId}`, { headers });
              if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                  syncId = dRes.data[0].displayGroupId;
              } else {
                  syncId = displayId;
              }
          } catch(e) { syncId = displayId; }
      }
      await synchronizeMainLoop(displayId, syncId);
      await axios.post(`${XIBO_BASE_URL}/api/displaygroup/${syncId}/action/collectNow`, null, { headers }).catch(() => {});
      await axios.put(`${XIBO_BASE_URL}/api/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});
  
      // Invalidate widget cache so next stats query picks up the new slot mapping
      statsService.invalidateWidgetCache();

      res.json({ success: true, widgetId });

    } catch (err) {
      if (uploadedMediaId) {
          console.warn(`[POST /xibo/slots/add] Rolling back orphaned mediaId: ${uploadedMediaId}`);
          axios.delete(`${XIBO_BASE_URL}/api/library/${uploadedMediaId}`, { headers: await authHeader() }).catch(e => console.error("Media rollback failed:", e.message));
      }
      console.error('[POST /xibo/slots/add]', err.message);
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
    
    // 1. Delete the widget
    await axios.delete(`${XIBO_BASE_URL}/api/playlist/widget/${widgetId}`, { headers });
    
    // 2. If it's the last one in the slot, add placeholder
    if (displayId && slotId && process.env.PLACEHOLDER_MEDIA_ID) {
        try {
            const currentSlots = await getSlotsForDisplay(displayId);
            const targetSlot = currentSlots.find(s => s.slot == slotId);
            const playlistId = targetSlot?.playlistId;

            if (playlistId && (!targetSlot || targetSlot.media.length === 0)) {
                const mediaId = process.env.PLACEHOLDER_MEDIA_ID;
                const widgetResp = await axios.post(`${XIBO_BASE_URL}/api/playlist/library/assign/${playlistId}`, `media[0]=${mediaId}&duration=13&useDuration=1`, {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                const newWidgetId = widgetResp.data[0]?.widgetId;
                if (newWidgetId) {
                    await axios.put(`${XIBO_BASE_URL}/api/playlist/widget/${newWidgetId}`, `name=Slot ${slotId}: Placeholder`, {
                        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                }
            }
        } catch(e) {
            console.warn('Placeholder recovery failed:', e.message);
        }
    }

    // 3. Sync
    if (displayId) {
        let syncId = displayGroupId;
        if (!syncId || syncId === 'undefined' || syncId === 'null') {
            try {
                const dRes = await axios.get(`${XIBO_BASE_URL}/api/display?displayId=${displayId}`, { headers });
                if (dRes.data && dRes.data.length > 0 && dRes.data[0].displayGroupId) {
                    syncId = dRes.data[0].displayGroupId;
                } else {
                    syncId = displayId;
                }
            } catch(e) { syncId = displayId; }
        }
        await synchronizeMainLoop(displayId, syncId);
        await axios.put(`${XIBO_BASE_URL}/api/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});
    }

    res.json({ success: true });
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
    const displays = await xiboService.getDisplays();
    
    await screenService.syncDisplays();
    
    await Promise.all(displays.map(async (d) => {
      try {
        await Promise.all([
          axios.post(
            `${XIBO_BASE_URL}/api/displaygroup/${d.displayGroupId}/action/collectNow`,
            new URLSearchParams(),
            { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
          ),
          axios.put(`${XIBO_BASE_URL}/api/display/requestscreenshot/${d.displayId}`, null, { headers })
        ]);
        console.log(`[StatsSync] Woke up display ${d.display} (groupId: ${d.displayGroupId})`);
      } catch (e) {
        console.warn(`[StatsSync] Could not wake display ${d.display}:`, e.response?.data?.message || e.message);
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

// ─── BACKGROUND JOB REGISTRATION ─────────────────────────────────────────────

setInterval(syncDisplayLocations, LOCATION_SYNC_INTERVAL);
setTimeout(syncDisplayLocations, 30000);

setInterval(syncDisplayStats, STATS_SYNC_INTERVAL);
setTimeout(syncDisplayStats, 10000);

// Mount services to app settings for background access
app.set('screenService', require('./src/services/screen.service'));
app.set('statsService', require('./src/services/stats.service'));
app.set('xiboService', xiboService);

server.listen(PORT, () => {
    console.log(`🚀 Xibo CMS Server starting on http://localhost:${PORT}`);
    if (XIBO_BASE_URL) {
        console.log(`   Connected to Xibo API: ${XIBO_BASE_URL}`);
    } else {
        console.warn(`   ⚠️ XIBO_BASE_URL not set in .env!`);
    }
});

