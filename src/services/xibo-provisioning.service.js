const axios = require('axios');
const { dbRun, dbAll, dbGet } = require('../db/database');

/**
 * XiboProvisioningService
 * ─────────────────────────────────────────────────────────────────
 * Auto-provisions a full Xibo resource stack for a partner (SaaS).
 *
 * Provisioning order:
 *   1. Authenticate (OAuth2 client_credentials)
 *   2. Create Folder          → PARTNER_{id}_FOLDER
 *   3. Create Display Group   → PARTNER_{id}_GROUP
 *   4. Create Layout          → PARTNER_{id}_LAYOUT (1920×1080)
 *   5. Create Playlist        → PARTNER_{id}_PLAYLIST
 *   6. Create Campaign        → PARTNER_{id}_CAMPAIGN
 *   7. Schedule Campaign      → perpetual schedule on the display group
 *
 * All Xibo IDs are stored in `partner_xibo_resources`.
 * Progress/errors are tracked in `partner_xibo_credentials.provision_log`.
 */
class XiboProvisioningService {

    // ─── INTERNAL HELPERS ──────────────────────────────────────────

    /**
     * Build an axios instance pre-authenticated for a partner's Xibo.
     * @param {string} baseUrl
     * @param {string} token
     */
    _buildClient(baseUrl, token) {
        return axios.create({
            baseURL: baseUrl.replace(/\/$/, ''),
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30000
        });
    }

    /**
     * Persist a provisioned resource ID to the DB.
     */
    async _saveResource(partnerId, type, xibo_resource_id, name, meta = {}) {
        await dbRun(`
            INSERT INTO partner_xibo_resources
                (partner_id, resource_type, xibo_resource_id, xibo_resource_name, meta)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                xibo_resource_id = VALUES(xibo_resource_id),
                xibo_resource_name = VALUES(xibo_resource_name),
                meta = VALUES(meta)
        `, [partnerId, type, xibo_resource_id, name, JSON.stringify(meta)]);
    }

    /**
     * Load already-saved resources for a partner (for idempotency).
     */
    async _loadResources(partnerId) {
        const rows = await dbAll(
            'SELECT resource_type, xibo_resource_id, xibo_resource_name FROM partner_xibo_resources WHERE partner_id = ?',
            [partnerId]
        );
        const map = {};
        for (const r of rows) map[r.resource_type] = r.xibo_resource_id;
        return map;
    }

    /**
     * Update provision_log in credentials table with step progress.
     */
    async _updateLog(partnerId, log) {
        await dbRun(
            'UPDATE partner_xibo_credentials SET provision_log = ?, updated_at = CURRENT_TIMESTAMP WHERE partner_id = ?',
            [JSON.stringify(log), partnerId]
        );
    }

    // ─── STEP 1: AUTHENTICATE ──────────────────────────────────────

    /**
     * OAuth2 client_credentials flow. Returns { token, client }.
     * Caches token in DB until expiry.
     * @param {Object} cred - { xibo_base_url, client_id, client_secret }
     */
    async authenticate(cred) {
        const baseUrl = cred.xibo_base_url.replace(/\/$/, '');

        // Check cached token
        if (cred.access_token && cred.token_expires_at && new Date(cred.token_expires_at) > new Date(Date.now() + 60000)) {
            const client = this._buildClient(baseUrl, cred.access_token);
            return { token: cred.access_token, client };
        }

        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', cred.client_id);
        params.append('client_secret', cred.client_secret);

        let resp;
        try {
            resp = await axios.post(`${baseUrl}/api/authorize/access_token`, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 20000
            });
        } catch (err) {
            const detail = err.response?.data || err.message;
            throw new Error(`Xibo authentication failed: ${JSON.stringify(detail)}`);
        }

