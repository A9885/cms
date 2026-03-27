const axios = require('axios');
const FormData = require('form-data');

class XiboService {
  constructor() {
    this.baseUrl = process.env.XIBO_BASE_URL;
    this.clientId = process.env.XIBO_CLIENT_ID;
    this.clientSecret = process.env.XIBO_CLIENT_SECRET;
    this.cachedToken = null;
    this.tokenExpiry = null;
  }

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

  async getHeaders() {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async getDisplays(params = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/display`, { headers, params });
    return resp.data;
  }

  async updateDisplay(displayId, updates) {
    const headers = await this.getHeaders();
    try {
      // Fetch full display data first
      const displays = await this.getDisplays();
      const display = displays.find(d => d.displayId === parseInt(displayId));
      
      if (!display) throw new Error(`Display ${displayId} not found`);

      const params = new URLSearchParams();
      // Fields to skip because they cause validation errors or are read-only in Xibo v4
      const skipFields = [
        'displayId', 'lastAccessed', 'status', 'isLoggedIn', 
        'orientation', 'resolution', 'clientAddress', 'lastReported', 
        'version', 'isHardwareKeyValidated', 'screenShotModifiedDt',
        'overrideConfig', 'bandwidthLimit', 'bandwidthLimitFormatted',
        'createdDt', 'modifiedDt', 'folderId', 'permissionsFolderId', 'auditingUntil'
      ];
      
      Object.keys(display).forEach(key => {
        if (skipFields.includes(key)) return;
        
        // Use updated value if provided, otherwise keep existing
        let val = updates.hasOwnProperty(key) ? updates[key] : display[key];
        
        // Xibo v4 requires 'name' instead of 'display' in PUT
        if (key === 'display') {
          params.append('name', val);
          params.append('display', val);
          return;
        }

        if (val !== null && val !== undefined) {
          params.append(key, val);
        }
      });

      const resp = await axios.put(`${this.baseUrl}/api/display/${displayId}`, params, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return resp.data;
    } catch (err) {
      const detail = err.response?.data || err.message;
      throw new Error(`Xibo display update failed: ${JSON.stringify(detail)}`);
    }
  }

  async updateDisplayAuditing(displayId, auditingUntil) {
    try {
      // Quick check if already enabled
      const displays = await this.getDisplays();
      const display = displays.find(d => d.displayId === parseInt(displayId));
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

  async getLibrary(params = { start: 0, length: 150 }) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/library`, { headers, params });
    return resp.data;
  }

  async getStats(type, additionalParams = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/stats`, {
      headers,
      params: { type, ...additionalParams }
    });
    return resp.data;
  }

  async getPlaylists(params = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/playlist`, { headers, params });
    return resp.data;
  }

  async addDisplay(name, hardwareKey) {
    // Legacy method retained but now delegates to registerDisplay after finding by license key
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
   * Register (and optionally rename) a Xibo display by its numeric displayId.
   * Authorizes it if it is currently unlicensed.
   */
  async registerDisplay(displayId, name) {
    console.log(`[XiboService] Registering display ${displayId} as "${name}"...`);
    try {
      const displays = await this.getDisplays();
      const display = displays.find(d => d.displayId === displayId);
      if (!display) throw new Error(`Display with ID ${displayId} not found in Xibo.`);

      // Authorize if needed, always set name
      const updates = { display: name };
      if (display.licensed !== 1) {
        updates.licensed = 1;
        console.log(`[XiboService] Display ${displayId} is unauthorized — authorizing...`);
      }

      try {
        return await this.updateDisplay(displayId, updates);
      } catch (updateErr) {
        // If rename/auth fails, return the display as-is (it's already accessible)
        console.warn(`[XiboService] updateDisplay failed (non-fatal): ${updateErr.message}`);
        return { ...display, display: name };
      }
    } catch (err) {
      console.error('[XiboService] registerDisplay failed:', err.message);
      throw err;
    }
  }

  async getCampaigns(params = {}) {
    const headers = await this.getHeaders();
    const resp = await axios.get(`${this.baseUrl}/api/campaign`, { headers, params });
    return resp.data;
  }

  async setStatCollection(type, id, enabled = true) {
    const headers = await this.getHeaders();
    const endpoint = type === 'layout' 
      ? `${this.baseUrl}/api/layout/setenablestat/${id}`
      : `${this.baseUrl}/api/library/setenablestat/${id}`;
    
    // For media, value is 'On', 'Off', or 'Inherit'. For layouts, it's 1 or 0.
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
