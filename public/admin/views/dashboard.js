App.registerView('dashboard', {
    map: null,
    screensData: [],
    liveSnapshot: {},

    render() {
        return `
            <div class="dash-kpi-row" id="dashboard-kpis">
                <div class="kpi-card kpi-white" style="grid-column: span 6;">Loading real-time KPIs...</div>
            </div>

            <!-- Dashboard Map & Alerts Row -->
            <div class="dash-chart-row" style="grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="card" style="padding: 0; overflow: hidden; height: 400px; position: relative;">
                    <div style="position: absolute; top: 15px; left: 15px; z-index: 1000; background: white; padding: 8px 12px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="map" style="width: 16px; color: var(--accent);"></i> Live Network Map
                    </div>
                    <div id="dash-map" style="width: 100%; height: 100%;"></div>
                </div>
                
                <div class="card" style="height: 400px; display: flex; flex-direction: column;">
                    <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
                        Live Network Status
                        <div style="display:flex; gap:8px;">
                            <span id="alert-count" class="badge warning" style="display:none;">0</span>
                            <span id="live-count" class="badge success" style="display:none;">0 Live</span>
                        </div>
                    </div>
                    <div id="alerts-container" style="flex: 1; overflow-y: auto; padding: 0 5px;">
                        <div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
                            <i data-lucide="check-circle" style="width: 48px; height: 48px; margin-bottom:15px; color: #10b981;"></i>
                            <p style="font-size: 0.9rem; font-weight: 500;">All Systems Green</p>
                        </div>
                    </div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f1f5f9;">
                        <button class="btn btn-secondary" style="width: 100%; font-size: 0.8rem;" data-onclick="Views.dashboard.triggerSync">
                            <i data-lucide="refresh-cw" style="width: 14px; margin-right: 6px;"></i> System Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div class="dash-chart-row">
                <div class="card">
                    <div class="card-title">Daily Ad Plays (Last 7 Days)</div>
                    <div style="height: 250px; position:relative;">
                        <canvas id="chart-daily-plays"></canvas>
                    </div>
                </div>
                <div class="card" style="opacity: 0.6; pointer-events: none;">
                    <!-- TODO: Enable in v2.0 -->
                    <div class="card-title">Revenue Growth (₹) <span class="badge secondary">Coming Soon</span></div>
                    <div style="height: 250px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-weight: 600;">
                        Chart data available in next version
                    </div>
                </div>
                <div class="card">
                    <div class="card-title" style="margin-bottom: 10px;">Recent Activity</div>
                    <div class="table-wrap" style="height: 250px; overflow-y: auto;">
                        <table>
                            <thead><tr><th>Display & Media</th><th>Brand / Slot</th><th>Time</th></tr></thead>
                            <tbody id="dash-recent-plays-body"><tr><td colspan="3">Loading...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.dashboard = this;
        const header = document.getElementById('dynamic-header-title');
        if (header) header.innerText = 'Admin Command Center';
        if (this.map) { this.map.remove(); this.map = null; }
        
        // Ensure Campaigns tab is hidden natively
        const campaignTab = document.querySelector('a[data-view="campaigns"]');
        if (campaignTab) campaignTab.style.display = 'none';

        await this.refreshData();
        this.initMap();
        lucide.createIcons();
    },

    async refreshData() {
        await Promise.all([
            this.loadKPIs(),
            this.loadScreens(),
            this.loadRecentPlays(),
            this.loadLiveSnapshot(),
            this.loadWeeklyStats()
        ]);
        this.updateLiveStatus();
        if (this.map) this.updateMapMarkers();
    },

    async loadKPIs() {
        // Fetch dashboard data and the global totals endpoint in parallel
        const [data, totals] = await Promise.all([
            Api.get('/dashboard'),
            fetch('/xibo/stats/totals').then(r => r.json()).catch(() => null)
        ]);
        if (data) {
            // Override totalImpressions with the canonical 30d total so it
            // always matches the Analytics page (same source: getAllMediaStats)
            if (totals && totals.totalPlays != null) {
                data.totalImpressions = totals.totalPlays;
            }
            await this.updateKPIsUI(data);
            // TODO: Enable in v2.0
            // this.renderRevenueChart(data.revenueTrend || []);
        }
    },

    async loadScreens() {
        const screensMap = await Api.getXiboDisplays();
        this.screensData = Object.values(screensMap || {});
    },

    async loadRecentPlays() {
        const tbody = document.getElementById('dash-recent-plays-body');
        if (!tbody) return;
        try {
            const res = await fetch('/xibo/stats/recent');
            const result = await res.json();
            const records = result.data || [];
            tbody.innerHTML = '';
            if (records.length === 0) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 4; td.textContent = 'No recent plays';
                tr.appendChild(td); tbody.appendChild(tr);
            } else {
                records.slice(0, 10).forEach(r => {
                    const tr = document.createElement('tr');
                    
                    // Display & Media Column
                    const tdInfo = document.createElement('td');
                    const cleanName = App.cleanFilename(r.adName);
                    tdInfo.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 30px; border-radius: 4px; overflow: hidden; background: #f1f5f9; border: 1px solid var(--border); flex-shrink: 0;">
                                <img src="/xibo/library/download/${r.mediaId}?thumbnail=1" 
                                     style="width: 100%; height: 100%; object-fit: cover;" 
                                     onerror="this.src='https://placehold.co/40x30/e2e8f0/64748b?text=🎞️'">
                            </div>
                            <div style="overflow: hidden; text-overflow: ellipsis;">
                                <div style="font-weight: 700; color: var(--text); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${r.displayName || 'Unknown Display'}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cleanName}</div>
                            </div>
                        </div>
                    `;
                    
                    // Brand / Slot Column
                    const tdBrand = document.createElement('td');
                    const slotText = r.slot !== '-' ? `Slot ${r.slot}` : '';
                    tdBrand.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="font-weight: 600; font-size: 0.8rem;">${r.brandName || 'Local'}</div>
                            ${slotText ? `<span style="font-size: 0.7rem; color: var(--primary); font-weight: 700; letter-spacing: 0.5px;">${slotText.toUpperCase()}</span>` : ''}
                        </div>
                    `;
                    
                    // Time Column
                    const tdTime = document.createElement('td');
                    tdTime.innerHTML = `
                        <div style="text-align: right; font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">
                            ${new Date(r.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    `;
                    
                    tr.append(tdInfo, tdBrand, tdTime);
                    tbody.appendChild(tr);
                });
            }
        } catch (e) { console.error('Failed to load recent plays:', e); }
    },

    async loadWeeklyStats() {
        try {
            const res = await fetch('/xibo/stats/weekly');
            const result = await res.json();
            console.log('[Dashboard] Weekly stats response:', result);
            if (result.success && result.data && result.data.length > 0) {
                this.renderDailyChart(result.data);
            } else {
                // Render empty chart with 7-day labels so chart is not blank
                const emptyData = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    emptyData.push({ date: d.toISOString().split('T')[0], total: 0 });
                }
                this.renderDailyChart(emptyData);
            }
        } catch (e) {
            console.error('Failed to load weekly stats:', e);
        }
    },

    async loadLiveSnapshot() {
        try {
            const liveRes = await fetch('/xibo/stats/live');
            const liveData = await liveRes.json();
            this.liveSnapshot = liveData.snapshot || {};
        } catch (e) { this.liveSnapshot = {}; }
    },

    initMap() {
        if (this.map) return;
        const mapContainer = document.getElementById('dash-map');
        if (!mapContainer) return;

        if (!document.getElementById('map-marker-anims')) {
            const style = document.createElement('style');
            style.id = 'map-marker-anims';
            style.textContent = `
                @keyframes mapPulseSuccess { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); } 70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
                @keyframes mapPulseError { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
                .leaflet-popup-content-wrapper { background: #0f172a; color: #fff; border: 1px solid #1e293b; border-radius: 8px; }
                .leaflet-popup-tip { background: #0f172a; }
            `;
            document.head.appendChild(style);
        }

        this.map = L.map('dash-map', { zoomControl: true, attributionControl: false }).setView([17.3850, 78.4867], 10); 
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(this.map);

        setTimeout(() => {
            this.map.invalidateSize();
            this.updateMapMarkers();
        }, 100);
    },

    updateMapMarkers() {
        if (!this.map || !this.screensData) return;
        this.map.eachLayer(layer => { if (layer instanceof L.Marker) this.map.removeLayer(layer); });
        let bounds = [];
        this.screensData.forEach(s => {
            if (s.lat && s.lng) {
                const color = s.online ? '#10b981' : '#ef4444';
                const pulse = s.online ? 'mapPulseSuccess 2s infinite' : 'mapPulseError 2s infinite';
                const stroke = s.online ? '#065f46' : '#7f1d1d';
                const customIcon = L.divIcon({
                    html: `<div style="background:${color}; width:18px; height:18px; border-radius:50%; border:2px solid ${stroke}; animation:${pulse};"></div>`,
                    className: '', iconSize: [18, 18]
                });
                const live = this.liveSnapshot[s.id];
                const nowPlaying = live ? `<div style="margin-top:5px; font-size:11px; color:#10b981;">▶ ${App.cleanFilename(live.adName)}</div>` : '';
                const popupHtml = `<div style="font-family:'Inter', sans-serif;"><strong style="color:#fff;">${s.name}</strong><div style="font-size:11px; color:#94a3b8;">${s.location || s.address || 'Unknown'}</div>${nowPlaying}</div>`;
                L.marker([s.lat, s.lng], { icon: customIcon }).addTo(this.map).bindPopup(popupHtml);
                bounds.push([s.lat, s.lng]);
            }
        });
        if (bounds.length > 0) this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    },

    async updateKPIsUI(data) {
        const kpiContainer = document.getElementById('dashboard-kpis');
        if (!kpiContainer) return;
        kpiContainer.innerHTML = '';
        const createKpi = (cls, icon, lbl, val, sub) => {
            const card = document.createElement('div');
            card.className = `kpi-card ${cls}`;
            const header = document.createElement('div');
            header.className = 'kpi-header';
            const i = document.createElement('i');
            i.setAttribute('data-lucide', icon);
            header.append(i, document.createTextNode(` ${lbl}`));
            const h2 = document.createElement('h2'); h2.textContent = val;
            card.append(header, h2);
            if (sub) {
                const s = document.createElement('div');
                s.style.cssText = 'font-size: 0.7rem; color: rgba(255,255,255,0.7);';
                s.textContent = sub; card.appendChild(s);
            }
            return card;
        };
        kpiContainer.appendChild(createKpi('kpi-blue', 'monitor', 'Total Screens', data.totalScreens));
        kpiContainer.appendChild(createKpi('kpi-darkblue', 'play-circle', 'Total PoP Plays', (data.totalImpressions || 0).toLocaleString(), 'Total verified plays'));
        // TODO: Enable in v2.0
        const revKpi = createKpi('kpi-lightblue', 'indian-rupee', 'Revenue', 'Coming Soon', 'Available in next version');
        revKpi.style.opacity = '0.7';
        kpiContainer.appendChild(revKpi);

        // TODO: Enable in v2.0
        /*
        try {
            const payouts = await Api.get('/partners/payouts/pending');
            if (payouts && payouts.length > 0) {
                const totalPending = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
                kpiContainer.appendChild(createKpi('kpi-red', 'clock', 'Payouts Due', `₹${totalPending.toLocaleString()}`, `${payouts.length} pending requests` || 'Settlement required'));
            } else {
                kpiContainer.appendChild(createKpi('kpi-white', 'users', 'Partners', data.totalPartners));
            }
        } catch (e) {
            kpiContainer.appendChild(createKpi('kpi-white', 'users', 'Partners', data.totalPartners));
        }
        */
        kpiContainer.appendChild(createKpi('kpi-white', 'users', 'Partners', data.totalPartners));

        kpiContainer.appendChild(createKpi('kpi-white', 'briefcase', 'Brands', data.totalBrands));

        lucide.createIcons();
    },

    renderDailyChart(weeklyData) {
        const canvas = document.getElementById('chart-daily-plays');
        if (!canvas) return;
        
        // Prevent layout overlap bugs by destroying previous chart instantiation
        if (this.dailyChartInst) {
            this.dailyChartInst.destroy();
        }

        const ctx = canvas.getContext('2d');

        // Map array of { date: 'YYYY-MM-DD', total: number } onto chart vectors
        // IMPORTANT: Parse date parts directly to avoid UTC midnight timezone shift
        const labels = weeklyData.map(d => {
            const parts = String(d.date).split('T')[0].split('-');
            // Build date using local parts (year, month-1, day) to avoid TZ shifts
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            return days[date.getDay()];
        });
        const dataVals = weeklyData.map(d => parseInt(d.total) || 0);
        console.log('[Dashboard] Chart labels:', labels, 'Values:', dataVals);

        this.dailyChartInst = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Plays', 
                    data: dataVals, 
                    backgroundColor: '#6366f1', 
                    borderRadius: 4 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    y: { beginAtZero: true }, 
                    x: { grid: { display: false } } 
                } 
            }
        });
    },

    renderRevenueChart(trend) {
        const canvas = document.getElementById('chart-revenue');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const labels = trend.length ? trend.map(t => t.month) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const data = trend.length ? trend.map(t => t.total) : [0, 0, 0, 0, 0, 0]; 
        new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Revenue', data, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    },

    updateLiveStatus() {
        const container = document.getElementById('alerts-container');
        const alertBadge = document.getElementById('alert-count');
        const liveBadge = document.getElementById('live-count');
        if (!container) return;
        
        const offline = this.screensData.filter(s => !s.online);
        const online = this.screensData.filter(s => s.online);
        
        container.innerHTML = '';
        if (offline.length > 0) {
            offline.forEach(s => {
                const item = document.createElement('div');
                item.className = 'alert-item'; item.style.borderLeft = '3px solid #ef4444';
                const content = document.createElement('div');
                const title = document.createElement('div');
                title.style.fontWeight = '600'; title.textContent = `${s.name || s.display || s.id || s.displayId || 'Unknown'} Offline`;
                content.append(title); item.append(content); container.appendChild(item);
            });
            alertBadge.textContent = offline.length; alertBadge.style.display = 'inline-block';
        } else alertBadge.style.display = 'none';

        if (online.length > 0) {
            online.forEach(s => {
                const live = this.liveSnapshot[s.xibo_display_id];
                const item = document.createElement('div');
                item.className = 'alert-item'; item.style.borderLeft = '4px solid #10b981';
                item.style.padding = '12px';
                
                const content = document.createElement('div');
                content.style.display = 'flex';
                content.style.alignItems = 'center';
                content.style.gap = '12px';
                content.style.width = '100%';

                const thumbnail = document.createElement('div');
                thumbnail.style.width = '44px';
                thumbnail.style.height = '33px';
                thumbnail.style.borderRadius = '4px';
                thumbnail.style.overflow = 'hidden';
                thumbnail.style.background = '#f1f5f9';
                thumbnail.style.flexShrink = '0';
                
                if (live && live.mediaId) {
                    thumbnail.innerHTML = `<img src="/xibo/library/download/${live.mediaId}?thumbnail=1" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://placehold.co/44x33/e2e8f0/64748b?text=🎞️'">`;
                } else {
                    thumbnail.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:1rem;">📡</div>`;
                }

                const textWrap = document.createElement('div');
                textWrap.style.flex = '1';
                textWrap.style.overflow = 'hidden';

                const title = document.createElement('div');
                title.style.fontWeight = '700';
                title.style.fontSize = '0.85rem';
                title.style.color = 'var(--text)';
                title.style.whiteSpace = 'nowrap';
                title.style.overflow = 'hidden';
                title.style.textOverflow = 'ellipsis';
                title.textContent = s.name || s.display || 'Live Screen';

                const playing = document.createElement('div');
                playing.style.fontSize = '0.75rem';
                playing.style.color = '#10b981';
                playing.style.fontWeight = '600';
                playing.innerHTML = `<span style="opacity:0.8;">▶</span> ${live ? App.cleanFilename(live.adName) : 'Syncing...'}`;
                
                textWrap.append(title, playing);
                content.append(thumbnail, textWrap);
                item.append(content);
                container.appendChild(item);
            });
            liveBadge.textContent = `${online.length} Live`; liveBadge.style.display = 'inline-block';
        } else liveBadge.style.display = 'none';

        if (container.children.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px;"><p>All Systems Green</p></div>';
        }
        lucide.createIcons();
    },

    async triggerSync(e) {
        const btn = e.target.closest('[data-onclick]');
        if (!btn) return;
        btn.disabled = true;
        const old = btn.innerHTML;
        btn.innerHTML = 'Syncing...';
        try {
            await fetch('/admin/api/test-sync', { method: 'POST' });
            await this.refreshData();
            btn.innerHTML = 'Complete';
            setTimeout(() => { btn.disabled = false; btn.innerHTML = old; lucide.createIcons(); }, 2000);
        } catch (e) { btn.disabled = false; btn.innerHTML = old; App.showToast('Sync failed', 'error'); }
    }
});
