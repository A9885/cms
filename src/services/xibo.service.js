const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Service for interacting with the Xibo CMS API.
 * Handles authentication, display management, stats retrieval, and more.
 */
class XiboService {
  constructor() {
    // ─── Lazy config: always read from process.env at call time ─────────────
    // This means changing XIBO_BASE_URL / XIBO_CLIENT_ID / XIBO_CLIENT_SECRET
    // in .env (and reloading dotenv) is picked up automatically — no restart needed.
    this._overrideBaseUrl = null;     // set only for per-partner instances
    this._overrideClientId = null;
    this._overrideClientSecret = null;
    this.cachedToken = null;
    this.tokenExpiry = null;
    this._lastConfigSig = null;       // tracks credential changes for cache busting
    this._apiPrefix = '/api';         // Default, may be updated to /api/index.php if needed
    this._isHealed = false;           // True if we switched to index.php fallback
    
    // Circuit Breaker State
    this.failureCount = 0;
    this.circuitOpen = false;
    this.threshold = 3;
    this.resetTimeout = 60000; // 60 seconds
  }

  /**
   * Internal wrapper for axios requests with circuit breaker logic.
   */
  async xiboRequest(fn) {
    if (this.circuitOpen) {
      console.log('[Xibo] Circuit OPEN — returning cached state');
      return { success: false, syncing: true, data: [] };
    }

    try {
      const result = await fn();
      
      if (this.failureCount >= this.threshold) {
          console.log('[Xibo] Circuit CLOSED — Xibo connection restored');
      }
      
      this.failureCount = 0;
      this.circuitOpen = false;
      return result; // RETURN RAW DATA ON SUCCESS
    } catch (err) {
      this.failureCount++;
      console.error(`[Xibo] Request failed (${this.failureCount}/${this.threshold}):`, err.message);
      
      if (this.failureCount >= this.threshold) {
        this.circuitOpen = true;
        console.log('[Xibo] Circuit OPEN — returning cached state');
        
        setTimeout(() => {
          this.circuitOpen = false;
          console.log('[Xibo] Circuit HALF-OPEN — retrying Xibo connection');
        }, this.resetTimeout);
      }
      
      return { syncing: true, data: [] }; // RETURN SYNCING OBJECT ON FAILURE
    }
  }

  // ─── Lazy credential accessors ─────────────────────────────────────────────

  get baseUrl() {
    return (this._overrideBaseUrl ?? process.env.XIBO_BASE_URL ?? '').replace(/\/$/, '');
  }
  set baseUrl(v) { this._overrideBaseUrl = v; }

  get clientId() {
    return this._overrideClientId ?? process.env.XIBO_CLIENT_ID;
  }
  set clientId(v) { this._overrideClientId = v; }

  get clientSecret() {
    return this._overrideClientSecret ?? process.env.XIBO_CLIENT_SECRET;
  }
  set clientSecret(v) { this._overrideClientSecret = v; }

  /**
   * Returns a string that uniquely identifies the current credentials.
   * Used to detect when .env has changed so the cached token is invalidated.
   */
  _configSignature() {
    return `${this.baseUrl}|${this.clientId}|${this.clientSecret}`;
  }

  /**
   * Flush the cached token. Called when the .env file changes.
   */
  invalidateToken() {
    this.cachedToken = null;
    this.tokenExpiry = null;
    this._lastConfigSig = null;
    console.log('[XiboService] 🔄 Token cache flushed — will re-authenticate on next request.');
  }

