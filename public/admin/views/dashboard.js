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
                        <button class="btn btn-secondary" style="width: 100%; font-size: 0.8rem;" onclick="Views.dashboard.triggerSync()">
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
                <div class="card">
                    <div class="card-title">Revenue Growth (₹)</div>
                    <div style="height: 250px; position:relative;">
                        <canvas id="chart-revenue"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-title" style="margin-bottom: 10px;">Recent Activity</div>
                    <div class="table-wrap" style="height: 250px; overflow-y: auto;">
                        <table>
                            <thead><tr><th>Campaign</th><th>Brand/Slot</th><th>Display</th><th>Time</th></tr></thead>
                            <tbody id="dash-recent-plays-body"><tr><td colspan="4">Loading...</td></tr></tbody>
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
        await this.refreshData();
        this.initMap();
        lucide.createIcons();
    },

    async refreshData() {
        await Promise.all([
            this.loadKPIs(),
            this.loadScreens(),
            this.loadRecentPlays(),
            this.loadLiveSnapshot()
        ]);
        this.updateLiveStatus();
        if (this.map) this.updateMapMarkers();
    },

    async loadKPIs() {
        const data = await Api.get('/dashboard');
        if (data) {
            await this.updateKPIsUI(data);
            this.renderRevenueChart(data.revenueTrend || []);
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
                    const tdName = document.createElement('td');
                    tdName.style.fontWeight = '600'; tdName.textContent = r.adName;
                    const tdBrand = document.createElement('td');
                    tdBrand.textContent = `${r.brandName || 'Local'} ${r.slot !== '-' ? `(S${r.slot})` : ''}`;
                    const tdDisp = document.createElement('td');
                    tdDisp.textContent = r.displayName;
                    const tdTime = document.createElement('td');
                    tdTime.textContent = new Date(r.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    tr.append(tdName, tdBrand, tdDisp, tdTime);
                    tbody.appendChild(tr);
                });
            }
            this.renderDailyChart(records.length);
        } catch (e) { console.error('Failed to load recent plays:', e); }
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
                const nowPlaying = live ? `<div style="margin-top:5px; font-size:11px; color:#10b981;">▶ ${live.adName}</div>` : '';
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
        kpiContainer.appendChild(createKpi('kpi-darkblue', 'play-circle', 'Daily Plays', (data.totalImpressions || 0).toLocaleString(), 'Across network'));
        kpiContainer.appendChild(createKpi('kpi-orange', 'layers', 'Campaigns', data.activeCampaigns));
        kpiContainer.appendChild(createKpi('kpi-lightblue', 'indian-rupee', 'Revenue', `₹${(data.monthlyRevenue || 0).toLocaleString()}`));

        // Add Pending Payouts alert if any
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

        kpiContainer.appendChild(createKpi('kpi-white', 'briefcase', 'Brands', data.totalBrands));

        // Add Creative Moderation alert if any
        try {
            const pendingCreatives = await Api.get('/admin/creatives/pending');
            if (pendingCreatives && pendingCreatives.length > 0) {
                kpiContainer.appendChild(createKpi('kpi-orange', 'check-square', 'Mod Queue', `${pendingCreatives.length}`, 'Pending approval'));
            }
        } catch (e) {
            console.warn('[Dashboard] Failed to fetch moderation count');
        }

        lucide.createIcons();
    },

    renderDailyChart(totalVolume) {
        const canvas = document.getElementById('chart-daily-plays');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ label: 'Plays', data: [0, 0, 0, 0, 0, 0, totalVolume], backgroundColor: '#6366f1', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
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
                title.style.fontWeight = '600'; title.textContent = `${s.name} Offline`;
                content.append(title); item.append(content); container.appendChild(item);
            });
            alertBadge.textContent = offline.length; alertBadge.style.display = 'inline-block';
        } else alertBadge.style.display = 'none';

        if (online.length > 0) {
            online.forEach(s => {
                const live = this.liveSnapshot[s.id];
                const item = document.createElement('div');
                item.className = 'alert-item'; item.style.borderLeft = '3px solid #10b981';
                const content = document.createElement('div');
                const title = document.createElement('div');
                title.style.fontWeight = '600'; title.textContent = s.name;
                const playing = document.createElement('div');
                playing.style.color = '#10b981'; playing.textContent = `▶ ${live ? live.adName : 'Syncing...'}`;
                content.append(title, playing); item.append(content); container.appendChild(item);
            });
            liveBadge.textContent = `${online.length} Live`; liveBadge.style.display = 'inline-block';
        } else liveBadge.style.display = 'none';

        if (container.children.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px;"><p>All Systems Green</p></div>';
        }
        lucide.createIcons();
    },

    async triggerSync() {
        const btn = event.currentTarget;
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
