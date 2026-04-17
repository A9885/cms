/**
 * Inventory View — Embedded Proof of Play Analytics
 * Screens → Slots → PoP history, with automatic 1-minute data refresh
 * and background force-sync-all every 1 minute to ensure data is always current.
 */
App.registerView('inventory', {

    // ── State ──
    _screens: {},
    _slots: [],
    _selectedScreen: null,
    _selectedMedia: null,
    _mediaSummary: {}, // mediaId -> { totalPlays, lastPlay }
    _navStack: 'screens', // 'screens' | 'slots' | 'pop'
    _autoSyncTimer: null,
    _popRefreshTimer: null,
    _screenRefreshTimer: null,
    _lastSyncAt: null,
    MAX_SLOTS: 20,

    render() {
        return `
        <style>
        /* ── Inventory PoP Styles ── */
        #inv-toast-box {
            position: fixed; top: 72px; right: 18px; z-index: 9999;
            display: flex; flex-direction: column; gap: 8px; pointer-events: none;
        }

        .inv-breadcrumb {
            display: flex; align-items: center; gap: 8px;
            color: #718096; font-size: 0.78rem; margin-bottom: 1rem;
        }
        .inv-breadcrumb a { color: var(--accent); text-decoration: none; cursor: pointer; }
        .inv-breadcrumb a:hover { text-decoration: underline; }
        .inv-breadcrumb .sep { color: #cbd5e1; }

        .inv-card-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;
        }
        .inv-card-header h3 { font-size: 1rem; font-weight: 700; margin: 0; }
        .inv-card-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .inv-sync-badge {
            font-size: 0.7rem; color: #718096; padding: 3px 8px;
            background: #f1f5f9; border-radius: 20px; white-space: nowrap;
        }
        .inv-sync-badge.syncing { color: #2563eb; background: #eff6ff; }

        /* Screen table */
        .inv-screen-table { width: 100%; border-collapse: collapse; }
        .inv-screen-table thead th {
            text-align: left; padding: 9px 12px;
            font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
            color: #718096; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        }
        .inv-screen-table tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.15s; }
        .inv-screen-table tbody tr:hover { background: #f8fafc; }
        .inv-screen-table tbody tr:last-child { border-bottom: none; }
        .inv-screen-table td { padding: 12px; vertical-align: middle; font-size: 0.83rem; }

        .inv-badge-online { background: #d1fae5; color: #047857; padding: 3px 9px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; }
        .inv-badge-offline { background: #fee2e2; color: #b91c1c; padding: 3px 9px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; }
        .inv-badge-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; margin-right: 4px; vertical-align: middle; }

        /* Slot grid */
        .inv-slot-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-top: 1rem;
        }
        .inv-slot-card {
            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
            padding: 12px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;
            min-height: 90px; display: flex; flex-direction: column;
        }
        .inv-slot-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(37,99,235,0.1); }
        .inv-slot-card.empty { cursor: default; opacity: 0.45; }
        .inv-slot-card.empty:hover { transform: none; border-color: #e2e8f0; box-shadow: none; }
        .inv-slot-num { font-size: 0.62rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }
        .inv-slot-name { font-weight: 700; font-size: 0.78rem; margin-top: 4px; color: #1a202c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .inv-slot-id { font-size: 0.68rem; color: #94a3b8; margin-top: 2px; }
        .inv-slot-plays { font-size: 0.68rem; color: var(--accent); font-weight: 700; margin-top: auto; padding-top: 4px; }
        .inv-slot-reserved { border-left: 3px solid var(--accent); }

        /* PoP stats strip */
        .inv-pop-stats {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 0;
        }
        .inv-pop-stat { padding: 1.1rem 1.25rem; text-align: center; border-right: 1px solid #e2e8f0; }
        .inv-pop-stat:last-child { border-right: none; }
        .inv-pop-stat-value { font-size: 1.8rem; font-weight: 800; color: var(--accent); }
        .inv-pop-stat-label { font-size: 0.7rem; color: #718096; margin-top: 3px; font-weight: 600; }

        /* PoP stale warning */
        .inv-stale-warn {
            background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;
            padding: 11px 15px; margin: 0.75rem 0; font-size: 0.78rem; color: #c2410c;
            display: flex; align-items: center; gap: 10px;
        }
        .inv-stale-warn.stale-red { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }

        /* PoP history table */
        .inv-pop-history { max-height: 340px; overflow-y: auto; }
        .inv-pop-history table { font-size: 0.8rem; }
        .inv-pop-history thead th { position: sticky; top: 0; z-index: 1; }

        /* Progress bar */
        .inv-progress-bar { height: 5px; border-radius: 3px; background: #e2e8f0; margin-top: 5px; overflow: hidden; width: 110px; }
        .inv-progress-fill { height: 100%; border-radius: 3px; background: var(--success); transition: width 0.4s; }
        .inv-progress-fill.full { background: var(--danger); }
        .inv-progress-fill.high { background: var(--warning); }

        /* Countdown badge (bottom right) */
        #inv-countdown {
            position: fixed; bottom: 18px; right: 18px; z-index: 200;
            background: #f1f5f9; border: 1px solid #e2e8f0;
            color: #718096; font-size: 0.69rem; font-weight: 600;
            padding: 4px 12px; border-radius: 20px; pointer-events: none;
        }

        .inv-btn-back {
            background: #f1f5f9; border: 1px solid #e2e8f0;
            color: #4a5568; padding: 5px 12px; border-radius: 6px;
            font-size: 0.75rem; font-weight: 600; cursor: pointer;
            font-family: inherit; transition: all 0.15s;
        }
        .inv-btn-back:hover { background: #e2e8f0; }

        .inv-loc-link { color: var(--accent); text-decoration: none; font-size: 0.78rem; font-weight: 600; }
        .inv-loc-link:hover { text-decoration: underline; }

        .inv-badge-live {
            background: rgba(16,185,129,0.15); color: #059669;
            font-size: 0.62rem; font-weight: 800; padding: 1px 6px;
            border-radius: 20px; margin-left: 6px; vertical-align: middle;
        }

        @keyframes inv-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .inv-loading { text-align: center; padding: 3rem; color: #718096; animation: inv-pulse 1.5s ease-in-out infinite; font-size: 0.85rem; }
        .inv-empty { text-align: center; padding: 3rem; color: #718096; font-size: 0.85rem; }
        </style>

        <!-- Toast box -->
        <div id="inv-toast-box"></div>

        <!-- Breadcrumb -->
        <div class="inv-breadcrumb" id="inv-breadcrumb">
            <a onclick="window.InvView.goTo('screens')">Inventory</a>
        </div>

        <!-- PANEL: Screens -->
        <div id="inv-view-screens">
            <div class="card">
                <div class="inv-card-header">
                    <div>
                        <h3>📺 Screen Inventory &amp; Proof of Play</h3>
                        <div style="font-size:0.75rem;color:#718096;margin-top:3px;" id="inv-screen-subtitle">Loading screens...</div>
                    </div>
                    <div class="inv-card-actions">
                        <span class="inv-sync-badge" id="inv-sync-badge">🔄 Auto-sync every 1 min</span>
                        <input type="text" id="inv-search" placeholder="🔍 Search screens..." style="padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.75rem;width:170px;outline:none;">
                        <button class="btn btn-secondary" style="font-size:0.72rem;" onclick="window.InvView.loadScreens()">↻ Refresh</button>
                        <button id="inv-sync-all-btn" class="btn btn-primary" style="background:linear-gradient(135deg,#2ea44f,#1a7f37);font-size:0.72rem;" onclick="window.InvView.forceSyncAll()">⚡ Force Sync All</button>
                    </div>
                </div>
                <div id="inv-screens-wrap">
                    <div class="inv-loading">Loading screens...</div>
                </div>
            </div>
        </div>

        <!-- PANEL: Slots -->
        <div id="inv-view-slots" style="display:none;">
            <div class="card">
                <div class="inv-card-header">
                    <div>
                        <h3 id="inv-slots-title">Slots</h3>
                        <div style="font-size:0.75rem;color:#718096;margin-top:3px;" id="inv-slots-subtitle">Click a slot to view Proof of Play</div>
                    </div>
                    <button class="inv-btn-back" onclick="window.InvView.goTo('screens')">← Back</button>
                </div>
                <div class="inv-slot-grid" id="inv-slot-grid">
                    <div class="inv-loading">Loading slots...</div>
                </div>
            </div>
        </div>

        <!-- PANEL: PoP -->
        <div id="inv-view-pop" style="display:none;margin-top:0.75rem;">
            <div class="card">
                <div class="inv-card-header" id="inv-pop-header-row" style="border-bottom:1px solid #e2e8f0;padding-bottom:1rem;margin-bottom:0;"></div>
                <div class="inv-pop-stats" id="inv-pop-stats"></div>
                <div style="padding:0.75rem 1.25rem 0 1.25rem;" id="inv-stale-notice"></div>
                <div class="inv-pop-history" id="inv-pop-history" style="padding:0 0 0.75rem 0;">
                    <div class="inv-loading">Loading playback history...</div>
                </div>
            </div>
        </div>

        <!-- Countdown -->
        <div id="inv-countdown">🔄 Auto-sync active</div>
        `;
    },

    async mount(container) {
        window.InvView = this;
        this._navStack = 'screens';
        this._selectedScreen = null;
        this._selectedMedia = null;
        await Promise.all([
            this.loadScreens(),
            this.loadMediaSummary()
        ]);
        this._startAutoSync();
        lucide.createIcons();
    },

    // ── View Navigation ──────────────────────────────────────────────────────
    goTo(view) {
        document.getElementById('inv-view-screens').style.display = (view === 'screens') ? '' : 'none';
        document.getElementById('inv-view-slots').style.display   = (view === 'slots')   ? '' : 'none';
        document.getElementById('inv-view-pop').style.display     = (view === 'pop')     ? '' : 'none';
        this._navStack = view;
        this._updateBreadcrumb();

        // Start per-view auto-refresh
        clearInterval(this._popRefreshTimer);
        clearInterval(this._screenRefreshTimer);

        if (view === 'pop') {
            this._popRefreshTimer = setInterval(() => this._refreshPoP(), 60 * 1000);
        } else if (view === 'screens') {
            this._screenRefreshTimer = setInterval(() => this.loadScreens(), 60 * 1000);
        }
    },

    _updateBreadcrumb() {
        let html = '<a onclick="InvView.goTo(\'screens\')">Inventory</a>';
        if (this._selectedScreen) {
            html += ' <span class="sep">›</span> <a onclick="InvView.goTo(\'slots\')">' + this._esc(this._selectedScreen.name) + '</a>';
        }
        if (this._selectedMedia && this._navStack === 'pop') {
            const mName = (this._selectedMedia.name || 'Media').replace(/^Slot_\d+_\d+_/, '');
            html += ' <span class="sep">›</span> <span>' + this._esc(mName) + '</span>';
        }
        document.getElementById('inv-breadcrumb').innerHTML = html;
    },

    async loadMediaSummary() {
        try {
            const resp = await fetch('/xibo/stats/media-summary');
            const data = await resp.json();
            const summary = {};
            data.forEach(item => {
                summary[item.mediaId] = item;
            });
            this._mediaSummary = summary;
        } catch (e) { console.warn('Failed to load media summary:', e); }
    },

    // ── Load Screens ─────────────────────────────────────────────────────────
    async loadScreens() {
        const wrap = document.getElementById('inv-screens-wrap');
        if (wrap && wrap.innerHTML.indexOf('inv-screen-table') === -1) {
            wrap.innerHTML = '<div class="inv-loading">Loading screens...</div>';
        }

        try {
            const rawRes = await fetch('/xibo/displays/locations?t=' + Date.now()).then(r => r.json());
            const locRes = rawRes.data || rawRes || {};
            
            if (rawRes.syncing) {
                const badge = document.getElementById('inv-sync-badge');
                if (badge) { badge.textContent = '⚡ Syncing Data...'; badge.className = 'inv-sync-badge syncing'; }
            }
            
            this._screens = locRes;
            const dIds = Object.keys(locRes);

            const subtitle = document.getElementById('inv-screen-subtitle');
            if (subtitle) subtitle.textContent = dIds.length + ' screen' + (dIds.length !== 1 ? 's' : '') + ' found';

            if (dIds.length === 0) {
                if (wrap) wrap.innerHTML = '<div class="inv-empty">📺 No screens found in Xibo.</div>';
                return;
            }

            // Fetch slot counts in parallel
            const slotCounts = {};
            await Promise.all(dIds.map(async dId => {
                try {
                    const slots = await fetch('/xibo/slots/display/' + dId + '?t=' + Date.now()).then(r => r.json());
                    slotCounts[dId] = Array.isArray(slots) ? slots.filter(s => s.media && s.media.length > 0).length : 0;
                } catch { slotCounts[dId] = 0; }
            }));

            let rows = '';
            for (const dId of dIds) {
                const d = locRes[dId];
                const used = slotCounts[dId] || 0;
                const pct = Math.round((used / this.MAX_SLOTS) * 100);
                const fillCls = pct >= 100 ? 'full' : pct >= 80 ? 'high' : '';
                const onlineBadge = d.online
                    ? '<span class="inv-badge-online"><span class="inv-badge-dot"></span>Online</span>'
                    : '<span class="inv-badge-offline"><span class="inv-badge-dot"></span>Offline</span>';

                let locHtml = '—';
                if (d.lat && d.lng) {
                    const mUrl = 'https://maps.google.com/?q=' + d.lat + ',' + d.lng;
                    locHtml = '<a class="inv-loc-link" href="' + mUrl + '" target="_blank" onclick="event.stopPropagation()">📍 ' + d.lat.toFixed(4) + ', ' + d.lng.toFixed(4) + '</a>';
                } else if (d.address) {
                    locHtml = this._esc(d.address);
                }
                if (d.timezone) locHtml += '<div style="font-size:0.7rem;color:#94a3b8;margin-top:1px;">' + this._esc(d.timezone) + '</div>';

                const lastSeen = d.lastAccessed ? new Date(d.lastAccessed + ' UTC').toLocaleString() : 'Never';

                rows += `
                <tr>
                    <td>
                        <div style="font-weight:700;font-size:0.85rem;">${this._esc(d.name)}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;margin-top:2px;">ID: ${dId}${d.device ? ' · ' + this._esc(d.device) : ''}</div>
                    </td>
                    <td>${locHtml}</td>
                    <td>
                        ${onlineBadge}
                        <div style="font-size:0.7rem;color:#94a3b8;margin-top:3px;">Last seen: ${this._esc(lastSeen)}</div>
                    </td>
                    <td>
                        <div style="font-weight:700;">${used}/${this.MAX_SLOTS}</div>
                        <div class="inv-progress-bar"><div class="inv-progress-fill ${fillCls}" style="width:${pct}%"></div></div>
                        <div style="font-size:0.68rem;color:#94a3b8;margin-top:2px;">${pct}% used</div>
                    </td>
                    <td>
                        <button class="btn btn-primary" style="font-size:0.72rem;" onclick="window.InvView.selectScreen('${dId}')">View Slots →</button>
                    </td>
                </tr>`;
            }

            if (wrap) wrap.innerHTML = `
                <table class="inv-screen-table">
                    <thead><tr><th>Screen</th><th>Location</th><th>Status</th><th>Slots Used</th><th>Action</th></tr></thead>
                    <tbody id="inv-screen-tbody">${rows}</tbody>
                </table>`;

            // Search filter
            const search = document.getElementById('inv-search');
            if (search) {
                search.oninput = (e) => {
                    const q = e.target.value.toLowerCase();
                    document.querySelectorAll('#inv-screen-tbody tr').forEach(tr => {
                        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
                    });
                };
            }

            // Update last-fetched badge
            const badge = document.getElementById('inv-sync-badge');
            if (badge) badge.textContent = '🕐 Updated ' + new Date().toLocaleTimeString();

        } catch (e) {
            if (wrap) wrap.innerHTML = '<div class="inv-empty">⚠️ Failed to load screens: ' + this._esc(e.message) + '</div>';
        }
    },

    // ── Select Screen → Show Slots ────────────────────────────────────────────
    async selectScreen(displayId) {
        this._selectedScreen = { id: displayId, ...this._screens[displayId] };
        this.goTo('slots');

        const titleEl = document.getElementById('inv-slots-title');
        if (titleEl) titleEl.textContent = this._selectedScreen.name + ' — Slots';

        const grid = document.getElementById('inv-slot-grid');
        if (grid) grid.innerHTML = '<div class="inv-loading">Loading slots...</div>';

        try {
            const res = await fetch('/xibo/slots/display/' + displayId + '?t=' + Date.now());
            this._slots = await res.json();

            let html = '';
            for (let i = 1; i <= this.MAX_SLOTS; i++) {
                const slot = Array.isArray(this._slots) ? this._slots.find(s => Number(s.slot) === Number(i)) : null;
                const hasMedia = slot && slot.media && slot.media.length > 0;

                if (hasMedia) {
                    const m = slot.media[0];
                    const name = (m.name || 'Media').replace(/^Slot_\d+_\d+_/, '');
                    const mSummary = this._mediaSummary[m.mediaId] || { totalPlays: 0 };
                    const thumbUrl = `/xibo/proxy/thumbnail/${m.mediaId}`;
                    const durDisplay = m.duration ? m.duration + 's' : '—';
                    
                    html += `
                    <div class="inv-slot-card inv-slot-reserved" onclick="window.InvView.selectMedia(${i}, ${JSON.stringify(m).replace(/"/g, '&quot;')})" style="background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                        <div style="position: relative; height: 80px; margin: -12px -12px 10px -12px; background: #e2e8f0; border-bottom: 1px solid #f1f5f9;">
                            <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px 10px 0 0;">
                            <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; font-size: 0.6rem; padding: 1px 4px; border-radius: 4px;">${durDisplay}</div>
                        </div>
                        <div class="inv-slot-num">Slot ${i}</div>
                        <div class="inv-slot-name" style="color: #1e293b; font-size: 0.8rem; margin-top: 4px;" title="${this._esc(name)}">${this._esc(name)}</div>
                        <div class="inv-slot-plays" style="margin-top: 6px; font-size: 0.7rem; color: var(--accent); border-top: 1px solid #f1f5f9; padding-top: 6px;">
                            ${mSummary.totalPlays.toLocaleString()} plays Recorded
                        </div>
                    </div>`;
                } else {
                    html += `
                    <div class="inv-slot-card empty" style="border-style: dashed; background: #f8fafc; border-color: #cbd5e1;">
                        <div class="inv-slot-num">Slot ${i}</div>
                        <div class="inv-slot-name" style="color:#94a3b8; font-size: 0.75rem; font-style: italic; margin-top: 4px;">Empty Slot</div>
                    </div>`;
                }
            }

            const usedCount = (Array.isArray(this._slots) ? this._slots.filter(s => s.media && s.media.length > 0) : []).length;
            const sub = document.getElementById('inv-slots-subtitle');
            if (sub) sub.textContent = usedCount + ' of ' + this.MAX_SLOTS + ' slots in use · Total loop duration: ' + this._slots.reduce((acc, s) => acc + (s.totalDuration || 0), 0) + 's';

            if (grid) grid.innerHTML = html;
        } catch (e) {
            if (grid) grid.innerHTML = '<div class="inv-empty">⚠️ Failed to load slots: ' + this._esc(e.message) + '</div>';
        }
    },

    // ── Select Media → Show PoP ───────────────────────────────────────────────
    async selectMedia(slotNum, mediaInfo) {
        this._selectedMedia = { ...mediaInfo, slotNum };
        const mediaId = mediaInfo.mediaId || mediaInfo.id;
        const mediaName = (mediaInfo.name || 'Media').replace(/^Slot_\d+_\d+_/, '');

        this.goTo('pop');

        // Render PoP header row
        const headerEl = document.getElementById('inv-pop-header-row');
        if (headerEl) {
            headerEl.innerHTML = `
            <div>
                <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Proof of Play</div>
                <h3 style="margin-top:3px;">${this._esc(mediaName)}</h3>
                <div style="font-size:0.73rem;color:#718096;margin-top:2px;display:flex;align-items:center;gap:10px;">
                    <span>Slot ${slotNum} · ${this._esc(this._selectedScreen.name)} · Media ID: ${mediaId}</span>
                    <span id="inv-pop-lastseen" style="margin-left:5px;"></span>
                    <span>· <a href="#analytics" style="color:var(--accent);text-decoration:none;font-weight:600;">Global Analytics →</a></span>
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span style="font-size:0.7rem;color:#718096;" id="inv-pop-fetched-badge"></span>
                <button class="inv-btn-back" onclick="window.InvView.goTo('slots')">← Back to Slots</button>
                <button class="btn btn-primary" style="font-size:0.72rem;background:linear-gradient(135deg,#2ea44f,#1a7f37);" onclick="window.InvView.singleSync()">🔄 Force Sync Screen</button>
                <button class="btn btn-secondary" style="font-size:0.72rem;" onclick="window.InvView._refreshPoP()">↻ Refresh Data</button>
            </div>`;
        }

        document.getElementById('inv-pop-stats').innerHTML = '<div style="padding:1.5rem;text-align:center;color:#718096;grid-column:1/-1;">Fetching playback data...</div>';
        document.getElementById('inv-pop-history').innerHTML = '';
        document.getElementById('inv-stale-notice').innerHTML = '';

        await this._fetchPoP(mediaId, mediaName);
    },

    async _fetchPoP(mediaId, mediaName) {
        try {
            const res = await fetch('/xibo/stats?mediaId=' + mediaId + '&t=' + Date.now());
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            const history = data.history || [];
            const lastCheckIn = data.lastCheckIn;
            const playCount = data.playCount || 0;
            const last24h = history.filter(r => new Date(r.time) > new Date(Date.now() - 86400000));
            const lastPlayAge = history.length > 0 ? Date.now() - new Date(history[0].time).getTime() : null;

            // Connectivity Badge
            const lastSeenEl = document.getElementById('inv-pop-lastseen');
            if (lastSeenEl && lastCheckIn) {
                const checkInDate = new Date(lastCheckIn + ' UTC');
                const diffMs = Date.now() - checkInDate.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                let color = '#059669', label = 'Online';
                if (diffMins > 15) { color = '#d97706'; label = 'Away'; }
                if (diffMins > 120) { color = '#b91c1c'; label = 'Offline'; }
                
                const timeStr = diffMins < 1 ? 'just now' : diffMins + 'm ago';
                lastSeenEl.innerHTML = `<span style="background:${color}15;color:${color};padding:2px 8px;border-radius:12px;font-weight:700;font-size:0.65rem;border:1px solid ${color}30;">
                    ● Player Last Seen: ${timeStr} (${label})
                </span>`;
            }

            // Stats strip
            const statsEl = document.getElementById('inv-pop-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                <div class="inv-pop-stat">
                    <div class="inv-pop-stat-value">${playCount}</div>
                    <div class="inv-pop-stat-label">Total Plays (30 Days)</div>
                </div>
                <div class="inv-pop-stat">
                    <div class="inv-pop-stat-value">${last24h.length}</div>
                    <div class="inv-pop-stat-label">Plays Last 24h</div>
                </div>
                <div class="inv-pop-stat">
                    <div class="inv-pop-stat-value" style="font-size:1.2rem;">${history.length > 0 ? new Date(history[0].time).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '—'}</div>
                    <div class="inv-pop-stat-label">Last Verified Play</div>
                </div>`;
            }

            // Stale notice
            const staleEl = document.getElementById('inv-stale-notice');
            if (staleEl) {
                if (lastPlayAge && lastPlayAge > 86400000) {
                    const daysAgo = Math.floor(lastPlayAge / 86400000);
                    const lastDate = new Date(history[0].time).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
                    staleEl.innerHTML = `<div class="inv-stale-warn stale-red">
                        <span style="font-size:1rem;">⚠️</span>
                        <div style="flex:1"><strong>Data is ${daysAgo} day${daysAgo>1?'s':''} out of date.</strong><br>
                        Last verified play: <strong>${lastDate}</strong>. Auto-sync is running — new data will appear here within 1 minute.</div>
                        <button class="btn btn-primary" style="font-size:0.72rem;background:#b91c1c;white-space:nowrap;" onclick="window.InvView.singleSync()">🔄 Fix Now</button>
                    </div>`;
                } else if (lastPlayAge && lastPlayAge > 7200000) {
                    const hoursAgo = Math.floor(lastPlayAge / 3600000);
                    staleEl.innerHTML = `<div class="inv-stale-warn">⏳ <strong>Note:</strong> Last play was ~${hoursAgo}h ago. Data syncs automatically every 1 minute.</div>`;
                } else {
                    staleEl.innerHTML = '';
                }
            }

            // Update fetched badge
            const fetchBadge = document.getElementById('inv-pop-fetched-badge');
            if (fetchBadge) fetchBadge.textContent = '🕐 Updated ' + new Date().toLocaleTimeString();

            // History table
            const histEl = document.getElementById('inv-pop-history');
            if (histEl) {
                if (history.length === 0) {
                    histEl.innerHTML = '<div class="inv-empty">📊 No verified plays recorded yet. The screen is playing — new data appears after the next auto-sync (within 1 minute).</div>';
                    return;
                }
                const rows = history.map(r => {
                    const dt = new Date(r.time);
                    const isRecent = (Date.now() - dt.getTime()) < 300000;
                    const liveBadge = isRecent ? '<span class="inv-badge-live">LIVE</span>' : '';
                    const slot = r.slot !== '-' ? `<span style="color:var(--accent);font-weight:700;">Slot ${r.slot}</span>` : '<span style="color:#cbd5e1;">—</span>';
                    const brand = r.brandName === 'Unlinked' ? '<span style="color:#94a3b8;font-style:italic;">External/Unlinked</span>' : this._esc(r.brandName);
                    const loc = this._selectedScreen;
                    let locCell = '—';
                    if (loc && loc.lat && loc.lng) {
                        locCell = '<a class="inv-loc-link" href="https://maps.google.com/?q=' + loc.lat + ',' + loc.lng + '" target="_blank">📍 ' + loc.lat.toFixed(4) + ', ' + loc.lng.toFixed(4) + '</a>';
                    } else if (loc && loc.timezone) {
                        locCell = this._esc(loc.timezone);
                    }
                    return `<tr>
                        <td style="color:#4a5568;">${dt.toLocaleString()}${liveBadge}</td>
                        <td style="font-weight:700;">${this._esc(r.display || 'Display')}</td>
                        <td>${slot}</td>
                        <td>${brand}</td>
                        <td>${locCell}</td>
                    </tr>`;
                }).join('');

                histEl.innerHTML = `<table class="inv-screen-table">
                    <thead><tr><th>Verification Time</th><th>Display</th><th>Slot No.</th><th>Brand</th><th>Location</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
            }
        } catch (e) {
            const statsEl = document.getElementById('inv-pop-stats');
            if (statsEl) statsEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#b91c1c;grid-column:1/-1;">⚠️ Failed to load PoP: ' + this._esc(e.message) + '</div>';
        }
    },

    _refreshPoP() {
        if (!this._selectedMedia) return;
        const mediaId = this._selectedMedia.mediaId || this._selectedMedia.id;
        const mediaName = (this._selectedMedia.name || 'Media').replace(/^Slot_\d+_\d+_/, '');
        this._fetchPoP(mediaId, mediaName);
    },

    // ── Force Sync (single display) ───────────────────────────────────────────
    async singleSync() {
        if (!this._selectedScreen) return;
        try {
            const res = await fetch('/xibo/displays/' + this._selectedScreen.id + '/sync', { method: 'POST' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this._showToast('✅ Sync requested for ' + this._selectedScreen.name + '. Refreshing in 30s...');
            setTimeout(() => this._refreshPoP(), 30000);
        } catch (e) {
            this._showToast('❌ Sync failed: ' + e.message, 'error');
        }
    },

    // ── Force Sync All ─────────────────────────────────────────────────────────
    async forceSyncAll() {
        const btn = document.getElementById('inv-sync-all-btn');
        if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
        try {
            const res = await fetch('/xibo/displays/force-sync-all', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            this._showToast('⚡ Sync sent to ' + data.synced + ' screen(s). Data updates within 1 min.');
            this._lastSyncAt = Date.now();
            setTimeout(() => this.loadScreens(), 5000);
        } catch (e) {
            this._showToast('❌ ' + e.message, 'error');
        } finally {
            if (btn) { btn.innerHTML = '⚡ Force Sync All'; btn.disabled = false; }
        }
    },

    // ── Automatic Background Sync ─────────────────────────────────────────────
    // Runs every 1 minute: force-sync-all + refresh current view
    _startAutoSync() {
        clearInterval(this._autoSyncTimer);
        let countdown = 60; // 1 min
        const tick = () => {
            countdown--;
            const badge = document.getElementById('inv-countdown');
            if (badge) {
                const m = Math.floor(countdown / 60);
                const s = countdown % 60;
                badge.textContent = '🔄 Next auto-sync in ' + m + ':' + String(s).padStart(2, '0');
            }
            if (countdown <= 0) {
                countdown = 60;
                this._autoSyncAll();
            }
        };
        this._autoSyncTimer = setInterval(tick, 1000);
    },

    async _autoSyncAll() {
        console.log('[InvView] Auto-syncing all displays...');
        const badge = document.getElementById('inv-sync-badge');
        if (badge) { badge.textContent = '⚡ Syncing...'; badge.className = 'inv-sync-badge syncing'; }
        try {
            await fetch('/xibo/displays/force-sync-all', { method: 'POST' });
            this._lastSyncAt = Date.now();
            // Refresh current view data after sync
            if (this._navStack === 'screens') await this.loadScreens();
            else if (this._navStack === 'pop') this._refreshPoP();
        } catch (e) { console.warn('[InvView] Auto-sync failed:', e.message); }
        finally {
            const b = document.getElementById('inv-sync-badge');
            if (b) { b.textContent = '🕐 Synced ' + new Date().toLocaleTimeString(); b.className = 'inv-sync-badge'; }
        }
    },

    // ── Toast ─────────────────────────────────────────────────────────────────
    _showToast(msg, type = 'success') {
        const box = document.getElementById('inv-toast-box');
        if (!box) return;
        const color = type === 'error' ? '#b91c1c' : '#047857';
        const bg    = type === 'error' ? '#fef2f2' : '#f0fdf4';
        const toast = document.createElement('div');
        toast.style.cssText = `background:${bg};border:1px solid ${type==='error'?'#fecaca':'#bbf7d0'};border-radius:8px;padding:10px 14px;font-size:0.78rem;color:${color};max-width:340px;box-shadow:0 4px 16px rgba(0,0,0,0.1);pointer-events:auto;`;
        toast.textContent = msg;
        box.appendChild(toast);
        setTimeout(() => toast.remove(), 6000);
    },

    // ── Helpers ───────────────────────────────────────────────────────────────
    _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    // Called by app.js on navigation away — clean up timers
    unmount() {
        clearInterval(this._autoSyncTimer);
        clearInterval(this._popRefreshTimer);
        clearInterval(this._screenRefreshTimer);
        const badge = document.getElementById('inv-countdown');
        if (badge) badge.remove();
    }
});