  /**
   * Obtain an OAuth2 access token using client credentials.
   * Caches the token until it expires OR until credentials change.
   * @returns {Promise<string>} The access token.
   * @throws {Error} If token retrieval fails.
   */
  async getAccessToken() {
    const sig = this._configSignature();

    // Bust cache if credentials have changed since last token was issued
    if (this._lastConfigSig && this._lastConfigSig !== sig) {
      console.log('[XiboService] ⚡ Credentials changed — invalidating cached token.');
      this.invalidateToken();
    }

    if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    if (!this.baseUrl || !this.clientId || !this.clientSecret) {
      throw new Error('Xibo credentials not configured. Set XIBO_BASE_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET in .env');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);

    const prefixes = ['/api', '/api/index.php', '/web/api', '/index.php/api'];
    
    const tryAuth = async (prefix) => {
      const url = `${this.baseUrl}${prefix}/authorize/access_token`;
      return await axios.post(url, params, { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 8000 
      });
    };

    try {
      let response;
      let lastErr;

      try {
        response = await tryAuth(this._apiPrefix);
      } catch (err) {
        lastErr = err;
        
        // Detect if the 404 is an HTML page (API routing completely broken) vs JSON (API reached but endpoint missing)
        const isHtml404 = err.response?.status === 404 && 
                          (typeof err.response.data === 'string' && err.response.data.includes('<!DOCTYPE html>'));

        // If we haven't successfully "healed" yet AND it's an HTML 404, iterate through prefixes
        if (!this._isHealed && isHtml404) {
          console.warn(`[XiboService] 🔍 Path ${this._apiPrefix} failed with HTML. Starting deep path discovery...`);

          
          for (const p of prefixes) {
            if (p === this._apiPrefix) continue; // Skip what we already tried
            try {
              console.log(`[XiboService] 🧪 Testing prefix: ${p}`);
              response = await tryAuth(p);
              this._apiPrefix = p; 
              this._isHealed = true;
              console.log(`[XiboService] ✅ Found working API path: ${p}`);
              break; 
            } catch (innerErr) {
              lastErr = innerErr;
              continue;
            }
          }
        }
      }

      if (!response) {
        throw lastErr || new Error('All API paths exhausted.');
      }

      this.cachedToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
      this._lastConfigSig = sig;
      console.log(`[XiboService] ✅ Authenticated with ${this.baseUrl} (Prefix: ${this._apiPrefix})`);
      return this.cachedToken;
    } catch (err) {
        const detail = err.response?.data || err.message;
        const is404 = err.response?.status === 404;
        let msg = `Xibo Authentication Failed: ${JSON.stringify(detail)}`;
        if (is404) msg += ` - This usually means the API router is missing. Check Nginx rewrite rules or try adding /api/index.php manually to your URL.`;
        throw new Error(msg);
    }
  }

