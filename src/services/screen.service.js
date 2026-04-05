const axios = require('axios');
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('./xibo.service');

/**
 * Service for managing screens and their associated slots in the CRM.
 */
class ScreenService {
  /**
   * Auto-provision 20 dedicated slots for a display if they don't already exist.
   * @param {number|string} displayId
   */
  async provisionSlots(displayId) {
    try {
      const existing = await dbGet('SELECT COUNT(*) as count FROM slots WHERE displayId = ?', [displayId]);
      if (existing && existing.count === 0) {
        console.log(`[ScreenService] Provisioning 20 dedicated slots for Display ${displayId}`);
        const tasks = [];
        for (let i = 1; i <= 20; i++) {
          tasks.push(dbRun('INSERT OR IGNORE INTO slots (displayId, slot_number) VALUES (?, ?)', [displayId, i]));
        }
        await Promise.all(tasks);
      }
    } catch (err) {
      console.error(`[ScreenService] Provisioning failed for ${displayId}:`, err.message);
    }
  }

  /**
   * Synchronize Xibo displays with local screen records.
   */
  async syncDisplays() {
    try {
      const displays = await xiboService.getDisplays();
      for (const d of displays) {
        const existing = await dbGet('SELECT id FROM screens WHERE xibo_display_id = ?', [d.displayId]);
        let status = 'Offline';
        if (d.licensed === 0) status = 'PendingAuth';
        else if (d.loggedIn) status = 'Online';
        
        // --- PoP SELF-HEALING: Verify recording permissions for ALL displays (Core Fix) ---
        const now = new Date();
        const auditDate = d.auditingUntil ? new Date(d.auditingUntil + ' UTC') : null;
        const needsAuditFix = !auditDate || auditDate < new Date(now.getTime() + 86400000); // If expired or expiring in < 24h
        const needsStatsFix = d.statsEnabled === 0 || d.statsEnabled === '0' || d.statsEnabled === false;

        if (needsAuditFix || needsStatsFix) {
            console.log(`[ScreenService] Self-Healing Display ${d.display} (Needs Fix: Audit=${needsAuditFix}, Stats=${needsStatsFix})`);
            try {
                // Extend to 2027 to be safe
                await xiboService.updateDisplayAuditing(d.displayId, '2027-12-31 00:00:00');
            } catch (e) {
                console.warn(`[ScreenService] Self-Healing failed for ${d.displayId}:`, e.message);
            }
        }

        if (!existing) {
          console.log(`[ScreenService] NEW Display detected: ${d.display} (ID: ${d.displayId}). Provisioning slots...`);
          const byName = await dbGet('SELECT id FROM screens WHERE name = ? AND xibo_display_id IS NULL', [d.display]);
          if (byName) await dbRun('UPDATE screens SET xibo_display_id = ?, status = ? WHERE id = ?', [d.displayId, status, byName.id]);
          else await dbRun(`INSERT INTO screens (name, xibo_display_id, status) VALUES (?, ?, ?)`, [d.display || 'Unknown', d.displayId, status]);
        } else {
          await dbRun('UPDATE screens SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, existing.id]);
        }
        
        await this.provisionSlots(d.displayId);
      }
    } catch (err) { console.error('[ScreenService] syncDisplays failed:', err.message); }
  }

  /**
   * Internal: Resolve location address from GPS coordinates using reverse-geocoding.
   * @private
   */
  async _resolveAddressFromGPS(display) {
    const lat = parseFloat(display.latitude), lon = parseFloat(display.longitude);
    try {
      const res = await axios.get(`http://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const geo = res.data;
      if (geo?.city) {
        const address = [geo.city, geo.principalSubdivision, geo.countryName].filter(Boolean).join(', ');
        if (address !== (display.address || '').trim()) {
          await xiboService.updateDisplayLocation(display.displayId, { latitude: lat, longitude: lon, address });
          await dbRun(
            'UPDATE screens SET latitude = ?, longitude = ?, address = ?, location_source = "GPS", updated_at = CURRENT_TIMESTAMP WHERE xibo_display_id = ?',
            [lat, lon, address, display.displayId]
          );
        }
      }
    } catch (e) { console.warn(`[ScreenService] GPS geocode failed for ${display.display}:`, e.message); }
  }

  /**
   * Internal: Fallback to Geo-IP for location if GPS is unavailable.
   * @private
   */
  async _resolveLocationFromIP(display) {
    if (!display.clientAddress || ['127.0.0.1', 'localhost', '::1'].includes(display.clientAddress)) return;
    try {
      const res = await axios.get(`http://ip-api.com/json/${display.clientAddress}?fields=status,message,country,regionName,city,lat,lon`);
      const geo = res.data;
      if (geo?.status === 'success') {
        const address = `${geo.city}, ${geo.regionName}, ${geo.country}`;
        const lat = parseFloat(geo.lat), lon = parseFloat(geo.lon);
        await xiboService.updateDisplayLocation(display.displayId, { latitude: lat, longitude: lon, address });
        await dbRun(
            'UPDATE screens SET latitude = ?, longitude = ?, address = ?, location_source = "IP", updated_at = CURRENT_TIMESTAMP WHERE xibo_display_id = ?',
            [lat, lon, address, display.displayId]
        );
      }
    } catch (e) { console.warn(`[ScreenService] Geo-IP failed for ${display.display}:`, e.message); }
  }

  /**
   * Synchronize a specific display's location — GPS ONLY.
   * No IP geolocation fallback. Screens without a GPS fix are marked "Awaiting GPS".
   * @param {number|string} displayId Xibo Display ID
   */
  async syncLocation(displayId) {
    try {
      const displays = await xiboService.getDisplays({ displayId });
      const d = displays.find(disp => String(disp.displayId) === String(displayId));
      if (!d) return;

      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      const hasValidGPS = d.latitude && d.longitude && !isNaN(lat) && !isNaN(lon) 
                          && (lat !== 0 || lon !== 0)
                          && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

      if (hasValidGPS) {
        console.log(`[ScreenService] ✅ GPS from Xibo for ${d.display}: ${lat}, ${lon}`);
        // Update coordinates and resolve human-readable address
        await dbRun(
          'UPDATE screens SET latitude = ?, longitude = ?, location_source = "GPS", updated_at = CURRENT_TIMESTAMP WHERE xibo_display_id = ?',
          [lat, lon, displayId]
        );
        await this._resolveAddressFromGPS(d);
      } else {
        // No GPS from device yet — mark as Awaiting GPS, do NOT use IP approximation
        console.log(`[ScreenService] ⏳ No GPS fix for ${d.display}. Marking as "Awaiting GPS". IP fallback disabled.`);
        await dbRun(
          'UPDATE screens SET location_source = "Awaiting GPS", updated_at = CURRENT_TIMESTAMP WHERE xibo_display_id = ? AND (latitude IS NULL OR latitude = 0)',
          [displayId]
        );
      }
    } catch (err) {
      console.error(`[ScreenService] syncLocation FAILED for ${displayId}:`, err.message);
    }
  }

  /**
   * Main location synchronization job. Orchestrates GPS/IP resolution for all displays.
   */
  async syncAllLocations() {
    console.log(`[${new Date().toISOString()}] [ScreenService] Starting location sync...`);
    try {
      const displays = await xiboService.getDisplays();
      for (const d of displays) {
        await this.syncLocation(d.displayId);
        await new Promise(r => setTimeout(r, 1000)); // Throttle
      }
      console.log(`[${new Date().toISOString()}] [ScreenService] Sync complete.`);
    } catch (err) { console.error('[ScreenService] syncAllLocations failed:', err.message); }
  }

  /**
   * Enrich local screen records with real-time status from Xibo.
   */
  async enrichWithXibo(screens) {
    let displays = [];
    try { displays = await xiboService.getDisplays(); } catch (e) { console.warn('[ScreenService] enrichWithXibo: CMS unreachable'); }
    return screens.map(s => {
      const xibo = displays.find(d => String(d.displayId) === String(s.xibo_display_id));
      const status = xibo ? (xibo.loggedIn ? 'Online' : 'Offline') : 'Not Linked';
      return { ...s, isLinked: !!s.xibo_display_id, liveStatus: status, lastAccessed: xibo?.lastAccessed || null };
    });
  }
}

module.exports = new ScreenService();
