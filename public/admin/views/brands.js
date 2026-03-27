App.registerView('brands', {
    editingId: null,
    render() {
        return `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-title">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="briefcase"></i> Brands Management
                    </div>
                    <div class="table-header-actions">
                        <input type="text" id="brand-search" placeholder="🔍 Search brands..." style="width: 250px;">
                        <select id="brand-filter-industry"><option value="">All Industries</option></select>
                        <button class="btn btn-primary" onclick="Views.brands.showModal()">+ Add Brand</button>
                    </div>
                </div>
            </div>

            <div class="card" id="brands-list-container">
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Brand Name</th>
                                <th>Industry</th>
                                <th>Contact</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="brands-table-body">
                            <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">Loading brands...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Brand Modal (Add/Edit) -->
            <div class="modal-overlay" id="brand-modal">
                <div class="modal">
                    <div class="modal-header">
                        <div class="modal-title" id="modal-title">Add Brand</div>
                        <button class="modal-close" onclick="Views.brands.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="brand-form">
                            <div class="form-group">
                                <label>Brand Name</label>
                                <input type="text" class="form-control" id="brand-name" required>
                            </div>
                            <div class="form-group">
                                <label>Industry</label>
                                <input type="text" class="form-control" id="brand-industry" required>
                            </div>
                            <div class="form-group">
                                <label>Contact Person</label>
                                <input type="text" class="form-control" id="brand-contact">
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" class="form-control" id="brand-email">
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select class="form-control" id="brand-status">
                                    <option value="Active">Active</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Archived">Archived</option>
                                </select>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Views.brands.closeModal()">Cancel</button>
                        <button class="btn btn-primary" id="btn-save-brand" onclick="Views.brands.submitBrand()">Save Brand</button>
                    </div>
                </div>
            </div>

            <!-- Brand Profile Modal (Detailed View) -->
            <div class="modal-overlay" id="brand-profile-modal">
                <div class="modal" style="width: 800px; max-width: 95%;">
                    <div class="modal-header">
                        <div class="modal-title" id="profile-modal-title">Brand Profile</div>
                        <button class="modal-close" onclick="document.getElementById('brand-profile-modal').classList.remove('active')"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" id="brand-profile-content">
                        <!-- Profile content injected here -->
                        <div class="inv-loading">Loading brand profile...</div>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.brands = this;
        await this.loadBrands();

        // Setup Filters
        const searchInput = document.getElementById('brand-search');
        const industryFilter = document.getElementById('brand-filter-industry');

        const industries = [...new Set(this.brandsData.map(b => b.industry).filter(Boolean))];
        industryFilter.innerHTML = '<option value="">All Industries</option>' + 
            industries.map(i => `<option value="${i}">${i}</option>`).join('');

        const applyFilters = () => {
            const search = searchInput.value.toLowerCase();
            const industry = industryFilter.value;

            const filtered = this.brandsData.filter(b => {
                const matchesSearch = b.name.toLowerCase().includes(search) || (b.contact_person || '').toLowerCase().includes(search);
                const matchesIndustry = !industry || b.industry === industry;
                return matchesSearch && matchesIndustry;
            });
            this.renderTable(filtered);
        };

        searchInput.oninput = applyFilters;
        industryFilter.onchange = applyFilters;

        lucide.createIcons();
    },

    async loadBrands() {
        const brands = await Api.get('/brands');
        this.brandsData = brands || [];
        this.renderTable(this.brandsData);
    },

    renderTable(brands) {
        let html = '';
        if (brands && brands.length > 0) {
            brands.forEach(b => {
                const badgeClass = b.status.toLowerCase();
                html += `
                    <tr>
                        <td style="font-weight: 500;">
                            <a href="javascript:void(0)" onclick="Views.brands.showProfile(${b.id})" style="color: var(--accent); text-decoration: none;">${b.name}</a>
                        </td>
                        <td>${b.industry || '-'}</td>
                        <td>
                            <div>${b.contact_person || '-'}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted)">${b.email || '-'}</div>
                        </td>
                        <td><span class="badge ${badgeClass}">${b.status}</span></td>
                        <td style="text-align: right;">
                             <button class="icon-btn" onclick="Views.brands.showProfile(${b.id})" title="View Profile"><i data-lucide="user" style="width:14px;"></i></button>
                             <button class="icon-btn" onclick="Views.brands.showModal(${b.id})" title="Edit"><i data-lucide="edit-2" style="width:14px;"></i></button>
                             <button class="icon-btn" onclick="Views.brands.deleteBrand(${b.id})" title="Delete" style="color:#ef4444;"><i data-lucide="trash-2" style="width:14px;"></i></button>
                        </td>
                    </tr>
                `;
            });
        } else {
            html = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">No brands found.</td></tr>';
        }
        document.getElementById('brands-table-body').innerHTML = html;
        lucide.createIcons();
    },

    async showProfile(brandId) {
        const brand = this.brandsData.find(b => b.id === brandId);
        if (!brand) return;

        this._activeProfileBrandId = brandId; // track for real-time refresh

        const modal = document.getElementById('brand-profile-modal');
        const content = document.getElementById('brand-profile-content');
        document.getElementById('profile-modal-title').innerText = `${brand.name} — Profile`;
        modal.classList.add('active');
        content.innerHTML = '<div class="inv-loading">Fetching data...</div>';

        try {
            const [metrics, campaigns, screens] = await Promise.all([
                Api.get(`/brands/${brandId}/metrics`),
                Api.get(`/brands/${brandId}/campaigns`),
                Api.get('/screens')
            ]);

            const validScreens = (screens || []).filter(s => s.xibo_display_id);
            const defaultScreen = validScreens.length > 0 ? validScreens[0].xibo_display_id : null;

            content.innerHTML = `
                <div style="display:grid; grid-template-columns:220px 1fr; gap:20px;">

                    <!-- Left: Brand Info + KPIs -->
                    <div>
                        <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid var(--border); margin-bottom:16px;">
                            <h4 style="margin-bottom:12px; font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Brand Info</h4>
                            <div style="margin-bottom:8px;">
                                <small style="color:var(--text-muted); display:block;">Industry</small>
                                <strong>${brand.industry || 'Not set'}</strong>
                            </div>
                            <div style="margin-bottom:8px;">
                                <small style="color:var(--text-muted); display:block;">Contact</small>
                                <strong>${brand.contact_person || '-'}</strong>
                            </div>
                            <div style="margin-bottom:8px;">
                                <small style="color:var(--text-muted); display:block;">Email</small>
                                <strong style="font-size:0.85rem;">${brand.email || '-'}</strong>
                            </div>
                            <div style="margin-bottom:12px;">
                                <small style="color:var(--text-muted); display:block;">Status</small>
                                <span class="badge ${brand.status.toLowerCase()}">${brand.status}</span>
                            </div>
                            <button class="btn btn-secondary" style="width:100%; font-size:0.8rem;" onclick="Views.brands.showModal(${brand.id})">Edit Profile</button>
                        </div>
                        <div class="dash-kpi-row" style="grid-template-columns:1fr 1fr; gap:8px;">
                            <div class="kpi-card kpi-blue" style="padding:12px;">
                                <div class="kpi-header" style="font-size:0.7rem;"><i data-lucide="layers"></i> Slots</div>
                                <h2 style="font-size:1.5rem;">${metrics.totalScreens}</h2>
                            </div>
                            <div class="kpi-card kpi-lightblue" style="padding:12px;">
                                <div class="kpi-header" style="font-size:0.7rem;"><i data-lucide="play-circle"></i> Plays</div>
                                <h2 style="font-size:1.5rem;">${metrics.totalPlays.toLocaleString()}</h2>
                            </div>
                            <div class="kpi-card kpi-darkblue" style="padding:12px;">
                                <div class="kpi-header" style="font-size:0.7rem;"><i data-lucide="calendar"></i> Campaigns</div>
                                <h2 style="font-size:1.5rem;">${metrics.totalCampaigns}</h2>
                            </div>
                            <div class="kpi-card kpi-orange" style="padding:12px;">
                                <div class="kpi-header" style="font-size:0.7rem;"><i data-lucide="indian-rupee"></i> Spend</div>
                                <h2 style="font-size:1.5rem;">₹${(metrics.totalSpend||0).toLocaleString()}</h2>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Slot Assignment -->
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <h4 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Screen Slot Assignment</h4>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <label style="font-size:0.8rem; color:var(--text-muted);">Screen:</label>
                                <select id="slot-screen-select" class="form-control" style="border-radius:6px; font-size:0.85rem;" onchange="Views.brands.loadSlotGrid(${brand.id})">
                                    ${validScreens.map(s => `<option value="${s.xibo_display_id}">${s.name}</option>`).join('') || '<option value="">No screens</option>'}
                                </select>
                            </div>
                        </div>

                        <!-- Slot grid legend -->
                        <div style="display:flex; gap:12px; margin-bottom:10px; font-size:0.75rem; color:var(--text-muted);">
                            <span><span style="display:inline-block;width:12px;height:12px;background:#dcfce7;border:1px solid #86efac;border-radius:3px;margin-right:4px;"></span>Available</span>
                            <span><span style="display:inline-block;width:12px;height:12px;background:#dbeafe;border:1px solid #93c5fd;border-radius:3px;margin-right:4px;"></span>This Brand</span>
                            <span><span style="display:inline-block;width:12px;height:12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:3px;margin-right:4px;"></span>Other Brand</span>
                        </div>

                        <div id="slot-grid-container" style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:16px;">
                            <div style="grid-column:span 5; text-align:center; padding:20px; color:var(--text-muted);">Loading slots...</div>
                        </div>

                        <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border); display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-muted);">
                            <i data-lucide="info" style="width:16px; color:#3b82f6;"></i>
                            Click any <strong style="color:#15803d;">green</strong> slot to assign to this brand. Click <strong style="color:#1d4ed8;">blue</strong> slots to unassign.
                        </div>
                    </div>

                </div>
            `;
            lucide.createIcons();

            // Load the slot grid for the first screen
            if (defaultScreen) {
                await this.loadSlotGrid(brand.id);
            }

        } catch (err) {
            content.innerHTML = `<div style="color:var(--danger); text-align:center; padding:20px;">Error: ${err.message}</div>`;
        }
    },

    async loadSlotGrid(brandId) {
        const select = document.getElementById('slot-screen-select');
        const displayId = select ? select.value : null;
        if (!displayId) return;

        const container = document.getElementById('slot-grid-container');
        container.innerHTML = '<div style="grid-column:span 5;text-align:center;padding:15px;color:var(--text-muted);">Loading...</div>';

        const slots = await Api.get(`/slots/screen/${displayId}`);
        if (!slots) {
            container.innerHTML = '<div style="grid-column:span 5;text-align:center;color:red;">Failed to load slots</div>';
            return;
        }

        container.innerHTML = slots.map(slot => {
            const isThisBrand = slot.brand_id == brandId;
            const isOtherBrand = slot.brand_id && slot.brand_id != brandId;
            const isAvailable = !slot.brand_id;

            let bg = '#dcfce7'; let border = '#86efac'; let cursor = 'pointer'; let badge = ''; let onclick = `Views.brands.quickAssignSlot(${brandId}, ${displayId}, ${slot.slot_number}, false)`;
            if (isThisBrand) { bg = '#dbeafe'; border = '#93c5fd'; badge = `<div style="font-size:0.6rem;color:#1d4ed8;font-weight:700;margin-top:2px;">ASSIGNED</div>`; onclick = `Views.brands.quickAssignSlot(${brandId}, ${displayId}, ${slot.slot_number}, true)`; }
            if (isOtherBrand) { bg = '#fee2e2'; border = '#fca5a5'; cursor = 'default'; badge = `<div style="font-size:0.6rem;color:#b91c1c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;" title="${slot.brand_name}">${slot.brand_name || '?'}</div>`; onclick = ''; }

            return `<div onclick="${onclick}" style="background:${bg};border:1px solid ${border};border-radius:8px;padding:8px 4px;text-align:center;cursor:${cursor};transition:all 0.15s;user-select:none;" title="${isThisBrand ? 'Click to unassign' : isOtherBrand ? 'Taken by '+slot.brand_name : 'Click to assign'}">
                <div style="font-weight:700;font-size:0.85rem;color:#1e293b;">S${slot.slot_number}</div>
                ${badge}
            </div>`;
        }).join('');
    },

    async quickAssignSlot(brandId, displayId, slotNumber, isUnassign) {
        const confirmMsg = isUnassign ? `Unassign slot ${slotNumber}?` : `Assign slot ${slotNumber} to this brand?`;
        if (!confirm(confirmMsg)) return;

        const res = await Api.post('/slots/assign', {
            displayId: parseInt(displayId),
            slot_number: parseInt(slotNumber),
            brand_id: isUnassign ? null : brandId
        });

        if (res && res.success) {
            await this.loadSlotGrid(brandId); // refresh grid
        } else {
            alert('Failed: ' + (res?.error || 'Unknown error'));
        }
    },



    showModal(id = null) {
        this.editingId = id;
        const modal = document.getElementById('brand-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('brand-form');
        
        if (id) {
            title.innerText = 'Edit Brand';
            const b = this.brandsData.find(x => x.id === id);
            if (b) {
                document.getElementById('brand-name').value = b.name || '';
                document.getElementById('brand-industry').value = b.industry || '';
                document.getElementById('brand-contact').value = b.contact_person || '';
                document.getElementById('brand-email').value = b.email || '';
                document.getElementById('brand-status').value = b.status || 'Pending';
            }
        } else {
            title.innerText = 'Add New Brand';
            form.reset();
        }
        modal.classList.add('active');
    },

    closeModal() {
        document.getElementById('brand-modal').classList.remove('active');
        this.editingId = null;
    },

    async submitBrand() {
        const payload = {
            name: document.getElementById('brand-name').value,
            industry: document.getElementById('brand-industry').value,
            contact_person: document.getElementById('brand-contact').value,
            email: document.getElementById('brand-email').value,
            status: document.getElementById('brand-status').value
        };
        if (!payload.name) return alert('Brand Name is required');

        let res;
        if (this.editingId) {
            res = await Api.put(`/brands/${this.editingId}`, payload);
        } else {
            res = await Api.post('/brands', payload);
        }

        if (res.error) {
            alert('Error: ' + res.error);
        } else {
            alert(this.editingId ? 'Brand updated successfully!' : 'Brand created successfully!');
            this.closeModal();
            await this.loadBrands();
        }
    },

    async deleteBrand(id) {
        const b = this.brandsData.find(x => x.id === id);
        if (!confirm(`Are you sure you want to delete ${b ? b.name : 'this brand'}? This will also unassign all their slots.`)) return;
        const res = await Api.delete(`/brands/${id}`);
        if (res.error) {
            alert('Failed to delete: ' + res.error);
        } else {
            alert('Brand deleted and slots released.');
            await this.loadBrands();
        }
    }
});
