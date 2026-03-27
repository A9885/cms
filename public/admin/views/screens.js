App.registerView('screens', {
    render() {
        return `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-title">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="tv"></i> Screens Management
                    </div>
                    <div class="table-header-actions">
                        <button class="btn btn-secondary" id="btn-view-map">Map View</button>
                        <button class="btn btn-success" style="background: #10b981; color: white;" onclick="window.open('https://signtral.xibo.cloud/display/view', 'XiboReg', 'width=1100,height=800,left=150,top=100,popup=1')"><i data-lucide="monitor" style="width:14px; margin-right:4px;"></i>Register Xibo Display</button>
                        <button class="btn btn-primary" id="btn-open-create-screen">+ Add Screen</button>
                    </div>
                </div>
            </div>

            <div class="split-view">
                <!-- Left Side: Table -->
                <div id="screens-table-view" class="card" style="margin:0;">
                    <div class="table-header-actions" style="margin-bottom: 20px;">
                        <input type="text" id="screens-search" placeholder="🔍 Search screens..." style="width: 200px;">
                        <select id="filter-city"><option value="">All Cities</option></select>
                        <select id="filter-status">
                            <option value="">All Statuses</option>
                            <option value="Online">Online</option>
                            <option value="Offline">Offline</option>
                            <option value="Unlinked">Not Linked</option>
                        </select>
                        <select id="filter-partner"><option value="">All Partners</option></select>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Screen Name</th>
                                    <th>City</th>
                                    <th>Connection</th>
                                </tr>
                            </thead>
                            <tbody id="screens-table-body">
                                <tr><td colspan="3" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading screens...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right Side: Details -->
                <div id="screen-detail-panel" class="detail-panel">
                    <div id="detail-active-view" style="display:none;">
                        <div class="detail-header">
                            <div style="display:flex; justify-content:space-between; align-items:start;">
                                <div>
                                    <h3 id="det-name" style="margin:0;">—</h3>
                                    <div id="det-id-label" style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">ID: —</div>
                                </div>
                                <span id="det-status-badge" class="status-pill active">Online</span>
                            </div>
                        </div>

                        <div class="detail-section">
                            <div class="detail-section-title">Location & Hardware</div>
                            <div id="det-map" style="width:100%; height:160px; border-radius:12px; margin-bottom:12px; background:#f1f5f9; border:1px solid var(--border);"></div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">City</label>
                                    <div id="det-city" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Partner</label>
                                    <div id="det-partner" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                            </div>
                            <div style="margin-top:10px;">
                                <label style="font-size:0.7rem; color:var(--text-muted);">Full Address</label>
                                <div id="det-address" style="font-size:0.85rem; line-height:1.4;">—</div>
                            </div>
                        </div>

                        <!-- Link Alert for Unlinked Screens -->
                        <div id="unlinked-alert" style="display:none; background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:15px; margin-bottom:1.5rem;">
                            <div style="display:flex; gap:10px; align-items:start;">
                                <i data-lucide="alert-triangle" style="color:#c2410c; width:20px;"></i>
                                <div style="flex:1;">
                                    <div style="font-size:0.85rem; font-weight:700; color:#9a3412;">Not Linked to Xibo</div>
                                    <div style="font-size:0.75rem; color:#c2410c; margin-top:4px; line-height:1.4;">This local record is not connected to a live Xibo player. Linking is required for content delivery.</div>
                                    <button class="btn btn-primary" style="margin-top:10px; background:#ea580c; width:100%;" id="btn-open-link-modal">Link Xibo Player Now</button>
                                </div>
                            </div>
                        </div>

                        <div class="detail-section" id="perf-section">
                            <div class="detail-section-title">Real-time Performance</div>
                            <div class="table-wrap" style="max-height: 180px; overflow-y: auto;">
                                <table class="mini-table">
                                    <thead>
                                        <tr><th>Time</th><th>Ad Name</th><th>Plays</th></tr>
                                    </thead>
                                    <tbody id="det-pop-body">
                                        <tr><td colspan="3" style="text-align:center; padding:10px; color:var(--text-muted);">No recent plays</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:20px;">
                            <button class="btn btn-secondary" id="btn-edit-screen">Edit Info</button>
                            <button class="btn btn-primary" id="btn-sync-screen">Force Sync</button>
                        </div>
                    </div>
                    <div id="detail-placeholder" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); text-align:center; padding:2rem;">
                        <i data-lucide="info" size="32" style="margin-bottom:12px; opacity:0.5;"></i>
                        <p style="font-size:0.9rem;">Select a screen from the list to view full details and performance.</p>
                    </div>
                </div>
            </div>

            <!-- Create Screen Modal -->
            <div id="create-screen-modal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">Add New Local Screen</span>
                        <button onclick="document.getElementById('create-screen-modal').classList.remove('active')" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Screen Name *</label>
                            <input type="text" id="add-screen-name" placeholder="E.g., HYD-MALL-01" class="form-control">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" id="add-screen-city" placeholder="E.g., Hyderabad" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Partner</label>
                                <select id="add-screen-partner" class="form-control">
                                    <option value="">-- Select Partner --</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <textarea id="add-screen-address" placeholder="Full address" class="form-control" style="height:60px;"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('create-screen-modal').classList.remove('active')">Cancel</button>
                        <button class="btn btn-primary" id="btn-submit-create">Create Screen</button>
                    </div>
                </div>
            </div>

            <!-- Edit Screen Modal -->
            <div id="edit-screen-modal" class="modal-overlay" style="z-index: 1001;">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">Edit Screen: <span id="edit-modal-title"></span></span>
                        <button onclick="document.getElementById('edit-screen-modal').classList.remove('active')" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                         <div class="form-group">
                            <label>Screen Name *</label>
                            <input type="text" id="edit-screen-name" class="form-control">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" id="edit-screen-city" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Partner</label>
                                <select id="edit-screen-partner-select" class="form-control">
                                    <option value="">-- No Partner --</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <textarea id="edit-screen-address" class="form-control" style="height:60px;"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="edit-screen-notes" class="form-control" style="height:60px;"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" style="background:#fee2e2; color:#b91c1c; margin-right:auto;" id="btn-delete-screen">Delete Screen</button>
                        <button class="btn btn-secondary" onclick="document.getElementById('edit-screen-modal').classList.remove('active')">Cancel</button>
                        <button class="btn btn-primary" id="btn-submit-edit">Save Changes</button>
                    </div>
                </div>
            </div>

            <!-- Link Xibo Modal -->
            <div id="link-xibo-modal" class="modal-overlay" style="z-index: 1002;">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">Link Xibo Player</span>
                        <button onclick="document.getElementById('link-xibo-modal').classList.remove('active')" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Select Xibo Player</label>
                            <select id="link-xibo-select" class="form-control">
                                <option value="">-- Loading Xibo Displays... --</option>
                            </select>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">Connecting this local record to a live player allows real-time monitoring and analytics sync.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('link-xibo-modal').classList.remove('active')">Cancel</button>
                        <button class="btn btn-primary" id="btn-submit-link">Confirm Connection</button>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.screens = this;

        const [screens, partners, xiboDisplays] = await Promise.all([
            window.Api.get('/screens'),
            window.Api.get('/partners'),
            window.Api.getXiboAvailableDisplays()
        ]);
        
        this.localScreens = screens || [];
        this.partnersData = partners || [];
        this.xiboDisplays = (xiboDisplays || []).filter(d => !this.localScreens.some(s => s.xibo_display_id === d.displayId));
        this.allXiboDisplays = xiboDisplays || [];
        this.detMap = null;

        // Populate Partners Filter & Selects
        const pFilter = document.getElementById('filter-partner');
        const pAdd = document.getElementById('add-screen-partner');
        const pEdit = document.getElementById('edit-screen-partner-select');
        
        const pOptions = this.partnersData.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        if (pFilter) pFilter.innerHTML = '<option value="">All Partners</option>' + pOptions;
        if (pAdd) pAdd.innerHTML = '<option value="">-- Select Partner --</option>' + pOptions;
        if (pEdit) pEdit.innerHTML = '<option value="">-- No Partner --</option>' + pOptions;

        // Populate Cities Filter
        const cities = [...new Set(this.localScreens.map(s => s.city).filter(Boolean))];
        const cFilter = document.getElementById('filter-city');
        if (cFilter) cFilter.innerHTML = '<option value="">All Cities</option>' + 
            cities.map(c => `<option value="${c}">${c}</option>`).join('');

        // Setup Create Screen Form
        const btnOpenAdd = document.getElementById('btn-open-create-screen');
        if (btnOpenAdd) {
            btnOpenAdd.onclick = () => document.getElementById('create-screen-modal').classList.add('active');
        }

        const btnSubmitAdd = document.getElementById('btn-submit-create');
        if (btnSubmitAdd) {
            btnSubmitAdd.onclick = async () => {
                const name = document.getElementById('add-screen-name').value;
                const city = document.getElementById('add-screen-city').value;
                const address = document.getElementById('add-screen-address').value;
                const partner_id = document.getElementById('add-screen-partner').value;
                if (!name) return alert('Name is required');
                btnSubmitAdd.innerText = 'Creating...';
                try {
                    await window.Api.post('/screens', { name, city, address, partner_id });
                    document.getElementById('create-screen-modal').classList.remove('active');
                    this.mount(container);
                } catch (err) { alert(err.message); }
                finally { btnSubmitAdd.innerText = 'Create Screen'; }
            };
        }

        // Setup Filters
        const sInput = document.getElementById('screens-search');
        const cFilt = document.getElementById('filter-city');
        const stFilt = document.getElementById('filter-status');
        const pFilt = document.getElementById('filter-partner');

        const applyFilters = () => {
            const q = sInput.value.toLowerCase();
            const city = cFilt.value;
            const status = stFilt.value;
            const pId = pFilt.value;

            const filtered = this.localScreens.filter(s => {
                const xibo = this.allXiboDisplays.find(xd => xd.displayId === s.xibo_display_id);
                const isLinked = !!s.xibo_display_id;
                const curSt = xibo ? (xibo.loggedIn ? 'Online' : 'Offline') : (isLinked ? 'Offline' : 'Unlinked');
                
                const matchQ = s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q);
                const matchC = !city || s.city === city;
                const matchS = !status || (status === 'Unlinked' ? !isLinked : curSt === status);
                const matchP = !pId || s.partner_id == pId;
                return matchQ && matchC && matchS && matchP;
            });
            this.renderTable(filtered);
        };

        if (sInput) sInput.oninput = applyFilters;
        if (cFilt) cFilt.onchange = applyFilters;
        if (stFilt) stFilt.onchange = applyFilters;
        if (pFilt) pFilt.onchange = applyFilters;

        // Render Table
        this.renderTable(this.localScreens);
        lucide.createIcons();

        // Default Detail
        if (this.localScreens.length > 0) this.showDetails(this.localScreens[0].id);
    },

    renderTable(screens) {
        const tbody = document.getElementById('screens-table-body');
        if (!tbody) return;
        
        let html = '';
        screens.forEach(s => {
            const xibo = this.allXiboDisplays.find(xd => xd.displayId === s.xibo_display_id);
            const isLinked = !!s.xibo_display_id;
            let statusText = 'Not Linked';
            let badgeClass = 'offline'; // Gray/Red for unlinked
            
            if (isLinked) {
                const online = xibo ? xibo.loggedIn : false;
                statusText = online ? 'Online' : 'Offline';
                badgeClass = online ? 'online' : 'offline';
            } else {
                badgeClass = 'warning'; // Orange for unlinked
            }

            html += `
                <tr onclick="Views.screens.showDetails(${s.id})" style="cursor:pointer;" class="screen-row" data-id="${s.id}">
                    <td>
                        <div style="font-weight: 600;">${s.name}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted)">ID: ${s.id} ${isLinked ? '· Linked' : ''}</div>
                    </td>
                    <td style="font-size:0.8rem;">${s.city || '—'}</td>
                    <td><span class="badge ${badgeClass}">${statusText}</span></td>
                </tr>
            `;
        });
        if (screens.length === 0) html = '<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--text-muted);">No screens.</td></tr>';
        tbody.innerHTML = html;
    },

    async showDetails(id) {
        const screen = this.localScreens.find(s => s.id === id);
        if (!screen) return;

        document.getElementById('detail-placeholder').style.display = 'none';
        document.getElementById('detail-active-view').style.display = 'block';

        // Highlight Row
        document.querySelectorAll('.screen-row').forEach(tr => tr.style.background = '');
        const row = document.querySelector(`.screen-row[data-id="${id}"]`);
        if (row) row.style.background = 'rgba(59, 130, 246, 0.08)';

        document.getElementById('det-name').innerText = screen.name;
        const isLinked = !!screen.xibo_display_id;
        document.getElementById('det-id-label').innerText = `ID: ${screen.id} ${isLinked ? '· Xibo: ' + screen.xibo_display_id : '· Not Linked'}`;
        document.getElementById('det-city').innerText = screen.city || '—';
        document.getElementById('det-partner').innerText = screen.partner_name || 'Unassigned';
        document.getElementById('det-address').innerText = screen.address || '—';

        const xibo = this.allXiboDisplays.find(xd => xd.displayId === screen.xibo_display_id);
        const online = xibo ? xibo.loggedIn : false;
        const statusText = isLinked ? (online ? 'Online' : 'Offline') : 'Not Linked';
        const badge = document.getElementById('det-status-badge');
        badge.innerText = statusText;
        badge.className = `status-pill ${isLinked ? (online ? 'active' : 'inactive') : 'warning'}`;

        // Linked Alert
        document.getElementById('unlinked-alert').style.display = isLinked ? 'none' : 'block';
        document.getElementById('perf-section').style.opacity = isLinked ? '1' : '0.5';

        // Map
        if (!this.detMap) {
            this.detMap = L.map('det-map', { zoomControl: false }).setView([17.3850, 78.4867], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(this.detMap);
        }
        if (this.detMarker) this.detMap.removeLayer(this.detMarker);
        this.detMarker = L.marker([17.3850, 78.4867]).addTo(this.detMap);
        this.detMap.setView([17.3850, 78.4867], 13);

        // PoP
        const pBody = document.getElementById('det-pop-body');
        pBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;">Loading...</td></tr>';
        if (isLinked) {
            try {
                const logs = await window.Api.get(`/screens/${id}/proof-of-play`);
                if (!logs || logs.length === 0) {
                    pBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:var(--text-muted);">No logs found.</td></tr>';
                } else {
                    pBody.innerHTML = logs.map(l => `
                        <tr><td>${new Date(l.playedAt).toLocaleTimeString()}</td><td>${l.adName || 'Ad'}</td><td>${l.count || 1}</td></tr>
                    `).join('');
                }
            } catch (e) { pBody.innerHTML = '<tr><td colspan="3">Failed to load logs.</td></tr>'; }
        } else {
            pBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:var(--text-muted);">Link screen to view performance.</td></tr>';
        }

        // Actions
        document.getElementById('btn-edit-screen').onclick = () => this.openEditModal(screen);
        document.getElementById('btn-sync-screen').disabled = !isLinked;
        document.getElementById('btn-sync-screen').onclick = async () => {
            const b = document.getElementById('btn-sync-screen');
            if (!isLinked) return;
            b.innerText = 'Syncing...';
            try {
                await window.Api.post(`/screens/${id}/sync`);
                alert('Force sync requested');
            } catch (err) { alert('Sync fail'); }
            finally { b.innerText = 'Force Sync'; }
        };

        const btnLink = document.getElementById('btn-open-link-modal');
        if (btnLink) {
            btnLink.onclick = () => this.openLinkModal(screen);
        }
    },

    openLinkModal(screen) {
        const modal = document.getElementById('link-xibo-modal');
        const select = document.getElementById('link-xibo-select');
        
        if (this.xiboDisplays.length === 0) {
            select.innerHTML = '<option value="">-- No available Xibo displays found --</option>';
        } else {
            select.innerHTML = '<option value="">-- Choose Connected Player --</option>' + 
                this.xiboDisplays.map(d => `<option value="${d.displayId}">${d.name} (ID:${d.displayId})</option>`).join('');
        }
        
        modal.classList.add('active');

        document.getElementById('btn-submit-link').onclick = async () => {
            const displayId = select.value;
            if (!displayId) return alert('Select a player');
            
            try {
                await window.Api.put(`/screens/${screen.id}`, {
                    ...screen,
                    xibo_display_id: parseInt(displayId),
                    status: 'Linked'
                });
                modal.classList.remove('active');
                this.mount(document.getElementById('app'));
                alert('Screen linked successfully!');
            } catch (err) { alert('Link fail: ' + err.message); }
        };
    },

    openEditModal(screen) {
        document.getElementById('edit-modal-title').innerText = screen.name;
        document.getElementById('edit-screen-name').value = screen.name;
        document.getElementById('edit-screen-city').value = screen.city || '';
        document.getElementById('edit-screen-address').value = screen.address || '';
        document.getElementById('edit-screen-partner-select').value = screen.partner_id || '';
        document.getElementById('edit-screen-notes').value = screen.notes || '';
        document.getElementById('edit-screen-modal').classList.add('active');

        document.getElementById('btn-submit-edit').onclick = async () => {
            const body = {
                name: document.getElementById('edit-screen-name').value,
                city: document.getElementById('edit-screen-city').value,
                address: document.getElementById('edit-screen-address').value,
                partner_id: document.getElementById('edit-screen-partner-select').value || null,
                notes: document.getElementById('edit-screen-notes').value
            };
            try {
                await window.Api.put(`/screens/${screen.id}`, body);
                document.getElementById('edit-screen-modal').classList.remove('active');
                this.mount(document.getElementById('app'));
            } catch (err) { alert('Save failed'); }
        };

        document.getElementById('btn-delete-screen').onclick = async () => {
            if (!confirm('Permanent delete?')) return;
            try {
                await window.Api.delete(`/screens/${screen.id}`);
                document.getElementById('edit-screen-modal').classList.remove('active');
                this.mount(document.getElementById('app'));
            } catch (err) { alert('Delete failed'); }
        };
    }
});
