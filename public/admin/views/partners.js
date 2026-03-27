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
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.partners = this;
        await this.loadPartners();
        lucide.createIcons();
    },

    async loadPartners() {
        const [partners, stats] = await Promise.all([
            Api.get('/partners'),
            Api.get('/partners/stats')
        ]);
        
        this.partnersData = partners;
        const statsMap = {};
        if (Array.isArray(stats)) {
            stats.forEach(s => { statsMap[s.id] = s.screen_count; });
        }

        let html = '';
        if (partners && partners.length > 0) {
            partners.forEach(p => {
                const badgeClass = p.status.toLowerCase();
                const screenCount = statsMap[p.id] || 0;
                html += `
                    <tr>
                        <td style="font-weight: 500;">
                            <div>${p.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted)">${p.email || '-'}</div>
                        </td>
                        <td>
                            <div>${p.company || '-'}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted)">${p.city || '-'}</div>
                        </td>
                        <td>
                            <div style="font-weight: 700; color: var(--accent);">${screenCount}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted)">Assigned</div>
                        </td>
                        <td>${p.revenue_share_percentage}%</td>
                        <td><span class="badge ${badgeClass}">${p.status}</span></td>
                        <td style="text-align: right;">
                             <button class="icon-btn" onclick="Views.partners.showModal(${p.id})" title="Edit"><i data-lucide="edit-2" style="width:14px;"></i></button>
                             <button class="icon-btn" onclick="Views.partners.deletePartner(${p.id})" title="Delete" style="color:#ef4444;"><i data-lucide="trash-2" style="width:14px;"></i></button>
                        </td>
                    </tr>
                `;
            });
        } else {
            html = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">No partners found.</td></tr>';
        }
        document.getElementById('partners-table-body').innerHTML = html;
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

        if(!payload.name) return alert('Name is required');

        let res;
        if (this.editingId) {
            res = await Api.put(`/partners/${this.editingId}`, payload);
        } else {
            res = await Api.post('/partners', payload);
        }

        if (res.error) {
            alert(res.error);
        } else {
            this.closeModal();
            await this.loadPartners();
        }
    },

    async deletePartner(id) {
        if (!confirm('Are you sure you want to delete this partner?')) return;
        const res = await Api.delete(`/partners/${id}`);
        if (res.error) {
            alert(res.error);
        } else {
            await this.loadPartners();
        }
    }
});
