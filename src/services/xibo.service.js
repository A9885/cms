const axios = require('axios');
const FormData = require('form-data');

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
    const resp = await axios.get(`${this.baseUrl}/api/display`, { headers, params });
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
        'createdDt', 'modifiedDt', 'folderId', 'permissionsFolderId', 'auditingUntil'
      ]);
      
      for (const [key, value] of Object.entries(display)) {
        if (skipFields.has(key)) continue;
        const val = updates.hasOwnProperty(key) ? updates[key] : value;
        if (key === 'display') {
          params.append('name', val);
          params.append('display', val);
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
}

module.exports = new XiboService();
