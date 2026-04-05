App.registerView('creative', {
    render() {
        return `
            <div class="page-title">Creative Library</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Media Assets</h3>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" class="form-control" placeholder="Search by name..." style="width: 200px;">
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
                                <th>Status</th>
                                <th>Size</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="creative-table-body">
                            <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">Syncing with Xibo Cloud Library...</td></tr>
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
        const library = await Api.getXiboLibrary();
        const mapping = await Api.get('/media/brands') || [];
        this.libraryData = library;
        this.mappingData = mapping;

        const tbody = document.getElementById('creative-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (library && library.length > 0) {
            library.forEach(m => {
                const icon = m.type === 'video' ? 'video' : 'image';
                const sizeStr = (m.size / 1024 / 1024).toFixed(2) + ' MB';
                
                // Find brand mapping
                const map = mapping.find(map => map.mediaId === m.mediaId);
                const brand = map ? this.brands.find(b => b.id === map.brand_id) : null;

                const tr = document.createElement('tr');
                
                const tdCreative = document.createElement('td');
                const creativeWrap = document.createElement('div');
                creativeWrap.style.display = 'flex';
                creativeWrap.style.alignItems = 'center';
                creativeWrap.style.gap = '8px';
                
                const iconBox = document.createElement('div');
                iconBox.style.width = '40px';
                iconBox.style.height = '30px';
                iconBox.style.background = '#f1f5f9';
                iconBox.style.borderRadius = '4px';
                iconBox.style.display = 'flex';
                iconBox.style.alignItems = 'center';
                iconBox.style.justifyContent = 'center';
                const i = document.createElement('i');
                i.setAttribute('data-lucide', icon);
                i.style.color = 'var(--text-muted)';
                i.style.width = '14px';
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
                const tdBrand = document.createElement('td');
                tdBrand.style.fontSize = '0.85rem';
                if (brand) {
                    tdBrand.textContent = brand.name;
                } else {
                    const unassigned = document.createElement('span');
                    unassigned.style.color = '#cbd5e1';
                    unassigned.style.fontStyle = 'italic';
                    unassigned.textContent = 'Unassigned';
                    tdBrand.appendChild(unassigned);
                }
                tr.appendChild(tdBrand);

                const tdStatus = document.createElement('td');
                const status = map ? (map.status || 'Pending') : 'Pending';
                const statusPill = document.createElement('span');
                statusPill.className = `badge ${status.toLowerCase()}`;
                statusPill.textContent = status;
                tdStatus.appendChild(statusPill);
                tr.appendChild(tdStatus);

                const tdSize = document.createElement('td');
                tdSize.style.color = 'var(--text-muted)';
                tdSize.textContent = sizeStr;
                tr.appendChild(tdSize);

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'right';
                tdActions.style.display = 'flex';
                tdActions.style.gap = '4px';
                tdActions.style.justifyContent = 'flex-end';
                
                const linkBtn = document.createElement('button');
                linkBtn.className = 'btn btn-secondary';
                linkBtn.style.padding = '4px 10px';
                linkBtn.style.fontSize = '0.7rem';
                linkBtn.textContent = 'Link Brand';
                linkBtn.onclick = () => this.openAssignModal(m.mediaId, map ? map.brand_id : '');
                tdActions.appendChild(linkBtn);

                const prevBtn = document.createElement('button');
                prevBtn.className = 'btn btn-secondary';
                prevBtn.style.padding = '4px 10px';
                prevBtn.style.fontSize = '0.7rem';
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
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-muted)';
            td.style.padding = '40px';
            td.textContent = 'Your media library is empty.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        lucide.createIcons();
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
