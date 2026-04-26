App.registerView('partners', {
    editingId: null,
    partnersData: [],
    filters: {
        query: '',
        status: 'all'
    },
    
    render() {
        return `
            <div class="page-title">Partners & Payouts</div>
            
            <!-- KPI Section -->
            <div class="dash-kpi-row" id="partner-kpis">
                <div class="kpi-card kpi-blue">
                    <div class="kpi-icon-overlay"><i data-lucide="users"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-header">Active Partners</div>
                        <h2 id="kpi-total-partners">-</h2>
                        <div class="kpi-footer">Revenue generating partners</div>
                    </div>
                </div>
                <div class="kpi-card kpi-orange">
                    <div class="kpi-icon-overlay"><i data-lucide="clock"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-header">Pending Payouts</div>
                        <h2 id="kpi-pending-payouts">-</h2>
                        <div class="kpi-footer">Awaiting settlement</div>
                    </div>
                </div>
                <div class="kpi-card kpi-lightblue">
                    <div class="kpi-icon-overlay"><i data-lucide="check-circle"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-header">Total Paid</div>
                        <h2 id="kpi-total-paid">-</h2>
                        <div class="kpi-footer">Lifetime settlements</div>
                    </div>
                </div>
                <div class="kpi-card kpi-darkblue">
                    <div class="kpi-icon-overlay"><i data-lucide="monitor"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-header">Total Screens</div>
                        <h2 id="kpi-total-screens">-</h2>
                        <div class="kpi-footer">Partner-owned displays</div>
                    </div>
                </div>
            </div>

            <div class="dash-table-row">
                <!-- Payout Queue -->
                <div class="card">
                    <div class="card-title">
                        <span><i data-lucide="wallet" style="width:18px; vertical-align:middle; margin-right:8px; color:var(--warning);"></i> Payout Requests Queue</span>
                    </div>
                    <div class="table-wrap" style="border:none;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Partner</th>
                                    <th>Period</th>
                                    <th>Amount</th>
                                    <th style="text-align: right;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="payouts-table-body">
                                <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding:30px;">No pending requests.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Action Center -->
                <div class="card action-card">
                    <div class="card-title" style="color:#fff;">Network Operations</div>
                    <div class="action-content">
                        <div class="action-stat-row">
                            <div class="action-stat">
                                <span class="label">System Health</span>
                                <span class="value" style="color:#34d399;">OPTIMAL</span>
                            </div>
                            <div class="action-stat">
                                <span class="label">New Requests</span>
                                <span class="value" id="new-requests-count">0</span>
                            </div>
                        </div>
                        
                        <div class="action-btns">
                            <button class="btn btn-glow-blue" data-onclick="Views.partners.showModal">
                                <i data-lucide="user-plus"></i> New Partner
                            </button>
                            <button class="btn btn-outline-white" data-onclick="Views.partners.exportPartners">
                                <i data-lucide="download"></i> Export Report
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Partner List -->
            <div class="card" style="margin-top: 1.5rem;">
                <div class="table-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="font-size: 1.1rem; font-weight: 800; color:var(--text-primary);">Registered Partners</h3>
                        <p style="font-size: 0.75rem; color: var(--text-muted);">Manage partner accounts, revenue share, and screen assignments.</p>
                    </div>
                    <div class="table-header-actions">
                        <div class="search-box">
                            <i data-lucide="search"></i>
                            <input type="text" id="partner-search" placeholder="Search partners..." oninput="Views.partners.filterPartners(this.value)">
                        </div>
                        <select class="form-control" style="width:140px; height:38px; margin-bottom:0;" onchange="Views.partners.filterStatus(this.value)">
                            <option value="all">All Status</option>
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Disabled">Disabled</option>
                        </select>
                    </div>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table style="min-width: 900px;">
                        <thead>
                            <tr>
                                <th style="width: 250px;">Partner Details</th>
                                <th>Displays</th>
                                <th>Rev. Share</th>
                                <th>Settled</th>
                                <th>Balance</th>
                                <th>Status</th>
                                <th style="text-align: right; padding-right: 24px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="partners-table-body">
                            <tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 50px;">Loading partners...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Partner Modal (Add/Edit) -->
            <div class="modal-overlay" id="partner-modal">
                <div class="modal" style="width: 600px;">
                    <div class="modal-header">
                        <div class="modal-title" id="partner-modal-title">Add Partner</div>
                        <button type="button" class="modal-close" data-onclick="Views.partners.closeModal"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="partner-form" data-onsubmit="Views.partners.submitPartner">
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
                                    <input type="password" class="form-control" id="partner-password" placeholder="Leave empty for default">
                                    <small style="color:var(--text-muted); font-size:0.7rem;">Defaults to Partner@123 for new partners.</small>
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
                        <button type="button" class="btn btn-secondary" data-onclick="Views.partners.closeModal">Cancel</button>
                        <button type="submit" form="partner-form" class="btn btn-primary">Save Partner</button>
                    </div>
                </div>
            </div>

            <!-- Assign Screens Modal -->
            <div class="modal-overlay" id="assign-screens-modal">
                <div class="modal" style="width: 500px;">
                    <div class="modal-header">
                        <div class="modal-title">Assign Screens to <span id="assign-partner-name" style="color:var(--accent);"></span></div>
                        <button type="button" class="modal-close" data-onclick="Views.partners.closeAssignModal"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body">
                        <div id="available-screens-list" style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;">
                            <div style="padding: 20px; text-align: center; color: var(--text-muted);">Loading screens...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-onclick="Views.partners.closeAssignModal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="btn-confirm-assignment" data-onclick="Views.partners.submitAssignment">Confirm Assignment</button>
                    </div>
                </div>
            </div>

            <!-- XIBO INTEGRATION MODAL -->
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
                        <button type="button" class="modal-close" style="color:#94a3b8;" data-onclick="Views.partners.closeXiboModal"><i data-lucide="x"></i></button>
                    </div>

                    <div class="modal-body" style="padding: 0;">
                        <div id="xibo-status-banner" style="display:none; padding: 10px 20px; font-size:0.8rem; font-weight:600; border-bottom: 1px solid #e2e8f0;"></div>

                        <div id="xibo-cred-section" style="padding: 20px 24px; border-bottom: 1px solid #f0f4f8;">
                            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:14px;">
                                Xibo API Credentials
                            </div>
                            <div class="form-group" style="margin-bottom:12px;">
                                <label style="font-size:0.78rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">Xibo CMS Base URL</label>
                                <input type="url" class="form-control" id="xibo-base-url" placeholder="https://your-xibo-cms.com">
                                <small style="color:#94a3b8; font-size:0.7rem;">Include https://, no trailing slash</small>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                                <div class="form-group">
                                    <label style="font-size:0.78rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">Client ID</label>
                                    <input type="text" class="form-control" id="xibo-client-id" placeholder="OAuth2 Client ID">
                                </div>
                                <div class="form-group">
                                    <label style="font-size:0.78rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">Client Secret</label>
                                    <input type="password" class="form-control" id="xibo-client-secret" placeholder="••••••••••••">
                                </div>
                            </div>
                            <button id="btn-xibo-connect" class="btn btn-primary" style="width:100%; margin-top:8px; font-weight:600;" data-onclick="Views.partners.connectXibo">
                                <i data-lucide="zap" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;"></i>
                                Connect &amp; Auto-Provision Xibo
                            </button>
                        </div>

                        <div id="xibo-progress-section" style="padding: 20px 24px; border-bottom: 1px solid #f0f4f8;">
                            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:14px;">Provisioning Progress</div>
                            <div id="xibo-steps-list" style="display:flex; flex-direction:column; gap:8px;">
                                <div style="text-align:center; color:#94a3b8; font-size:0.8rem; padding:20px 0;">Connect account to start provisioning.</div>
                            </div>
                        </div>

                        <div id="xibo-resources-section" style="padding: 20px 24px; display:none;">
                            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:14px;">Provisioned Resources</div>
                            <div id="xibo-resources-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px;"></div>
                        </div>
                    </div>

                    <div class="modal-footer" style="justify-content:space-between; flex-wrap:wrap; gap:8px;">
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary btn-sm" id="btn-xibo-reprovision" style="display:none; font-size:0.75rem;" data-onclick="Views.partners.reprovisionXibo">
                                <i data-lucide="refresh-cw" style="width:12px;"></i> Re-Provision
                            </button>
                            <button class="btn btn-sm" id="btn-xibo-reset" style="display:none; background:#fee2e2; color:#b91c1c; border:none; font-size:0.75rem;" data-onclick="Views.partners.reprovisionXibo">
                                <i data-lucide="alert-triangle" style="width:12px;"></i> Full Reset
                            </button>
                            <button class="btn btn-sm" id="btn-xibo-disconnect" style="display:none; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; font-size:0.75rem;" data-onclick="Views.partners.disconnectXibo">
                                <i data-lucide="unlink" style="width:12px;"></i> Disconnect
                            </button>
                        </div>
                        <button type="button" class="btn btn-secondary" data-onclick="Views.partners.closeXiboModal">Close</button>
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
        try {
            const partners = await Api.get('/partners');
            this.partnersData = partners || [];
            const tbody = document.getElementById('partners-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            let totalScreens = 0;
            let totalPaid = 0;
            let pendingBal = 0;

            let filtered = this.partnersData;
            
            // Apply Status Filter
            if (this.filters.status !== 'all') {
                filtered = filtered.filter(p => p.status === this.filters.status);
            }
            
            // Apply Search Filter
            if (this.filters.query) {
                const q = this.filters.query.toLowerCase();
                filtered = filtered.filter(p => 
                    (p.name && p.name.toLowerCase().includes(q)) || 
                    (p.company && p.company.toLowerCase().includes(q)) ||
                    (p.email && p.email.toLowerCase().includes(q)) ||
                    (p.city && p.city.toLowerCase().includes(q))
                );
            }

            if (filtered.length > 0) {
                filtered.forEach(p => {
                    totalScreens += (p.screen_count || 0);
                    totalPaid += (p.total_paid || 0);
                    pendingBal += (p.pending_balance || 0);

                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #f1f5f9';
                    
                    // Details
                    const tdName = document.createElement('td');
                    tdName.innerHTML = `
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:40px; height:40px; background:linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--accent); font-weight:800; font-size:1rem; border:1px solid rgba(0,0,0,0.05);">
                                ${(p.name || 'P').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${p.name}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${p.company || 'No Company'}</div>
                            </div>
                        </div>
                    `;
                    tr.appendChild(tdName);

                    // Screens
                    const tdScreens = document.createElement('td');
                    const screenCount = p.screen_count || 0;
                    const screenWrap = document.createElement('div');
                    screenWrap.style.display = 'flex';
                    screenWrap.style.alignItems = 'center';
                    screenWrap.style.gap = '10px';
                    screenWrap.innerHTML = `<span style="background:rgba(37, 99, 235, 0.08); color:var(--accent); min-width:28px; padding:0 6px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px; font-weight:800; font-size:0.8rem; border:1px solid rgba(37, 99, 235, 0.15);">${screenCount}</span>`;
                    
                    const manageBtn = document.createElement('button');
                    manageBtn.className = 'btn-text';
                    manageBtn.style.cssText = 'font-size:0.72rem; font-weight:700; color:var(--accent); background:none; border:none; cursor:pointer; padding:6px 10px; border-radius:6px; transition:all 0.2s;';
                    manageBtn.textContent = 'Manage';
                    manageBtn.onmouseover = () => manageBtn.style.background = 'rgba(37, 99, 235, 0.05)';
                    manageBtn.onmouseout = () => manageBtn.style.background = 'none';
                    manageBtn.onclick = () => this.showAssignModal(p.id);
                    screenWrap.appendChild(manageBtn);
                    tdScreens.appendChild(screenWrap);
                    tr.appendChild(tdScreens);

                    // Rev Share
                    const tdRev = document.createElement('td');
                    tdRev.innerHTML = `<span style="font-weight:700; font-size:0.85rem; color:var(--text-secondary);">${p.revenue_share_percentage}%</span>`;
                    tr.appendChild(tdRev);

                    // Paid
                    const tdPaid = document.createElement('td');
                    tdPaid.style.fontWeight = '700';
                    tdPaid.textContent = `₹${(p.total_paid || 0).toLocaleString()}`;
                    tr.appendChild(tdPaid);

                    // Balance
                    const tdBal = document.createElement('td');
                    tdBal.style.fontWeight = '800';
                    tdBal.style.color = (p.pending_balance > 0) ? '#ea580c' : 'var(--text-primary)';
                    tdBal.textContent = `₹${(p.pending_balance || 0).toLocaleString()}`;
                    tr.appendChild(tdBal);

                    // Status
                    const tdStatus = document.createElement('td');
                    const status = (p.status || 'Active').toLowerCase();
                    let badgeClass = 'badge-active';
                    if (status === 'pending') badgeClass = 'badge-pending';
                    if (status === 'disabled') badgeClass = 'badge-disabled';
                    
                    tdStatus.innerHTML = `<span class="badge-premium ${badgeClass}">${p.status}</span>`;
                    tr.appendChild(tdStatus);

                    // Actions
                    const tdActions = document.createElement('td');
                    tdActions.style.textAlign = 'right';
                    tdActions.style.paddingRight = '20px';
                    
                    const actionWrap = document.createElement('div');
                    actionWrap.style.display = 'flex';
                    actionWrap.style.justifyContent = 'flex-end';
                    actionWrap.style.gap = '8px';

                    if (p.status === 'Pending' || p.status === 'Disabled') {
                        actionWrap.appendChild(this._createActionBtn('check', '#10b981', 'Approve', () => this.updateStatus(p.id, 'approve')));
                    } else {
                        actionWrap.appendChild(this._createActionBtn('slash', '#f59e0b', 'Disable', () => this.updateStatus(p.id, 'disable')));
                    }

                    actionWrap.appendChild(this._createActionBtn('edit-2', 'var(--accent)', 'Edit', () => this.showModal(p.id)));
                    
                    const isProvisioned = p.xibo_provision_status === 'active';
                    const hasError = p.xibo_provision_status === 'error';
                    actionWrap.appendChild(this._createActionBtn('zap', isProvisioned ? '#10b981' : (hasError ? '#ef4444' : '#6366f1'), 'Xibo Integration', () => this.showXiboModal(p.id)));
                    
                    actionWrap.appendChild(this._createActionBtn('trash-2', '#ef4444', 'Delete', () => this.deletePartner(p.id)));

                    tdActions.appendChild(actionWrap);
                    tr.appendChild(tdActions);
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 80px 20px;">
                            <div style="opacity:0.5; margin-bottom:15px;"><i data-lucide="users" style="width:48px; height:48px;"></i></div>
                            <div style="font-weight:700; font-size:1.1rem; color:var(--text-primary);">No partners found</div>
                            <div style="font-size:0.85rem; margin-top:5px;">Try adjusting your search or filters.</div>
                        </td>
                    </tr>`;
            }

            // Update KPIs
            document.getElementById('kpi-total-partners').textContent = this.partnersData.length;
            document.getElementById('kpi-total-paid').textContent = `₹${totalPaid.toLocaleString()}`;
            document.getElementById('kpi-pending-payouts').textContent = `₹${pendingBal.toLocaleString()}`;
            document.getElementById('kpi-total-screens').textContent = totalScreens;
            
            const pendingPartnersCount = this.partnersData.filter(p => p.status === 'Pending').length;
            const newRequestsEl = document.getElementById('new-requests-count');
            if (newRequestsEl) newRequestsEl.textContent = pendingPartnersCount;
            
            lucide.createIcons();
        } catch (err) {
            console.error('[Partners] Load failed:', err);
        }
    },

    _createActionBtn(icon, color, title, callback) {
        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.borderRadius = '8px';
        btn.style.color = color;
        btn.title = title;
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            callback();
        };
        btn.innerHTML = `<i data-lucide="${icon}" style="width:14px; height:14px;"></i>`;
        return btn;
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
        try {
            const payouts = await Api.get('/partners/payouts/pending');
            const tbody = document.getElementById('payouts-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (payouts && payouts.length > 0) {
                payouts.forEach(p => {
                    const tr = document.createElement('tr');
                    
                    const tdName = document.createElement('td');
                    tdName.style.fontWeight = '600';
                    tdName.textContent = p.partner_name || 'Unknown';
                    tr.appendChild(tdName);

                    const tdMonth = document.createElement('td');
                    tdMonth.textContent = p.month;
                    tr.appendChild(tdMonth);

                    const tdAmt = document.createElement('td');
                    tdAmt.style.fontWeight = '700';
                    tdAmt.style.color = 'var(--accent)';
                    tdAmt.textContent = `₹${(p.amount || 0).toLocaleString()}`;
                    tr.appendChild(tdAmt);

                    const tdAction = document.createElement('td');
                    tdAction.style.textAlign = 'right';
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-primary btn-sm';
                    btn.style.padding = '4px 12px';
                    btn.style.fontSize = '0.7rem';
                    btn.textContent = 'Approve & Pay';
                    btn.onclick = () => this.approvePayout(p.id);
                    tdAction.appendChild(btn);
                    tr.appendChild(tdAction);

                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding:30px;">No pending settlement requests.</td></tr>';
            }
        } catch (err) {
            console.error('[Payouts] Load failed:', err);
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
        if (id && typeof id === 'object' && id.target) id = null; // ignore event objects
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

    closeModal(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        document.getElementById('partner-modal').classList.remove('active');
        this.editingId = null;
    },

    async submitPartner(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
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

    closeAssignModal(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        document.getElementById('assign-screens-modal').classList.remove('active');
        this.assigningId = null;
    },

    async submitAssignment(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const btn = document.getElementById('btn-confirm-assignment');
        const checkboxes = document.querySelectorAll('.screen-checkbox:checked');
        const screenIds = Array.from(checkboxes)
            .map(cb => parseInt(cb.value, 10))
            .filter(id => !isNaN(id));
        
        if (!this.assigningId) {
            App.showToast('No partner selected for assignment', 'error');
            return;
        }

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

    _xiboPollingInterval: null,
    _xiboPartnerId: null,

    async showXiboModal(partnerId) {
        this._xiboPartnerId = partnerId;
        const modal = document.getElementById('xibo-setup-modal');
        modal.classList.add('active');
        lucide.createIcons();
        await this._loadXiboStatus();
    },

    closeXiboModal(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        document.getElementById('xibo-setup-modal').classList.remove('active');
        this._stopPolling();
        this._xiboPartnerId = null;
    },

    async _loadXiboStatus() {
        if (!this._xiboPartnerId) return;
        try {
            const status = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/status`, {
                credentials: 'include'
            }).then(r => r.json());

            this._renderXiboStatus(status);

            if (status.status === 'active') {
                const resources = await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/resources`, {
                    credentials: 'include'
                }).then(r => r.json());
                this._renderResources(resources);
            }

            if (status.status === 'provisioning') {
                this._startPolling();
            }
        } catch (err) {
            console.error('[Xibo Panel] Status load error:', err);
        }
    },

    _renderXiboStatus(status) {
        const banner = document.getElementById('xibo-status-banner');
        const btnsReprovision = document.getElementById('btn-xibo-reprovision');
        const btnsReset = document.getElementById('btn-xibo-reset');
        const btnsDisconnect = document.getElementById('btn-xibo-disconnect');
        const resourceSection = document.getElementById('xibo-resources-section');

        if (status.xibo_base_url) {
            const urlInput = document.getElementById('xibo-base-url');
            if (urlInput && !urlInput.value) urlInput.value = status.xibo_base_url;
        }

        if (status.status === 'active') {
            banner.style.display = 'block';
            banner.style.background = '#dcfce7';
            banner.style.color = '#15803d';
            banner.innerHTML = `✅ Xibo provisioned & active — <span style="font-weight:400;">${status.xibo_base_url}</span>`;
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

    _renderSteps(steps) {
        const container = document.getElementById('xibo-steps-list');
        if (!container) return;
        const stepMap = new Map();
        for (const s of steps) stepMap.set(s.step, s);
        const deduped = [...stepMap.values()];

        container.innerHTML = deduped.map(s => {
            const isOk = s.status === 'ok';
            const isErr = s.status === 'error';
            const isRunning = s.status === 'running';
            const label = this._STEP_LABELS[s.step] || s.step;
            const bg = isOk ? '#f0fdf4' : (isErr ? '#fef2f2' : (isRunning ? '#fffbeb' : '#f8fafc'));
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
            folder: 'folder', display_group: 'monitor',
            layout: 'layout', playlist: 'list',
            campaign: 'megaphone', schedule: 'calendar'
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

    async connectXibo() {
        const url = document.getElementById('xibo-base-url')?.value?.trim();
        const id = document.getElementById('xibo-client-id')?.value?.trim();
        const secret = document.getElementById('xibo-client-secret')?.value?.trim();

        if (!url || !id || !secret) {
            App.showToast('All fields are required.', 'error');
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
                body: JSON.stringify({ xibo_base_url: url, client_id: id, client_secret: secret })
            }).then(r => r.json());

            if (res.error) throw new Error(res.error);
            App.showToast('Provisioning started!', 'success');
            this._startPolling();
            await this._loadXiboStatus();
        } catch (err) {
            App.showToast('Connection failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="zap" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;"></i> Connect & Auto-Provision Xibo';
            lucide.createIcons();
        }
    },

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
                        await this._loadXiboStatus();
                        await this.loadPartners();
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
        // Handle PointerEvent if called via data-onclick
        if (reset && typeof reset === 'object' && reset.target) reset = false;
        
        const msg = reset ? 'Full reset will re-create everything. Continue?' : 'Re-provision will check for missing resources. Continue?';
        if (!await App.showConfirm(msg)) return;
        try {
            await fetch(`/admin/api/partners/${this._xiboPartnerId}/xibo/reprovision`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset })
            }).then(r => r.json());

            App.showToast('Provisioning started', 'success');
            this._startPolling();
            await this._loadXiboStatus();
        } catch (err) {
            App.showToast('Error: ' + err.message, 'error');
        }
    },

    async disconnectXibo() {
        if (!await App.showConfirm('Disconnect Xibo?')) return;
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
    },

    filterPartners(query) {
        this.filters.query = query;
        this.loadPartners();
    },

    filterStatus(status) {
        this.filters.status = status;
        this.loadPartners();
    },

    exportPartners() {
        if (this.partnersData.length === 0) return App.showToast('No data to export', 'warning');
        
        const headers = ['Name', 'Company', 'Email', 'Phone', 'City', 'Revenue Share', 'Total Paid', 'Pending Balance', 'Status'];
        const csv = [
            headers.join(','),
            ...this.partnersData.map(p => [
                `"${p.name}"`,
                `"${p.company}"`,
                p.email,
                p.phone || '',
                p.city || '',
                p.revenue_share_percentage,
                p.total_paid || 0,
                p.pending_balance || 0,
                p.status
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `partners_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});