        const token = resp.data.access_token;
        const expiresIn = resp.data.expires_in || 3600;
        const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000);

        // Cache token in DB
        await dbRun(`
            UPDATE partner_xibo_credentials
            SET access_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE partner_id = ?
        `, [token, expiresAt, cred.partner_id]);

        const client = this._buildClient(baseUrl, token);
        return { token, client };
    }

    // ─── STEP 2: CREATE FOLDER ─────────────────────────────────────

    /**
     * Create an isolated folder for the partner.
     * @param {AxiosInstance} client
     * @param {Object} partner - { id, name }
     * @returns {number} folderId
     */
    async createFolder(client, partner) {
        const folderName = `PARTNER_${partner.id}_FOLDER`;

        // Check if already exists
        try {
            const res = await client.get('/api/folders', { params: { folderName } });
            const existing = (res.data || []).find(f => f.folderName === folderName || f.text === folderName);
            if (existing) {
                console.log(`[Provision] Folder already exists: ${existing.folderId}`);
                return existing.folderId;
            }
        } catch (e) { /* not found, proceed to create */ }

        const params = new URLSearchParams();
        params.append('folderName', folderName);

        const res = await client.post('/api/folders', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const folderId = res.data.id || res.data.folderId;
        if (!folderId) throw new Error(`Folder creation returned no ID: ${JSON.stringify(res.data)}`);
        console.log(`[Provision] ✅ Folder created: ${folderId} (${folderName})`);
        return folderId;
    }

    // ─── STEP 3: CREATE DISPLAY GROUP ─────────────────────────────

    /**
     * Create a dedicated display group for the partner.
     * @param {AxiosInstance} client
     * @param {number} folderId
     * @param {Object} partner - { id, name }
     * @returns {number} displayGroupId
     */
    async createDisplayGroup(client, folderId, partner) {
        const groupName = `PARTNER_${partner.id}_GROUP`;

        // Check if already exists
        try {
            const res = await client.get('/api/displaygroup', { params: { displayGroup: groupName } });
            const existing = (res.data || []).find(g => g.displayGroup === groupName);
            if (existing) {
                console.log(`[Provision] Display group already exists: ${existing.displayGroupId}`);
                return existing.displayGroupId;
            }
        } catch (e) { /* proceed */ }

        const params = new URLSearchParams();
        params.append('displayGroup', groupName);
        params.append('description', `Auto-provisioned for partner: ${partner.name}`);
        params.append('isDynamic', '0');
        if (folderId) params.append('folderId', folderId);

        const res = await client.post('/api/displaygroup', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const displayGroupId = res.data.displayGroupId;
        if (!displayGroupId) throw new Error(`Display group creation returned no ID: ${JSON.stringify(res.data)}`);
        console.log(`[Provision] ✅ Display Group created: ${displayGroupId} (${groupName})`);
        return displayGroupId;
    }

    // ─── STEP 4: CREATE LAYOUT ─────────────────────────────────────

    /**
     * Create a default 1920×1080 layout for the partner.
     * @param {AxiosInstance} client
     * @param {number} folderId
     * @param {Object} partner - { id, name }
     * @returns {{ layoutId, campaignId }}
     */
    async createLayout(client, folderId, partner) {
        const layoutName = `PARTNER_${partner.id}_LAYOUT`;

        // Check if already exists
        try {
            const res = await client.get('/api/layout', { params: { layout: layoutName } });
            const existing = (res.data || []).find(l => l.layout === layoutName);
            if (existing) {
                console.log(`[Provision] Layout already exists: ${existing.layoutId}`);
                return { layoutId: existing.layoutId, campaignId: existing.campaignId };
            }
        } catch (e) { /* proceed */ }

        const params = new URLSearchParams();
        params.append('name', layoutName);
        params.append('description', `Auto-provisioned layout for ${partner.name}`);
        params.append('width', '1920');
        params.append('height', '1080');
        params.append('backgroundColor', '#000000');
        params.append('backgroundzIndex', '0');
        if (folderId) params.append('folderId', folderId);

        const res = await client.post('/api/layout', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const layoutId = res.data.layoutId;
        const campaignId = res.data.campaignId;
        if (!layoutId) throw new Error(`Layout creation returned no ID: ${JSON.stringify(res.data)}`);
        console.log(`[Provision] ✅ Layout created: ${layoutId} (${layoutName})`);
        return { layoutId, campaignId };
    }

    // ─── STEP 5: CREATE PLAYLIST ────────────────────────────────────

    /**
     * Create a standalone playlist for the partner's slot-based content.
     * @param {AxiosInstance} client
     * @param {Object} partner - { id, name }
     * @returns {number} playlistId
     */
    async createPlaylist(client, partner) {
        const playlistName = `PARTNER_${partner.id}_PLAYLIST`;

        // Check if already exists
        try {
            const res = await client.get('/api/playlist', { params: { name: playlistName } });
            const existing = (res.data || []).find(p => p.playlist === playlistName || p.name === playlistName);
            if (existing) {
                console.log(`[Provision] Playlist already exists: ${existing.playlistId}`);
                return existing.playlistId;
            }
        } catch (e) { /* proceed */ }

        const params = new URLSearchParams();
        params.append('name', playlistName);
        params.append('isDynamic', '0');

        const res = await client.post('/api/playlist', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const playlistId = res.data.playlistId;
        if (!playlistId) throw new Error(`Playlist creation returned no ID: ${JSON.stringify(res.data)}`);
        console.log(`[Provision] ✅ Playlist created: ${playlistId} (${playlistName})`);
        return playlistId;
    }

    // ─── STEP 6: CREATE CAMPAIGN ───────────────────────────────────

    /**
     * Create a campaign and assign the layout to it.
     * @param {AxiosInstance} client
     * @param {number} layoutId
     * @param {number|null} campaignId - If layout already has a campaign, use it
     * @param {Object} partner - { id, name }
     * @returns {number} campaignId
     */
    async createCampaign(client, layoutId, campaignId, partner) {
        const campaignName = `PARTNER_${partner.id}_CAMPAIGN`;

        // If layout already has an associated campaign (from fullscreen/layout API), use it
        if (campaignId) {
            console.log(`[Provision] Using layout's existing campaign: ${campaignId}`);
            return campaignId;
        }

        // Check if named campaign exists
        try {
            const res = await client.get('/api/campaign', { params: { name: campaignName } });
            const existing = (res.data || []).find(c => c.campaign === campaignName || c.name === campaignName);
            if (existing) {
                console.log(`[Provision] Campaign already exists: ${existing.campaignId}`);
                return existing.campaignId;
            }
        } catch (e) { /* proceed */ }

        const params = new URLSearchParams();
        params.append('name', campaignName);
        params.append('type', 'list');

        const res = await client.post('/api/campaign', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const newCampaignId = res.data.campaignId;
        if (!newCampaignId) throw new Error(`Campaign creation returned no ID: ${JSON.stringify(res.data)}`);

        // Assign layout to campaign
        const assignParams = new URLSearchParams();
        assignParams.append('layoutIds[]', layoutId);
        await client.post(`/api/campaign/${newCampaignId}/layout/assign`, assignParams, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(e => console.warn(`[Provision] Layout-to-campaign assign warn: ${e.message}`));

        console.log(`[Provision] ✅ Campaign created: ${newCampaignId} (${campaignName})`);
        return newCampaignId;
    }

    // ─── STEP 7: SCHEDULE CAMPAIGN ─────────────────────────────────

    /**
     * Schedule the campaign on the partner's display group (perpetual 5-year window).
     * @param {AxiosInstance} client
     * @param {number} campaignId
     * @param {number} displayGroupId
     * @param {Object} partner
     * @returns {number} scheduleId
     */
    async scheduleCampaign(client, campaignId, displayGroupId, partner) {
        const now = new Date();
        const fiveYears = new Date(now);
        fiveYears.setFullYear(now.getFullYear() + 5);
        const pad = n => String(n).padStart(2, '0');
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        const params = new URLSearchParams();
        params.append('eventTypeId', '1'); // Campaign event
        params.append('campaignId', campaignId);
        params.append('displayGroupIds[]', displayGroupId);
        params.append('fromDt', fmt(now));
        params.append('toDt', fmt(fiveYears));
        params.append('isPriority', '0');
        params.append('displayOrder', '1');

        let scheduleId;
        try {
            const res = await client.post('/api/schedule', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            scheduleId = res.data.eventId || res.data.scheduleId;
        } catch (err) {
            // Non-fatal: schedule might already exist
            console.warn(`[Provision] Schedule creation warn (may already exist): ${err.message}`);
            scheduleId = 0;
        }

        console.log(`[Provision] ✅ Campaign scheduled on DisplayGroup ${displayGroupId} (scheduleId: ${scheduleId})`);
        return scheduleId;
    }

    // ─── PRIMARY ORCHESTRATOR ──────────────────────────────────────

    /**
     * Full provisioning flow for a partner.
     * Idempotent — skips steps already completed.
     * Writes step-by-step progress to provision_log.
     *
     * @param {number} partnerId
     * @returns {Promise<{ success: boolean, resources: Object, error?: string }>}
     */
    async provisionPartner(partnerId) {
        const log = { steps: [], startedAt: new Date().toISOString() };
        const addStep = (step, status, detail = '') => {
            log.steps.push({ step, status, detail, ts: new Date().toISOString() });
            console.log(`[Provision] ${status === 'ok' ? '✅' : status === 'error' ? '❌' : '⏳'} Step [${step}]: ${detail}`);
        };

        // Load partner
        const partner = await dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]);
        if (!partner) throw new Error(`Partner ${partnerId} not found`);

        // Load credentials
        const cred = await dbGet('SELECT * FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]);
        if (!cred) throw new Error(`No Xibo credentials for partner ${partnerId}`);

        // Mark as provisioning
        await dbRun(`
            UPDATE partner_xibo_credentials 
            SET provision_status = 'provisioning', provision_error = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE partner_id = ?
        `, [partnerId]);
        await dbRun(`UPDATE partners SET xibo_provision_status = 'provisioning' WHERE id = ?`, [partnerId]);

        const existing = await this._loadResources(partnerId);
        const resources = {};

        try {
            // ── Step 1: Authenticate ────────────────────────────────
            addStep('authenticate', 'running', `Connecting to ${cred.xibo_base_url}`);
            const { client } = await this.authenticate({ ...cred, partner_id: partnerId });
            addStep('authenticate', 'ok', 'OAuth2 token obtained');
            await this._updateLog(partnerId, log);

            // ── Step 2: Folder ───────────────────────────────────────
            let folderId = existing['folder'];
            if (!folderId) {
                addStep('folder', 'running', 'Creating partner folder');
                folderId = await this.createFolder(client, partner);
                await this._saveResource(partnerId, 'folder', folderId, `PARTNER_${partnerId}_FOLDER`);
                await dbRun('UPDATE partners SET xibo_folder_id = ? WHERE id = ?', [folderId, partnerId]);
            } else {
                addStep('folder', 'ok', `Reusing existing folder ${folderId}`);
            }
            resources.folder = folderId;
            addStep('folder', 'ok', `Folder ID: ${folderId}`);
            await this._updateLog(partnerId, log);

            // ── Step 3: Display Group ────────────────────────────────
            let displayGroupId = existing['display_group'];
            if (!displayGroupId) {
                addStep('display_group', 'running', 'Creating display group');
                displayGroupId = await this.createDisplayGroup(client, folderId, partner);
                await this._saveResource(partnerId, 'display_group', displayGroupId, `PARTNER_${partnerId}_GROUP`);
                await dbRun('UPDATE partners SET xibo_display_group_id = ? WHERE id = ?', [displayGroupId, partnerId]);
            } else {
                addStep('display_group', 'ok', `Reusing existing display group ${displayGroupId}`);
            }
            resources.display_group = displayGroupId;
            await this._updateLog(partnerId, log);

            // ── Step 4: Layout ───────────────────────────────────────
            let layoutId = existing['layout'];
            let campaignIdFromLayout = null;
            if (!layoutId) {
                addStep('layout', 'running', 'Creating 1920×1080 layout');
                const layoutResult = await this.createLayout(client, folderId, partner);
                layoutId = layoutResult.layoutId;
                campaignIdFromLayout = layoutResult.campaignId;
                await this._saveResource(partnerId, 'layout', layoutId, `PARTNER_${partnerId}_LAYOUT`, { campaignId: campaignIdFromLayout });
            } else {
                addStep('layout', 'ok', `Reusing existing layout ${layoutId}`);
                // Try retrieving campaignId from meta
                const layoutRow = await dbGet('SELECT meta FROM partner_xibo_resources WHERE partner_id = ? AND resource_type = ?', [partnerId, 'layout']);
                if (layoutRow?.meta) {
                    try { campaignIdFromLayout = JSON.parse(layoutRow.meta)?.campaignId; } catch(e) {}
                }
            }
            resources.layout = layoutId;
            addStep('layout', 'ok', `Layout ID: ${layoutId}`);
            await this._updateLog(partnerId, log);

            // ── Step 5: Playlist ─────────────────────────────────────
            let playlistId = existing['playlist'];
            if (!playlistId) {
                addStep('playlist', 'running', 'Creating partner playlist');
                playlistId = await this.createPlaylist(client, partner);
                await this._saveResource(partnerId, 'playlist', playlistId, `PARTNER_${partnerId}_PLAYLIST`);
            } else {
                addStep('playlist', 'ok', `Reusing existing playlist ${playlistId}`);
            }
            resources.playlist = playlistId;
            addStep('playlist', 'ok', `Playlist ID: ${playlistId}`);
            await this._updateLog(partnerId, log);

            // ── Step 6: Campaign ─────────────────────────────────────
            let campaignId = existing['campaign'];
            if (!campaignId) {
                addStep('campaign', 'running', 'Creating campaign');
                campaignId = await this.createCampaign(client, layoutId, campaignIdFromLayout, partner);
                await this._saveResource(partnerId, 'campaign', campaignId, `PARTNER_${partnerId}_CAMPAIGN`);
            } else {
                addStep('campaign', 'ok', `Reusing existing campaign ${campaignId}`);
            }
            resources.campaign = campaignId;
            addStep('campaign', 'ok', `Campaign ID: ${campaignId}`);
            await this._updateLog(partnerId, log);

            // ── Step 7: Schedule ─────────────────────────────────────
            let scheduleId = existing['schedule'];
            if (!scheduleId) {
                addStep('schedule', 'running', 'Scheduling campaign on display group');
                scheduleId = await this.scheduleCampaign(client, campaignId, displayGroupId, partner);
                if (scheduleId) {
                    await this._saveResource(partnerId, 'schedule', scheduleId, `PARTNER_${partnerId}_SCHEDULE`);
                }
            } else {
                addStep('schedule', 'ok', `Reusing existing schedule ${scheduleId}`);
            }
            resources.schedule = scheduleId;
            addStep('schedule', 'ok', `Schedule ID: ${scheduleId}`);

            // ── Mark as Active ───────────────────────────────────────
            log.completedAt = new Date().toISOString();
            await dbRun(`
                UPDATE partner_xibo_credentials
                SET provision_status = 'active', provision_error = NULL, provision_log = ?, updated_at = CURRENT_TIMESTAMP
                WHERE partner_id = ?
            `, [JSON.stringify(log), partnerId]);
            await dbRun(`UPDATE partners SET xibo_provision_status = 'active' WHERE id = ?`, [partnerId]);

            console.log(`[Provision] 🎉 Partner ${partnerId} fully provisioned!`, resources);
            return { success: true, resources };

        } catch (err) {
            console.error(`[Provision] ❌ Failed for partner ${partnerId}:`, err.message);
            addStep('error', 'error', err.message);
            log.completedAt = new Date().toISOString();
            await dbRun(`
                UPDATE partner_xibo_credentials
                SET provision_status = 'error', provision_error = ?, provision_log = ?, updated_at = CURRENT_TIMESTAMP
                WHERE partner_id = ?
            `, [err.message, JSON.stringify(log), partnerId]);
            await dbRun(`UPDATE partners SET xibo_provision_status = 'error' WHERE id = ?`, [partnerId]);
            return { success: false, error: err.message, resources };
        }
    }

    // ─── IDEMPOTENT REPROVISION ────────────────────────────────────

    /**
     * Re-run provisioning — only creates what's missing.
     */
    async reprovisionPartner(partnerId) {
        console.log(`[Provision] Reprovision triggered for partner ${partnerId}`);
        return await this.provisionPartner(partnerId);
    }

    /**
     * Full reset and reprovision — clears all saved resource IDs.
     */
    async resetAndReprovision(partnerId) {
        await dbRun('DELETE FROM partner_xibo_resources WHERE partner_id = ?', [partnerId]);
        await dbRun('UPDATE partner_xibo_credentials SET provision_status = \'pending\', provision_error = NULL, provision_log = NULL WHERE partner_id = ?', [partnerId]);
        await dbRun('UPDATE partners SET xibo_provision_status = \'not_started\', xibo_folder_id = NULL, xibo_display_group_id = NULL WHERE id = ?', [partnerId]);
        return await this.provisionPartner(partnerId);
    }

    // ─── MULTI-TENANT CLIENT FACTORY ──────────────────────────────

    /**
     * Get a pre-authenticated Xibo API client for a specific partner.
     * @param {number} partnerId
     * @returns {Promise<AxiosInstance>}
     */
    async getClientForPartner(partnerId) {
        const cred = await dbGet('SELECT * FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]);
        if (!cred) throw new Error(`No Xibo credentials for partner ${partnerId}`);
        const { client } = await this.authenticate({ ...cred, partner_id: partnerId });
        return client;
    }

    // ─── DISPLAY GROUP MEMBERSHIP ─────────────────────────────────

    /**
     * Assign a Xibo display to the partner's auto-provisioned display group.
     * Called when a screen is assigned to a partner.
     * @param {number} xibo_display_id
     * @param {number} partnerId
     */
    async assignDisplayToPartnerGroup(xibo_display_id, partnerId) {
        try {
            const partner = await dbGet('SELECT xibo_display_group_id FROM partners WHERE id = ?', [partnerId]);
            if (!partner?.xibo_display_group_id) {
                console.warn(`[Provision] Partner ${partnerId} has no display group. Run provisioning first.`);
                return false;
            }

            const cred = await dbGet('SELECT * FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]);
            if (!cred) {
                // No per-partner credentials — use the central Xibo service
                const xiboService = require('./xibo.service');
                const headers = await xiboService.getHeaders();
                const baseUrl = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
                const params = new URLSearchParams();
                params.append('displayIds[]', xibo_display_id);
                await axios.post(`${baseUrl}/api/displaygroup/${partner.xibo_display_group_id}/display/assign`, params, {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            } else {
                const client = await this.getClientForPartner(partnerId);
                const params = new URLSearchParams();
                params.append('displayIds[]', xibo_display_id);
                await client.post(`/api/displaygroup/${partner.xibo_display_group_id}/display/assign`, params, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            }

            console.log(`[Provision] ✅ Display ${xibo_display_id} assigned to partner ${partnerId}'s group`);
            return true;
        } catch (err) {
            console.error(`[Provision] assignDisplayToPartnerGroup failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Remove a Xibo display from the partner's display group.
     * Called when a screen is unassigned from a partner.
     * @param {number} xibo_display_id
     * @param {number} partnerId
     */
    async removeDisplayFromPartnerGroup(xibo_display_id, partnerId) {
        try {
            const partner = await dbGet('SELECT xibo_display_group_id FROM partners WHERE id = ?', [partnerId]);
            if (!partner?.xibo_display_group_id) return false;

            const cred = await dbGet('SELECT * FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]);
            let apiCall;

            if (!cred) {
                const xiboService = require('./xibo.service');
                const headers = await xiboService.getHeaders();
                const baseUrl = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
                const params = new URLSearchParams();
                params.append('displayIds[]', xibo_display_id);
                apiCall = axios.post(`${baseUrl}/api/displaygroup/${partner.xibo_display_group_id}/display/unassign`, params, {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            } else {
                const client = await this.getClientForPartner(partnerId);
                const params = new URLSearchParams();
                params.append('displayIds[]', xibo_display_id);
                apiCall = client.post(`/api/displaygroup/${partner.xibo_display_group_id}/display/unassign`, params, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            }

            await apiCall;
            console.log(`[Provision] ✅ Display ${xibo_display_id} removed from partner ${partnerId}'s group`);
            return true;
        } catch (err) {
            console.error(`[Provision] removeDisplayFromPartnerGroup failed: ${err.message}`);
            return false;
        }
    }
}

module.exports = new XiboProvisioningService();
