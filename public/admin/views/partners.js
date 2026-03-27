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
                                <th>Rev. Share</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="partners-table-body">
                            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading partners...</td></tr>
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
    }
});
