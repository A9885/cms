App.registerView('creative', {
    render() {
        return `
            <div class="page-title">Creative Library</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Media Assets</h3>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="creative-search" class="form-control" placeholder="Search by name..." style="width: 200px;" oninput="Views.creative.filterTable(this.value)">
                        <button class="btn btn-secondary" style="font-size: 0.8rem; display: flex; align-items: center; gap: 6px;" onclick="Views.creative.syncFromSlots(this)" title="Auto-link all slot-assigned media to brands">
                            <i data-lucide="refresh-cw" style="width:14px;"></i> Sync from Slots
                        </button>
                        <button class="btn btn-primary" onclick="window.location.href='/'">+ Upload Media</button>
                    </div>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Creative Name</th>
                                <th>Type</th>
                                <th>Assigned Brand</th>
                                <th>Source</th>
                                <th>Size</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="creative-table-body">
                            <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">Syncing with Xibo Cloud Library...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Media Preview Modal -->
            <div class="modal-overlay" id="preview-modal">
                <div class="modal" style="width: 500px;">
                    <div class="modal-header">
                        <div class="modal-title" id="preview-title">Media Preview</div>
                        <button class="modal-close" onclick="Views.creative.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" style="text-align: center; background: #000; display: flex; align-items: center; justify-content: center; min-height: 300px;">
                        <div id="preview-content" style="color: #666;">
                            <i data-lucide="image" style="width: 48px; height: 48px; margin-bottom: 10px;"></i>
                            <p>Loading Preview...</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div id="preview-info" style="text-align: left; font-size: 0.8rem; color: var(--text-muted);"></div>
                        <button class="btn btn-secondary" onclick="Views.creative.closeModal()">Close</button>
                    </div>
                </div>
            </div>

            <!-- Assignment Modal (Phase 4.1) -->
            <div class="modal-overlay" id="assign-creative-modal">
                <div class="modal" style="max-width: 400px;">
                    <div class="modal-header">
                        <div class="modal-title">Link to CRM Brand</div>
                        <button class="modal-close" onclick="Views.creative.closeAssignModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">
                            Linking this media to a brand enables <strong>Slot-level Proof of Play</strong> tracking.
                        </p>
                        <div class="form-group">
                            <label>Assigned Brand</label>
                            <select id="assign-media-brand-id">
                                <option value="">-- No Brand (Unlinked) --</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Views.creative.closeAssignModal()">Cancel</button>
                        <button class="btn btn-primary" id="btn-save-media-brand">Save Link</button>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.creative = this;
        
        // Pre-fetch brands for the assignment dropdown
        this.brands = await Api.get('/brands') || [];
        const brandSelect = document.getElementById('assign-media-brand-id');
        if (brandSelect) {
            brandSelect.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '-- No Brand (Unlinked) --';
            brandSelect.appendChild(defaultOpt);
            
            this.brands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                brandSelect.appendChild(opt);
            });
        }

        await this.loadLibrary();
        lucide.createIcons();
    },

    async loadLibrary() {
        const [library, mapping, slotsRes] = await Promise.all([
            Api.getXiboLibrary(),
            Api.get('/media/brands').then(r => r || []),
            Api.get('/inventory').catch(() => ({}))
        ]);
        this.libraryData = library;
        this.mappingData = mapping;

        // Build a set of mediaIds that are assigned via slots
        const slotLinkedMediaIds = new Set();
        if (slotsRes && typeof slotsRes === 'object') {
            Object.values(slotsRes).forEach(screenSlots => {
                (screenSlots || []).forEach(slot => {
                    if (slot.mediaId && slot.brand_id) slotLinkedMediaIds.add(String(slot.mediaId));
                });
            });
        }

        const tbody = document.getElementById('creative-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (library && library.length > 0) {
            library.forEach(m => {
                const icon = m.type === 'video' ? 'video' : 'image';
                const sizeStr = (m.size / 1024 / 1024).toFixed(2) + ' MB';
                
                // Find brand mapping
                const map = mapping.find(mp => String(mp.mediaId) === String(m.mediaId));
                const brand = map ? this.brands.find(b => String(b.id) === String(map.brand_id)) : null;
                const isAutoLinked = slotLinkedMediaIds.has(String(m.mediaId));

                const tr = document.createElement('tr');
                tr.dataset.name = (m.name || '').toLowerCase();
                
                const tdCreative = document.createElement('td');
                const creativeWrap = document.createElement('div');
                creativeWrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
                
                const iconBox = document.createElement('div');
                iconBox.style.cssText = 'width:40px; height:30px; background:#f1f5f9; border-radius:4px; display:flex; align-items:center; justify-content:center;';
                const i = document.createElement('i');
                i.setAttribute('data-lucide', icon);
                i.style.cssText = 'color:var(--text-muted); width:14px;';
                iconBox.appendChild(i);
                creativeWrap.appendChild(iconBox);
                
                const nameText = document.createElement('div');
                nameText.style.fontWeight = '500';
                nameText.textContent = m.name;
                creativeWrap.appendChild(nameText);
                tdCreative.appendChild(creativeWrap);
                tr.appendChild(tdCreative);

                const tdType = document.createElement('td');
                tdType.style.textTransform = 'capitalize';
                tdType.textContent = m.type;
                tr.appendChild(tdType);

                // Brand column
                const tdBrand = document.createElement('td');
                tdBrand.style.fontSize = '0.85rem';
                if (brand) {
                    tdBrand.innerHTML = `<span style="font-weight:600; color:var(--text);">${brand.name}</span>`;
                } else {
                    tdBrand.innerHTML = `<span style="color:#cbd5e1; font-style:italic;">Unassigned</span>`;
                }
                tr.appendChild(tdBrand);

                // Source column — Auto (from slot) vs Manual vs None
                const tdSource = document.createElement('td');
                if (isAutoLinked && brand) {
                    tdSource.innerHTML = `<span class="badge" style="background:#d1fae5; color:#065f46; font-size:0.7rem;">⚡ Auto (Slot)</span>`;
                } else if (map && brand) {
                    tdSource.innerHTML = `<span class="badge" style="background:#e0e7ff; color:#3730a3; font-size:0.7rem;">✎ Manual</span>`;
                } else {
                    tdSource.innerHTML = `<span style="color:#94a3b8; font-size:0.75rem;">—</span>`;
                }
                tr.appendChild(tdSource);

                const tdSize = document.createElement('td');
                tdSize.style.color = 'var(--text-muted)';
                tdSize.textContent = sizeStr;
                tr.appendChild(tdSize);

                const tdActions = document.createElement('td');
                tdActions.style.cssText = 'text-align:right; display:flex; gap:4px; justify-content:flex-end;';
                
                // Show "Change Brand" or "Link Brand" — always allow override
                const linkBtn = document.createElement('button');
                linkBtn.className = 'btn btn-secondary';
                linkBtn.style.cssText = 'padding:4px 10px; font-size:0.7rem;';
                linkBtn.textContent = map ? 'Change Brand' : 'Link Brand';
                linkBtn.onclick = () => this.openAssignModal(m.mediaId, map ? map.brand_id : '');
                tdActions.appendChild(linkBtn);

                const prevBtn = document.createElement('button');
                prevBtn.className = 'btn btn-secondary';
                prevBtn.style.cssText = 'padding:4px 10px; font-size:0.7rem;';
                prevBtn.textContent = 'Preview';
                prevBtn.onclick = () => this.previewMedia(m.mediaId);
                tdActions.appendChild(prevBtn);

                tr.appendChild(tdActions);
                tbody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6;
            td.style.cssText = 'text-align:center; color:var(--text-muted); padding:40px;';
            td.textContent = 'Your media library is empty.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        lucide.createIcons();
    },

    filterTable(query) {
        const tbody = document.getElementById('creative-table-body');
        if (!tbody) return;
        const q = (query || '').toLowerCase();
        tbody.querySelectorAll('tr').forEach(tr => {
            tr.style.display = (!q || (tr.dataset.name || '').includes(q)) ? '' : 'none';
        });
    },

    async syncFromSlots(btn) {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" style="width:14px; animation:spin 1s linear infinite;"></i> Syncing...'; lucide.createIcons(); }
        try {
            const res = await Api.post('/slots/sync-brands', {});
            if (res && res.success) {
                App.showToast(`✅ Auto-linked ${res.linked} media files from slots`, 'success');
                await this.loadLibrary();
            } else {
                App.showToast('Sync failed', 'error');
            }
        } catch(e) {
            App.showToast('Sync error: ' + e.message, 'error');
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw" style="width:14px;"></i> Sync from Slots'; lucide.createIcons(); }
    },

    openAssignModal(mediaId, currentBrandId) {
        const modal = document.getElementById('assign-creative-modal');
        const select = document.getElementById('assign-media-brand-id');
        select.value = currentBrandId || "";
        
        modal.classList.add('active');
        
        document.getElementById('btn-save-media-brand').onclick = async () => {
            const btn = document.getElementById('btn-save-media-brand');
            btn.disabled = true;
            btn.innerText = 'Saving...';
            
            const res = await Api.post('/media/assign', {
                mediaId,
                brand_id: select.value || null
            });
            
            btn.disabled = false;
            btn.innerText = 'Save Link';
            
            if (res.success) {
                this.closeAssignModal();
                this.loadLibrary();
            } else {
                App.showToast('Failed to save assignment', 'error');
            }
        };
    },

    closeAssignModal() {
        document.getElementById('assign-creative-modal').classList.remove('active');
    },

    previewMedia(mediaId) {
        const modal = document.getElementById('preview-modal');
        const content = document.getElementById('preview-content');
        const title = document.getElementById('preview-title');
        const info = document.getElementById('preview-info');
        
        const media = this.libraryData.find(m => m.mediaId === mediaId);
        if (!media) return;

        title.textContent = media.name;
        
        info.innerHTML = '';
        const typeStrong = document.createElement('strong');
        typeStrong.textContent = 'Type:';
        info.appendChild(typeStrong);
        info.appendChild(document.createTextNode(` ${media.type}`));
        info.appendChild(document.createElement('br'));
        const resStrong = document.createElement('strong');
        resStrong.textContent = 'Resolution:';
        info.appendChild(resStrong);
        info.appendChild(document.createTextNode(` ${media.width}x${media.height}`));

        content.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.color = '#fff';
        wrap.style.padding = '20px';
        const i = document.createElement('i');
        i.setAttribute('data-lucide', media.type === 'video' ? 'film' : 'image');
        i.style.width = '64px';
        i.style.height = '64px';
        i.style.marginBottom = '20px';
        i.style.color = '#3b82f6';
        wrap.appendChild(i);
        const h4 = document.createElement('h4');
        h4.style.margin = '0';
        h4.textContent = `${media.type.toUpperCase()} ASSET READY`;
        wrap.appendChild(h4);
        const p = document.createElement('p');
        p.style.fontSize = '0.8rem';
        p.style.color = '#94a3b8';
        p.style.marginTop = '10px';
        p.textContent = 'Media is stored securely in Xibo CMS Cloud.';
        p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode('Used in active campaigns.'));
        wrap.appendChild(p);
        content.appendChild(wrap);

        modal.classList.add('active');
        lucide.createIcons();
    },

    closeModal() {
        document.getElementById('preview-modal').classList.remove('active');
    }
});
