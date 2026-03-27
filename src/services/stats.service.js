const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('./xibo.service');

// ── In-memory cache for widgetId resolution (playlist structure rarely changes) ──
const WIDGET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _widgetCacheTime = 0;
let _widgetCache = null; // Map<mediaId_str, widgetId[]>
let _buildInProgress = null; // Singleton promise lock — prevents concurrent builds

// ── Short-lived stat result cache per mediaId (5s TTL) ──
const STAT_CACHE_TTL_MS = 5 * 1000; // 5 seconds
const _statResultCache = new Map(); // mediaId -> { result, ts, promise }

class StatsService {
  constructor() {
    this.uploadLogPath = path.join(__dirname, '../../upload_log.json');
    this._allMediaStatsCache = null;
    this._allMediaStatsCacheTime = 0;
    this._recentStatsCache = null;
    this._recentStatsCacheTime = 0;
    this._liveSnapshotCache = null;
    this._liveSnapshotCacheTime = 0;
  }

  /**
   * Fetch stats from Xibo with automatic retry on 429 rate-limit errors.
   * Retries up to 3 times with exponential backoff (500ms → 1s → 2s).
   */
  async _getStatsWithRetry(type, params, maxRetries = 3) {
    let lastErr;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await xiboService.getStats(type, params);
        return res;
      } catch (e) {
        const status = e.response?.status;
        if (status === 429) {
          const delay = 500 * Math.pow(2, attempt);
          console.warn('[StatsService] 429 rate limited on ' + type + ' stats, retrying in ' + delay + 'ms (attempt ' + (attempt + 1) + ')');
          await new Promise(r => setTimeout(r, delay));
          lastErr = e;
        } else {
          throw e; // Non-429 error — rethrow immediately
        }
      }
    }
    console.error('[StatsService] All retries exhausted for ' + type + ' stats');
    return { data: [] }; // Return empty rather than crashing
  }

  async getRecentStats() {
    const now = Date.now();
    if (this._recentStatsCache && (now - this._recentStatsCacheTime) < 60 * 1000) {
      return this._recentStatsCache;
    }
    let xiboRecords = [];
    try {
      // 30-day window — Xibo Cloud can delay aggregation, wider window ensures we always see data
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      const statsParams = { fromDt: thirtyDaysAgo, toDt: nowStr, length: 5000 };

      // Query sequentially to avoid 429 rate limiting (with retry on each)
      const mediaRes = await this._getStatsWithRetry('media', statsParams);
      await new Promise(r => setTimeout(r, 200));
      const widgetRes = await this._getStatsWithRetry('widget', statsParams);

      const mData = mediaRes.data || mediaRes || [];
      const wData = widgetRes.data || widgetRes || [];

      // Deduplicate: same play event can appear in both media and widget records
      const seen = new Set();
      const allRaw = [...mData, ...wData];
      const deduped = allRaw.filter(r => {
        const key = r.type + '|' + r.displayId + '|' + r.widgetId + '|' + r.start;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Phase 4.1: Fetch local mappings for enrichment
      const mediaMappings = await dbAll('SELECT * FROM media_brands');
      const slotMappings = await dbAll('SELECT * FROM slots');
      const brandsList = await dbAll('SELECT id, name FROM brands');

      // Asynchronous chunk processor
      const processChunks = async (items, chunkSize = 1000) => {
        let results = [];
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          const mapped = chunk.map(r => {
            let adName = r.media || r.layout || (r.widgetId ? 'Widget ' + r.widgetId : 'Unknown Ad');
            if (adName === 'Deleted from Layout' && r.layout) adName = r.layout;

            let playedAt = r.start || r.statDate || r.fromDt;
            if (playedAt && !playedAt.endsWith('Z')) playedAt += 'Z';

            // Resolve Brand and Slot (Enrichment)
            let brandName = 'Local/Unlinked';
            let slotNumber = '-';
            
            const mapping = mediaMappings.find(m => m.mediaId === r.mediaId);
            if (mapping) {
                const brand = brandsList.find(b => b.id === mapping.brand_id);
                if (brand) {
                    brandName = brand.name;
                    // Find actual slot on this display
                    const slot = slotMappings.find(s => s.displayId === r.displayId && s.brand_id === brand.id);
                    if (slot) slotNumber = slot.slot_number;
                }
            }

            return {
              adName,
              displayName: r.display || 'Display ' + r.displayId,
              displayId: r.displayId,
              playedAt,
              count: r.numberPlays || 1,
              brandName,
              slot: slotNumber,
              source: 'Xibo API'
            };
          });
          results = results.concat(mapped);
          await new Promise(resolve => setImmediate(resolve));
        }
        return results;
      };

      xiboRecords = await processChunks(deduped);
    } catch (err) {
      console.error('[StatsService] Xibo API stats fetch failed:', err.message);
    }

    const allRecords = [...xiboRecords];
    allRecords.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
    const finalResult = { data: allRecords.slice(0, 500), total: allRecords.length };
    this._recentStatsCache = finalResult;
    this._recentStatsCacheTime = Date.now();
    return finalResult;
  }

  /**
   * Build a cache of { mediaId -> widgetId[] } by scanning all slot playlists.
   * Cached for 5 minutes to prevent rate limiting from repeated playlist API calls.
   */
  async _buildWidgetCache() {
    const now = Date.now();
    // Return cached result if still fresh
    if (_widgetCache && (now - _widgetCacheTime) < WIDGET_CACHE_TTL_MS) {
      return _widgetCache;
    }
    // If a build is already in progress, wait for it — don't start a second one
    if (_buildInProgress) {
      return _buildInProgress;
    }

    // Start a new build and store its promise so concurrent callers can wait for it
    _buildInProgress = (async () => {
      const cache = new Map();
      try {
        const headers = await xiboService.getHeaders();
        const baseUrl = xiboService.baseUrl;
        const displays = await xiboService.getDisplays();

        for (const display of displays) {
          try {
            const dId = display.displayId;
            const pRes = await axios.get(baseUrl + '/api/playlist', {
              headers,
              params: { name: 'SCREEN_' + dId + '_SLOT_', embed: 'widgets', length: 100 }
            });
            await new Promise(r => setTimeout(r, 100));

            const playlists = (pRes.data || []).filter(p => {
              const name = p.playlist || p.name || '';
              return name.startsWith('SCREEN_' + dId + '_SLOT_') && name.endsWith('_PLAYLIST');
            });

            for (const pl of playlists) {
              for (const widget of (pl.widgets || [])) {
                const mIds = widget.mediaIds || (widget.mediaId ? [widget.mediaId] : []);
                for (const mid of mIds) {
                  const key = String(mid);
                  if (!cache.has(key)) cache.set(key, []);
                  cache.get(key).push(widget.widgetId);
                }
              }
            }
          } catch (e) { /* skip this display */ }
        }
      } catch (e) {
        console.error('[StatsService] _buildWidgetCache error:', e.message);
      }

      _widgetCache = cache;
      _widgetCacheTime = Date.now();
      _buildInProgress = null; // Release lock
      console.log('[StatsService] Widget cache built: ' + cache.size + ' media entries');
      return cache;
    })();

    return _buildInProgress;
  }




  async getMediaStats(mediaId) {
    const cacheKey = String(mediaId);
    const cached = _statResultCache.get(cacheKey);
    const now = Date.now();

    // Return cached result if still fresh (30s TTL)
    if (cached && cached.result && (now - cached.ts) < STAT_CACHE_TTL_MS) {
      console.log('[StatsService] Cache hit for mediaId=' + mediaId);
      return cached.result;
    }
    // If already fetching, share the in-flight promise
    if (cached && cached.promise) {
      return cached.promise;
    }

    // Start a fresh fetch, store the promise so concurrent callers share it
    const fetchPromise = (async () => {
      try {
      // 90-day window to capture Xibo Cloud aggregation delays
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      const statsParams = { fromDt: ninetyDaysAgo, toDt: nowStr, length: 5000 };

      // Step 1: Fetch ALL media stats (Xibo v4 rejects mediaId[] param — 422 error)
      // We pull everything then filter by mediaId client-side.
      const mResAll = await this._getStatsWithRetry('media', statsParams);
      const allMediaData = mResAll.data || mResAll || [];
      // Filter: match by mediaId field OR by Slot_<mediaId>_ prefix in media name
      const mData = allMediaData.filter(r =>
        r.mediaId == mediaId ||
        (r.media || '').startsWith('Slot_' + mediaId + '_')
      );

      // Step 2: Find widgetIds from the cache (no repeated playlist API calls)
      const cache = await this._buildWidgetCache();
      const widgetIds = cache.get(String(mediaId)) || [];
      console.log('[StatsService] mediaId=' + mediaId + ' -> widgetIds: [' + widgetIds.join(', ') + '] | allMedia: ' + allMediaData.length + ', filtered: ' + mData.length);

      // Step 3: Widget stats with widgetId[] (still valid in v4)
      let wData = [];
      for (const wid of widgetIds) {
        await new Promise(r => setTimeout(r, 250)); // Delay before each call
        try {
          const wRes = await this._getStatsWithRetry('widget', { ...statsParams, 'widgetId[]': wid });
          const records = wRes.data || wRes || [];
          wData = wData.concat(records);
        } catch (e) { /* skip on persistent error */ }
      }

      // Deduplicate by Xibo's own unique record ID (stable across API pagination)
      const seen = new Set();
      const allRecords = [...mData, ...wData].filter(r => {
        const key = r.id || (r.displayId + '|' + r.widgetId + '|' + r.start);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Phase 4.1: Find Slot/Brand Mapping
      const mediaMapping = await dbGet('SELECT * FROM media_brands WHERE mediaId = ?', [mediaId]);
      const slotMappings = await dbAll('SELECT * FROM slots');
      const brand = mediaMapping ? await dbGet('SELECT name FROM brands WHERE id = ?', [mediaMapping.brand_id]) : null;

      const history = allRecords
        .map(r => {
          let time = r.start || r.statDate || r.fromDt;
          if (time && !time.endsWith('Z')) time += 'Z';

          let slot = '-';
          if (mediaMapping) {
            const sMatch = slotMappings.find(s => s.displayId === r.displayId && s.brand_id === mediaMapping.brand_id);
            if (sMatch) slot = sMatch.slot_number;
          }
          
          // Fallback: Parse from media name (e.g. Slot_3_...)
          if (slot === '-') {
            const match = (r.media || '').match(/Slot_(\d+)/i);
            if (match) slot = parseInt(match[1]);
          }

          return { 
            time, 
            display: r.display || 'Display ' + r.displayId,
            slot,
            brandName: brand ? brand.name : 'Unlinked'
          };
        })
        .filter(r => r.time)
        .sort((a, b) => new Date(b.time) - new Date(a.time));

      // playCount = sum of numberPlays (Xibo can aggregate multiple plays into one record)
      const playCount = allRecords.reduce((sum, r) => sum + (r.numberPlays || 1), 0);

      const result = { mediaId, playCount, history };
      // Store in 30s cache and clear in-flight promise
      _statResultCache.set(cacheKey, { result, ts: Date.now(), promise: null });
      return result;
    } catch (err) {
      _statResultCache.delete(cacheKey); // Clear on error so next call tries again
      console.error('[StatsService] getMediaStats FAILED:', err.message);
      throw err;
    }
    })();

    // Register the in-flight promise so concurrent callers share it
    _statResultCache.set(cacheKey, { result: null, ts: 0, promise: fetchPromise });
    return fetchPromise;
  }

  /**
   * Returns a snapshot of what is CURRENTLY playing on each display.
   * Looks at the last 15 minutes of data.
   */
  async getLiveSnapshot() {
    const now = Date.now();
    if (this._liveSnapshotCache && (now - this._liveSnapshotCacheTime) < 30 * 1000) {
      return this._liveSnapshotCache;
    }
    try {
      // 15-minute window for "Live" status
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      const params = { fromDt: fifteenMinsAgo, toDt: nowStr, length: 500 };

      const mediaRes = await this._getStatsWithRetry('media', params);
      const widgetRes = await this._getStatsWithRetry('widget', params);
      
      const mData = mediaRes.data || mediaRes || [];
      const wData = widgetRes.data || widgetRes || [];
      const allRaw = [...mData, ...wData];

      // Local mappings for enrichment
      const mediaMappings = await dbAll('SELECT * FROM media_brands');
      const brandsList = await dbAll('SELECT id, name FROM brands');

      // Group by DisplayId and take the absolute latest per display
      const snapshot = {};
      
      allRaw.forEach(r => {
        const dId = r.displayId;
        const start = r.start || r.statDate || r.fromDt;
        if (!start) return;

        if (!snapshot[dId] || new Date(start) > new Date(snapshot[dId].start)) {
          let adName = r.media || r.layout || (r.widgetId ? 'Widget ' + r.widgetId : 'Unknown');
          
          let brandName = 'Local/Unlinked';
          const mapping = mediaMappings.find(m => m.mediaId === r.mediaId);
          if (mapping) {
            const brand = brandsList.find(b => b.id === mapping.brand_id);
            if (brand) brandName = brand.name;
          }

          snapshot[dId] = {
            displayId: dId,
            displayName: r.display || 'Display ' + dId,
            adName,
            brandName,
            start: start + (start.endsWith('Z') ? '' : 'Z'),
            isLive: true
          };
        }
      });

      this._liveSnapshotCache = snapshot;
      this._liveSnapshotCacheTime = Date.now();
      return snapshot;
    } catch (err) {
      console.error('[StatsService] getLiveSnapshot failed:', err.message);
      return {};
    }
  }

  // Call this after a new slot upload so the cache is refreshed
  invalidateWidgetCache() {
    _widgetCache = null;
    _widgetCacheTime = 0;
    console.log('[StatsService] Widget cache invalidated');
  }

  // Get a system-wide summary of all media play counts
  async getAllMediaStats() {
    const now = Date.now();
    if (this._allMediaStatsCache && (now - this._allMediaStatsCacheTime) < 15 * 60 * 1000) {
      return this._allMediaStatsCache;
    }
    try {
      console.log('[StatsService] Fetching all media stats summary...');
      const headers = await xiboService.getHeaders();
      const baseUrl = xiboService.baseUrl;

      // 1. Get Library (to get names/ids)
      const library = await xiboService.getLibrary({ length: 500 });
      
      // 2. Get All Media Stats (90-day window for safety)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      
      const statsRes = await this._getStatsWithRetry('media', { fromDt: ninetyDaysAgo, toDt: nowStr, length: 5000 });
      const statsData = statsRes.data || statsRes || [];

      // 3. Aggregate
      const summary = library.map(m => {
        const mId = m.mediaId;
        const records = statsData.filter(r => 
          r.mediaId == mId || 
          (r.media || '').startsWith(`Slot_${mId}_`)
        );
        
        const sorted = [...records].sort((a,b) => (b.start||'') > (a.start||'') ? 1 : -1);
        
        return {
          mediaId: mId,
          name: m.name,
          totalPlays: records.length,
          lastPlay: sorted[0]?.start || null,
          uniqueDisplays: new Set(records.map(r => r.displayId)).size,
          type: m.mediaType
        };
      });

      // Sort by plays descending
      const result = summary.sort((a, b) => b.totalPlays - a.totalPlays);
      this._allMediaStatsCache = result;
      this._allMediaStatsCacheTime = Date.now();
      return result;
    } catch (err) {
      console.error('[StatsService] getAllMediaStats failed:', err.message);
      return [];
    }
  }

  // ── Internal: run an XTR task by taskId ──────────────────────────────────

  async _runXtrTask(taskId, taskName, headers, baseUrl) {
    try {
      await axios.post(`${baseUrl}/api/task/${taskId}/run`, null, { headers });
      console.log(`[StatsService] ✅ Triggered XTR task ${taskId} (${taskName})`);
    } catch (e) {
      console.warn(`[StatsService] ⚠️  XTR task ${taskId} failed: ${e.response?.status} ${JSON.stringify(e.response?.data||e.message)}`);
    }
  }

  // Force a re-sync of stats for a specific display
  async forceSync(displayId) {
    try {
      console.log(`[StatsService] Force-syncing stats for display ${displayId}...`);
      const headers = await xiboService.getHeaders();
      const baseUrl = xiboService.baseUrl;

      // 1. Enable auditing until 2027 (long-lived — prevents expiry issues)
      await xiboService.updateDisplayAuditing(displayId, '2027-12-31 00:00:00');

      // 2. Get display info to get the displayGroupId (needed for collectNow)
      const displays = await xiboService.getDisplays();
      const display = displays.find(d => d.displayId == displayId);
      const displayGroupId = display?.displayGroupId;

      // 3. Trigger collectNow via displayGroup (correct Xibo v4 endpoint — display-level returns 404)
      if (displayGroupId) {
        await axios.post(`${baseUrl}/api/displaygroup/${displayGroupId}/action/collectNow`,
          new URLSearchParams(),
          { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
        ).catch(e => console.warn('[StatsService] displaygroup collectNow:', e.response?.status, e.response?.data || e.message));
        console.log(`[StatsService] collectNow sent to displayGroup ${displayGroupId}`);
      }

      // 4. Request screenshot (wakes the display, forces a check-in)
      await axios.put(`${baseUrl}/api/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});

      // 5. Trigger XTR aggregation tasks so Xibo Cloud processes raw play logs
      //    Task IDs: 11=StatsMigration, 4=StatsArchive, 10=ReportSchedule
      //    We reset the schedule of Task 11 to ensure it's ACTIVE and pointing to NOW.
      try {
        const tParams = new URLSearchParams();
        tParams.append('isActive', '1');
        tParams.append('schedule', '*/5 * * * *'); // Run every 5 minutes
        await axios.put(`${baseUrl}/api/task/11`, tParams, { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => {});
      } catch (e) { /* ignore task update error */ }

      await this._runXtrTask(11, 'StatsMigration', headers, baseUrl);
      await this._runXtrTask(4,  'StatsArchive',   headers, baseUrl);
      await this._runXtrTask(10, 'ReportSchedule', headers, baseUrl);

      // 6. Enable stats on all media in this display's slots
      const slots = await dbAll('SELECT * FROM slots WHERE displayId = ?', [displayId]);
      for (const slot of slots) {
        if (slot.brand_id) {
          const media = await dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [slot.brand_id]);
          for (const m of media) {
            try {
              await xiboService.setStatCollection('media', m.mediaId, true);
            } catch (e) { console.warn(`[StatsService] Skipping media ${m.mediaId}: ${e.message}`); }
          }
        }
      }
      // Name-based fallback for media not linked in DB
      const library = await xiboService.getLibrary({ length: 150 });
      const nameMatches = library.filter(m => m.name.includes(`Slot_`) || m.name.includes(`SCREEN_${displayId}`));
      for (const m of nameMatches) {
        try {
          await xiboService.setStatCollection('media', m.mediaId, true);
        } catch (e) { /* ignore 404 on missing media */ }
      }

      // 7. Clear all server-side caches so next request hits Xibo API fresh
      this.invalidateWidgetCache();
      _statResultCache.clear();

      console.log(`[StatsService] Force-sync complete for display ${displayId}`);
      return { success: true, displayGroupId };
    } catch (err) {
      console.error('[StatsService] Force sync failed:', err.message);
      throw err;
    }
  }
}

module.exports = new StatsService();