  /**
   * Get the Authorization header for API requests.
   * @returns {Promise<{Authorization: string}>}
   */
  async getHeaders() {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Fetch all displays from Xibo.
   * @param {Object} params - Query parameters for the API.
   * @returns {Promise<Array>} List of displays.
   */
  async getDisplays(params = {}) {
    return await this.xiboRequest(async () => {
        const headers = await this.getHeaders();
        const finalParams = { ...params };
        const currentEmbed = (finalParams.embed || '').split(',').filter(Boolean);
        if (!currentEmbed.includes('statsEnabled')) currentEmbed.push('statsEnabled');
        if (!currentEmbed.includes('auditUntil')) currentEmbed.push('auditUntil');
        finalParams.embed = currentEmbed.join(',');

        const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/display`, { 
            headers, 
            params: finalParams, 
            timeout: 8000 
        });
        return resp.data;
    });
  }

  /**
   * Update a Xibo display's properties.
   * @param {number|string} displayId - The Xibo ID of the display.
   * @param {Object} updates - New values for display properties.
   * @returns {Promise<Object>} The updated display data.
   */
  async updateDisplay(displayId, updates) {
    const headers = await this.getHeaders();
    try {
      const displays = await this.getDisplays();
      const display = displays.find(d => d.displayId === parseInt(displayId, 10));
      
      if (!display) throw new Error(`Display ${displayId} not found`);

      const params = new URLSearchParams();

      // Fields that are read-only or server-managed — never send these back to Xibo.
      // NOTE: statsEnabled and auditUntil are intentionally NOT skipped so that
      // updateDisplayAuditing() can write them by passing them explicitly in `updates`.
      const skipFields = new Set([
        'displayId', 'lastAccessed', 'status', 'isLoggedIn',
        'orientation', 'resolution', 'clientAddress', 'lastReported',
        'version', 'isHardwareKeyValidated', 'screenShotModifiedDt',
        'overrideConfig', 'bandwidthLimit', 'bandwidthLimitFormatted',
        'createdDt', 'modifiedDt', 'folderId', 'permissionsFolderId',
        'auditingUntil',  // legacy key returned by Xibo (different from the PUT key auditUntil)
        // DO NOT skip 'statsEnabled' or 'auditUntil' — they are write-only fields
        // used by updateDisplayAuditing() and must reach the API.
      ]);

      // ── defaultLayoutId guard ────────────────────────────────────────────────
      // Xibo v4 returns 422 if defaultLayoutId is null/undefined in a PUT request.
      // If the display has no default layout, auto-assign the first published layout.
      if (!display.defaultLayoutId && !updates.defaultLayoutId) {
        try {
          const layoutsResp = await axios.get(`${this.baseUrl}${this._apiPrefix}/layout`, {
            headers,
            params: { retired: 0, publishedStatusId: 1, length: 10 }
          });
          const layouts = layoutsResp.data || [];
          if (layouts.length > 0) {
            updates.defaultLayoutId = layouts[0].layoutId;
            console.log(`[XiboService] ⚙️  Auto-assigning defaultLayoutId=${updates.defaultLayoutId} ("${layouts[0].layout}") to display ${displayId}`);
          } else {
            // No published layouts found — skip the update gracefully rather than 422-ing
            console.warn(`[XiboService] ⚠️  No published layouts available to assign as default for display ${displayId}. Skipping update.`);
            return display; // Return current display state without throwing
          }
        } catch (layoutErr) {
          console.warn(`[XiboService] ⚠️  Could not fetch layouts for defaultLayoutId fallback: ${layoutErr.message}`);
        }
      }

      // Build the PUT body from merged display + updates
      const allKeys = new Set([...Object.keys(display), ...Object.keys(updates)]);

      for (const key of allKeys) {
        if (skipFields.has(key)) continue;
        const val = updates.hasOwnProperty(key) ? updates[key] : display[key];

        if (key === 'display' || key === 'name') {
           if (!params.has('display')) {
             params.append('display', updates.display || updates.name || display.display || display.name);
           }
           continue;
        }
        if (val !== null && val !== undefined) {
          params.append(key, val);
        }
      }

      const resp = await axios.put(`${this.baseUrl}${this._apiPrefix}/display/${displayId}`, params, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return resp.data;
    } catch (err) {
      const detail = err.response?.data || err.message;
      throw new Error(`Xibo display update failed: ${JSON.stringify(detail)}`);
    }
  }



  /**
   * Update display coordinate/address metadata.
   * @param {number|string} displayId
   * @param {Object} location - { latitude, longitude, address }
   * @returns {Promise<Object|null>}
   */
  async updateDisplayLocation(displayId, { latitude, longitude, address }) {
    try {
      const updates = {};
      if (latitude !== undefined) updates.latitude = latitude;
      if (longitude !== undefined) updates.longitude = longitude;
      if (address !== undefined) updates.address = address;

      const res = await this.updateDisplay(displayId, updates);
      console.log(`[XiboService] Location UPDATED for display ${displayId}`);
      return res;
    } catch (err) {
      console.error(`[XiboService] Location update FAILED for ${displayId}:`, err.message);
      return null;
    }
  }

  /**
   * Fetch files/media from the Xibo Library.
   * @param {Object} params - { start, length }
   * @returns {Promise<Array>}
   */
  async getLibrary(params = { start: 0, length: 150 }) {
    return await this.xiboRequest(async () => {
        const headers = await this.getHeaders();
        const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/library`, { 
            headers, 
            params, 
            timeout: 8000 
        });
        return resp.data;
    });
  }

