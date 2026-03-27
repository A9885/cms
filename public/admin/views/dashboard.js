App.registerView('dashboard', {
    map: null,
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
                            <p style="font-size: 0.75rem; margin-top: 5px;">No active screen outages detected.</p>
                        </div>
                    </div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f1f5f9;">
                        <button class="btn btn-secondary" style="width: 100%; font-size: 0.8rem;" onclick="Views.dashboard.triggerTestSync()">
                            <i data-lucide="refresh-cw" style="width: 14px; margin-right: 6px;"></i> Test Real-time Sync
                        </button>
                    </div>
                </div>
            </div>

            <div class="dash-chart-row">
                <!-- Daily Ad Play Chart -->
                <div class="card">
                    <div class="card-title">Daily Ad Plays (Last 7 Days)</div>
                    <div style="height: 250px; position:relative;">
                        <canvas id="chart-daily-plays"></canvas>
                    </div>
                </div>

                <!-- Revenue Trend Chart -->
                <div class="card">
                    <div class="card-title">Revenue Growth (₹)</div>
                    <div style="height: 250px; position:relative;">
                        <canvas id="chart-revenue"></canvas>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="card">
                    <div class="card-title" style="margin-bottom: 10px;">Recent Events</div>
                    <div class="table-wrap" style="height: 250px; overflow-y: auto;">
                        <table>
                            <thead><tr><th>Campaign</th><th>Brand/Slot</th><th>Display</th><th>Time</th></tr></thead>
                            <tbody id="dash-campaigns-body"><tr><td colspan="4">Loading...</td></tr></tbody>
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

        // Clear previous state if any
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        await this.refreshData();
        this.initMap();
        
        lucide.createIcons();
    },

    async refreshData() {
        // 1. Fetch Dashboard API (KPIs + Revenue Trend)
        const data = await Api.get('/dashboard');
        if (data) {
            this.updateKPIs(data);
            this.renderRevenueChart(data.revenueTrend || []);
        }

        // 2. Load Screens & Alerts
        const screensMap = await Api.getXiboDisplays();
        const screens = Object.values(screensMap);
        this.screensData = screens;
        // this.updateAlerts(screens); -> Replaced by updateLiveStatus later

        // 3. Load Recent Campaigns & Daily Ad Plays
        await this.loadStatsData();
        
        // 4. Fetch Live Snapshot
        const liveRes = await fetch('/xibo/stats/live');
        const liveData = await liveRes.json();
        this.liveSnapshot = liveData.snapshot || {};
        
        this.updateLiveStatus(screens, this.liveSnapshot);

        if (this.map) this.updateMapMarkers();
    },

    async loadStatsData() {
        try {
            const res = await fetch('/xibo/stats/recent');
            const result = await res.json();
            const records = result.data || [];
            
            // 3.1 Update Recent Activity Table
            let html = '';
            records.slice(0, 10).forEach(r => {
                const time = new Date(r.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const brand = r.brandName || 'Local';
                const slot = r.slot !== '-' ? `(S${r.slot})` : '';
                html += `
                    <tr>
                        <td><div style="font-weight:600; font-size:0.75rem;">${r.adName}</div></td>
                        <td style="font-size:0.7rem;">${brand} ${slot}</td>
                        <td style="font-size:0.7rem; color:var(--text-muted)">${r.displayName}</td>
                        <td style="font-size:0.7rem;">${time}</td>
                    </tr>
                `;
            });
            document.getElementById('dash-campaigns-body').innerHTML = html || '<tr><td colspan="4">No recent plays</td></tr>';

            // 3.2 Update Daily Ad Play Chart (Strictly representing total volume for today without fake distributions)
            this.renderDailyChart(records.length);

        } catch(e) {
            console.error('Failed to load stats data:', e);
        }
    },

    initMap() {
        if (this.map) return;
        const mapContainer = document.getElementById('dash-map');
        if (!mapContainer) return;

        // Inject custom keyframes for the pulsing marker if not already present
        if (!document.getElementById('map-marker-anims')) {
            const style = document.createElement('style');
            style.id = 'map-marker-anims';
            style.innerHTML = `
                @keyframes mapPulseSuccess {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                @keyframes mapPulseError {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                .leaflet-popup-content-wrapper {
                    background: #0f172a;
                    color: #fff;
                    border: 1px solid #1e293b;
                    border-radius: 8px;
                }
                .leaflet-popup-tip {
                    background: #0f172a;
                }
            `;
            document.head.appendChild(style);
        }

        this.map = L.map('dash-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([17.3850, 78.4867], 10); 

        // Premium Dark Theme Map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(this.map);

        setTimeout(() => {
            this.map.invalidateSize();
            this.updateMapMarkers();
        }, 100);
    },

    updateMapMarkers() {
        if (!this.map || !this.screensData) return;
        
        // Clear existing markers
        this.map.eachLayer(layer => {
            if (layer instanceof L.Marker) this.map.removeLayer(layer);
        });

        let bounds = [];
        this.screensData.forEach(s => {
            if (s.lat && s.lng) {
                const isOnline = s.online;
                const color = isOnline ? '#10b981' : '#ef4444';
                const pulseAnim = isOnline ? 'mapPulseSuccess 2s infinite' : 'mapPulseError 2s infinite';
                const stroke = isOnline ? '#065f46' : '#7f1d1d';
                
                const markerHtml = `
                    <div style="background:${color}; width:18px; height:18px; border-radius:50%; border:2px solid ${stroke}; animation:${pulseAnim};"></div>
                `;
                const customIcon = L.divIcon({
                    html: markerHtml,
                    className: '',
                    iconSize: [18, 18]
                });
                
                // Get Live Playing Status for popup
                const live = this.liveSnapshot ? this.liveSnapshot[s.id] : null;
                const nowPlaying = live ? `<div style="margin-top:5px; font-size:11px; padding:4px 6px; background:rgba(16,185,129,0.1); color:#10b981; border-radius:4px;"><span class="pulse" style="display:inline-block;width:6px;height:6px;background:#10b981;border-radius:50%;margin-right:4px;"></span>${live.adName}</div>` : '';
                
                const popupHtml = `
                    <div style="font-family:'Inter', sans-serif;">
                        <strong style="font-size:13px; color:#fff;">${s.name}</strong>
                        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${s.location || s.address || 'Location Unknown'}</div>
                        ${nowPlaying}
                    </div>
                `;

                const m = L.marker([s.lat, s.lng], { icon: customIcon })
                 .addTo(this.map)
                 .bindPopup(popupHtml);
                 
                bounds.push([s.lat, s.lng]);
            }
        });

        if (bounds.length > 0) {
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    },

    updateKPIs(data) {
        const kpiContainer = document.getElementById('dashboard-kpis');
        if (!kpiContainer) return;
        
        // Use strictly real values retrieved from backend
        this.baseImpressions = data.totalImpressions || 0; 
        
        kpiContainer.innerHTML = `
            <div class="kpi-card kpi-blue">
                <div class="kpi-header"><i data-lucide="monitor"></i> Total Screens</div>
                <h2>${data.totalScreens}</h2>
            </div>
            <div class="kpi-card kpi-darkblue">
                <div class="kpi-header"><i data-lucide="play-circle"></i> Live Impressions</div>
                <h2 id="live-impressions-counter">${this.baseImpressions.toLocaleString()}</h2>
                <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); display:flex; align-items:center;">
                    Real-time (Xibo API)
                </div>
            </div>
            <div class="kpi-card kpi-orange">
                <div class="kpi-header"><i data-lucide="layers"></i> Campaigns</div>
                <h2>${data.activeCampaigns}</h2>
            </div>
            <div class="kpi-card kpi-lightblue">
                <div class="kpi-header"><i data-lucide="indian-rupee"></i> Revenue</div>
                <h2>₹${data.monthlyRevenue.toLocaleString()}</h2>
            </div>
            <div class="kpi-card kpi-white">
                <div class="kpi-header"><i data-lucide="users"></i> Partners</div>
                <h2>${data.totalPartners}</h2>
            </div>
            <div class="kpi-card kpi-white">
                <div class="kpi-header"><i data-lucide="briefcase"></i> Brands</div>
                <h2>${data.totalBrands}</h2>
            </div>
        `;
        lucide.createIcons();
    },

    startLiveCounters() {
        // Feature removed to strictly forbid mocked real-time generation. 
        // Real-time stats are now driven completely through event aggregation or periodic refresh natively.
    },

    renderDailyChart(totalVolume) {
        const ctx = document.getElementById('chart-daily-plays');
        if (!ctx) return;
        
        // Zero mocked data generation - place all recent volume on 'Today'
        const data = [0, 0, 0, 0, 0, 0, totalVolume];

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Ad Impressions',
                    data: data,
                    backgroundColor: '#6366f1',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
    },

    renderRevenueChart(trend) {
        const ctx = document.getElementById('chart-revenue');
        if (!ctx) return;

        const labels = trend.length ? trend.map(t => t.month) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const data = trend.length ? trend.map(t => t.total) : [0, 0, 0, 0, 0, 0]; // Stripped fallback mocked demo figures 

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
    },

    updateLiveStatus(screens, liveSnapshot) {
        const alertsContainer = document.getElementById('alerts-container');
        const alertCountBadge = document.getElementById('alert-count');
        const liveCountBadge = document.getElementById('live-count');
        
        const offlineScreens = screens.filter(s => !s.online);
        const onlineScreens = screens.filter(s => s.online);
        
        let html = '';
        
        // 1. Offline Alerts (Priority)
        if (offlineScreens.length > 0) {
            offlineScreens.forEach(s => {
                html += `
                    <div class="alert-item" style="border-left: 3px solid #ef4444; margin-bottom: 10px;">
                        <div class="alert-icon warning"><i data-lucide="alert-circle"></i></div>
                        <div style="flex:1;">
                            <div style="color:var(--text-primary); font-weight:600; font-size:0.8rem;">${s.name} Offline</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">Location: ${s.location || 'Unknown'}</div>
                        </div>
                    </div>
                `;
            });
            alertCountBadge.innerText = offlineScreens.length;
            alertCountBadge.style.display = 'inline-block';
        } else {
            alertCountBadge.style.display = 'none';
        }

        // 2. Now Playing (Live Status)
        if (onlineScreens.length > 0) {
            html += `<div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); margin: 15px 0 8px 5px; text-transform: uppercase; letter-spacing: 0.5px;">Currently Playing</div>`;
            onlineScreens.forEach(s => {
                const live = liveSnapshot[s.id];
                const adName = live ? live.adName : 'Syncing...';
                const brand = live ? live.brandName : 'Direct';
                
                html += `
                    <div class="alert-item" style="border-left: 3px solid #10b981; background: rgba(16, 185, 129, 0.02);">
                        <div class="alert-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                            <i data-lucide="play-circle" style="width:14px; height:14px;"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="color:var(--text-primary); font-weight:600; font-size:0.8rem;">${s.name}</div>
                            <div style="font-size:0.75rem; color: #10b981; font-weight: 500;">
                                <span class="pulse" style="display:inline-block; width:6px; height:6px; background:#10b981; border-radius:50%; margin-right:4px;"></span>
                                ${adName}
                            </div>
                            <div style="font-size:0.65rem; color: var(--text-muted);">${brand}</div>
                        </div>
                    </div>
                `;
            });
            liveCountBadge.innerText = `${onlineScreens.length} Live`;
            liveCountBadge.style.display = onlineScreens.length > 0 ? 'inline-block' : 'none';
        }

        if (html === '') {
            html = `
                <div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
                    <i data-lucide="check-circle" style="width: 48px; height: 48px; margin-bottom:15px; color: #10b981;"></i>
                    <p style="font-size: 0.9rem; font-weight: 500;">All Systems Green</p>
                </div>
            `;
        }

        alertsContainer.innerHTML = html;
        lucide.createIcons();
    },

    async triggerTestSync() {
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin" style="width:14px; margin-right:6px;"></i> Syncing...';
        lucide.createIcons();

        try {
            await fetch('/admin/api/test-sync', { method: 'POST' });
            setTimeout(() => {
                btn.innerHTML = '<i data-lucide="check" style="width:14px; margin-right:6px;"></i> Sync Complete';
                lucide.createIcons();
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    lucide.createIcons();
                }, 2000);
            }, 1000);
        } catch (e) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            lucide.createIcons();
            alert('Test Sync failed.');
        }
    }
});
