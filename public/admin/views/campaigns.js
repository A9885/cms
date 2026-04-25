App.registerView('campaigns', {
    render() {
        return `
            <div class="page-title">Campaign Management</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Active Campaigns</h3>
                    <button class="btn btn-primary" data-onclick="App.showToast">+ Create Campaign</button>
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
        const tbody = document.getElementById('campaigns-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (campaigns && campaigns.length > 0) {
            campaigns.forEach(c => {
                const tr = document.createElement('tr');
                
                const tdCampaign = document.createElement('td');
                tdCampaign.style.fontWeight = '500';
                const nameDiv = document.createElement('div');
                nameDiv.textContent = c.name;
                tdCampaign.appendChild(nameDiv);
                const idDiv = document.createElement('div');
                idDiv.style.fontSize = '0.70rem';
                idDiv.style.color = 'var(--text-muted)';
                idDiv.textContent = `ID: ${c.id}`;
                tdCampaign.appendChild(idDiv);
                tr.appendChild(tdCampaign);

                const tdBrand = document.createElement('td');
                tdBrand.textContent = c.brandName || 'Local Upload';
                tr.appendChild(tdBrand);

                const tdScreens = document.createElement('td');
                tdScreens.textContent = Number(c.isLayoutSpecific) === 1 ? 'Specific Screen' : 'Global / Multiple';
                tr.appendChild(tdScreens);

                const tdStatus = document.createElement('td');
                const span = document.createElement('span');
                span.className = 'badge active';
                span.textContent = c.status || 'Active';
                tdStatus.appendChild(span);
                tr.appendChild(tdStatus);

                tbody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-muted)';
            td.textContent = 'No campaign activity found or failed to fetch from Xibo.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    }
});
