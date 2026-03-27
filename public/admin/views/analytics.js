const AnalyticsView = {
    render() {
        return `
            <style>
                .analytics-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; }
                .btn-back { background: #f1f5f9; border: 1px solid #e2e8f0; color: #4a5568; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
                .btn-back:hover { background: #e2e8f0; }
                .pop-history-table { max-height: 500px; overflow-y: auto; }
            </style>

            <div class="view-header">
                <div class="header-left">
                    <h1>Proof of Play: Media Analytics</h1>
                    <p class="subtitle">System-wide playback counts across all screens</p>
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary" onclick="App.views.analytics.fetchData()">
                        <i data-lucide="refresh-cw"></i> Refresh Data
                    </button>
                    <button class="btn btn-primary" onclick="App.views.analytics.forceSyncAll()">
                        <i data-lucide="zap"></i> Force Sync All
                    </button>
                </div>
            </div>

            <div id="analytics-view-main">
                <div class="stats-strip" id="analytics-summary-strip">
                    <div class="stat-card">
                        <span class="stat-label">Total Plays (30d)</span>
                        <span class="stat-value" id="total-system-plays">-</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Active Media</span>
                        <span class="stat-value" id="total-active-media">-</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Last Aggregation</span>
                        <span class="stat-value" id="last-agg-time">-</span>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="header-left">
                            <i data-lucide="bar-chart-3"></i>
                            <span>Media Playback Summary</span>
                        </div>
                        <div class="search-box">
                            <i data-lucide="search"></i>
                            <input type="text" placeholder="Search media..." onkeyup="App.views.analytics.filterTable(this.value)">
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <table class="data-table" id="analytics-table">
                            <thead>
                                <tr>
                                    <th>Media Item</th>
                                    <th>Type</th>
                                    <th class="text-center">Total Plays</th>
                                    <th class="text-center">Unique Screens</th>
                                    <th>Last Verified Play</th>
                                    <th class="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody id="analytics-tbody">
                                <tr><td colspan="6" class="text-center p-5">Loading analytics data...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="analytics-view-pop" style="display:none;">
                <div class="analytics-nav">
                    <button class="btn-back" onclick="App.views.analytics.showMain()">← Back to Overview</button>
                    <h3 id="pop-media-title" style="margin:0; font-size:1.1rem;">Media Analytics</h3>
                </div>
                
                <div class="card" style="margin-top: 1rem;">
                    <div class="card-header">
                        <div class="header-left">
                            <i data-lucide="list"></i>
                            <span>Playback History Log</span>
                        </div>
                    </div>
                    <div class="card-body p-0 pop-history-table">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Verification Time</th>
                                    <th>Display</th>
                                    <th>Slot No.</th>
                                    <th>Brand</th>
                                </tr>
                            </thead>
                            <tbody id="analytics-pop-tbody">
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
        try {
            const tbody = document.getElementById('analytics-tbody');
            const resp = await fetch('/xibo/stats/media-summary');
            const data = await resp.json();
            this.allData = data;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center p-5">No play records found.</td></tr>';
                return;
            }

            // Update Summary Strip
            const totalPlays = data.reduce((sum, item) => sum + item.totalPlays, 0);
            const activeMedia = data.filter(item => item.totalPlays > 0).length;
            
            document.getElementById('total-system-plays').textContent = totalPlays.toLocaleString();
            document.getElementById('total-active-media').textContent = activeMedia;
            document.getElementById('last-agg-time').textContent = new Date().toLocaleTimeString();

            this.renderTable(data);
        } catch (err) {
            console.error('Error fetching analytics:', err);
            document.getElementById('analytics-tbody').innerHTML = 
                `<tr><td colspan="6" class="text-center text-red p-5">Error: ${err.message}</td></tr>`;
        }
    },

    renderTable(items) {
        const tbody = document.getElementById('analytics-tbody');
        tbody.innerHTML = items.map(item => `
            <tr>
                <td>
                    <div class="media-info">
                        <div class="media-icon"><i data-lucide="${item.type === 'video' ? 'video' : 'image'}"></i></div>
                        <div>
                            <div class="font-bold">${item.name}</div>
                            <div class="text-xs text-muted">ID: ${item.mediaId}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge badge-secondary">${item.type}</span></td>
                <td class="text-center font-bold text-lg">${item.totalPlays}</td>
                <td class="text-center">${item.uniqueDisplays}</td>
                <td>${item.lastPlay ? item.lastPlay : '<span class="text-muted italic">Never</span>'}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-primary" onclick="App.views.analytics.viewMediaPop(${item.mediaId}, '${item.name.replace(/'/g, "\\'")}')">
                        View Proof of Play →
                    </button>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    },

    filterTable(query) {
        if (!this.allData) return;
        const filtered = this.allData.filter(i => 
            i.name.toLowerCase().includes(query.toLowerCase()) || 
            String(i.mediaId).includes(query)
        );
        this.renderTable(filtered);
    },

    async forceSyncAll() {
        if (!confirm('Force sync will trigger a manual data collection from all screens. Proceed?')) return;
        
        try {
            App.showToast('🚀 Aggregating system-wide stats...', 'info');
            const resp = await fetch('/xibo/displays/force-sync-all', { method: 'POST' });
            const result = await resp.json();
            
            if (result.success) {
                App.showToast(`✅ Sync complete for ${result.synced} screens. Refreshing...`, 'success');
                setTimeout(() => this.fetchData(), 2000);
            } else {
                App.showToast('❌ Sync failed: ' + result.error, 'error');
            }
        } catch (err) {
            App.showToast('❌ Error: ' + err.message, 'error');
        }
    },

    showMain() {
        document.getElementById('analytics-view-main').style.display = 'block';
        document.getElementById('analytics-view-pop').style.display = 'none';
        
        // Disable sync button in overview by default if needed, or leave it
        document.querySelector('.header-actions').style.display = 'flex';
    },

    async viewMediaPop(mediaId, mediaName) {
        document.getElementById('analytics-view-main').style.display = 'none';
        document.getElementById('analytics-view-pop').style.display = 'block';
        document.querySelector('.header-actions').style.display = 'none';

        const titleObj = document.getElementById('pop-media-title');
        titleObj.textContent = `Analysis: ${mediaName}`;

        const tbody = document.getElementById('analytics-pop-tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-5">Fetching playback history...</td></tr>';

        try {
            const res = await fetch(`/xibo/stats?mediaId=${mediaId}&t=` + Date.now());
            const data = await res.json();
            const history = data.history || [];

            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center p-5 text-muted">No verify play logs found for this media.</td></tr>';
                return;
            }

            tbody.innerHTML = history.map(r => `
                <tr>
                    <td class="text-muted">${new Date(r.time).toLocaleString()}</td>
                    <td class="font-bold">${r.display || 'Unknown Display'}</td>
                    <td>${r.slot !== '-' ? 'Slot '+r.slot : '-'}</td>
                    <td>${r.brandName || 'External'}</td>
                </tr>
            `).join('');

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-5 text-red">Failed to load history: ${e.message}</td></tr>`;
        }
    }
};

App.registerView('analytics', AnalyticsView);
