const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Service for interacting with the Xibo CMS API.
 * Handles authentication, display management, stats retrieval, and more.
 */
class XiboService {
  constructor() {
    this.baseUrl = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
    this.clientId = process.env.XIBO_CLIENT_ID;
    this.clientSecret = process.env.XIBO_CLIENT_SECRET;
    this.cachedToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Obtain an OAuth2 access token using client credentials.
   * Caches the token until it expires.
   * @returns {Promise<string>} The access token.
   * @throws {Error} If token retrieval fails.
   */
  async getAccessToken() {
    if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/authorize/access_token`,
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      this.cachedToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
      return this.cachedToken;
    } catch (err) {
      const msg = err.response?.data || err.message;
      throw new Error(`Failed to obtain Xibo access token: ${JSON.stringify(msg)}`);
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
    const headers = await this.getHeaders();
    // --- PIPELINE FIX: Ensure recording permissions are always visible ---
    const finalParams = { ...params };
    const currentEmbed = (finalParams.embed || '').split(',').filter(Boolean);
    if (!currentEmbed.includes('statsEnabled')) currentEmbed.push('statsEnabled');
    if (!currentEmbed.includes('auditUntil')) currentEmbed.push('auditUntil');
    finalParams.embed = currentEmbed.join(',');

    const resp = await axios.get(`${this.baseUrl}/api/display`, { headers, params: finalParams });
    return resp.data;
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
      const skipFields = new Set([
        'displayId', 'lastAccessed', 'status', 'isLoggedIn', 
        'orientation', 'resolution', 'clientAddress', 'lastReported', 
        'version', 'isHardwareKeyValidated', 'screenShotModifiedDt',
        'overrideConfig', 'bandwidthLimit', 'bandwidthLimitFormatted',
        'createdDt', 'modifiedDt', 'folderId', 'permissionsFolderId',
        'auditingUntil', 'statsEnabled'
      ]);
      
      // --- PIPELINE FIX: Ensure new fields like statsEnabled are always included ---
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

      const resp = await axios.put(`${this.baseUrl}/api/display/${displayId}`, params, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return resp.data;
    } catch (err) {
      const detail = err.response?.data || err.message;
      throw new Error(`Xibo display update failed: ${JSON.stringify(detail)}`);
    }
  }

  /**
   * Enable or update the auditing period for a display.
   * @param {number|string} displayId
   * @param {string} auditingUntil - ISO timestamp or formatted string.
   * @returns {Promise<Object|null>}
   */
  async updateDisplayAuditing(displayId, auditingUntil) {
    try {
      const displays = await this.getDisplays();
      const display = displays.find(d => d.displayId === parseInt(displayId, 10));
      if (display?.auditingUntil && new Date(display.auditingUntil) >= new Date(auditingUntil.replace(' ', 'T'))) {
        return { message: 'Auditing already enabled' };
      }

      const res = await this.updateDisplay(displayId, { auditingUntil });
      console.log(`[XiboService] Auditing ENABLED for display ${displayId}`);
      return res;
    } catch (err) {
      console.error(`[XiboService] Auditing update FAILED for ${displayId}:`, err.message);
      return null;
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
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/library`, { headers, params });
    return resp.data;
  }

  /**
   * Fetch Proof of Play stats.
   * @param {string} type - 'media', 'widget', or 'layout'
   * @param {Object} additionalParams - { fromDt, toDt, length }
   * @returns {Promise<Array>}
   */
  async getStats(type, additionalParams = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/stats`, {
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
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/playlist`, { headers, params });
    return resp.data;
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
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/campaign`, { headers, params });
    return resp.data;
  }

  /**
   * Fetch all layouts from Xibo.
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getLayouts(params = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/layout`, { headers, params });
    return resp.data;
  }

  /**
   * Fetch all schedules from Xibo.
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getSchedules(params = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/schedule`, { headers, params });
    return resp.data;
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
      ? `${this.baseUrl}/api/layout/setenablestat/${id}`
      : `${this.baseUrl}/api/library/setenablestat/${id}`;
    
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
      await axios.post(`${this.baseUrl}/api/display/${displayId}/command/collect_stats`, {}, { headers });
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
      const tasksRes = await axios.get(`${this.baseUrl}/api/task?length=200`, { headers });
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
        await axios.put(`${this.baseUrl}/api/task/${aggregationTask.taskId}`, params, {
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
  async updateDisplayAuditing(displayId, auditingUntil) {
    return await this.updateDisplay(displayId, { statsEnabled: 1, auditUntil: auditingUntil });
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
      const pResp = await axios.get(`${this.baseUrl}/api/playlist`, {
        headers,
        params: { name: playlistName }
      });

      const found = pResp.data?.find(p => (p.playlist === playlistName || p.name === playlistName));
      if (found) return found.playlistId;

      // 2. Create if not found
      console.log(`[XiboService] Creating playlist: ${playlistName}`);
      const createResp = await axios.post(`${this.baseUrl}/api/playlist`, 
        `name=${encodeURIComponent(playlistName)}&isDynamic=0`,
        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return createResp.data.playlistId;
    } catch (err) {
      if (err.response?.status === 409) {
          // Retry find once if conflict occurs
          const retry = await axios.get(`${this.baseUrl}/api/playlist`, { headers, params: { name: playlistName } });
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
      const resp = await axios.post(`${this.baseUrl}/api/playlist/library/assign/${playlistId}`, params, {
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
      await axios.delete(`${this.baseUrl}/api/playlist/widget/${widgetId}`, { headers });
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
      const resp = await axios.post(`${this.baseUrl}/api/library`, form, {
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
}

module.exports = new XiboService();



