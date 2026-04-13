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
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label>Contact Name</label>
                                    <input type="text" class="form-control" id="partner-name" required>
                                </div>
                                <div class="form-group">
                                    <label>Company Name</label>
                                    <input type="text" class="form-control" id="partner-company" required>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label>Email Address</label>
                                    <input type="email" class="form-control" id="partner-email" required>
                                </div>
                                <div class="form-group">
                                    <label>Phone Number</label>
                                    <input type="text" class="form-control" id="partner-phone">
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label>City</label>
                                    <input type="text" class="form-control" id="partner-city">
                                </div>
                                <div class="form-group">
                                    <label>Revenue Share (%)</label>
                                    <input type="number" class="form-control" id="partner-revshare" value="50">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Mailing Address</label>
                                <textarea class="form-control" id="partner-address" rows="2"></textarea>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label>Login Password</label>
                                    <input type="password" class="form-control" id="partner-password" placeholder="Leave empty for default (Partner@123)">
                                    <small style="color:var(--text-muted); font-size:0.7rem;">Defaults to Partner@123 if creating new.</small>
                                </div>
                                <div class="form-group">
                                    <label>Status</label>
                                    <select class="form-control" id="partner-status">
                                        <option value="Active">Active</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Disabled">Disabled</option>
                                    </select>
                                </div>
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

            <!-- ═══ XIBO INTEGRATION MODAL ═══════════════════════════════════════ -->
            <div class="modal-overlay" id="xibo-setup-modal">
                <div class="modal" style="width: 640px; max-width: 95vw;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); border-radius: 12px 12px 0 0; padding: 20px 24px;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:36px; height:36px; background: rgba(99,179,237,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center;">
                                <i data-lucide="zap" style="width:18px; height:18px; color:#63b3ed;"></i>
                            </div>
                            <div>
                                <div class="modal-title" style="color:#fff; font-size:1rem;">Xibo CMS Integration</div>
                                <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Auto-provision partner's Xibo account</div>
                            </div>
                        </div>
                        <button class="modal-close" style="color:#94a3b8;" onclick="Views.partners.closeXiboModal()"><i data-lucide="x"></i></button>
                    </div>

                    <div class="modal-body" style="padding: 0;">

                        <!-- Status Banner -->
                        <div id="xibo-status-banner" style="display:none; padding: 10px 20px; font-size:0.8rem; font-weight:600; border-bottom: 1px solid #e2e8f0;"></div>

                        <!-- Credential Form -->
                        <div id="xibo-cred-section" style="padding: 20px 24px; border-bottom: 1px solid #f0f4f8;">
                            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:14px;">
                                Xibo API Credentials
                            </div>
                            <div class="form-group" style="margin-bottom:12px;">
                                <label style="font-size:0.78rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">
                                    Xibo CMS Base URL
                                </label>
                                <input type="url" class="form-control" id="xibo-base-url" 
                                    placeholder="https://your-xibo-cms.com" 
                                    style="font-size:0.85rem; font-family: monospace;">
                                <small style="color:#94a3b8; font-size:0.7rem;">Include https://, no trailing slash needed</small>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                                <div class="form-group">
                                    <label style="font-size:0.78rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">Client ID</label>
                                    <input type="text" class="form-control" id="xibo-client-id" 
                                        placeholder="OAuth2 Client ID" style="font-family:monospace; font-size:0.82rem;">
                                </div>
                                <div class="form-group">
                                    <label style="font-size:0.78rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">Client Secret</label>
                                    <input type="password" class="form-control" id="xibo-client-secret" 
                                        placeholder="••••••••••••" style="font-family:monospace; font-size:0.82rem;">
                                </div>
                            </div>
                            <button id="btn-xibo-connect" class="btn btn-primary" style="width:100%; margin-top:8px; font-weight:600;" 
                                onclick="Views.partners.connectXibo()">
                                <i data-lucide="zap" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;"></i>
                                Connect &amp; Auto-Provision Xibo
                            </button>
                        </div>

                        <!-- Live Provisioning Progress -->
                        <div id="xibo-progress-section" style="padding: 20px 24px; border-bottom: 1px solid #f0f4f8;">
                            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:14px;">
                                Provisioning Progress
                            </div>
                            <div id="xibo-steps-list" style="display:flex; flex-direction:column; gap:8px;">
                                <!-- Steps rendered dynamically -->
                                <div style="text-align:center; color:#94a3b8; font-size:0.8rem; padding:20px 0;">
                                    Connect your Xibo account above to start provisioning.
                                </div>
                            </div>
                        </div>

                        <!-- Resource Summary -->
                        <div id="xibo-resources-section" style="padding: 20px 24px; display:none;">
                            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:14px;">
                                Provisioned Resources
                            </div>
                            <div id="xibo-resources-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px;">
                                <!-- Resource cards rendered dynamically -->
                            </div>
                        </div>

                    </div>

                    <div class="modal-footer" style="justify-content:space-between; flex-wrap:wrap; gap:8px;">
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary btn-sm" id="btn-xibo-reprovision" style="display:none; font-size:0.75rem;" 
                                onclick="Views.partners.reprovisionXibo(false)">
                                <i data-lucide="refresh-cw" style="width:12px;"></i> Re-Provision
                            </button>
                            <button class="btn btn-sm" id="btn-xibo-reset" style="display:none; background:#fee2e2; color:#b91c1c; border:none; font-size:0.75rem;" 
                                onclick="Views.partners.reprovisionXibo(true)">
                                <i data-lucide="alert-triangle" style="width:12px;"></i> Full Reset
                            </button>
                            <button class="btn btn-sm" id="btn-xibo-disconnect" style="display:none; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; font-size:0.75rem;" 
                                onclick="Views.partners.disconnectXibo()">
                                <i data-lucide="unlink" style="width:12px;"></i> Disconnect
                            </button>
                        </div>
                        <button class="btn btn-secondary" onclick="Views.partners.closeXiboModal()">Close</button>
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
                editBtn.title = 'Edit Partner';
                editBtn.onclick = () => this.showModal(p.id);
                editBtn.innerHTML = '<i data-lucide="edit-2"></i>';
                tdActions.appendChild(editBtn);

                const xiboBtn = document.createElement('button');
                xiboBtn.className = 'icon-btn';
                xiboBtn.title = 'Xibo Integration';
                const isProvisioned = p.xibo_provision_status === 'active';
                const hasError = p.xibo_provision_status === 'error';
                xiboBtn.style.color = isProvisioned ? '#10b981' : (hasError ? '#ef4444' : '#6366f1');
                xiboBtn.onclick = () => this.showXiboModal(p.id);
                xiboBtn.innerHTML = '<i data-lucide="zap"></i>';
                tdActions.appendChild(xiboBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'icon-btn';
                deleteBtn.style.color = '#ef4444';
                deleteBtn.title = 'Delete Partner';
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
                document.getElementById('partner-name').value = p.name || '';
                document.getElementById('partner-company').value = p.company || '';
                document.getElementById('partner-email').value = p.email || '';
                document.getElementById('partner-phone').value = p.phone || '';
                document.getElementById('partner-city').value = p.city || '';
                document.getElementById('partner-address').value = p.address || '';
                document.getElementById('partner-revshare').value = p.revenue_share_percentage;
                document.getElementById('partner-status').value = p.status;
                document.getElementById('partner-password').value = '';
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
            phone: document.getElementById('partner-phone').value,
            city: document.getElementById('partner-city').value,
            address: document.getElementById('partner-address').value,
            revenue_share_percentage: document.getElementById('partner-revshare').value,
            status: document.getElementById('partner-status').value,
            password: document.getElementById('partner-password').value
        };

        if(!payload.name || !payload.email) return App.showToast('Name and Email are required', 'error');

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
            
            App.showToast('Screens assigned successfully. Xibo display groups syncing in background...', 'success');
            this.closeAssignModal();
            await this.loadPartners();
        } catch (err) {
            App.showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirm Assignment';
        }
    },

    // ─── XIBO INTEGRATION PANEL ──────────────────────────────────────────────

    _xiboPollingInterval: null,
    _xiboPartnerId: null,

    /**
     * Open the Xibo Integration modal for a specific partner.
     */
    async showXiboModal(partnerId) {
        this._xiboPartnerId = partnerId;
        const modal = document.getElementById('xibo-setup-modal');
        modal.classList.add('active');
        lucide.createIcons();

        // Pre-fill existing credentials and status
        await this._loadXiboStatus();
    },

    closeXiboModal() {
        document.getElementById('xibo-setup-modal').classList.remove('active');
        this._stopPolling();
        this._xiboPartnerId = null;
    },

    /**
     * Load current Xibo status and render the panel accordingly.
     */
    async _loadXiboStatus() {
        if (!this._xiboPartnerId) return;
        try {
            // Load status
            const status = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/status`, {
                credentials: 'include'
            }).then(r => r.json());

            this._renderXiboStatus(status);

            // Load resources if active
            if (status.status === 'active') {
                const resources = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/resources`, {
                    credentials: 'include'
                }).then(r => r.json());
                this._renderResources(resources);
            }

            // Auto-poll if provisioning is in progress
            if (status.status === 'provisioning') {
                this._startPolling();
            }
        } catch (err) {
            console.error('[Xibo Panel] Status load error:', err);
        }
    },

    /**
     * Render the modal UI based on current provisioning status.
     */
    _renderXiboStatus(status) {
        const banner = document.getElementById('xibo-status-banner');
        const btnsReprovision = document.getElementById('btn-xibo-reprovision');
        const btnsReset = document.getElementById('btn-xibo-reset');
        const btnsDisconnect = document.getElementById('btn-xibo-disconnect');
        const credSection = document.getElementById('xibo-cred-section');
        const resourceSection = document.getElementById('xibo-resources-section');

        // Pre-fill URL if available
        if (status.xibo_base_url) {
            const urlInput = document.getElementById('xibo-base-url');
            if (urlInput && !urlInput.value) urlInput.value = status.xibo_base_url;
        }

        // Status banner
        if (status.status === 'active') {
            banner.style.display = 'block';
            banner.style.background = '#dcfce7';
            banner.style.color = '#15803d';
            banner.innerHTML = `✅ Xibo provisioned &amp; active — <span style="font-weight:400;">${status.xibo_base_url}</span>`;
            [btnsReprovision, btnsReset, btnsDisconnect].forEach(b => b && (b.style.display = 'inline-flex'));
            resourceSection.style.display = 'block';
        } else if (status.status === 'provisioning') {
            banner.style.display = 'block';
            banner.style.background = '#fef9c3';
            banner.style.color = '#854d0e';
            banner.innerHTML = `⏳ Provisioning in progress... <span style="font-size:0.7rem; font-weight:400;">Auto-refreshing every 3s</span>`;
            [btnsReprovision, btnsReset, btnsDisconnect].forEach(b => b && (b.style.display = 'none'));
            resourceSection.style.display = 'none';
        } else if (status.status === 'error') {
            banner.style.display = 'block';
            banner.style.background = '#fee2e2';
            banner.style.color = '#991b1b';
            banner.innerHTML = `❌ Provisioning failed: ${status.error || 'Unknown error'}`;
            [btnsReprovision, btnsReset, btnsDisconnect].forEach(b => b && (b.style.display = 'inline-flex'));
        } else {
            banner.style.display = 'none';
            [btnsReprovision, btnsReset, btnsDisconnect].forEach(b => b && (b.style.display = 'none'));
        }

        // Render steps
        if (status.steps && status.steps.length > 0) {
            this._renderSteps(status.steps);
        }

        lucide.createIcons();
    },

    _STEP_LABELS: {
        authenticate: 'OAuth2 Authentication',
        folder: 'Create Partner Folder',
        display_group: 'Create Display Group',
        layout: 'Create Default Layout (1920×1080)',
        playlist: 'Create Content Playlist',
        campaign: 'Create Campaign',
        schedule: 'Schedule Campaign'
    },

    _STEP_ICONS: {
        authenticate: 'key',
        folder: 'folder-plus',
        display_group: 'monitor',
        layout: 'layout',
        playlist: 'list',
        campaign: 'megaphone',
        schedule: 'calendar',
        error: 'x-circle'
    },

    /**
     * Render provisioning step list with ✅/⏳/❌ icons.
     */
    _renderSteps(steps) {
        const container = document.getElementById('xibo-steps-list');
        if (!container) return;

        // Deduplicate: keep last entry per step name
        const stepMap = new Map();
        for (const s of steps) stepMap.set(s.step, s);
        const deduped = [...stepMap.values()];

        container.innerHTML = deduped.map(s => {
            const isOk = s.status === 'ok';
            const isErr = s.status === 'error';
            const isRunning = s.status === 'running';
            const icon = this._STEP_ICONS[s.step] || 'circle';
            const label = this._STEP_LABELS[s.step] || s.step;
            const bg = isOk ? '#f0fdf4' : (isErr ? '#fef2f2' : (isRunning ? '#fffbeb' : '#f8fafc'));
            const iconColor = isOk ? '#16a34a' : (isErr ? '#dc2626' : (isRunning ? '#d97706' : '#94a3b8'));
            const emoji = isOk ? '✅' : (isErr ? '❌' : (isRunning ? '⏳' : '○'));
            return `
                <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:${bg}; border-radius:8px; border:1px solid ${isOk ? '#bbf7d0' : (isErr ? '#fecaca' : '#f1f5f9')};">
                    <span style="font-size:1rem; flex-shrink:0;">${emoji}</span>
                    <div style="flex:1;">
                        <div style="font-size:0.8rem; font-weight:600; color:#1e293b;">${label}</div>
                        <div style="font-size:0.7rem; color:#64748b; margin-top:1px;">${s.detail || ''}</div>
                    </div>
                    ${isRunning ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div>' : ''}
                </div>
            `;
        }).join('');
    },

    /**
     * Render resource cards (Folder, Display Group, Layout, etc.)
     */
    _renderResources(data) {
        const section = document.getElementById('xibo-resources-section');
        const grid = document.getElementById('xibo-resources-grid');
        if (!grid) return;

        const resources = data.resources || [];
        if (resources.length === 0) {
            section.style.display = 'none';
            return;
        }

        const typeIcons = {
            folder: 'folder', 
            display_group: 'monitor',
            layout: 'layout', 
            playlist: 'list',
            campaign: 'megaphone', 
            schedule: 'calendar'
        };
        const typeColors = {
            folder: '#6366f1', display_group: '#0ea5e9',
            layout: '#8b5cf6', playlist:'#f59e0b',
            campaign: '#10b981', schedule: '#06b6d4'
        };

        grid.innerHTML = resources.map(r => {
            const icon = typeIcons[r.type] || 'box';
            const color = typeColors[r.type] || '#94a3b8';
            const label = (r.type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return `
                <div style="padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; border-left:3px solid ${color};">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <i data-lucide="${icon}" style="width:14px; height:14px; color:${color};"></i>
                        <span style="font-size:0.72rem; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:0.04em;">${label}</span>
                    </div>
                    <div style="font-size:0.9rem; font-weight:700; color:#0f172a;">ID: ${r.xibo_id}</div>
                    <div style="font-size:0.68rem; color:#94a3b8; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.name || ''}">${r.name || '-'}</div>
                </div>
            `;
        }).join('');

        section.style.display = 'block';
        lucide.createIcons();
    },

    /**
     * Submit credentials and start provisioning.
     */
    async connectXibo() {
        const url = document.getElementById('xibo-base-url')?.value?.trim();
        const id = document.getElementById('xibo-client-id')?.value?.trim();
        const secret = document.getElementById('xibo-client-secret')?.value?.trim();

        if (!url || !id || !secret) {
            App.showToast('All three fields (URL, Client ID, Secret) are required.', 'error');
            return;
        }

        const btn = document.getElementById('btn-xibo-connect');
        btn.disabled = true;
        btn.innerHTML = '<span style="font-size:0.75rem;">⏳ Connecting...</span>';

        try {
            const res = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/connect`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    xibo_base_url: url,
                    client_id: id,
                    client_secret: secret
                })
            }).then(r => r.json());

            if (res.error) throw new Error(res.error);

            App.showToast('Provisioning started! Monitoring progress...', 'success');
            this._startPolling();
            // Immediately refresh status display
            await this._loadXiboStatus();
        } catch (err) {
            App.showToast('Connection failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="zap" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;"></i> Connect & Auto-Provision Xibo';
            lucide.createIcons();
        }
    },

    /**
     * Start polling the provisioning status every 3 seconds.
     */
    _startPolling() {
        this._stopPolling();
        this._xiboPollingInterval = setInterval(async () => {
            try {
                const status = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/status`, {
                    credentials: 'include'
                }).then(r => r.json());
                this._renderXiboStatus(status);

                if (status.status === 'active' || status.status === 'error') {
                    this._stopPolling();
                    if (status.status === 'active') {
                        App.showToast('🎉 Xibo successfully provisioned!', 'success');
                        const resources = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/resources`, {
                            credentials: 'include'
                        }).then(r => r.json());
                        this._renderResources(resources);
                        await this.loadPartners(); // Refresh the table (update ⚡ icon color)
                    }
                }
            } catch (e) {
                this._stopPolling();
            }
        }, 3000);
    },

    _stopPolling() {
        if (this._xiboPollingInterval) {
            clearInterval(this._xiboPollingInterval);
            this._xiboPollingInterval = null;
        }
    },

    async reprovisionXibo(reset = false) {
        const msg = reset
            ? 'Full reset will DELETE all stored Xibo resource IDs and re-create everything from scratch. Continue?'
            : 'Re-provision will check for missing resources and create only what\'s needed. Continue?';
        if (!await App.showConfirm(msg)) return;

        try {
            await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/reprovision`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset })
            }).then(r => r.json());

            App.showToast(reset ? 'Full reset provisioning started' : 'Re-provision started', 'success');
            document.getElementById('xibo-resources-section').style.display = 'none';
            this._startPolling();
            await this._loadXiboStatus();
        } catch (err) {
            App.showToast('Error: ' + err.message, 'error');
        }
    },

    async disconnectXibo() {
        if (!await App.showConfirm('Disconnect Xibo? This removes all stored credentials and resource IDs from this app (does NOT delete resources from Xibo itself).')) return;
        try {
            await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/disconnect`, {
                method: 'DELETE',
                credentials: 'include'
            }).then(r => r.json());

            App.showToast('Xibo disconnected.', 'success');
            this.closeXiboModal();
            await this.loadPartners();
        } catch (err) {
            App.showToast('Disconnect failed: ' + err.message, 'error');
        }
    }
});

