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
        industryFilter.innerHTML = '';
        const allInd = document.createElement('option');
        allInd.value = '';
        allInd.textContent = 'All Industries';
        industryFilter.appendChild(allInd);
        industries.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            industryFilter.appendChild(opt);
        });

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
        const tbody = document.getElementById('brands-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (brands && brands.length > 0) {
            brands.forEach(b => {
                const tr = document.createElement('tr');
                
                const tdName = document.createElement('td');
                tdName.style.fontWeight = '500';
                const link = document.createElement('a');
                link.href = 'javascript:void(0)';
                link.style.color = 'var(--accent)';
                link.style.textDecoration = 'none';
                link.textContent = b.name;
                link.onclick = () => this.showProfile(b.id);
                tdName.appendChild(link);
                tr.appendChild(tdName);

                const tdIndustry = document.createElement('td');
                tdIndustry.textContent = b.industry || '-';
                tr.appendChild(tdIndustry);

                const tdContact = document.createElement('td');
                const contactDiv = document.createElement('div');
                contactDiv.textContent = b.contact_person || '-';
                tdContact.appendChild(contactDiv);
                const emailDiv = document.createElement('div');
                emailDiv.style.fontSize = '0.75rem';
                emailDiv.style.color = 'var(--text-muted)';
                emailDiv.textContent = b.email || '-';
                tdContact.appendChild(emailDiv);
                tr.appendChild(tdContact);

                const tdStatus = document.createElement('td');
                const badgeClass = b.status.toLowerCase();
                const span = document.createElement('span');
                span.className = `badge ${badgeClass}`;
                span.textContent = b.status;
                tdStatus.appendChild(span);
                tr.appendChild(tdStatus);

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'right';
                
                const viewBtn = document.createElement('button');
                viewBtn.className = 'icon-btn';
                viewBtn.title = 'View Profile';
                viewBtn.onclick = () => this.showProfile(b.id);
                const userIcon = document.createElement('i');
                userIcon.setAttribute('data-lucide', 'user');
                userIcon.style.width = '14px';
                viewBtn.appendChild(userIcon);
                tdActions.appendChild(viewBtn);

                const editBtn = document.createElement('button');
                editBtn.className = 'icon-btn';
                editBtn.title = 'Edit';
                editBtn.onclick = () => this.showModal(b.id);
                const editIcon = document.createElement('i');
                editIcon.setAttribute('data-lucide', 'edit-2');
                editIcon.style.width = '14px';
                editBtn.appendChild(editIcon);
                tdActions.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'icon-btn';
                deleteBtn.title = 'Delete';
                deleteBtn.style.color = '#ef4444';
                deleteBtn.onclick = () => this.deleteBrand(b.id);
                const trashIcon = document.createElement('i');
                trashIcon.setAttribute('data-lucide', 'trash-2');
                trashIcon.style.width = '14px';
                deleteBtn.appendChild(trashIcon);
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
            td.textContent = 'No brands found.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
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
        content.innerHTML = '';
        const loading = document.createElement('div');
        loading.className = 'inv-loading';
        loading.textContent = 'Fetching data...';
        content.appendChild(loading);

        try {
            const [metrics, campaigns, screens] = await Promise.all([
                Api.get(`/brands/${brandId}/metrics`),
                Api.get(`/brands/${brandId}/campaigns`),
                Api.get('/screens')
            ]);

            const validScreens = (screens || []).filter(s => s.xibo_display_id);
            const defaultScreen = validScreens.length > 0 ? validScreens[0].xibo_display_id : null;

            content.innerHTML = '';
            const mainGrid = document.createElement('div');
            mainGrid.style.display = 'grid';
            mainGrid.style.gridTemplateColumns = '220px 1fr';
            mainGrid.style.gap = '20px';

            // Left Col
            const leftCol = document.createElement('div');
            
            const infoBox = document.createElement('div');
            infoBox.style.background = '#f8fafc';
            infoBox.style.padding = '15px';
            infoBox.style.borderRadius = '10px';
            infoBox.style.border = '1px solid var(--border)';
            infoBox.style.marginBottom = '16px';
            
            const h4 = document.createElement('h4');
            h4.style.marginBottom = '12px';
            h4.style.fontSize = '0.8rem';
            h4.style.color = 'var(--text-muted)';
            h4.style.textTransform = 'uppercase';
            h4.textContent = 'Brand Info';
            infoBox.appendChild(h4);

            const fields = [
                { label: 'Industry', value: brand.industry || 'Not set' },
                { label: 'Contact', value: brand.contact_person || '-' },
                { label: 'Email', value: brand.email || '-', class: 'email' }
            ];
            fields.forEach(f => {
                const div = document.createElement('div');
                div.style.marginBottom = '8px';
                const label = document.createElement('small');
                label.style.color = 'var(--text-muted)';
                label.style.display = 'block';
                label.textContent = f.label;
                div.appendChild(label);
                const val = document.createElement('strong');
                if (f.class === 'email') val.style.fontSize = '0.85rem';
                val.textContent = f.value;
                div.appendChild(val);
                infoBox.appendChild(div);
            });

            const stDiv = document.createElement('div');
            stDiv.style.marginBottom = '12px';
            const stLabel = document.createElement('small');
            stLabel.style.color = 'var(--text-muted)';
            stLabel.style.display = 'block';
            stLabel.textContent = 'Status';
            stDiv.appendChild(stLabel);
            const stBadge = document.createElement('span');
            stBadge.className = `badge ${brand.status.toLowerCase()}`;
            stBadge.textContent = brand.status;
            stDiv.appendChild(stBadge);
            infoBox.appendChild(stDiv);

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary';
            editBtn.style.width = '100%';
            editBtn.style.fontSize = '0.8rem';
            editBtn.textContent = 'Edit Profile';
            editBtn.onclick = () => this.showModal(brand.id);
            infoBox.appendChild(editBtn);
            leftCol.appendChild(infoBox);

            const kpiGrid = document.createElement('div');
            kpiGrid.className = 'dash-kpi-row';
            kpiGrid.style.gridTemplateColumns = '1fr 1fr';
            kpiGrid.style.gap = '8px';

            const kpis = [
                { icon: 'layers', color: 'blue', label: 'Slots', val: metrics.totalScreens },
                { icon: 'play-circle', color: 'lightblue', label: 'Plays', val: metrics.totalPlays.toLocaleString() },
                { icon: 'calendar', color: 'darkblue', label: 'Campaigns', val: metrics.totalCampaigns },
                { icon: 'indian-rupee', color: 'orange', label: 'Spend', val: `₹${(metrics.totalSpend||0).toLocaleString()}` }
            ];
            kpis.forEach(k => {
                const card = document.createElement('div');
                card.className = `kpi-card kpi-${k.color}`;
                card.style.padding = '12px';
                const head = document.createElement('div');
                head.className = 'kpi-header';
                head.style.fontSize = '0.7rem';
                const i = document.createElement('i');
                i.setAttribute('data-lucide', k.icon);
                head.appendChild(i);
                head.appendChild(document.createTextNode(` ${k.label}`));
                card.appendChild(head);
                const h2 = document.createElement('h2');
                h2.style.fontSize = '1.5rem';
                h2.textContent = k.val;
                card.appendChild(h2);
                kpiGrid.appendChild(card);
            });
            leftCol.appendChild(kpiGrid);
            mainGrid.appendChild(leftCol);

            // Right Col
            const rightCol = document.createElement('div');
            
            const rightHead = document.createElement('div');
            rightHead.style.display = 'flex';
            rightHead.style.justifyContent = 'space-between';
            rightHead.style.alignItems = 'center';
            rightHead.style.marginBottom = '12px';
            const rh4 = document.createElement('h4');
            rh4.style.fontSize = '0.9rem';
            rh4.style.color = 'var(--text-muted)';
            rh4.style.textTransform = 'uppercase';
            rh4.textContent = 'Screen Slot Assignment';
            rightHead.appendChild(rh4);
            const selectWrap = document.createElement('div');
            selectWrap.style.display = 'flex';
            selectWrap.style.gap = '8px';
            selectWrap.style.alignItems = 'center';
            const slabel = document.createElement('label');
            slabel.style.fontSize = '0.8rem';
            slabel.style.color = 'var(--text-muted)';
            slabel.textContent = 'Screen:';
            selectWrap.appendChild(slabel);
            const select = document.createElement('select');
            select.id = 'slot-screen-select';
            select.className = 'form-control';
            select.style.borderRadius = '6px';
            select.style.fontSize = '0.85rem';
            select.onchange = () => this.loadSlotGrid(brand.id);
            if (validScreens.length > 0) {
                validScreens.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.xibo_display_id;
                    opt.textContent = s.name;
                    select.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No screens';
                select.appendChild(opt);
            }
            selectWrap.appendChild(select);
            rightHead.appendChild(selectWrap);
            rightCol.appendChild(rightHead);

            const legend = document.createElement('div');
            legend.style.display = 'flex';
            legend.style.gap = '12px';
            legend.style.marginBottom = '10px';
            legend.style.fontSize = '0.75rem';
            legend.style.color = 'var(--text-muted)';
            const types = [
                { color: '#dcfce7', border: '#86efac', text: 'Available' },
                { color: '#dbeafe', border: '#93c5fd', text: 'This Brand' },
                { color: '#fee2e2', border: '#fca5a5', text: 'Other Brand' }
            ];
            types.forEach(t => {
                const span = document.createElement('span');
                const box = document.createElement('span');
                box.style.display = 'inline-block';
                box.style.width = '12px';
                box.style.height = '12px';
                box.style.background = t.color;
                box.style.border = `1px solid ${t.border}`;
                box.style.borderRadius = '3px';
                box.style.marginRight = '4px';
                span.appendChild(box);
                span.appendChild(document.createTextNode(t.text));
                legend.appendChild(span);
            });
            rightCol.appendChild(legend);

            const gridCont = document.createElement('div');
            gridCont.id = 'slot-grid-container';
            gridCont.style.display = 'grid';
            gridCont.style.gridTemplateColumns = 'repeat(5,1fr)';
            gridCont.style.gap = '8px';
            gridCont.style.marginBottom = '16px';
            const gridLoading = document.createElement('div');
            gridLoading.style.gridColumn = 'span 5';
            gridLoading.style.textAlign = 'center';
            gridLoading.style.padding = '20px';
            gridLoading.style.color = 'var(--text-muted)';
            gridLoading.textContent = 'Loading slots...';
            gridCont.appendChild(gridLoading);
            rightCol.appendChild(gridCont);

            const infoFooter = document.createElement('div');
            infoFooter.style.background = '#f8fafc';
            infoFooter.style.padding = '12px';
            infoFooter.style.borderRadius = '8px';
            infoFooter.style.border = '1px solid var(--border)';
            infoFooter.style.display = 'flex';
            infoFooter.style.alignItems = 'center';
            infoFooter.style.gap = '8px';
            infoFooter.style.fontSize = '0.85rem';
            infoFooter.style.color = 'var(--text-muted)';
            const infoI = document.createElement('i');
            infoI.setAttribute('data-lucide', 'info');
            infoI.style.width = '16px';
            infoI.style.color = '#3b82f6';
            infoFooter.appendChild(infoI);
            const footerText = document.createElement('span');
            footerText.innerHTML = 'Click any <strong style="color:#15803d;">green</strong> slot to assign to this brand. Click <strong style="color:#1d4ed8;">blue</strong> slots to unassign.';
            infoFooter.appendChild(footerText);
            rightCol.appendChild(infoFooter);
            
            mainGrid.appendChild(rightCol);
            content.appendChild(mainGrid);
            lucide.createIcons();

            if (defaultScreen) {
                await this.loadSlotGrid(brand.id);
            }

        } catch (err) {
            content.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.style.color = 'var(--danger)';
            errDiv.style.textAlign = 'center';
            errDiv.style.padding = '20px';
            errDiv.textContent = `Error: ${err.message}`;
            content.appendChild(errDiv);
        }
    },

    async loadSlotGrid(brandId) {
        const select = document.getElementById('slot-screen-select');
        const displayId = select ? select.value : null;
        if (!displayId) return;

        const container = document.getElementById('slot-grid-container');
        container.innerHTML = '';
        const loading = document.createElement('div');
        loading.style.gridColumn = 'span 5';
        loading.style.textAlign = 'center';
        loading.style.padding = '15px';
        loading.style.color = 'var(--text-muted)';
        loading.textContent = 'Loading...';
        container.appendChild(loading);

        const slots = await Api.get(`/slots/screen/${displayId}`);
        container.innerHTML = '';
        if (!slots) {
            const err = document.createElement('div');
            err.style.gridColumn = 'span 5';
            err.style.textAlign = 'center';
            err.style.color = 'red';
            err.textContent = 'Failed to load slots';
            container.appendChild(err);
            return;
        }

        slots.forEach(slot => {
            const isThisBrand = String(slot.brand_id) === String(brandId);
            const isOtherBrand = slot.brand_id && slot.brand_id !== brandId;
            const isAvailable = !slot.brand_id;

            let bg = '#dcfce7'; let border = '#86efac'; let cursor = 'pointer'; let badgeText = ''; let onclick = () => this.quickAssignSlot(brandId, displayId, slot.slot_number, false);
            if (isThisBrand) { 
                bg = '#dbeafe'; border = '#93c5fd'; 
                badgeText = 'ASSIGNED'; 
                onclick = () => this.quickAssignSlot(brandId, displayId, slot.slot_number, true); 
            }
            if (isOtherBrand) { 
                bg = '#fee2e2'; border = '#fca5a5'; cursor = 'default'; 
                badgeText = slot.brand_name || '?'; 
                onclick = null; 
            }

            const item = document.createElement('div');
            item.style.background = bg;
            item.style.border = `1px solid ${border}`;
            item.style.borderRadius = '8px';
            item.style.padding = '8px 4px';
            item.style.textAlign = 'center';
            item.style.cursor = cursor;
            item.style.transition = 'all 0.15s';
            item.style.userSelect = 'none';
            item.title = isThisBrand ? 'Click to unassign' : (isOtherBrand ? 'Taken by ' + (slot.brand_name || 'other') : 'Click to assign');
            if (onclick) item.onclick = onclick;

            const sNum = document.createElement('div');
            sNum.style.fontWeight = '700';
            sNum.style.fontSize = '0.85rem';
            sNum.style.color = '#1e293b';
            sNum.textContent = `S${slot.slot_number}`;
            item.appendChild(sNum);

            if (badgeText) {
                const badge = document.createElement('div');
                badge.style.fontSize = '0.6rem';
                badge.style.color = isThisBrand ? '#1d4ed8' : '#b91c1c';
                badge.style.fontWeight = isThisBrand ? '700' : 'normal';
                badge.style.overflow = 'hidden';
                badge.style.textOverflow = 'ellipsis';
                badge.style.whiteSpace = 'nowrap';
                badge.style.maxWidth = '60px';
                badge.style.marginTop = '2px';
                badge.textContent = badgeText;
                if (!isThisBrand) badge.title = badgeText;
                item.appendChild(badge);
            }
            container.appendChild(item);
        });
    },

    async quickAssignSlot(brandId, displayId, slotNumber, isUnassign) {
        const confirmMsg = isUnassign ? `Unassign slot ${slotNumber}?` : `Assign slot ${slotNumber} to this brand?`;
        if (!await App.showConfirm(confirmMsg)) return;

        const res = await Api.post('/slots/assign', {
            displayId: parseInt(displayId, 10),
            slot_number: parseInt(slotNumber, 10),
            brand_id: isUnassign ? null : brandId
        });

        if (res && res.success) {
            await this.loadSlotGrid(brandId); // refresh grid
        } else {
            App.showToast('Failed: ' + (res?.error || 'Unknown error'), 'error');
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
        if (!payload.name) return App.showToast('Brand Name is required', 'error');

        let res;
        if (this.editingId) {
            res = await Api.put(`/brands/${this.editingId}`, payload);
        } else {
            res = await Api.post('/brands', payload);
        }

        if (res.error) {
            App.showToast('Error: ' + res.error, 'error');
        } else {
            App.showToast(this.editingId ? 'Brand updated successfully!' : 'Brand created successfully!', 'success');
            this.closeModal();
            await this.loadBrands();
        }
    },

    async deleteBrand(id) {
        const b = this.brandsData.find(x => x.id === id);
        if (!await App.showConfirm(`Are you sure you want to delete ${b ? b.name : 'this brand'}? This will also unassign all their slots.`)) return;
        const res = await Api.delete(`/brands/${id}`);
        if (res.error) {
            App.showToast('Failed to delete: ' + res.error, 'error');
        } else {
            App.showToast('Brand deleted and slots released.', 'success');
            await this.loadBrands();
        }
    }
});
