App.registerView('monitoring', {
    render() {
        return `
            <div class="page-title">System Monitoring</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Screen Health Monitoring</h3>
                    <button class="btn btn-secondary" onclick="App.navigate('monitoring')"><i data-lucide="refresh-cw" style="width: 14px; margin-right: 6px;"></i> Refresh</button>
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
        const screensMap = await Api.getXiboDisplays();
        let html = '';
        
        for (const [id, s] of Object.entries(screensMap)) {
            const isOnline = s.online;
            const statusBadge = isOnline ? '<span class="badge online">Online</span>' : '<span class="badge offline">Offline</span>';
            const internetStatus = isOnline ? '<span style="color: var(--success); font-weight: 600;">Good</span>' : '<span style="color: var(--danger); font-weight: 600;">Lost</span>';
            const lastSync = s.lastAccessed ? new Date(s.lastAccessed + ' UTC').toLocaleString() : 'Never';

            html += `
                <tr>
                    <td style="font-weight: 600;">${s.name}</td>
                    <td>${statusBadge}</td>
                    <td style="color: var(--text-muted); font-size: 0.85rem;">${lastSync}</td>
                    <td>${internetStatus}</td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Ping Device</button></td>
                </tr>
            `;
        }

        if(html === '') html = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No screens monitored</td></tr>';
        document.getElementById('monitoring-table-body').innerHTML = html;
    }
});
