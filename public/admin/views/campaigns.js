App.registerView('campaigns', {
    render() {
        return `
            <div class="page-title">Campaign Management</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Active Campaigns</h3>
                    <button class="btn btn-primary" onclick="alert('Create campaign maps to Xibo Scheduling UI for MVP')">+ Create Campaign</button>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Campaign</th>
                                <th>Brand</th>
                                <th>Screens</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="campaigns-table-body">
                            <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Loading campaigns from Xibo...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async mount(container) {
        const campaigns = await Api.get('/campaigns/recent');
        let html = '';
        if (campaigns && campaigns.length > 0) {
            campaigns.forEach(c => {
                html += `
                    <tr>
                        <td style="font-weight: 500;">
                            <div>${c.name}</div>
                            <div style="font-size: 0.70rem; color: var(--text-muted);">ID: ${c.id}</div>
                        </td>
                        <td>${c.brandName || 'Local Upload'}</td>
                        <td>${c.isLayoutSpecific == 1 ? 'Specific Screen' : 'Global / Multiple'}</td>
                        <td><span class="badge active">${c.status || 'Active'}</span></td>
                    </tr>
                `;
            });
        } else {
            html = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No campaign activity found or failed to fetch from Xibo.</td></tr>';
        }
        document.getElementById('campaigns-table-body').innerHTML = html;
    }
});
