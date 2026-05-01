const axios = require('axios');
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('./xibo.service');
const bufferService = require('./buffer.service');

/**
 * Service for managing screens and their associated slots in the CRM.
 */
class ScreenService {
  /**
   * Helper to log screen-specific events
   */
  async logEvent(screenId, type, details) {
    try {
      await dbRun(
        'INSERT INTO screen_event_logs (screen_id, event_type, details) VALUES (?, ?, ?)',
        [screenId, type, details]
      );
    } catch (err) {
      console.warn(`[ScreenService] Failed to log event for screen ${screenId}:`, err.message);
    }
  }

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
      const res = await xiboService.getDisplays();
      if (res.syncing) {
        console.log('[ScreenService] Sync deferred: Xibo is in syncing state.');
        return;
      }
      const displays = res;

      for (const d of displays) {
        const existing = await dbGet('SELECT id FROM screens WHERE xibo_display_id = ?', [d.displayId]);
        let status = 'Offline';
        if (d.licensed === 0) status = 'PendingAuth';
        else if (d.loggedIn) status = 'Online';
        
        // --- PoP SELF-HEALING: Verify recording permissions for ALL displays (Core Fix) ---
        // Only attempt a fix if the audit window expires within 7 days (not every single cycle).
        const now = new Date();
        const auditDate = d.auditingUntil ? new Date(d.auditingUntil + ' UTC') : null;
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const needsAuditFix = !auditDate || auditDate < sevenDaysFromNow;
        const needsStatsFix = d.statsEnabled === 0 || d.statsEnabled === '0' || d.statsEnabled === false;

        if (needsAuditFix || needsStatsFix) {
            console.log(`[ScreenService] Self-Healing Display ${d.display} (Needs Fix: Audit=${needsAuditFix}, Stats=${needsStatsFix})`);
            try {
                // Extend audit window to 2027; updateDisplayAuditing() will auto-assign
                // a defaultLayoutId if one is missing, preventing the Xibo 422 error.
                await xiboService.updateDisplayAuditing(d.displayId, '2027-12-31 00:00:00');

                // --- ROBUSTNESS: Ensure all media in active slots have Stats Collection Enabled ---
                const slotAds = await dbAll('SELECT mediaId FROM slots WHERE displayId = ? AND mediaId IS NOT NULL', [d.displayId]);
                for (const ad of slotAds) {
                   await xiboService.setStatCollection('media', ad.mediaId, true).catch(() => {});
                }

                console.log(`[ScreenService] ✅ Self-Healing complete for Display ${d.display}`);
            } catch (e) {
                // Non-fatal: log but don't break the sync loop for other displays
                console.warn(`[ScreenService] Self-Healing failed for ${d.displayId}:`, e.message);
            }
        }

        const orientation = d.orientation || 'Landscape';
        const resolution = d.resolution || '';
        const clientAddress = d.clientAddress || '';
        const macAddress = d.macAddress || '';
        const brand = d.brand || '';
        const model = d.model || '';
        const license = d.license || ''; // Hardware Key
        const latitude = d.latitude ? parseFloat(d.latitude) : null;
        const longitude = d.longitude ? parseFloat(d.longitude) : null;

        const screen = await dbGet('SELECT id, name, previous_status FROM screens WHERE xibo_display_id = ?', [d.displayId]);
        const newStatus = status;

        if (!screen) {
          console.log(`[ScreenService] NEW Display detected: ${d.display} (ID: ${d.displayId}). Provisioning slots...`);
          const byName = await dbGet('SELECT id FROM screens WHERE name = ? AND xibo_display_id IS NULL', [d.display]);
          if (byName) {
            await dbRun(
              `UPDATE screens SET 
                xibo_display_id = ?, status = ?, previous_status = ?, screen_id = COALESCE(screen_id, ?),
                orientation = ?, resolution = ?, client_address = ?, mac_address = ?, 
                brand = ?, device_model = ?, license = ?, latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?), last_sync = NOW()
               WHERE id = ?`, 
              [d.displayId, newStatus, newStatus, `SIG-${d.displayId}`, orientation, resolution, clientAddress, macAddress, brand, model, license, latitude, longitude, byName.id]
            );
            await this.logEvent(byName.id, 'provisioning', `Assigned to Xibo Display ${d.display} (ID: ${d.displayId}). Initial status: ${newStatus}`);
          } else {
            const sid = `SIG-${d.displayId}`;
            const result = await dbRun(
              `INSERT INTO screens (name, xibo_display_id, status, previous_status, screen_id, orientation, resolution, client_address, mac_address, brand, device_model, license, latitude, longitude, last_sync) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
               [d.display || 'Unknown', d.displayId, newStatus, newStatus, sid, orientation, resolution, clientAddress, macAddress, brand, model, license, latitude, longitude]
            );
            await this.logEvent(result.id, 'provisioning', `New Screen detected and provisioned. Xibo ID: ${d.displayId}. Initial status: ${newStatus}`);
          }
        } else {
          // Transition Logic
          const wasOnline = screen.previous_status === 'Online' || screen.previous_status === null;
          const isNowOffline = newStatus === 'Offline';

          if (wasOnline && isNowOffline) {
            await bufferService.recordOfflineStart(d.displayId);
            await this.logEvent(screen.id, 'status_change', 'Screen went OFFLINE');
          }

          const wasOffline = screen.previous_status === 'Offline';
          const isNowOnline = newStatus === 'Online';

          if (wasOffline && isNowOnline) {
            await bufferService.recordOfflineEnd(d.displayId);
            await this.logEvent(screen.id, 'status_change', 'Screen back ONLINE');
          }

          await dbRun(
            `UPDATE screens SET 
              status = ?, previous_status = ?,
              orientation = COALESCE(NULLIF(orientation, ''), ?), 
              resolution = COALESCE(NULLIF(resolution, ''), ?), 
              client_address = ?, mac_address = ?, 
              brand = ?, device_model = ?, license = ?,
              latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?),
              updated_at = CURRENT_TIMESTAMP, last_sync = NOW()
             WHERE id = ?`, 
            [newStatus, newStatus, orientation, resolution, clientAddress, macAddress, brand, model, license, latitude, longitude, screen.id]
          );
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
    
    // FIX 2: Validation guards to prevent 400 error logs
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return;
    
    // Skip if address is a placeholder or too short to be valid
    const currentAddr = (display.address || '').trim();
    if (!currentAddr || currentAddr.toLowerCase() === "i don't know" || currentAddr.length < 5) {
      // If it's a known placeholder, we don't want to log a warning, just skip
      if (currentAddr.toLowerCase() === "i don't know") return;
    }

    try {
      const res = await axios.get(`http://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const geo = res.data;
      if (geo?.city) {
        const address = [geo.city, geo.principalSubdivision, geo.countryName].filter(Boolean).join(', ');
        if (address !== currentAddr) {
          await xiboService.updateDisplayLocation(display.displayId, { latitude: lat, longitude: lon, address });
          await dbRun(
            'UPDATE screens SET latitude = ?, longitude = ?, address = ?, location_source = "GPS", updated_at = CURRENT_TIMESTAMP WHERE xibo_display_id = ?',
            [lat, lon, address, display.displayId]
          );
        }
      }
    } catch (e) { 
      // Only log if it's not a 400 error caused by invalid data we missed
      if (e.response?.status !== 400) {
        console.warn(`[ScreenService] GPS geocode failed for ${display.display}:`, e.message); 
      }
    }
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
      const res = await xiboService.getDisplays({ displayId });
      if (res.syncing) return;
      const displays = res;
      
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
      const res = await xiboService.getDisplays();
      if (res.syncing) return;
      const displays = res;

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
    try { 
        const res = await xiboService.getDisplays(); 
        displays = res.syncing ? [] : res;
    } catch (e) { console.warn('[ScreenService] enrichWithXibo: CMS unreachable'); }
    return screens.map(s => {
      const xibo = Array.isArray(displays) ? displays.find(d => String(d.displayId) === String(s.xibo_display_id)) : null;
      const status = xibo ? (xibo.loggedIn ? 'Online' : 'Offline') : (displays.syncing ? 'Syncing...' : 'Not Linked');
      return { ...s, isLinked: !!s.xibo_display_id, liveStatus: status, lastAccessed: xibo?.lastAccessed || null };
    });
  }

  // ─── PARTNER GROUP SYNC (SaaS Hook) ─────────────────────────────

  /**
   * When a screen is assigned to a partner, auto-add it to their Xibo display group.
   * No-op if the partner hasn't provisioned Xibo yet.
   * @param {number} xibo_display_id
   * @param {number} partnerId
   */
  async onScreenAssignedToPartner(xibo_display_id, partnerId) {
    if (!xibo_display_id || !partnerId) return;
    try {
      const provisioningService = require('./xibo-provisioning.service');
      const result = await provisioningService.assignDisplayToPartnerGroup(xibo_display_id, partnerId);
      if (result) {
        console.log(`[ScreenService] ✅ Screen ${xibo_display_id} auto-joined partner ${partnerId}'s Xibo group`);
      }
    } catch (err) {
      console.warn(`[ScreenService] onScreenAssignedToPartner non-fatal:`, err.message);
    }
  }

  /**
   * When a screen is removed from a partner, auto-remove it from their Xibo display group.
   * @param {number} xibo_display_id
   * @param {number} oldPartnerId
   */
  async onScreenRemovedFromPartner(xibo_display_id, oldPartnerId) {
    if (!xibo_display_id || !oldPartnerId) return;
    try {
      const provisioningService = require('./xibo-provisioning.service');
      const result = await provisioningService.removeDisplayFromPartnerGroup(xibo_display_id, oldPartnerId);
      if (result) {
        console.log(`[ScreenService] ✅ Screen ${xibo_display_id} auto-removed from partner ${oldPartnerId}'s Xibo group`);
      }
    } catch (err) {
      console.warn(`[ScreenService] onScreenRemovedFromPartner non-fatal:`, err.message);
    }
  }

  /**
   * Push local screen updates (name, location) back to Xibo CMS.
   * @param {number|string} screenId Local screen ID
   */
  async pushToXibo(screenId) {
    try {
      const screen = await dbGet('SELECT * FROM screens WHERE id = ?', [screenId]);
      if (!screen || !screen.xibo_display_id) return;

      console.log(`[ScreenService] Pushing updates for Screen ${screenId} to Xibo (Display ID: ${screen.xibo_display_id})`);
      
      const updates = {
        name: screen.name,
        latitude: screen.latitude,
        longitude: screen.longitude,
        address: screen.address
      };

      await xiboService.updateDisplay(screen.xibo_display_id, updates);
      console.log(`[ScreenService] ✅ Xibo sync successful for Screen ${screenId}`);
    } catch (err) {
      console.error(`[ScreenService] ❌ Failed to push updates to Xibo for Screen ${screenId}:`, err.message);
    }
  }

  /**
   * Flushes all buffered statistics for a display back to Xibo CMS.
   */
  async flushBufferedStats(displayId) {
    console.log(`[ScreenService] Starting buffer flush for Display ${displayId}...`);
    try {
        const pending = await bufferService.getPendingStats(displayId);
        if (!pending || pending.length === 0) {
            await bufferService.markWindowFlushed(displayId);
            return;
        }

        const batches = [];
        for (let i = 0; i < pending.length; i += 50) {
            batches.push(pending.slice(i, i + 50));
        }

        let totalFlushed = 0;
        for (const batch of batches) {
            try {
                await Promise.all(batch.map(async (record) => {
                    await xiboService.postStats({
                        displayId: record.display_id,
                        mediaId: record.media_id,
                        layoutId: record.layout_id,
                        widgetId: record.widget_id,
                        statDate: record.stat_date,
                        duration: record.duration
                    });
                    totalFlushed++;
                }));

                await bufferService.markSynced(batch.map(r => r.id));
            } catch (batchErr) {
                console.error(`[ScreenService] Batch flush failed for ${displayId}:`, batchErr.message);
                await bufferService.markSyncFailed(batch.map(r => r.id));
                break;
            }
        }

        await bufferService.markWindowFlushed(displayId);
        if (totalFlushed > 0) {
            console.log(`[ScreenService] ✅ Flushed ${totalFlushed} stats for Display ${displayId} after reconnect.`);
        }
    } catch (err) {
        console.error(`[ScreenService] Flush error for ${displayId}:`, err.message);
    }
  }
  /**
   * Automatically free slots that have reached their end date or
   * belong to expired/cancelled subscriptions.
   */
  async cleanupExpiredSlots() {
    try {
      // 1. Mark subscriptions as Expired if their end_date has passed
      const subResult = await dbRun(`
        UPDATE subscriptions 
        SET status = 'Expired' 
        WHERE status = 'Active' AND end_date < NOW()
      `);
      if (subResult.changes > 0) {
        console.log(`[ScreenService] 📅 Marked ${subResult.changes} subscriptions as Expired.`);
      }

      // 2. Identify and free slots that are past their end date or linked to non-active subscriptions
      const slotsToFree = await dbAll(`
        SELECT id, displayId, slot_number, xibo_widget_id, playlist_id 
        FROM slots 
        WHERE status != 'Available' 
        AND (
          (end_date IS NOT NULL AND end_date < NOW())
          OR (subscription_id IS NOT NULL AND subscription_id IN (SELECT id FROM subscriptions WHERE status IN ('Expired', 'Cancelled')))
        )
      `);

      for (const slot of slotsToFree) {
          if (slot.xibo_widget_id) {
              try {
                  console.log(`[ScreenService] 🗑️ Deleting Xibo widget ${slot.xibo_widget_id} for Slot ${slot.slot_number} on Screen ${slot.displayId} (Subscription Expired)`);
                  await xiboService.removeWidgetFromPlaylist(slot.xibo_widget_id);
              } catch (xErr) {
                  console.error(`[ScreenService] ⚠️ Failed to delete Xibo widget ${slot.xibo_widget_id}:`, xErr.message);
              }
          }
          
          await dbRun(`
              UPDATE slots 
              SET status = 'Available', 
                  brand_id = NULL, 
                  subscription_id = NULL, 
                  mediaId = NULL, 
                  creative_name = NULL,
                  start_date = NULL, 
                  end_date = NULL,
                  playlist_id = NULL,
                  xibo_widget_id = NULL,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
          `, [slot.id]);
      }

      if (slotsToFree.length > 0) {
        console.log(`[ScreenService] 🔓 Freed ${slotsToFree.length} expired slots.`);
      }

      // 3. Reconcile brand slot limits (liberate excess slots if capacity dropped)
      const brands = await dbAll('SELECT id FROM brands');
      let totalExcessFreed = 0;
      for (const brand of brands) {
          // Get total allowed slots across all ACTIVE subscriptions for this brand
          const activeSubs = await dbAll(
              `SELECT SUM(slots_included) as allowed_slots 
               FROM subscriptions 
               WHERE brand_id = ? AND status = 'Active' AND start_date <= NOW() AND end_date >= NOW()`,
              [brand.id]
          );
          const allowed = activeSubs[0].allowed_slots || 0;
          
          // Get all currently assigned slots for this brand
          const assignedSlots = await dbAll(
              'SELECT id, displayId, slot_number, xibo_widget_id FROM slots WHERE brand_id = ? ORDER BY updated_at ASC',
              [brand.id]
          );
          const assignedCount = assignedSlots.length;
          
          if (assignedCount > allowed) {
              const excess = assignedCount - allowed;
              const slotsToLiberate = assignedSlots.slice(0, excess);
              
              for (const slot of slotsToLiberate) {
                  if (slot.xibo_widget_id) {
                      try {
                          console.log(`[ScreenService] ⚖️ Deleting Xibo widget ${slot.xibo_widget_id} for Slot ${slot.slot_number} on Screen ${slot.displayId} (Capacity Reconciliation)`);
                          await xiboService.removeWidgetFromPlaylist(slot.xibo_widget_id);
                      } catch (xErr) {
                          console.error(`[ScreenService] ⚠️ Reconciler failed to delete Xibo widget ${slot.xibo_widget_id}:`, xErr.message);
                      }
                  }
                  
                  await dbRun(`
                      UPDATE slots 
                      SET status = 'Available', 
                          brand_id = NULL, 
                          subscription_id = NULL, 
                          mediaId = NULL, 
                          creative_name = NULL,
                          start_date = NULL, 
                          end_date = NULL,
                          playlist_id = NULL,
                          xibo_widget_id = NULL,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?
                  `, [slot.id]);
              }
              console.log(`[ScreenService] ⚖️ Liberated ${excess} excess slots for Brand ID ${brand.id} due to capacity reduction.`);
              totalExcessFreed += excess;
          }
      }
      console.log(`[ScreenService] ⚖️ Liberated ${totalExcessFreed} excess slots across all brands.`);

      // 4. Ghost Purge: Find Available slots that still have a xibo_widget_id (Leaked)
      const ghostSlots = await dbAll(`
          SELECT id, displayId, slot_number, xibo_widget_id 
          FROM slots 
          WHERE status = 'Available' AND xibo_widget_id IS NOT NULL
      `);
      
      for (const slot of ghostSlots) {
          try {
              console.log(`[ScreenService] 👻 Purging ghost widget ${slot.xibo_widget_id} from Available Slot ${slot.slot_number} on Screen ${slot.displayId}`);
              await xiboService.removeWidgetFromPlaylist(slot.xibo_widget_id);
          } catch (xErr) {
              console.error(`[ScreenService] ⚠️ Failed to purge ghost widget ${slot.xibo_widget_id}:`, xErr.message);
          }
          await dbRun('UPDATE slots SET xibo_widget_id = NULL WHERE id = ?', [slot.id]);
      }

      return slotsToFree.length + totalExcessFreed + ghostSlots.length;
    } catch (err) {
      console.error('[ScreenService] Cleanup Error:', err.message);
      return 0;
    }
  }
}

module.exports = new ScreenService();
