const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('./xibo.service');

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

  async _buildWidgetCache() {
    const now = Date.now();
    if (_widgetCache && (now - _widgetCacheTime) < WIDGET_CACHE_TTL_MS) return _widgetCache;
    if (_buildInProgress) return _buildInProgress;

    _buildInProgress = (async () => {
      const cache = new Map();
      try {
        const headers = await xiboService.getHeaders();
        const baseUrl = xiboService.baseUrl;
        const displays = await xiboService.getDisplays();

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
      this._getStatsWithRetry('media', params),
      this._buildWidgetCache()
    ]);
    
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

  // ─── PUBLIC METHODS ─────────────────────────────────────────────────────

  async getRecentStats() {
    const now = Date.now();
    if (this._recentStatsCache && (now - this._recentStatsCacheTime) < 60000) return this._recentStatsCache;
    
    try {
      const thirtyDaysAgo = new Date(Date.now() - 2592000000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      const params = { fromDt: thirtyDaysAgo, toDt: nowStr, length: 5000 };

      const [mediaRes, widgetRes] = await Promise.all([
        this._getStatsWithRetry('media', params),
        this._getStatsWithRetry('widget', params)
      ]);

      const allRaw = [...(mediaRes.data || mediaRes || []), ...(widgetRes.data || widgetRes || [])];
      const seen = new Set();
      const deduped = allRaw.filter(r => {
        const key = `${r.type}|${r.displayId}|${r.widgetId}|${r.start}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const [mediaMappings, slotMappings, brandsList] = await Promise.all([
          dbAll('SELECT * FROM media_brands'),
          dbAll('SELECT * FROM slots'),
          dbAll('SELECT id, name FROM brands')
      ]);

      const results = deduped.map(r => {
        let adName = r.media || r.layout || (r.widgetId ? `Widget ${r.widgetId}` : 'Unknown Ad');
        let playedAt = r.start || r.statDate || r.fromDt;
        if (playedAt && !playedAt.endsWith('Z')) playedAt += 'Z';

        let brandName = 'Local/Unlinked', slotNumber = '-';
        const mapping = mediaMappings.find(m => String(m.mediaId) === String(r.mediaId));
        if (mapping) {
          const brand = brandsList.find(b => String(b.id) === String(mapping.brand_id));
          if (brand) {
            brandName = brand.name;
            const slot = slotMappings.find(s => String(s.displayId) === String(r.displayId) && String(s.brand_id) === String(brand.id));
            if (slot) slotNumber = slot.slot_number;
          }
        }
        return { adName, displayName: r.display || `Display ${r.displayId}`, displayId: r.displayId, playedAt, count: r.numberPlays || 1, brandName, slot: slotNumber, source: 'Xibo API' };
      });

      results.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
      const finalResult = { data: results.slice(0, 500), total: results.length };
      this._recentStatsCache = finalResult;
      this._recentStatsCacheTime = Date.now();
      return finalResult;
    } catch (err) {
      console.error('[StatsService] getRecentStats failed:', err.message);
      return { data: [], total: 0 };
    }
  }

  async getMediaStats(mediaId) {
    const cacheKey = String(mediaId);
    const cached = _statResultCache.get(cacheKey);
    if (cached && cached.result && (Date.now() - cached.ts) < STAT_CACHE_TTL_MS) return cached.result;
    if (cached && cached.promise) return cached.promise;

    const fetchPromise = (async () => {
      try {
        const ninetyDaysAgo = new Date(Date.now() - 7776000000).toISOString().split('.')[0].replace('T', ' ');
        const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
        const params = { fromDt: ninetyDaysAgo, toDt: nowStr, length: 5000 };

        const allRecords = await this._fetchRawPlaybackRecords(mediaId, params);
        const [mediaMapping, slotMappings] = await Promise.all([
          dbGet('SELECT * FROM media_brands WHERE mediaId = ?', [mediaId]),
          dbAll('SELECT * FROM slots')
        ]);
        const brand = mediaMapping ? await dbGet('SELECT name FROM brands WHERE id = ?', [mediaMapping.brand_id]) : null;

        const history = allRecords.map(r => {
          let time = r.start || r.statDate || r.fromDt;
          if (time && !time.endsWith('Z')) time += 'Z';
          let slot = '-';
          if (mediaMapping) {
            const sMatch = slotMappings.find(s => String(s.displayId) === String(r.displayId) && String(s.brand_id) === String(mediaMapping.brand_id));
            if (sMatch) slot = sMatch.slot_number;
          }
          if (slot === '-') {
            const match = (r.media || '').match(/Slot_(\d+)/i);
            if (match) slot = parseInt(match[1], 10);
          }
          return { time, display: r.display || `Display ${r.displayId}`, slot, brandName: brand ? brand.name : 'Unlinked' };
        }).filter(r => r.time).sort((a, b) => new Date(b.time) - new Date(a.time));

        const result = { mediaId, playCount: allRecords.reduce((sum, r) => sum + (r.numberPlays || 1), 0), history };
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
    if (this._liveSnapshotCache && (now - this._liveSnapshotCacheTime) < 30000) return this._liveSnapshotCache;
    try {
      const fifteenMinsAgo = new Date(Date.now() - 900000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      const params = { fromDt: fifteenMinsAgo, toDt: nowStr, length: 500 };

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
          snapshot[dId] = { displayId: dId, displayName: r.display || `Display ${dId}`, adName: r.media || r.layout || (r.widgetId ? `Widget ${r.widgetId}` : 'Unknown'), brandName, start: start + (start.endsWith('Z') ? '' : 'Z'), isLive: true };
        }
      });
      this._liveSnapshotCache = snapshot;
      this._liveSnapshotCacheTime = Date.now();
      return snapshot;
    } catch (err) { return {}; }
  }

  invalidateWidgetCache() {
    _widgetCache = null;
    _widgetCacheTime = 0;
  }

  async getAllMediaStats() {
    const now = Date.now();
    if (this._allMediaStatsCache && (now - this._allMediaStatsCacheTime) < 900000) return this._allMediaStatsCache;
    try {
      const ninetyDaysAgo = new Date(Date.now() - 7776000000).toISOString().split('.')[0].replace('T', ' ');
      const nowStr = new Date().toISOString().split('.')[0].replace('T', ' ');
      const [library, statsRes] = await Promise.all([
          xiboService.getLibrary({ length: 500 }),
          this._getStatsWithRetry('media', { fromDt: ninetyDaysAgo, toDt: nowStr, length: 5000 })
      ]);
      const statsData = statsRes.data || statsRes || [];
      const summary = library.map(m => {
        const mId = m.mediaId;
        const records = statsData.filter(r => String(r.mediaId) === String(mId) || (r.media || '').startsWith(`Slot_${mId}_`));
        const sorted = [...records].sort((a,b) => (b.start||'') > (a.start||'') ? 1 : -1);
        return { mediaId: mId, name: m.name, totalPlays: records.reduce((sum, r) => sum + (r.numberPlays || 1), 0), lastPlay: sorted[0]?.start || null, uniqueDisplays: new Set(records.map(r => r.displayId)).size, type: m.mediaType };
      });
      const result = summary.sort((a, b) => b.totalPlays - a.totalPlays);
      this._allMediaStatsCache = result;
      this._allMediaStatsCacheTime = Date.now();
      return result;
    } catch (err) { return []; }
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
      this.invalidateWidgetCache();
      _statResultCache.clear();
      return { success: true };
    } catch (err) { throw err; }
  }
}

module.exports = new StatsService();
