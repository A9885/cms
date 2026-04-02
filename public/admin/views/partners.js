App.registerView('partners', {
    editingId: null,
    render() {
        return `
            <div class="page-title">Partners Management</div>
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
                                <th>Company / City</th>
                                <th>Screens</th>
                                <th>Rev. Share</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="partners-table-body">
                            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading partners...</td></tr>
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
                                <label>City</label>
                                <input type="text" class="form-control" id="partner-city">
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
                                    <option value="Inactive">Inactive</option>
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

            <!-- Assign Screens Modal -->
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
                        <div style="margin-top: 12px; display: flex; gap: 8px; align-items: start; background: #eff6ff; padding: 10px; border-radius: 8px; border: 1px solid #dbeafe;">
                            <i data-lucide="info" style="width: 16px; color: #2563eb; margin-top: 2px;"></i>
                            <p style="font-size: 0.72rem; color: #1e3a8a; line-height: 1.4; margin: 0;">
                                Select screens to assign to this partner. Re-assigning a screen will move it from its current partner to this one.
                            </p>
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
        lucide.createIcons();
    },

    async loadPartners() {
        const partners = await Api.get('/partners');
        this.partnersData = partners;
        const tbody = document.getElementById('partners-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (partners && partners.length > 0) {
            partners.forEach(p => {
                const tr = document.createElement('tr');
                
                const tdName = document.createElement('td');
                tdName.style.fontWeight = '500';
                const nameDiv = document.createElement('div');
                nameDiv.textContent = p.name;
                tdName.appendChild(nameDiv);
                const emailDiv = document.createElement('div');
                emailDiv.style.fontSize = '0.75rem';
                emailDiv.style.color = 'var(--text-muted)';
                emailDiv.textContent = p.email || '-';
                tdName.appendChild(emailDiv);
                tr.appendChild(tdName);

                const tdCompany = document.createElement('td');
                const companyDiv = document.createElement('div');
                companyDiv.textContent = p.company || '-';
                tdCompany.appendChild(companyDiv);
                const cityDiv = document.createElement('div');
                cityDiv.style.fontSize = '0.75rem';
                cityDiv.style.color = 'var(--text-muted)';
                cityDiv.textContent = p.city || '-';
                tdCompany.appendChild(cityDiv);
                tr.appendChild(tdCompany);

                const tdScreens = document.createElement('td');
                const screenCount = p.screen_count || 0;
                tdScreens.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:700; color:var(--accent);">${screenCount}</span>
                        <button class="btn-text" style="font-size:0.65rem; padding:2px 6px; background:#eff6ff;" onclick="Views.partners.showAssignModal(${p.id})">Manage</button>
                    </div>
                `;
                tr.appendChild(tdScreens);

                const tdRev = document.createElement('td');
                tdRev.textContent = `${p.revenue_share_percentage}%`;
                tr.appendChild(tdRev);

                const tdStatus = document.createElement('td');
                const badgeClass = p.status.toLowerCase();
                const span = document.createElement('span');
                span.className = `badge ${badgeClass}`;
                span.textContent = p.status;
                tdStatus.appendChild(span);
                tr.appendChild(tdStatus);

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'right';
                
                const editBtn = document.createElement('button');
                editBtn.className = 'icon-btn';
                editBtn.title = 'Edit';
                editBtn.onclick = () => this.showModal(p.id);
                const editIcon = document.createElement('i');
                editIcon.setAttribute('data-lucide', 'edit-2');
                editIcon.style.width = '14px';
                editBtn.appendChild(editIcon);
                tdActions.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'icon-btn';
                deleteBtn.title = 'Delete';
                deleteBtn.style.color = '#ef4444';
                deleteBtn.onclick = () => this.deletePartner(p.id);
                const deleteIcon = document.createElement('i');
                deleteIcon.setAttribute('data-lucide', 'trash-2');
                deleteIcon.style.width = '14px';
                deleteBtn.appendChild(deleteIcon);
                tdActions.appendChild(deleteBtn);

                tr.appendChild(tdActions);
                tbody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-muted)';
            td.style.padding = '40px';
            td.textContent = 'No partners found.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        lucide.createIcons();
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
                document.getElementById('partner-city').value = p.city;
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
            city: document.getElementById('partner-city').value,
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
        if (!await App.showConfirm('Are you sure you want to delete this partner?')) return;
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
