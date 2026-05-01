App.registerView('subscriptions', {
    render() {
        return `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-title">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="calendar-check"></i> All Subscriptions
                    </div>
                </div>
            </div>

            <div class="card" id="subscriptions-list-container">
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Brand Name</th>
                                <th>Plan Details</th>
                                <th>Period</th>
                                <th>Allocations</th>
                                <th>Status</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="subscriptions-table-body">
                            <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">Loading subscriptions...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.subscriptions = this;
        await this.loadAllSubscriptions();
        lucide.createIcons();
    },

    async loadAllSubscriptions() {
        try {
            const subs = await Api.get('/subscriptions');
            this.renderTable(subs || []);
        } catch (e) {
            console.error('Error loading subscriptions:', e);
            App.showToast('Failed to load subscriptions', 'error');
        }
    },

    renderTable(subs) {
        const tbody = document.getElementById('subscriptions-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (subs && subs.length > 0) {
            subs.forEach(s => {
                const tr = document.createElement('tr');
                
                const tdBrand = document.createElement('td');
                tdBrand.style.fontWeight = '600';
                tdBrand.textContent = s.brand_name || `ID: ${s.brand_id}`;
                tr.appendChild(tdBrand);

                const tdPlan = document.createElement('td');
                tdPlan.innerHTML = `<div style="font-weight:500;">${s.plan_name}</div><div style="font-size:0.75rem;color:var(--text-muted);">${s.cities || 'All Locations'}</div>`;
                tr.appendChild(tdPlan);

                const tdPeriod = document.createElement('td');
                tdPeriod.style.color = 'var(--text-muted)';
                tdPeriod.style.fontSize = '0.8rem';
                
                const fmt = (d) => {
                    const date = new Date(d);
                    return isNaN(date.getTime()) ? d : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                };
                tdPeriod.innerHTML = `<div>${fmt(s.start_date)}</div><div style="font-size:0.7rem; opacity:0.7;">to ${fmt(s.end_date)}</div>`;
                tr.appendChild(tdPeriod);

                const tdAlloc = document.createElement('td');
                tdAlloc.innerHTML = `<span title="Screens"><i data-lucide="tv" style="width:12px;vertical-align:middle;"></i> ${s.screens_included}</span> &nbsp; <span title="Slots"><i data-lucide="grid" style="width:12px;vertical-align:middle;"></i> ${s.slots_included}</span>`;
                tr.appendChild(tdAlloc);

                const tdStatus = document.createElement('td');
                const status = s.status || 'Active';
                const pill = document.createElement('span');
                pill.className = `badge ${status.toLowerCase().replace(/ /g, '-')}`;
                pill.textContent = status;
                tdStatus.appendChild(pill);
                tr.appendChild(tdStatus);

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'right';
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary';
                btn.style.padding = '5px 12px';
                btn.style.fontSize = '0.75rem';
                btn.textContent = 'Manage Brand';
                btn.onclick = () => {
                    window.location.hash = '#brands';
                    // We'd ideally open the brand profile directly, but this is a good start
                };
                tdActions.appendChild(btn);
                tr.appendChild(tdActions);

                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">No active subscriptions found.</td></tr>';
        }
        lucide.createIcons();
    }
});
