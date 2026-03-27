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
            brandSelect.innerHTML = '<option value="">-- No Brand (Unlinked) --</option>' + 
                this.brands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }

        await this.loadLibrary();
        lucide.createIcons();
    },

    async loadLibrary() {
        const library = await Api.getXiboLibrary();
        const mapping = await Api.get('/media/brands') || [];
        this.libraryData = library;
        this.mappingData = mapping;

        let html = '';
        if (library && library.length > 0) {
            library.forEach(m => {
                const icon = m.type === 'video' ? 'video' : 'image';
                const sizeStr = (m.size / 1024 / 1024).toFixed(2) + ' MB';
                
                // Find brand mapping
                const map = mapping.find(map => map.mediaId === m.mediaId);
                const brand = map ? this.brands.find(b => b.id === map.brand_id) : null;
                const brandName = brand ? brand.name : '<span style="color:#cbd5e1; font-style:italic;">Unassigned</span>';

                html += `
                    <tr>
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 40px; height: 30px; background: #f1f5f9; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                    <i data-lucide="${icon}" style="color: var(--text-muted); width: 14px;"></i>
                                </div>
                                <div style="font-weight: 500;">${m.name}</div>
                            </div>
                        </td>
                        <td style="text-transform: capitalize;">${m.type}</td>
                        <td style="font-size: 0.85rem;">${brandName}</td>
                        <td style="color: var(--text-muted)">${sizeStr}</td>
                        <td style="text-align: right; display: flex; gap: 4px; justify-content: flex-end;">
                            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.7rem;" onclick="Views.creative.openAssignModal(${m.mediaId}, '${map ? map.brand_id : ''}')">Link Brand</button>
                            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.7rem;" onclick="Views.creative.previewMedia(${m.mediaId})">Preview</button>
                        </td>
                    </tr>
                `;
            });
        } else {
            html = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">Your media library is empty.</td></tr>';
        }
        document.getElementById('creative-table-body').innerHTML = html;
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
                alert('Failed to save assignment');
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

        title.innerText = media.name;
        info.innerHTML = `
            <strong>Type:</strong> ${media.type}<br>
            <strong>Resolution:</strong> ${media.width}x${media.height}
        `;

        content.innerHTML = `
            <div style="color: #fff; padding: 20px;">
                <i data-lucide="${media.type === 'video' ? 'film' : 'image'}" style="width: 64px; height: 64px; margin-bottom: 20px; color: #3b82f6;"></i>
                <h4 style="margin: 0;">${media.type.toUpperCase()} ASSET READY</h4>
                <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 10px;">Media is stored securely in Xibo CMS Cloud.<br>Used in active campaigns.</p>
            </div>
        `;

        modal.classList.add('active');
        lucide.createIcons();
    },

    closeModal() {
        document.getElementById('preview-modal').classList.remove('active');
    }
});
