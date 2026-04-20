const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('./xibo.service');
const timeUtils = require('../utils/time');

// ─── PRIVATE CACHES ───────────────────────────────────────────────────────
const WIDGET_CACHE_TTL_MS = 5 * 60 * 1000;
let _widgetCacheTime = 0;
let _widgetCache = null;
let _buildInProgress = null;

const STAT_CACHE_TTL_MS = 5 * 1000;
const _statResultCache = new Map();

/**
 * Service for aggregating and enriching playback statistics from Xibo.
 */
class StatsService {
  constructor() {
    this.uploadLogPath = path.join(__dirname, '../../upload_log.json');
    this._allMediaStatsCache = null;
    this._allMediaStatsCacheTime = 0;
    this._recentStatsCache = null;
    this._recentStatsCacheTime = 0;
    this._liveSnapshotCache = null;
    this._liveSnapshotCacheTime = 0;
    this._noiseBlacklist = ['Logo', 'Screenshot', 'S3 Screenshot', 'Default', 'Empty'];
  }

  _isNoise(name) {
    if (!name) return true;
    return this._noiseBlacklist.some(noise => name.toLowerCase().includes(noise.toLowerCase()));
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────

  async _getStatsWithRetry(type, params, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await xiboService.getStats(type, params);
      } catch (e) {
        if (e.response?.status === 429) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
        } else throw e;
      }
    }
    return { data: [] };
  }

  _formatLocal(d) {
    const pad = (n) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  async _buildWidgetCache() {
    const now = Date.now();
    if (_widgetCache && (now - _widgetCacheTime) < WIDGET_CACHE_TTL_MS) return _widgetCache;
    if (_buildInProgress) return _buildInProgress;

    _buildInProgress = (async () => {
      const cache = new Map();
      try {
        const headers = await xiboService.getHeaders();
        const baseUrl = xiboService.baseUrl;
        const res = await xiboService.getDisplays();
        if (res.syncing) {
            _widgetCache = new Map();
            _widgetCacheTime = Date.now();
            return _widgetCache;
        }
        const displays = res;

        await Promise.all(displays.map(async (display) => {
          try {
            const dId = display.displayId;
            const pRes = await axios.get(`${baseUrl}/api/playlist`, {
              headers,
              params: { name: `SCREEN_${dId}_SLOT_`, embed: 'widgets', length: 100 }
            });
            const playlists = (pRes.data || []).filter(p => (p.playlist || p.name || '').startsWith(`SCREEN_${dId}_SLOT_`));
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
          } catch (e) { }
        }));
      } catch (e) { }
      _widgetCache = cache;
      _widgetCacheTime = Date.now();
      _buildInProgress = null;
      return cache;
    })();
    return _buildInProgress;
  }

  /**
   * Internal: Fetch and deduplicate raw records for a media asset.
   * @private
   */
  async _fetchRawPlaybackRecords(mediaId, params) {
    const [mResAll, widgetCache] = await Promise.all([
      this._getStatsWithRetry('media', { ...params, 'mediaId[]': [mediaId] }),
      this._buildWidgetCache()
    ]);
    
    // Server-side filtering is safer, but we keep local fallback for Slot_X_ naming
    const mData = (mResAll.data || mResAll || []).filter(r => 
      String(r.mediaId) === String(mediaId) || (r.media || '').startsWith(`Slot_${mediaId}_`)
    );

    const widgetIds = widgetCache.get(String(mediaId)) || [];
    const widgetDataResults = await Promise.all(widgetIds.map(async (wid) => {
      try {
        const wRes = await this._getStatsWithRetry('widget', { ...params, 'widgetId[]': wid });
        return wRes.data || wRes || [];
      } catch (e) { return []; }
    }));
    const wData = [].concat(...widgetDataResults);

    const seen = new Set();
    return [...mData, ...wData].filter(r => {
      const key = r.id || `${r.displayId}|${r.widgetId}|${r.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Performs a global sync of Xibo playback logs into the local daily_media_stats table.
   * This is called by a background worker in server.js.
   */
  async syncAllStats() {
    const startTime = Date.now();
    console.log('[StatsService] Starting global playback synchronization...');
    try {
      // 1. Check database connectivity first
      try {
        await dbGet('SELECT 1');
      } catch (dbErr) {
        throw new Error(`Local database unreachable: ${dbErr.message}`);
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      
      const fromDt = this._formatLocal(thirtyDaysAgo);
      const fromDtRaw = this._formatLocal(fortyEightHoursAgo);

      // --- DRIFT BUFFER FIX: Fetch hits up to 2 hours in the future ---
      // This ensures we catch records if the Xibo CMS clock is ahead of the server clock.
      const toDt = this._formatLocal(new Date(now.getTime() + 2 * 60 * 60 * 1000));

      console.log(`[StatsService] Fetching Xibo stats from ${fromDt} to ${toDt}...`);

      const params = { fromDt, toDt, length: 15000 };
      const [mediaRes, widgetRes, rawRes] = await Promise.all([
        this._getStatsWithRetry('media', params).catch(e => { console.warn('[StatsService] Media stats fetch failed:', e.message); return { data: [] }; }),
        this._getStatsWithRetry('widget', params).catch(e => { console.warn('[StatsService] Widget stats fetch failed:', e.message); return { data: [] }; }),
        this._getStatsWithRetry('raw', { fromDt: fromDtRaw, toDt, length: 10000 }).catch(e => { console.warn('[StatsService] Raw stats fetch failed:', e.message); return { data: [] }; })
      ]);

      const mCount = (mediaRes.data || mediaRes || []).length;
      const wCount = (widgetRes.data || widgetRes || []).length;
      const rCount = (rawRes.data || rawRes || []).length;
      
      console.log(`[StatsService] Xibo Data: ${mCount} media, ${wCount} widgets, ${rCount} raw hits.`);

      const allStats = [
        ...(mediaRes.data || mediaRes || []),
        ...(widgetRes.data || widgetRes || []),
        ...(rawRes.data || rawRes || [])
      ];

      if (allStats.length === 0) {
          console.log('[StatsService] No playback records found in Xibo for this window.');
          return { success: true, count: 0 };
      }

      // Group by mediaId, displayId, and date
      const aggregated = {}; 
      
      const processRecord = (r, isRawData) => {
        if (!r.mediaId || !r.displayId) return;
        
        // --- DRIFT + IST NORMALIZATION ---
        const dateRaw = r.start || r.statDate || r.fromDt || '';
        if (!dateRaw) return;
        
        // Use measured CMS clock offset to convert Xibo time to Server/UTC time
        const xiboTime = new Date(dateRaw);
        const offset = isNaN(xiboService.clockOffset) ? 0 : xiboService.clockOffset;
        const utcTime = new Date(xiboTime.getTime() + offset);
        
        // Group by IST Date (YYYY-MM-DD in India)
        const dateStr = timeUtils.getISTDateString(utcTime);
        if (!dateStr) return;
        
        const key = `${r.mediaId}|${r.displayId}|${dateStr}`;
        if (!aggregated[key]) {
          aggregated[key] = { count: 0, isAggregated: false };
        }

        const count = parseInt(r.numberPlays || r.count || 1, 10);
        
        if (isRawData) {
          if (!aggregated[key].isAggregated) {
            aggregated[key].count += count;
          }
        } else {
          if (!aggregated[key].isAggregated) {
            aggregated[key].count = 0; 
            aggregated[key].isAggregated = true;
          }
          aggregated[key].count += count;
        }
      };

      (mediaRes.data || mediaRes || []).forEach(r => processRecord(r, false));
      (widgetRes.data || widgetRes || []).forEach(r => processRecord(r, false));
      (rawRes.data || rawRes || []).forEach(r => processRecord(r, true));

      // Update database using REPLACE (upsert)
      let saved = 0;
      let errors = 0;
      for (const [key, data] of Object.entries(aggregated)) {
        const [mId, dId, date] = key.split('|');
        try {
            await dbRun(
              'REPLACE INTO daily_media_stats (mediaId, displayId, date, count) VALUES (?, ?, ?, ?)',
              [mId, dId, date, data.count]
            );
            saved++;
        } catch (dbErr) {
            errors++;
            if (errors < 5) console.error(`[StatsService] DB Save Error for ${key}:`, dbErr.message);
        }
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[StatsService] Sync COMPLETE! Saved ${saved} entries to local DB (${errors} errors). Duration: ${duration}s`);
      
      this.invalidateCache();
      return { success: true, count: saved };
    } catch (err) {
      console.error('[StatsService] Global sync CRITICAL FAILURE:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── PUBLIC METHODS ─────────────────────────────────────────────────────

  async getRecentStats() {
    const now = Date.now();
    // Cache for 2 minutes — drastically reduces Xibo API calls and portal lag
    if (this._recentStatsCache && (now - this._recentStatsCacheTime) < 120000) return this._recentStatsCache;
    
    try {
      const [mediaMappings, brandsList] = await Promise.all([
          dbAll('SELECT * FROM media_brands'),
          dbAll('SELECT id, name FROM brands')
      ]);

      // Optimization: Read daily counts from local DB for the last 30 days
      const localStats = await dbAll(`
        SELECT s.*, m.brand_id, sl.slot_number
        FROM daily_media_stats s
        JOIN media_brands m ON s.mediaId = m.mediaId
        LEFT JOIN slots sl ON s.mediaId = sl.mediaId AND s.displayId = sl.displayId
        WHERE s.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `);

    const results = localStats.map(s => {
        const brand = brandsList.find(b => String(b.id) === String(s.brand_id));
        let playedAt = new Date().toISOString(); // fallback
        try {
          if (s.date) {
            // Apply drift normalization if we have a measured offset
            const baseTime = new Date(s.date).getTime();
            playedAt = new Date(baseTime - xiboService.clockOffset).toISOString();
          }
        } catch (e) {}

        return {
          mediaId: s.mediaId,
          adName: `Media #${s.mediaId}`, 
          displayId: s.displayId,
          playedAt,
          count: s.count,
          brandName: brand ? brand.name : 'Unknown',
          slot: s.slot_number || '-',
          source: 'Local DB'
        };
      });

      const finalResult = { data: results.sort((a,b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 500), total: results.length };
      this._recentStatsCache = finalResult;
      this._recentStatsCacheTime = Date.now();
      return finalResult;
    } catch (err) {
      console.error('[StatsService] getRecentStats failed:', err.message);
      return { data: [], total: 0 };
    }
  }

  async getWeeklyStats() {
    try {
      // Query raw totals grouped by date over the past 7 days 
      const rawRecords = await dbAll(`
        SELECT DATE(date) as day, SUM(count) as totalPlays 
        FROM daily_media_stats 
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
        GROUP BY DATE(date)
        ORDER BY DATE(date) ASC
      `);

      // Ensure a continuous 7-day mapping, filling 0 for days without records
      const mappedStats = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        // Format YYYY-MM-DD
        const dateStr = d.toISOString().split('T')[0];
        
        // Find if this date exists in the query result
        const existing = rawRecords.find(r => {
          let rDate = r.day;
          if (typeof rDate !== 'string') {
            try { rDate = new Date(r.day).toISOString().split('T')[0]; } 
            catch(e) {}
          } else {
             rDate = rDate.split(' ')[0];
          }
          return rDate === dateStr;
        });
        
        // Push the mapped item
        mappedStats.push({
          date: dateStr,
          total: existing ? parseInt(existing.totalPlays) : 0
        });
      }

      return { success: true, data: mappedStats };
    } catch (err) {
      console.error('[StatsService] getWeeklyStats failed:', err.message);
      return { success: false, data: [] };
    }
  }

  async getMediaStats(mediaId) {
    const cacheKey = String(mediaId);
    const cached = _statResultCache.get(cacheKey);
    if (cached && cached.result && (Date.now() - cached.ts) < STAT_CACHE_TTL_MS) return cached.result;
    if (cached && cached.promise) return cached.promise;

    const fetchPromise = (async () => {
      try {
        const now = new Date();
        const ninetyDaysAgo = new Date(now.getTime() - 7776000000);
        
        const ninetyDaysAgoStr = this._formatLocal(ninetyDaysAgo);
        
        // --- DRIFT BUFFER FIX: Fetch hits up to 2 hours in the future ---
        const nowStr = this._formatLocal(new Date(now.getTime() + 2 * 60 * 60 * 1000));
        const params = { fromDt: ninetyDaysAgoStr, toDt: nowStr, length: 10000 };

        const allRecords = await this._fetchRawPlaybackRecords(mediaId, params);
        
        // --- HYBRID FIX: Merge Raw Logs for Today (Bypass Xibo Aggregator Delay) ---
        // If XTR hasn't run today, we search for type=raw for the last 2 hours
        const twoHoursAgo = new Date(Date.now() - 7200000);
        const twoHoursAgoStr = this._formatLocal(twoHoursAgo);
        const rawRes = await this._getStatsWithRetry('raw', { fromDt: twoHoursAgoStr, toDt: nowStr, length: 1000 }).catch(() => ({ data: [] }));
        const rawHits = (rawRes.data || rawRes || []).filter(r => 
          (String(r.mediaId) === String(mediaId) || (r.media || '').startsWith(`Slot_${mediaId}_`)) &&
          new Date(r.start || r.fromDt) > twoHoursAgo
        );
        
        const mergedRecords = [...allRecords];
        const seenKeys = new Set(allRecords.map(r => `${r.displayId}|${r.start}`));
        rawHits.forEach(r => {
            const key = `${r.displayId}|${r.start}`;
            if (!seenKeys.has(key)) {
                mergedRecords.push(r);
                seenKeys.add(key);
            }
        });

        const [mediaMapping, slotMappings] = await Promise.all([
          dbGet('SELECT * FROM media_brands WHERE mediaId = ?', [mediaId]),
          dbAll('SELECT * FROM slots')
        ]);
        
        let lastCheckIn = null;
        if (mediaMapping) {
          const sMatch = slotMappings.find(s => String(s.brand_id) === String(mediaMapping.brand_id));
          if (sMatch) {
            const displays = await xiboService.getDisplays();
            const d = displays.find(disp => String(disp.displayId) === String(sMatch.displayId));
            if (d) lastCheckIn = d.lastAccessed;
          }
        }
        
        const brand = mediaMapping ? await dbGet('SELECT name FROM brands WHERE id = ?', [mediaMapping.brand_id]) : null;

        const history = mergedRecords.map(r => {
          let timeRaw = r.start || r.statDate || r.fromDt;
          if (!timeRaw) return null;
          
          // --- TIME NORMALIZATION FIX ---
          // Use the measured CMS clock offset to convert Xibo time to Server/UTC time.
          const xiboTime = new Date(timeRaw);
          const offset = isNaN(xiboService.clockOffset) ? 0 : xiboService.clockOffset;
          const utcTime = new Date(xiboTime.getTime() + offset);
          const time = utcTime.toISOString();
          const timeIST = timeUtils.formatIST(utcTime);
          
          let slot = '-';
          const nameMatch = (r.media || r.layout || '').match(/(?:Slot_|S)(\d+)_/i);
          if (nameMatch) {
            slot = parseInt(nameMatch[1], 10);
          } else {
            // Priority 1: Match by mediaId AND displayId in slots table
            const sMatch = slotMappings.find(s => String(s.displayId) === String(r.displayId) && String(s.mediaId) === String(mediaId));
            if (sMatch) {
              slot = sMatch.slot_number;
            } else if (mediaMapping) {
              // Priority 2: Match by brand fallback (if unique slot for brand on display)
              const bMatches = slotMappings.filter(s => String(s.displayId) === String(r.displayId) && String(s.brand_id) === String(mediaMapping.brand_id));
              if (bMatches.length === 1) slot = bMatches[0].slot_number;
            }
          }

          return { time, timeIST, display: r.display || `Display ${r.displayId}`, slot, brandName: brand ? brand.name : 'Unlinked' };
        }).filter(r => r && r.time).sort((a, b) => new Date(b.time) - new Date(a.time));

        const result = { mediaId, playCount: allRecords.reduce((sum, r) => sum + (r.numberPlays || 1), 0), history, lastCheckIn };
        _statResultCache.set(cacheKey, { result, ts: Date.now(), promise: null });
        return result;
      } catch (err) {
        _statResultCache.delete(cacheKey);
        throw err;
      }
    })();

    _statResultCache.set(cacheKey, { result: null, ts: 0, promise: fetchPromise });
    return fetchPromise;
  }

  async getLiveSnapshot() {
    const now = Date.now();
    // Cache live snapshot for 30 seconds
    if (this._liveSnapshotCache && (now - this._liveSnapshotCacheTime) < 30000) return this._liveSnapshotCache;
    try {
      const fifteenMinsAgo = new Date(Date.now() - 900000).toISOString().split('.')[0].replace('T', ' ');
      
      // --- DRIFT BUFFER FIX: Fetch hits up to 2 hours in the future ---
      const nowStr = this._formatLocal(new Date(Date.now() + 2 * 60 * 60 * 1000));
      const params = { fromDt: fifteenMinsAgo, toDt: nowStr, length: 1500 };

      const [mediaRes, widgetRes, mediaMappings, brandsList] = await Promise.all([
        this._getStatsWithRetry('media', params),
        this._getStatsWithRetry('widget', params),
        dbAll('SELECT * FROM media_brands'),
        dbAll('SELECT id, name FROM brands')
      ]);
      
      const allRaw = [...(mediaRes.data || mediaRes || []), ...(widgetRes.data || widgetRes || [])];
      const snapshot = {};
      allRaw.forEach(r => {
        const dId = r.displayId, start = r.start || r.statDate || r.fromDt;
        if (!start) return;
        if (!snapshot[dId] || new Date(start) > new Date(snapshot[dId].start)) {
          let brandName = 'Local/Unlinked';
          const m = mediaMappings.find(mm => String(mm.mediaId) === String(r.mediaId));
          if (m) {
            const b = brandsList.find(bb => String(bb.id) === String(m.brand_id));
            if (b) brandName = b.name;
          }
          const offsetRaw = isNaN(xiboService.clockOffset) ? 0 : xiboService.clockOffset;
          const nDate = new Date(new Date(start).getTime() + offsetRaw);
          const normalizedStart = nDate.toISOString();

          snapshot[dId] = { displayId: dId, displayName: r.display || `Display ${dId}`, adName: r.media || r.layout || (r.widgetId ? `Widget ${r.widgetId}` : 'Unknown'), brandName, start: normalizedStart, isLive: true };
        }
      });
      this._liveSnapshotCache = snapshot;
      this._liveSnapshotCacheTime = Date.now();
      return snapshot;
    } catch (err) { return {}; }
  }

  invalidateCache() {
    _widgetCache = null;
    _widgetCacheTime = 0;
    _statResultCache.clear();
    this._recentStatsCache = null;
    this._recentStatsCacheTime = 0;
    this._allMediaStatsCache = null;
    this._allMediaStatsCacheTime = 0;
    this._liveSnapshotCache = null;
    this._liveSnapshotCacheTime = 0;
    console.log('[StatsService] All caches invalidated.');
  }

  invalidateWidgetCache() {
    _widgetCache = null;
    _widgetCacheTime = 0;
  }

  async getAllMediaStats() {
    const now = Date.now();
    if (this._allMediaStatsCache && (now - this._allMediaStatsCacheTime) < 900000) return this._allMediaStatsCache;
    try {
      const dbStats = await dbAll(`
        SELECT mediaId, SUM(count) as totalPlays, MAX(date) as lastPlay, COUNT(DISTINCT displayId) as uniqueDisplays
        FROM daily_media_stats
        GROUP BY mediaId
      `);

      const res = await xiboService.getLibrary({ length: 500 });
      if (res.syncing) return [];
      const library = res;

      const summary = library
        .filter(m => !this._isNoise(m.name))
        .map(m => {
          const stats = dbStats.find(s => String(s.mediaId) === String(m.mediaId)) || { totalPlays: 0, lastPlay: null, uniqueDisplays: 0 };
          return {
            mediaId: m.mediaId,
            name: m.name,
            totalPlays: stats.totalPlays,
            lastPlay: stats.lastPlay,
            uniqueDisplays: stats.uniqueDisplays,
            type: m.mediaType
          };
        });

      const result = summary.sort((a, b) => b.totalPlays - a.totalPlays);
      this._allMediaStatsCache = result;
      this._allMediaStatsCacheTime = Date.now();
      return result;
    } catch (err) { 
      console.error('[StatsService] getAllMediaStats failed:', err.message);
      return []; 
    }
  }

  async forceSync(displayId) {
    try {
      const headers = await xiboService.getHeaders(), baseUrl = xiboService.baseUrl;
      await xiboService.updateDisplayAuditing(displayId, '2027-12-31 00:00:00');
      const displays = await xiboService.getDisplays();
      const display = displays.find(d => String(d.displayId) === String(displayId));
      if (display?.displayGroupId) {
        await axios.post(`${baseUrl}/api/displaygroup/${display.displayGroupId}/action/collectNow`, new URLSearchParams(), { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => {});
      }
      await axios.put(`${baseUrl}/api/display/requestscreenshot/${displayId}`, null, { headers }).catch(() => {});
      const tParams = new URLSearchParams(); tParams.append('isActive', '1'); tParams.append('schedule', '*/5 * * * *');
      await axios.put(`${baseUrl}/api/task/11`, tParams, { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => {});
      
      const run = async (id, name) => { 
        try { await axios.post(`${baseUrl}/api/task/${id}/run`, null, { headers }); } catch (e) { } 
      };
      await Promise.all([run(11, 'Sync'), run(4, 'Arch'), run(10, 'Rep')]);

      const slots = await dbAll('SELECT * FROM slots WHERE displayId = ?', [displayId]);
      await Promise.all(slots.map(async (slot) => {
        if (slot.brand_id) {
          const media = await dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [slot.brand_id]);
          await Promise.all(media.map(m => xiboService.setStatCollection('media', m.mediaId, true).catch(() => {})));
        }
      }));
      this.invalidateCache();
      return { success: true };
    } catch (err) { throw err; }
  }
}

module.exports = new StatsService();
