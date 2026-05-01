App.registerView('monitoring', {
    render() {
        return `
            <div class="page-title">System Monitoring</div>
            <div class="dash-kpi-row" id="monitoring-stats-row" style="margin-bottom: 2rem;">
                <!-- Will be populated by JS -->
            </div>

            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Screen Health Monitoring</h3>
                    <button class="btn btn-secondary" data-onclick="App.navigate"><i data-lucide="refresh-cw" style="width: 14px; margin-right: 6px;"></i> Refresh</button>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Screen ID</th>
                                <th>Status</th>
                                <th>Last Sync</th>
                                <th>Internet</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="monitoring-table-body">
                            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Fetching screen health...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async mount(container) {
        const [health, screensMap] = await Promise.all([
            Api.get('/health/xibo'),
            Api.getXiboDisplays()
        ]);

        const statsRow = document.getElementById('monitoring-stats-row');
        if (statsRow && health && health.monitor) {
            const m = health.monitor;
            const lastPulse = m.lastPulse ? new Date(m.lastPulse).toLocaleTimeString() : 'Never';
            const lastCleanup = m.lastCleanup ? new Date(m.lastCleanup).toLocaleTimeString() : 'Never';
            
            statsRow.innerHTML = `
                <div class="kpi-card kpi-darkblue" style="grid-column: span 2;">
                    <div class="kpi-header">Heartbeat Status</div>
                    <h2>${m.active ? 'ACTIVE' : 'INACTIVE'}</h2>
                    <div class="kpi-footer">Last pulse: ${lastPulse}</div>
                </div>
                <div class="kpi-card kpi-blue" style="grid-column: span 2;">
                    <div class="kpi-header">Last Cleanup</div>
                    <h2>${lastCleanup}</h2>
                    <div class="kpi-footer">Next run in ~2 mins</div>
                </div>
                <div class="kpi-card kpi-orange" style="grid-column: span 2;">
                    <div class="kpi-header">Slots Freed</div>
                    <h2>${m.freedSlots || 0}</h2>
                    <div class="kpi-footer">During last maintenance cycle</div>
                </div>
            `;
        }

        const tbody = document.getElementById('monitoring-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const entries = Object.entries(screensMap);
        if (entries.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-muted)';
            td.textContent = 'No screens monitored';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        for (const [id, s] of entries) {
            const tr = document.createElement('tr');
            
            const tdName = document.createElement('td');
            tdName.style.fontWeight = '600';
            tdName.textContent = s.name;
            tr.appendChild(tdName);

            const tdStatus = document.createElement('td');
            const statusSpan = document.createElement('span');
            statusSpan.className = `badge ${s.online ? 'online' : 'offline'}`;
            statusSpan.textContent = s.online ? 'Online' : 'Offline';
            tdStatus.appendChild(statusSpan);
            tr.appendChild(tdStatus);

            const tdSync = document.createElement('td');
            tdSync.style.color = 'var(--text-muted)';
            tdSync.style.fontSize = '0.85rem';
            tdSync.textContent = s.lastAccessed ? new Date(s.lastAccessed + ' UTC').toLocaleString() : 'Never';
            tr.appendChild(tdSync);

            const tdInternet = document.createElement('td');
            const internetSpan = document.createElement('span');
            internetSpan.style.fontWeight = '600';
            internetSpan.style.color = s.online ? 'var(--success)' : 'var(--danger)';
            internetSpan.textContent = s.online ? 'Good' : 'Lost';
            tdInternet.appendChild(internetSpan);
            tr.appendChild(tdInternet);

            const tdAction = document.createElement('td');
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.style.padding = '4px 8px';
            btn.style.fontSize = '0.75rem';
            btn.textContent = 'Ping Device';
            tdAction.appendChild(btn);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        }
    }
});