  /**
   * Fetch Proof of Play stats.
   * @param {string} type - 'media', 'widget', or 'layout'
   * @param {Object} additionalParams - { fromDt, toDt, length }
   * @returns {Promise<Array>}
   */
  async getStats(type, additionalParams = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/stats`, {
      headers,
      params: { type, ...additionalParams }
    });
    return resp.data;
  }

  /**
   * Fetch playlists from Xibo.
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getPlaylists(params = {}) {
    return await this.xiboRequest(async () => {
        const headers = await this.getHeaders();
        const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/playlist`, { 
            headers, 
            params, 
            timeout: 8000 
        });
        return resp.data;
    });
  }

  /**
   * LEGACY: Register a display using an activation number/hardware key.
   * @param {string} name - Friendly name for the screen.
   * @param {string} hardwareKey - Activation key from the player.
   * @returns {Promise<Object>}
   */
  async addDisplay(name, hardwareKey) {
    console.log(`[XiboService] Searching for display with hardwareKey: ${hardwareKey}`);
    const displays = await this.getDisplays();
    const keyLower = (hardwareKey || '').trim().toLowerCase();
    const matching = displays.find(d => {
      if (!d.license) return false;
      const licLower = d.license.toLowerCase();
      return licLower === keyLower || licLower.includes(keyLower) || keyLower.includes(licLower);
    });
    if (!matching) {
      throw new Error(
        `No display found with that Activation Number. ` +
        `Please make sure the Xibo player has connected to the CMS at least once, ` +
        `then try again. (Searched ${displays.length} display(s))`
      );
    }
    return await this.registerDisplay(matching.displayId, name);
  }

  /**
   * Authorize and rename a brand-new Xibo display.
   * @param {number} displayId
   * @param {string} name
   * @returns {Promise<Object>}
   */
  async registerDisplay(displayId, name) {
    console.log(`[XiboService] Registering display ${displayId} as "${name}"...`);
    try {
      const displays = await this.getDisplays();
      const display = displays.find(d => d.displayId === displayId);
      if (!display) throw new Error(`Display with ID ${displayId} not found in Xibo.`);

      const updates = { display: name };
      if (display.licensed !== 1) {
        updates.licensed = 1;
        console.log(`[XiboService] Display ${displayId} is unauthorized — authorizing...`);
      }

      try {
        return await this.updateDisplay(displayId, updates);
      } catch (updateErr) {
        console.warn(`[XiboService] updateDisplay failed (non-fatal): ${updateErr.message}`);
        return { ...display, display: name };
      }
    } catch (err) {
      console.error('[XiboService] registerDisplay failed:', err.message);
      throw err;
    }
  }

  /**
   * Fetch all campaigns from Xibo.
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getCampaigns(params = {}) {
    return await this.xiboRequest(async () => {
        const headers = await this.getHeaders();
        const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/campaign`, { 
            headers, 
            params, 
            timeout: 8000 
        });
        return resp.data;
    });
  }

  /**
   * Fetch all layouts from Xibo.
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getLayouts(params = {}) {
    return await this.xiboRequest(async () => {
        const headers = await this.getHeaders();
        const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/layout`, { 
            headers, 
            params, 
            timeout: 8000 
        });
        return resp.data;
    });
  }

  /**
   * Fetch all schedules from Xibo.
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getSchedules(params = {}) {
    return await this.xiboRequest(async () => {
        const headers = await this.getHeaders();
        const resp = await axios.get(`${this.baseUrl}${this._apiPrefix}/schedule`, { 
            headers, 
            params, 
            timeout: 8000 
        });
        return resp.data;
    });
  }

  /**
   * Enable or disable stats collection for a media file or layout.
   * @param {string} type - 'media' or 'layout'
   * @param {number} id - Xibo internal ID.
   * @param {boolean} enabled
   */
  async setStatCollection(type, id, enabled = true) {
    const headers = await this.getHeaders();
    const endpoint = type === 'layout' 
      ? `${this.baseUrl}${this._apiPrefix}/layout/setenablestat/${id}`
      : `${this.baseUrl}${this._apiPrefix}/library/setenablestat/${id}`;
    
    let value = enabled ? (type === 'layout' ? 1 : 'On') : (type === 'layout' ? 0 : 'Off');
    
    try {
      await axios.put(endpoint, `enableStat=${value}`, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      console.log(`[XiboService] Stats collection set to ${value} for ${type} ID ${id}`);
    } catch (err) {
      if (err.response?.status === 404) {
        console.warn(`[XiboService] Skip: ${type} ID ${id} not found in library (404)`);
      } else {
        console.error(`[XiboService] Failed to set stats for ${type} ID ${id}:`, err.response?.data || err.message);
      }
    }
  }

  /**
   * Force a display to send its current playback statistics to the CMS immediately via XMR.
   * @param {number} displayId
   * @returns {Promise<boolean>}
   */
  async forceCollectDisplayStats(displayId) {
    try {
      const headers = await this.getHeaders();
      await axios.post(`${this.baseUrl}${this._apiPrefix}/display/${displayId}/command/collect_stats`, {}, { headers });
      console.log(`[XiboService] Sent Collect Stats command to display ${displayId}`);
      return true;
    } catch (err) {
      console.error(`[XiboService] Failed to force stats collection for ${displayId}:`, err.message);
      return false;
    }
  }

  /**
   * Verified PoP: Ensures the Xibo Statistics Aggregation background task is enabled.
   * This task moves hits from raw logs into aggregated media reports.
   */
  async verifyGlobalStatsTask() {
    try {
      const headers = await this.getHeaders();
      const tasksRes = await axios.get(`${this.baseUrl}${this._apiPrefix}/task?length=200`, { headers });
      const tasks = tasksRes.data || [];
      const aggregationTask = tasks.find(t => t.name?.includes('Aggregation') || t.class?.includes('Aggregation'));
      
      if (!aggregationTask) {
        console.warn('[XiboService] Aggregation task NOT FOUND in Xibo CMS.');
        return;
      }

      if (aggregationTask.isActive !== 1) {
        console.log(`[XiboService] PoP RESTORE: Enabling Xibo Aggregation Task (${aggregationTask.taskId})...`);
        const params = new URLSearchParams();
        params.append('isActive', '1');
        params.append('schedule', '*/5 * * * *'); // Every 5 minutes for real-time aggregation
        await axios.put(`${this.baseUrl}${this._apiPrefix}/task/${aggregationTask.taskId}`, params, {
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      }
    } catch (err) {
      console.error('[XiboService] Failed to verify global stats task:', err.message);
    }
  }

  /**
   * Helper: Directly update display auditing window.
   */
  /**
   * Enable auditing / stats recording for a display and extend the audit window.
   * Gracefully handles the Xibo 422 "Please set a Default Layout" error by
   * auto-resolving the defaultLayoutId before attempting the PUT.
   * @param {number|string} displayId
   * @param {string} auditingUntil  ISO-ish date string e.g. '2027-12-31 00:00:00'
   */
  async updateDisplayAuditing(displayId, auditingUntil) {
    // updateDisplay() will auto-fetch and inject defaultLayoutId if it's missing,
    // so we only need to supply the auditing fields explicitly here.
    return await this.updateDisplay(displayId, {
      statsEnabled: 1,
      auditUntil: auditingUntil,
    });
  }
  /**
   * Resolve a slot-specific playlist for a display.
   * Format: SCREEN_{displayId}_SLOT_{slotId}_PLAYLIST
   * @param {number|string} displayId
   * @param {number|string} slotId
   * @returns {Promise<number>} The playlistId.
   */
  async getSlotPlaylistId(displayId, slotId) {
    const headers = await this.getHeaders();
    const playlistName = `SCREEN_${displayId}_SLOT_${slotId}_PLAYLIST`;
    
    try {
      // 1. Search for existing playlist
      const pResp = await axios.get(`${this.baseUrl}${this._apiPrefix}/playlist`, {
        headers,
        params: { name: playlistName }
      });

      const found = pResp.data?.find(p => (p.playlist === playlistName || p.name === playlistName));
      if (found) return found.playlistId;

      // 2. Create if not found
      console.log(`[XiboService] Creating playlist: ${playlistName}`);
      const createResp = await axios.post(`${this.baseUrl}${this._apiPrefix}/playlist`, 
        `name=${encodeURIComponent(playlistName)}&isDynamic=0`,
        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return createResp.data.playlistId;
    } catch (err) {
      if (err.response?.status === 409) {
          // Retry find once if conflict occurs
          const retry = await axios.get(`${this.baseUrl}${this._apiPrefix}/playlist`, { headers, params: { name: playlistName } });
          const found = retry.data?.find(p => (p.playlist === playlistName || p.name === playlistName));
          if (found) return found.playlistId;
      }
      throw new Error(`Failed to resolve playlist ${playlistName}: ${err.message}`);
    }
  }

  /**
   * Assign a library item to a playlist.
   * @param {number} playlistId
   * @param {number} mediaId
   * @param {number} duration
   * @returns {Promise<Object>} The created widget record.
   */
  async assignMediaToPlaylist(playlistId, mediaId, duration = 10) {
    const headers = await this.getHeaders();
    try {
      const params = `media[0]=${mediaId}&duration=${duration}&useDuration=1`;
      const resp = await axios.post(`${this.baseUrl}${this._apiPrefix}/playlist/library/assign/${playlistId}`, params, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return resp.data?.[0] || resp.data;
    } catch (err) {
      throw new Error(`Xibo media assignment failed: ${err.message}`);
    }
  }

  /**
   * Remove a widget from its playlist.
   * @param {number} widgetId
   * @returns {Promise<boolean>}
   */
  async removeWidgetFromPlaylist(widgetId) {
    const headers = await this.getHeaders();
    try {
      await axios.delete(`${this.baseUrl}${this._apiPrefix}/playlist/widget/${widgetId}`, { headers });
      return true;
    } catch (err) {
      console.error(`[XiboService] Failed to remove widget ${widgetId}:`, err.message);
      return false;
    }
  }
  /**
   * Upload a file to the Xibo library.
   * @param {string} filePath - Path to the local file.
   * @param {string} fileName - Name to assign to the media in Xibo.
   * @returns {Promise<Object>} The library file result.
   */
  async uploadMedia(filePath, fileName) {
    const headers = await this.getHeaders();
    const form = new FormData();
    form.append('files', fs.createReadStream(filePath), { filename: fileName });
    form.append('name', fileName);

    try {
      const resp = await axios.post(`${this.baseUrl}${this._apiPrefix}/library`, form, {
        headers: { ...headers, ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      const fileResult = (resp.data.files || [])[0] || resp.data;
      if (fileResult.error) throw new Error(fileResult.error);
      return fileResult;
    } catch (err) {
      throw new Error(`Xibo library upload failed: ${err.message}`);
    }
  }

  /**
   * Process a display record to determine its health status.
   * @param {Object} d - The Xibo display object.
   * @returns {Object} Health status and metrics.
   */
  getDisplayHealth(d) {
    const lastSeen = d.lastAccessed ? new Date(d.lastAccessed) : null;
    const now = new Date();
    const stalenessMinutes = lastSeen ? Math.floor((now - lastSeen) / 60000) : Infinity;

    // Health Rules:
    // 1. Online: LoggedIn = 1 AND Seen in last 15 mins
    // 2. Stale: LoggedIn = 1 BUT Not seen in > 15 mins (Disconnected but session active)
    // 3. Offline: LoggedIn = 0
    let status = 'Offline';
    if (d.loggedIn === 1 || d.loggedIn === true) {
      status = stalenessMinutes < 15 ? 'Online' : 'Stale';
    }

    // Storage Status:
    const freeGB = d.storageAvailableSpace ? (d.storageAvailableSpace / 1073741824).toFixed(2) : null;
    const storageStatus = freeGB && freeGB < 2 ? 'Critical' : 'Healthy';

    return {
      displayId: d.displayId,
      name: d.display,
      status,
      stalenessMinutes,
      storage: {
          freeGB,
          totalGB: d.storageTotalSpace ? (d.storageTotalSpace / 1073741824).toFixed(2) : null,
          status: storageStatus
      },
      lastSeen: d.lastAccessed,
      ip: d.clientAddress || d.lanIpAddress || 'Hidden',
      version: d.clientVersion || 'Unknown',
      syncStatus: d.mediaInventoryStatus === 1 ? 'Synced' : 'Downloading'
    };
  }

  // ─── AUTO-DISCOVER CONFIG ──────────────────────────────────────────────────

  /**
   * Auto-discovers all critical Xibo IDs from the connected account:
   *   - PLACEHOLDER_MEDIA_ID  → first image/video in the library
   *   - Per-screen playlist IDs → SCREEN_{displayId}_MAIN_LOOP or SCREEN_{displayId}_PLAYLIST
   *
   * Called automatically after a .env reload (new account) or on demand via
   * GET /admin/api/xibo/discover.
   *
   * Returns a config snapshot so the admin can review / copy to .env if needed.
   * @returns {Promise<Object>}
   */
  async autoDiscoverConfig() {
    console.log('[XiboService] 🔍 Auto-discovering Xibo config from account...');
    const result = {
      xibo_base_url: this.baseUrl,
      discovered_at: new Date().toISOString(),
      placeholder_media_id: null,
      placeholder_media_name: null,
      screen_playlists: [],
      displays: [],
      warnings: []
    };

    try {
      // ── 1. Placeholder Media: first image or video in the library ────────────
      const library = await this.getLibrary({ start: 0, length: 50 });
      const media = (library || []).filter(m => ['image', 'video'].includes(m.mediaType));

      if (media.length === 0) {
        result.warnings.push('Library is empty — upload at least one image/video to use as placeholder.');
      } else {
        // Prefer an item named "placeholder" if one exists, else take the first
        const preferred = media.find(m => /placeholder/i.test(m.name)) || media[0];
        result.placeholder_media_id = preferred.mediaId;
        result.placeholder_media_name = preferred.name;
        console.log(`[XiboService] ✅ Placeholder media: ID=${preferred.mediaId} (${preferred.name})`);
      }

      // ── 2. Screen Playlists: discover MAIN_LOOP / PLAYLIST per display ───────
      const [displays, allPlaylists] = await Promise.all([
        this.getDisplays(),
        this.getPlaylists({ length: 500 }).catch(() => [])
      ]);

      result.displays = displays.map(d => ({ displayId: d.displayId, name: d.display }));

      for (const d of displays) {
        const mainLoopName = `SCREEN_${d.displayId}_MAIN_LOOP`;
        const legacyName   = `SCREEN_${d.displayId}_PLAYLIST`;
        const playlist = allPlaylists.find(p =>
          p.playlist === mainLoopName || p.name === mainLoopName ||
          p.playlist === legacyName   || p.name === legacyName
        );

        if (playlist) {
          result.screen_playlists.push({
            displayId: d.displayId,
            displayName: d.display,
            playlistId: playlist.playlistId,
            playlistName: playlist.playlist || playlist.name,
            envKey: `SCREEN_${d.displayId}_PLAYLIST_ID`
          });
          console.log(`[XiboService] ✅ Screen ${d.display}: playlist ${playlist.playlistId}`);
        } else {
          result.warnings.push(`Display "${d.display}" (ID:${d.displayId}) has no provisioned playlist yet — run provisioning first.`);
        }
      }

      console.log(`[XiboService] ✅ Auto-discover complete. Found ${result.screen_playlists.length} playlists, placeholder=${result.placeholder_media_id}`);

    } catch (err) {
      result.error = err.message;
      console.error('[XiboService] Auto-discover failed:', err.message);
    }

    return result;
  }

  /**
   * Diagnostic method to check Xibo connectivity health.
   * Returns details about reachability and if fallback was needed.
   */
  async getHealth() {
    const health = {
        baseUrl: this.baseUrl,
        prefix: this._apiPrefix,
        isHealed: this._isHealed,
        status: 'unknown',
        error: null
    };

    try {
        await this.getAccessToken();
        health.status = 'connected';
    } catch (err) {
        health.status = 'failed';
        health.error = err.message;
    }
    return health;
  }
}

// Singleton for central (ENV-based) Xibo instance
const centralInstance = new XiboService();
module.exports = centralInstance;
module.exports.XiboService = XiboService; // Export class for testing

/**
 * Multi-tenant factory: returns a XiboService instance configured
 * for a specific partner's credentials from the database.
 *
 * Usage:
 *   const client = await XiboService.forPartner(partnerId);
 *   const displays = await client.getDisplays();
 *
 * @param {number} partnerId
 * @returns {Promise<XiboService>}
 */
module.exports.forPartner = async function(partnerId) {
    const { dbGet } = require('../db/database');
    const cred = await dbGet(
        'SELECT * FROM partner_xibo_credentials WHERE partner_id = ?',
        [partnerId]
    );
    if (!cred) throw new Error(`No Xibo credentials found for partner ${partnerId}`);

    const instance = new XiboService();
    instance.baseUrl = cred.xibo_base_url.replace(/\/$/, '');
    instance.clientId = cred.client_id;
    instance.clientSecret = cred.client_secret;

    // Seed cached token if still valid
    if (cred.access_token && cred.token_expires_at && new Date(cred.token_expires_at) > new Date(Date.now() + 60000)) {
        instance.cachedToken = cred.access_token;
        instance.tokenExpiry = new Date(cred.token_expires_at).getTime();
    }

    return instance;
};



