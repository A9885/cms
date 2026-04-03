App.registerView('partners', {
    editingId: null,
    render() {
        return `
            <div class="page-title">Partners & Payouts</div>
            
            <div id="partner-kpis" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div class="kpi accent">
                    <div class="kpi-label">Active Partners</div>
                    <div class="kpi-value" id="kpi-total-partners">-</div>
                    <div class="kpi-icon"><i data-lucide="users"></i></div>
                </div>
                <div class="kpi kpi-warn">
                    <div class="kpi-label">Pending Payouts</div>
                    <div class="kpi-value" id="kpi-pending-payouts">-</div>
                    <div class="kpi-icon"><i data-lucide="clock"></i></div>
                </div>
                <div class="kpi kpi-success">
                    <div class="kpi-label">Total Paid</div>
                    <div class="kpi-value" id="kpi-total-paid">-</div>
                    <div class="kpi-icon"><i data-lucide="check-circle"></i></div>
                </div>
                <div class="kpi kpi-info">
                    <div class="kpi-label">Total Screens</div>
                    <div class="kpi-value" id="kpi-total-screens">-</div>
                    <div class="kpi-icon"><i data-lucide="monitor"></i></div>
                </div>
            </div>

            <div class="card" style="margin-bottom: 2rem;">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;"><i data-lucide="clock" style="width:16px; vertical-align:middle; margin-right:5px;"></i> Payout Requests Queue</h3>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Partner</th>
                                <th>Month</th>
                                <th>Amount</th>
                                <th>Requested</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="payouts-table-body">
                            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No pending requests.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Registered Partners</h3>
                    <button class="btn btn-primary" onclick="Views.partners.showModal()">+ Add Partner</button>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Partner Name</th>
                                <th>Screens</th>
                                <th>Rev. Share</th>
                                <th>Total Paid</th>
                                <th>Balance</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="partners-table-body">
                            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading partners...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Partner Modal (Add/Edit) -->
            <div class="modal-overlay" id="partner-modal">
                <div class="modal">
                    <div class="modal-header">
                        <div class="modal-title" id="partner-modal-title">Add Partner</div>
                        <button class="modal-close" onclick="Views.partners.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="partner-form">
                            <div class="form-group">
                                <label>Contact Name</label>
                                <input type="text" class="form-control" id="partner-name" required>
                            </div>
                            <div class="form-group">
                                <label>Company Name</label>
                                <input type="text" class="form-control" id="partner-company" required>
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" class="form-control" id="partner-email">
                            </div>
                            <div class="form-group">
                                <label>Revenue Share (%)</label>
                                <input type="number" class="form-control" id="partner-revshare" value="50">
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select class="form-control" id="partner-status">
                                    <option value="Active">Active</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Disabled">Disabled</option>
                                </select>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Views.partners.closeModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="Views.partners.submitPartner()">Save Partner</button>
                    </div>
                </div>
            </div>

            <!-- Assign Screens Modal (Remains the same) -->
            <div class="modal-overlay" id="assign-screens-modal">
                <div class="modal" style="width: 500px;">
                    <div class="modal-header">
                        <div class="modal-title">Assign Screens to <span id="assign-partner-name" style="color:var(--accent);"></span></div>
                        <button class="modal-close" onclick="Views.partners.closeAssignModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body">
                        <div id="available-screens-list" style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;">
                            <div style="padding: 20px; text-align: center; color: var(--text-muted);">Loading screens...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Views.partners.closeAssignModal()">Cancel</button>
                        <button class="btn btn-primary" id="btn-confirm-assignment" onclick="Views.partners.submitAssignment()">Confirm Assignment</button>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.partners = this;
        await this.loadPartners();
        await this.loadPayouts();
        lucide.createIcons();
    },

    async loadPartners() {
        const partners = await Api.get('/partners');
        this.partnersData = partners;
        const tbody = document.getElementById('partners-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        let totalScreens = 0;
        let totalPaid = 0;
        let pendingBal = 0;

        if (partners && partners.length > 0) {
            partners.forEach(p => {
                totalScreens += (p.screen_count || 0);
                totalPaid += (p.total_paid || 0);
                pendingBal += (p.pending_balance || 0);

                const tr = document.createElement('tr');
                
                const tdName = document.createElement('td');
                tdName.style.fontWeight = '500';
                tdName.innerHTML = `<div>${p.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">${p.company || '-'}</div>`;
                tr.appendChild(tdName);

                const tdScreens = document.createElement('td');
                tdScreens.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:700; color:var(--accent);">${p.screen_count || 0}</span>
                        <button class="btn-text" style="font-size:0.65rem;" onclick="Views.partners.showAssignModal(${p.id})">Manage</button>
                    </div>
                `;
                tr.appendChild(tdScreens);

                const tdRev = document.createElement('td');
                tdRev.textContent = `${p.revenue_share_percentage}%`;
                tr.appendChild(tdRev);

                const tdPaid = document.createElement('td');
                tdPaid.style.fontWeight = '600';
                tdPaid.textContent = `₹${(p.total_paid || 0).toLocaleString()}`;
                tr.appendChild(tdPaid);

                const tdBal = document.createElement('td');
                tdBal.style.fontWeight = '700';
                tdBal.style.color = (p.pending_balance > 0) ? 'var(--warning-dark)' : 'inherit';
                tdBal.textContent = `₹${(p.pending_balance || 0).toLocaleString()}`;
                tr.appendChild(tdBal);

                const tdStatus = document.createElement('td');
                const badgeClass = p.status.toLowerCase() === 'active' ? 'paid' : (p.status.toLowerCase() === 'pending' ? 'pending' : 'cancelled');
                tdStatus.innerHTML = `<span class="badge ${badgeClass}">${p.status}</span>`;
                tr.appendChild(tdStatus);

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'right';
                
                // Status Toggle Buttons
                if (p.status === 'Pending' || p.status === 'Disabled') {
                    const appBtn = document.createElement('button');
                    appBtn.className = 'icon-btn';
                    appBtn.style.color = '#10b981';
                    appBtn.title = 'Approve Partner';
                    appBtn.onclick = () => this.updateStatus(p.id, 'approve');
                    appBtn.innerHTML = '<i data-lucide="check"></i>';
                    tdActions.appendChild(appBtn);
                }
                if (p.status === 'Active') {
                    const disBtn = document.createElement('button');
                    disBtn.className = 'icon-btn';
                    disBtn.style.color = '#f59e0b';
                    disBtn.title = 'Disable Partner';
                    disBtn.onclick = () => this.updateStatus(p.id, 'disable');
                    disBtn.innerHTML = '<i data-lucide="slash"></i>';
                    tdActions.appendChild(disBtn);
                }

                const editBtn = document.createElement('button');
                editBtn.className = 'icon-btn';
                editBtn.title = 'Edit';
                editBtn.onclick = () => this.showModal(p.id);
                editBtn.innerHTML = '<i data-lucide="edit-2"></i>';
                tdActions.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'icon-btn';
                deleteBtn.style.color = '#ef4444';
                deleteBtn.title = 'Delete';
                deleteBtn.onclick = () => this.deletePartner(p.id);
                deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                tdActions.appendChild(deleteBtn);

                tr.appendChild(tdActions);
                tbody.appendChild(tr);
            });
        }

        // Update KPIs
        document.getElementById('kpi-total-partners').textContent = partners.length;
        document.getElementById('kpi-total-paid').textContent = `₹${totalPaid.toLocaleString()}`;
        document.getElementById('kpi-pending-payouts').textContent = `₹${pendingBal.toLocaleString()}`;
        document.getElementById('kpi-total-screens').textContent = totalScreens;
    },


    async updateStatus(id, action) {
        const msg = action === 'approve' ? 'Approve and activate this partner?' : 'Disable this partner? They will lose access to the portal.';
        if (!await App.showConfirm(msg)) return;
        
        const res = await Api.patch(`/partners/${id}/${action}`);
        if (res.error) {
            App.showToast(res.error, 'error');
        } else {
            App.showToast(`Partner ${action === 'approve' ? 'Activated' : 'Disabled'}`, 'success');
            await this.loadPartners();
        }
    },

    async loadPayouts() {
        const payouts = await Api.get('/partners/payouts/pending');
        const tbody = document.getElementById('payouts-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (payouts && payouts.length > 0) {
            payouts.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:600;">${p.partner_name || 'Unknown'}</td>
                    <td>${p.month}</td>
                    <td style="font-weight:700; color:var(--accent);">₹${(p.amount || 0).toLocaleString()}</td>
                    <td style="font-size:0.75rem; color:var(--text-muted);">${new Date(p.created_at).toLocaleDateString()}</td>
                    <td style="text-align:right;">
                        <button class="btn btn-primary btn-sm" style="padding:4px 12px; font-size:0.7rem;" onclick="Views.partners.approvePayout(${p.id})">Approve & Pay</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding:30px;">No pending settlement requests.</td></tr>';
        }
    },

    async approvePayout(id) {
        if (!await App.showConfirm('Confirm this payout as paid? The partner will be notified.')) return;
        const res = await Api.post(`/partners/payouts/${id}/approve`);
        if (res.error) {
            App.showToast(res.error, 'error');
        } else {
            App.showToast('Payout approved successfully', 'success');
            await this.loadPartners();
            await this.loadPayouts();
        }
    },

    showModal(id = null) {
        this.editingId = id;
        const modal = document.getElementById('partner-modal');
        const title = document.getElementById('partner-modal-title');
        const form = document.getElementById('partner-form');
        
        if (id) {
            title.innerText = 'Edit Partner';
            const p = this.partnersData.find(x => x.id === id);
            if (p) {
                document.getElementById('partner-name').value = p.name;
                document.getElementById('partner-company').value = p.company;
                document.getElementById('partner-email').value = p.email || '';
                document.getElementById('partner-revshare').value = p.revenue_share_percentage;
                document.getElementById('partner-status').value = p.status;
            }
        } else {
            title.innerText = 'Add New Partner';
            form.reset();
        }
        modal.classList.add('active');
    },

    closeModal() {
        document.getElementById('partner-modal').classList.remove('active');
        this.editingId = null;
    },

    async submitPartner() {
        const payload = {
            name: document.getElementById('partner-name').value,
            company: document.getElementById('partner-company').value,
            email: document.getElementById('partner-email').value,
            revenue_share_percentage: document.getElementById('partner-revshare').value,
            status: document.getElementById('partner-status').value
        };

        if(!payload.name) return App.showToast('Name is required', 'error');

        let res;
        if (this.editingId) {
            res = await Api.put(`/partners/${this.editingId}`, payload);
        } else {
            res = await Api.post('/partners', payload);
        }

        if (res.error) {
            App.showToast(res.error, 'error');
        } else {
            this.closeModal();
            await this.loadPartners();
        }
    },

    async deletePartner(id) {
        if (!await App.showConfirm('Are you sure you want to delete this partner? This will unassign all their screens.')) return;
        const res = await Api.delete(`/partners/${id}`);
        if (res.error) {
            App.showToast(res.error, 'error');
        } else {
            await this.loadPartners();
        }
    },


    // ── Screen Assignment ───────────────────────────────────────────────────
    
    async showAssignModal(partnerId) {
        this.assigningId = partnerId;
        const partner = this.partnersData.find(p => p.id === partnerId);
        if (!partner) return;

        document.getElementById('assign-partner-name').textContent = partner.name;
        const modal = document.getElementById('assign-screens-modal');
        const listWrap = document.getElementById('available-screens-list');
        listWrap.innerHTML = '<div style="padding:40px; text-align:center;"><div class="spinner"></div><div style="margin-top:10px; font-size:0.8rem; color:var(--text-muted);">Fetching screen inventory...</div></div>';
        modal.classList.add('active');
        lucide.createIcons();

        try {
            const screens = await Api.get('/screens');
            listWrap.innerHTML = '';
            
            if (!screens || screens.length === 0) {
                listWrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-muted);">No screens found in the system.</div>';
                return;
            }

            screens.forEach(s => {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 15px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.2s;';
                item.className = 'assign-item';
                
                const isSelected = s.partner_id === partnerId;
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = isSelected;
                checkbox.className = 'screen-checkbox';
                checkbox.value = s.id;
                checkbox.style.width = '16px';
                checkbox.style.height = '16px';
                
                const info = document.createElement('div');
                info.style.flex = '1';
                info.innerHTML = `
                    <div style="font-weight:600; font-size:0.85rem;">${s.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">${s.city || 'No city'} · ${s.xibo_display_id ? 'Linked' : 'Offline'}</div>
                `;

                if (s.partner_id && s.partner_id !== partnerId) {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'font-size:0.6rem; background:#fef2f2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:auto;';
                    badge.textContent = 'Owned by others';
                    item.appendChild(info);
                    item.appendChild(badge);
                } else {
                    item.appendChild(info);
                }

                item.prepend(checkbox);
                item.onclick = (e) => {
                    if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
                };
                listWrap.appendChild(item);
            });
        } catch (err) {
            listWrap.innerHTML = `<div style="padding:30px; text-align:center; color:#ef4444;">Failed to load screens: ${err.message}</div>`;
        }
    },

    closeAssignModal() {
        document.getElementById('assign-screens-modal').classList.remove('active');
        this.assigningId = null;
    },

    async submitAssignment() {
        const btn = document.getElementById('btn-confirm-assignment');
        const checkboxes = document.querySelectorAll('.screen-checkbox:checked');
        const screenIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
        
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const res = await Api.post(`/partners/${this.assigningId}/assign-screens`, { screenIds });
            if (res.error) throw new Error(res.error);
            
            App.showToast('Screens assigned successfully', 'success');
            this.closeAssignModal();
            await this.loadPartners();
        } catch (err) {
            App.showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirm Assignment';
        }
    }
});
