const AnalyticsView = {
    allData: [],
    currentMediaId: null,
    currentMediaName: null,
    currentPopHistory: [],

    render() {
        return `
        <style>
            /* ── Analytics Page Styles ── */
            .ana-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; flex-wrap:wrap; gap:12px; }
            .ana-header h1 { font-size:1.6rem; font-weight:800; color:var(--text); margin:0; }
            .ana-header p  { font-size:0.85rem; color:var(--text-muted); margin:4px 0 0; }
            .ana-action-bar { display:flex; gap:8px; flex-wrap:wrap; }

            /* KPI strip */
            .pop-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:1.5rem; }
            @media(max-width:900px){ .pop-kpi-strip { grid-template-columns:repeat(2,1fr); } }
            .pop-kpi { background:var(--card-bg); border:1px solid var(--border); border-radius:14px; padding:18px 22px; position:relative; overflow:hidden; transition:transform .15s,box-shadow .15s; }
            .pop-kpi:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.08); }
            .pop-kpi::before { content:''; position:absolute; top:0;left:0;right:0; height:3px; }
            .pop-kpi.blue::before  { background:linear-gradient(90deg,#6366f1,#818cf8); }
            .pop-kpi.green::before { background:linear-gradient(90deg,#10b981,#34d399); }
            .pop-kpi.amber::before { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
            .pop-kpi.rose::before  { background:linear-gradient(90deg,#f43f5e,#fb7185); }
            .pop-kpi-label { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); margin-bottom:6px; }
            .pop-kpi-value { font-size:2rem; font-weight:800; color:var(--text); line-height:1; }
            .pop-kpi-sub   { font-size:0.72rem; color:var(--text-muted); margin-top:4px; }

            /* Search & filter bar */
            .pop-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
            .pop-search  { display:flex; align-items:center; gap:8px; background:var(--input-bg,#f8fafc); border:1px solid var(--border); border-radius:8px; padding:7px 12px; flex:1; min-width:180px; }
            .pop-search input { border:none; background:transparent; outline:none; font-size:0.85rem; color:var(--text); width:100%; }
            .pop-search i { width:15px; color:var(--text-muted); flex-shrink:0; }

            /* Table enhancements */
            .pop-table-wrap { max-height:520px; overflow-y:auto; }
            .pop-plays-bar-wrap { display:flex; align-items:center; gap:8px; }
            .pop-plays-bar { height:6px; border-radius:99px; background:linear-gradient(90deg,#6366f1,#818cf8); min-width:4px; transition:width .4s; }
            .pop-plays-val { font-weight:700; font-size:0.95rem; color:var(--text); min-width:40px; }

            /* PoP detail view */
            .pop-detail-header { display:flex; align-items:center; gap:12px; margin-bottom:1.25rem; }
            .pop-back-btn { display:flex; align-items:center; gap:6px; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:7px 14px; font-size:0.8rem; font-weight:700; cursor:pointer; color:var(--text); transition:all .15s; }
            .pop-back-btn:hover { background:var(--border); }
            .pop-detail-title { font-size:1.1rem; font-weight:800; color:var(--text); }
            .pop-detail-sub   { font-size:0.78rem; color:var(--text-muted); }
            .pop-detail-actions { margin-left:auto; display:flex; gap:8px; }

            /* History table timeline style */
            .pop-timeline-dot { width:8px; height:8px; border-radius:50%; background:#6366f1; flex-shrink:0; }
            .history-badge { display:inline-flex; align-items:center; gap:4px; background:#ede9fe; color:#7c3aed; border-radius:6px; padding:2px 8px; font-size:0.7rem; font-weight:700; }

            /* Danger zone */
            .danger-zone { border:1px solid #fee2e2; border-radius:12px; padding:16px 20px; background:#fff5f5; display:flex; align-items:center; gap:14px; margin-top:1.25rem; }
            .danger-zone-text h4 { margin:0 0 2px; font-size:0.9rem; font-weight:700; color:#b91c1c; }
            .danger-zone-text p  { margin:0; font-size:0.78rem; color:#ef4444; }
            .btn-danger { background:#ef4444; color:#fff; border:none; border-radius:8px; padding:8px 16px; font-size:0.8rem; font-weight:700; cursor:pointer; transition:background .15s; }
            .btn-danger:hover { background:#dc2626; }

            .badge-type-img   { background:#e0f2fe; color:#0369a1; border-radius:6px; padding:2px 8px; font-size:0.7rem; font-weight:700; }
            .badge-type-video { background:#fce7f3; color:#be185d; border-radius:6px; padding:2px 8px; font-size:0.7rem; font-weight:700; }
        </style>

        <!-- ── MAIN OVERVIEW ── -->
        <div id="ana-main">
            <div class="ana-header">
                <div>
                    <h1>Proof of Play Analytics</h1>
                    <p>System-wide verified playback counts — last 30 days</p>
                </div>
                <div class="ana-action-bar">
                    <button class="btn btn-secondary" id="ana-refresh-btn" data-onclick="App.views.analytics.fetchData">
                        <i data-lucide="refresh-cw"></i> Refresh
                    </button>
                    <button class="btn btn-secondary" data-onclick="App.views.analytics.exportCSV">
                        <i data-lucide="download"></i> Export CSV
                    </button>
                    <button class="btn btn-primary" data-onclick="App.views.analytics.forceSyncAll">
                        <i data-lucide="zap"></i> Force Sync
                    </button>
                </div>
            </div>

            <!-- KPI Strip -->
            <div class="pop-kpi-strip" id="ana-kpi-strip">
                <div class="pop-kpi blue">
                    <div class="pop-kpi-label">Total Plays (30d)</div>
                    <div class="pop-kpi-value" id="kpi-total-plays">—</div>
                    <div class="pop-kpi-sub">Verified records</div>
                </div>
                <div class="pop-kpi green">
                    <div class="pop-kpi-label">Active Media</div>
                    <div class="pop-kpi-value" id="kpi-active-media">—</div>
                    <div class="pop-kpi-sub">Items with plays</div>
                </div>
                <div class="pop-kpi amber">
                    <div class="pop-kpi-label">Unique Screens</div>
                    <div class="pop-kpi-value" id="kpi-unique-screens">—</div>
                    <div class="pop-kpi-sub">Reporting displays</div>
                </div>
                <div class="pop-kpi rose">
                    <div class="pop-kpi-label">Last Updated</div>
                    <div class="pop-kpi-value" style="font-size:1.1rem;padding-top:6px;" id="kpi-last-agg">—</div>
                    <div class="pop-kpi-sub">Local aggregation</div>
                </div>
            </div>

            <!-- Table Card -->
            <div class="card">
                <div class="card-header" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i data-lucide="bar-chart-3"></i>
                        <span style="font-weight:700;">Media Playback Summary</span>
                        <span id="ana-count-badge" style="background:#ede9fe;color:#7c3aed;border-radius:99px;padding:2px 10px;font-size:0.72rem;font-weight:700;">0 items</span>
                    </div>
                    <div class="pop-toolbar">
                        <div class="pop-search">
                            <i data-lucide="search"></i>
                            <input type="text" id="ana-search" placeholder="Search media or brand..." data-oninput="App.views.analytics.filterTable">
                        </div>
                        <select id="ana-type-filter" class="btn btn-secondary" style="padding:7px 10px;font-size:0.8rem;" data-onchange="App.views.analytics.filterTable">
                            <option value="">All Types</option>
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                        </select>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="pop-table-wrap">
                        <table class="data-table" id="analytics-table">
                            <thead>
                                <tr>
                                    <th>Media Item</th>
                                    <th>Type</th>
                                    <th>Brand</th>
                                    <th class="text-center">Total Plays</th>
                                    <th class="text-center">Screens</th>
                                    <th>Last Play</th>
                                    <th class="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="analytics-tbody">
                                <tr><td colspan="7" class="text-center p-5" style="color:var(--text-muted);">Loading analytics data...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Danger Zone -->
            <div class="danger-zone">
                <i data-lucide="alert-triangle" style="width:28px;height:28px;color:#ef4444;flex-shrink:0;"></i>
                <div class="danger-zone-text">
                    <h4>Reset Proof of Play Data</h4>
                    <p>Permanently deletes all aggregated play records from the local database. This cannot be undone.</p>
                </div>
                <button class="btn-danger" style="margin-left:auto;" data-onclick="App.views.analytics.resetPoP">
                    <i data-lucide="trash-2" style="width:14px;vertical-align:middle;margin-right:4px;"></i> Reset PoP Data
                </button>
            </div>
        </div>

        <!-- ── DETAIL / PoP HISTORY VIEW ── -->
        <div id="ana-detail" style="display:none;">
            <div class="pop-detail-header">
                <button class="pop-back-btn" data-onclick="App.views.analytics.showMain">
                    <i data-lucide="arrow-left" style="width:14px;"></i> Back
                </button>
                <div>
                    <div class="pop-detail-title" id="detail-title">Media Analytics</div>
                    <div class="pop-detail-sub" id="detail-sub"></div>
                </div>
                <div class="pop-detail-actions">
                    <button class="btn btn-secondary" data-onclick="App.views.analytics.downloadMediaCSV">
                        <i data-lucide="download"></i> Download Report
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i data-lucide="list"></i>
                        <span style="font-weight:700;">Playback History Log</span>
                        <span id="detail-count-badge" style="background:#ede9fe;color:#7c3aed;border-radius:99px;padding:2px 10px;font-size:0.72rem;font-weight:700;"></span>
                    </div>
                </div>
                <div class="card-body p-0 pop-table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Verification Time</th>
                                <th>Screen</th>
                                <th>Slot</th>
                                <th>Brand</th>
                            </tr>
                        </thead>
                        <tbody id="detail-tbody">
                            <tr><td colspan="4" class="text-center p-5">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    async mount() {
        await this.fetchData();
        lucide.createIcons();
    },

    async fetchData() {
        const tbody = document.getElementById('analytics-tbody');
        if (!tbody) return;

        const btn = document.getElementById('ana-refresh-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2"></i> Loading...'; lucide.createIcons(); }

        try {
            // Fetch totals (global source of truth) and per-media detail in parallel
            const [totalsResp, summaryResp] = await Promise.all([
                fetch('/xibo/stats/totals'),
                fetch('/xibo/stats/media-summary')
            ]);
            const totals = await totalsResp.json();
            const data   = await summaryResp.json();
            this.allData = Array.isArray(data) ? data : [];

            const kpiTotalEl = document.getElementById('kpi-total-plays');
            const kpiMediaEl = document.getElementById('kpi-active-media');
            const kpiScrEl   = document.getElementById('kpi-unique-screens');
            const kpiLastEl  = document.getElementById('kpi-last-agg');

            if (kpiTotalEl) kpiTotalEl.textContent = (totals.totalPlays || 0).toLocaleString();
            if (kpiMediaEl) kpiMediaEl.textContent = totals.activeMedia || 0;
            if (kpiScrEl)   kpiScrEl.textContent   = totals.uniqueScreens || 0;
            if (kpiLastEl)  kpiLastEl.textContent   = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:true });

            this.renderTable(this.allData);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5" style="color:#ef4444;">Error: ${err.message}</td></tr>`;
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh'; lucide.createIcons(); }
        }
    },

    renderTable(items) {
        const tbody = document.getElementById('analytics-tbody');
        const badge = document.getElementById('ana-count-badge');
        if (!tbody) return;
        if (badge) badge.textContent = `${items.length} items`;

        const maxPlays = Math.max(...items.map(i => i.totalPlays || 0), 1);
        tbody.innerHTML = '';

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5" style="color:var(--text-muted);">No play records found.</td></tr>`;
            return;
        }

        items.forEach(item => {
            const tr = document.createElement('tr');
            const barWidth = Math.max(4, Math.round((item.totalPlays / maxPlays) * 100));
            const cleanName = App.cleanFilename(item.name);

            // Thumbnail cell
            const tdThumb = document.createElement('td');
            const thumbWrap = document.createElement('div');
            thumbWrap.style.cssText = 'display:flex;align-items:center;gap:10px;';
            const imgBox = document.createElement('div');
            imgBox.style.cssText = 'width:42px;height:42px;border-radius:8px;overflow:hidden;background:#f1f5f9;border:1px solid var(--border);flex-shrink:0;';
            const img = document.createElement('img');
            img.src = '/xibo/library/download/' + item.mediaId + '?thumbnail=1';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            img.onerror = function() { imgBox.style.cssText += 'display:flex;align-items:center;justify-content:center;font-size:1.2rem;'; imgBox.textContent = item.type === 'video' ? '\uD83C\uDFAC' : '\uD83D\uDDBC\uFE0F'; };
            imgBox.appendChild(img);
            const textBox = document.createElement('div');
            textBox.style.overflow = 'hidden';
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-weight:700;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;';
            nameDiv.textContent = cleanName;
            const idDiv = document.createElement('div');
            idDiv.style.cssText = 'font-size:0.72rem;color:var(--text-muted);';
            idDiv.textContent = 'ID: ' + item.mediaId;
            textBox.append(nameDiv, idDiv);
            thumbWrap.append(imgBox, textBox);
            tdThumb.appendChild(thumbWrap);

            // Type cell
            const tdType = document.createElement('td');
            const typeBadge = document.createElement('span');
            typeBadge.className = item.type === 'video' ? 'badge-type-video' : 'badge-type-img';
            typeBadge.textContent = item.type || 'image';
            tdType.appendChild(typeBadge);

            // Brand cell
            const tdBrand = document.createElement('td');
            const brandBadge = document.createElement('span');
            brandBadge.className = 'badge ' + (item.brandName === 'Local/Internal' ? 'badge-secondary' : 'badge-primary');
            brandBadge.style.opacity = '0.85';
            brandBadge.textContent = item.brandName || 'Unlinked';
            tdBrand.appendChild(brandBadge);

            // Plays cell
            const tdPlays = document.createElement('td');
            tdPlays.className = 'text-center';
            const barWrap = document.createElement('div');
            barWrap.className = 'pop-plays-bar-wrap';
            barWrap.style.cssText = 'justify-content:center;flex-direction:column;align-items:flex-start;gap:4px;padding:0 8px;';
            const playVal = document.createElement('span');
            playVal.className = 'pop-plays-val';
            playVal.textContent = (item.totalPlays || 0).toLocaleString();
            const bar = document.createElement('div');
            bar.className = 'pop-plays-bar';
            bar.style.width = barWidth + '%';
            barWrap.append(playVal, bar);
            tdPlays.appendChild(barWrap);

            // Screens cell
            const tdScreens = document.createElement('td');
            tdScreens.className = 'text-center';
            tdScreens.style.fontWeight = '600';
            tdScreens.textContent = item.uniqueDisplays || 0;

            // Last Play cell
            const tdLast = document.createElement('td');
            tdLast.style.cssText = 'font-size:0.8rem;color:var(--text-muted);';
            if (item.lastPlay) {
                tdLast.textContent = new Date(item.lastPlay).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
            } else {
                const neverSpan = document.createElement('span');
                neverSpan.className = 'text-muted italic';
                neverSpan.textContent = 'Never';
                tdLast.appendChild(neverSpan);
            }

            // Actions cell — pure DOM, no string interpolation of user data
            const tdAction = document.createElement('td');
            tdAction.className = 'text-right';
            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';

            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-sm btn-primary';
            viewBtn.textContent = 'View PoP';
            viewBtn.addEventListener('click', () => AnalyticsView.viewDetail(item.mediaId, cleanName));

            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-sm';
            resetBtn.style.cssText = 'background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;display:flex;align-items:center;gap:4px;';
            const trashIcon = document.createElement('i');
            trashIcon.setAttribute('data-lucide', 'trash-2');
            trashIcon.style.cssText = 'width:12px;height:12px;';
            resetBtn.appendChild(trashIcon);
            resetBtn.appendChild(document.createTextNode(' Reset'));
            resetBtn.addEventListener('click', () => AnalyticsView.resetMediaPoP(item.mediaId, cleanName));

            btnWrap.append(viewBtn, resetBtn);
            tdAction.appendChild(btnWrap);

            tr.append(tdThumb, tdType, tdBrand, tdPlays, tdScreens, tdLast, tdAction);
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    filterTable(e) {
        const query = document.getElementById('ana-search')?.value || '';
        const typeFilter = document.getElementById('ana-type-filter')?.value || '';
        let filtered = this.allData;
        if (query) {
            const q = query.toLowerCase();
            filtered = filtered.filter(i =>
                (i.name || '').toLowerCase().includes(q) ||
                (i.brandName || '').toLowerCase().includes(q) ||
                String(i.mediaId).includes(q)
            );
        }
        if (typeFilter) {
            filtered = filtered.filter(i => (i.type || '') === typeFilter);
        }
        this.renderTable(filtered);
    },

    exportCSV() {
        const a = document.createElement('a');
        a.href = '/xibo/stats/export-csv';
        a.download = '';
        a.click();
        App.showToast('📥 Downloading CSV report...', 'info');
    },

    downloadMediaCSV() {
        if (!this.currentPopHistory || !this.currentPopHistory.length) {
            App.showToast('No history to export.', 'warning'); return;
        }
        const rows = [['Verification Time', 'Screen', 'Slot', 'Brand']];
        this.currentPopHistory.forEach(r => {
            rows.push([
                new Date(r.time).toLocaleString('en-GB'),
                r.display || 'Unknown',
                r.slot !== '-' ? `Slot ${r.slot}` : '-',
                r.brandName || 'Unlinked'
            ]);
        });
        const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `pop_${App.cleanFilename(this.currentMediaName || 'media')}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        App.showToast('📥 Downloading media report...', 'info');
    },

    async forceSyncAll() {
        if (!await App.showConfirm('Force sync will trigger a manual data collection from all screens. Proceed?')) return;
        try {
            App.showToast('🚀 Syncing all screens...', 'info');
            const r = await fetch('/xibo/displays/force-sync-all', { method: 'POST' });
            const result = await r.json();
            if (result.success) {
                App.showToast(`✅ Synced ${result.synced} screens. Refreshing...`, 'success');
                setTimeout(() => this.fetchData(), 2000);
            } else {
                App.showToast('❌ Sync failed: ' + result.error, 'error');
            }
        } catch (e) { App.showToast('❌ ' + e.message, 'error'); }
    },

    async resetMediaPoP(mediaId, mediaName) {
        if (!await App.showConfirm(`Reset all Proof of Play data for "${mediaName}" (ID: ${mediaId})? This cannot be undone.`)) return;
        try {
            const r = await fetch(`/xibo/stats/reset/${mediaId}`, { method: 'DELETE' });
            const result = await r.json();
            if (result.success) {
                App.showToast(`✅ Cleared ${result.deleted} records for "${mediaName}".`, 'success');
                // Update the in-memory data so the table refreshes immediately
                const item = this.allData.find(i => String(i.mediaId) === String(mediaId));
                if (item) { item.totalPlays = 0; item.uniqueDisplays = 0; item.lastPlay = null; }
                this.filterTable(document.getElementById('ana-search')?.value || '');
                // Recompute KPIs
                const total = this.allData.reduce((s, i) => s + (i.totalPlays || 0), 0);
                const el = document.getElementById('kpi-total-plays');
                if (el) el.textContent = total.toLocaleString();
            } else {
                App.showToast('❌ Reset failed: ' + result.error, 'error');
            }
        } catch (e) { App.showToast('❌ ' + e.message, 'error'); }
    },

    async resetPoP() {
        if (!await App.showConfirm('⚠️ This will permanently delete ALL Proof of Play records from the database. This cannot be undone. Are you sure?')) return;
        if (!await App.showConfirm('🔴 FINAL WARNING: Proceed with resetting all PoP data?')) return;
        try {
            const r = await fetch('/xibo/stats/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true })
            });
            const result = await r.json();
            if (result.success) {
                App.showToast('✅ All PoP data has been reset.', 'success');
                this.allData = [];
                this.renderTable([]);
                ['kpi-total-plays','kpi-active-media','kpi-unique-screens'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '0';
                });
            } else {
                App.showToast('❌ Reset failed: ' + result.error, 'error');
            }
        } catch (e) { App.showToast('❌ ' + e.message, 'error'); }
    },

    showMain() {
        document.getElementById('ana-main').style.display = 'block';
        document.getElementById('ana-detail').style.display = 'none';
        this.currentMediaId = null;
    },

    async viewDetail(mediaId, mediaName) {
        this.currentMediaId   = mediaId;
        this.currentMediaName = mediaName;
        this.currentPopHistory = [];

        document.getElementById('ana-main').style.display   = 'none';
        document.getElementById('ana-detail').style.display = 'block';

        const titleEl = document.getElementById('detail-title');
        const subEl   = document.getElementById('detail-sub');
        const badgeEl = document.getElementById('detail-count-badge');
        const tbody   = document.getElementById('detail-tbody');

        if (titleEl) titleEl.textContent = mediaName;
        if (subEl)   subEl.textContent   = `Media ID: ${mediaId}`;
        if (badgeEl) badgeEl.textContent = '';
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-5" style="color:var(--text-muted);">Fetching playback history...</td></tr>`;
        lucide.createIcons();

        try {
            const res    = await fetch(`/xibo/stats?mediaId=${mediaId}&t=${Date.now()}`);
            const data   = await res.json();
            const history = data.history || [];
            this.currentPopHistory = history;

            if (badgeEl) badgeEl.textContent = `${history.length} events`;
            tbody.innerHTML = '';

            if (history.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center p-5" style="color:var(--text-muted);">No verified play logs found for this media.</td></tr>`;
                return;
            }

            history.forEach(r => {
                const tr = document.createElement('tr');
                const timeStr = new Date(r.time).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });

                tr.innerHTML = `
                    <td>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div class="pop-timeline-dot"></div>
                            <div>
                                <div style="font-size:0.82rem;font-weight:600;color:var(--text);">${timeStr}</div>
                                <div class="history-badge"><i data-lucide="shield-check" style="width:10px;"></i> Verified</div>
                            </div>
                        </div>
                    </td>
                    <td style="font-weight:700;font-size:0.85rem;">${App.esc(r.display || 'Unknown Screen')}</td>
                    <td>${r.slot !== '-' ? `<span style="background:#ede9fe;color:#7c3aed;border-radius:6px;padding:2px 8px;font-size:0.75rem;font-weight:700;">Slot ${r.slot}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                    <td style="font-size:0.82rem;">${App.esc(r.brandName || 'Unlinked')}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-5" style="color:#ef4444;">Failed to load: ${e.message}</td></tr>`;
        }
        lucide.createIcons();
    }
};

App.registerView('analytics', AnalyticsView);
