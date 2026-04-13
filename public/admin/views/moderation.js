App.registerView('moderation', {
    render() {
        return `
            <div class="page-title">Content Moderation &amp; Activity Log</div>

            <!-- Tab Bar -->
            <div style="display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:24px;">
                <button id="tab-btn-moderation" onclick="Views.moderation.switchTab('moderation')"
                    style="padding:10px 24px; background:none; border:none; border-bottom:3px solid var(--accent); color:var(--accent); font-weight:600; cursor:pointer; font-size:0.9rem; margin-bottom:-2px; transition:all 0.2s;">
                    <i data-lucide="check-square" style="width:15px;vertical-align:middle;margin-right:6px;"></i>Content Moderation
                </button>
                <button id="tab-btn-logs" onclick="Views.moderation.switchTab('logs')"
                    style="padding:10px 24px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-muted); font-weight:500; cursor:pointer; font-size:0.9rem; margin-bottom:-2px; transition:all 0.2s;">
                    <i data-lucide="activity" style="width:15px;vertical-align:middle;margin-right:6px;"></i>Activity Log
                </button>
            </div>

            <!-- ── MODERATION TAB ── -->
            <div id="tab-panel-moderation">
                <div class="card">
                    <div class="table-header">
                        <h3 style="font-size: 1rem; font-weight: 600;">Pending Creative Approvals</h3>
                        <div style="display: flex; gap: 10px;">
                            <span id="pending-count-badge" class="badge-lastseen" style="background: var(--accent); color: white; display: none;">0 Pending</span>
                            <button class="btn btn-secondary" onclick="Views.moderation.loadPending()"><i data-lucide="refresh-cw" style="width: 14px;"></i> Refresh Queue</button>
                        </div>
                    </div>
                    <div class="table-wrap" style="border: none; border-radius: 0;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Creative Preview</th>
                                    <th>Brand / Company</th>
                                    <th>Upload Date</th>
                                    <th style="text-align: right;">Moderation Actions</th>
                                </tr>
                            </thead>
                            <tbody id="moderation-table-body">
                                <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 40px;">Fetching moderation queue...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ── ACTIVITY LOG TAB ── -->
            <div id="tab-panel-logs" style="display:none;">

                <!-- Stats Row -->
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;margin-bottom:24px;" id="log-stats-row">
                    <div class="stat-pill" style="background:var(--bg-main);border:1px solid var(--border);border-radius:12px;padding:16px 20px;">
                        <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Total (30d)</div>
                        <div id="stat-total" style="font-size:1.6rem;font-weight:700;color:var(--text-main);">—</div>
                    </div>
                    <div class="stat-pill" style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;">
                        <div style="font-size:0.7rem;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Creates</div>
                        <div id="stat-creates" style="font-size:1.6rem;font-weight:700;color:#166534;">—</div>
                    </div>
                    <div class="stat-pill" style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;">
                        <div style="font-size:0.7rem;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Updates</div>
                        <div id="stat-updates" style="font-size:1.6rem;font-weight:700;color:#92400e;">—</div>
                    </div>
                    <div class="stat-pill" style="background:#fee2e2;border:1px solid #fca5a5;border-radius:12px;padding:16px 20px;">
                        <div style="font-size:0.7rem;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Errors</div>
                        <div id="stat-errors" style="font-size:1.6rem;font-weight:700;color:#991b1b;">—</div>
                    </div>
                    <div class="stat-pill" style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:12px;padding:16px 20px;">
                        <div style="font-size:0.7rem;font-weight:700;color:#5b21b6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Deletes</div>
                        <div id="stat-deletes" style="font-size:1.6rem;font-weight:700;color:#5b21b6;">—</div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="card" style="margin-bottom:20px;">
                    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
                        <div style="flex:2;min-width:180px;">
                            <label style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Search</label>
                            <input id="log-search" type="text" placeholder="Search descriptions..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.875rem;background:var(--bg-body);" oninput="Views.moderation._debounceSearch()">
                        </div>
                        <div style="flex:1;min-width:120px;">
                            <label style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Module</label>
                            <select id="log-filter-module" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.875rem;background:var(--bg-body);" onchange="Views.moderation.loadLogs(1)">
                                <option value="">All Modules</option>
                                <option>BRAND</option><option>PARTNER</option><option>SCREEN</option>
                                <option>DISPLAY</option><option>CMS</option><option>CAMPAIGN</option>
                                <option>CREATIVE</option><option>LAYOUT</option><option>MODERATION</option>
                                <option>BILLING</option><option>USER</option><option>SYSTEM</option>
                                <option>AUTH</option><option>SLOT</option>
                            </select>
                        </div>
                        <div style="flex:1;min-width:120px;">
                            <label style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Action</label>
                            <select id="log-filter-action" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.875rem;background:var(--bg-body);" onchange="Views.moderation.loadLogs(1)">
                                <option value="">All Actions</option>
                                <option>CREATE</option><option>UPDATE</option><option>DELETE</option>
                                <option>APPROVE</option><option>REJECT</option><option>ERROR</option>
                                <option>UPLOAD</option><option>PROVISION</option><option>SYNC</option>
                                <option>LOGIN</option><option>LOGOUT</option><option>ASSIGN</option><option>UNASSIGN</option>
                            </select>
                        </div>
                        <div style="flex:1;min-width:130px;">
                            <label style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:6px;">From Date</label>
                            <input id="log-filter-from" type="date" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.875rem;background:var(--bg-body);" onchange="Views.moderation.loadLogs(1)">
                        </div>
                        <div style="flex:1;min-width:130px;">
                            <label style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:6px;">To Date</label>
                            <input id="log-filter-to" type="date" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.875rem;background:var(--bg-body);" onchange="Views.moderation.loadLogs(1)">
                        </div>
                        <button class="btn btn-secondary" onclick="Views.moderation.clearFilters()" style="padding:8px 16px;white-space:nowrap;">
                            <i data-lucide="x" style="width:14px;"></i> Clear
                        </button>
                        <button class="btn btn-primary" onclick="Views.moderation.loadLogs(1)" style="padding:8px 16px;white-space:nowrap;">
                            <i data-lucide="refresh-cw" style="width:14px;"></i> Refresh
                        </button>
                    </div>
                </div>

                <!-- Log Table -->
                <div class="card">
                    <div class="table-wrap" style="border:none;border-radius:0;">
                        <table id="activity-log-table">
                            <thead>
                                <tr>
                                    <th style="width:160px;">Timestamp</th>
                                    <th style="width:110px;">Module</th>
                                    <th style="width:100px;">Action</th>
                                    <th>Description</th>
                                    <th style="width:120px;">User</th>
                                    <th style="width:130px;">IP Address</th>
                                </tr>
                            </thead>
                            <tbody id="activity-log-body">
                                <tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">Loading activity logs...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <!-- Pagination -->
                    <div id="log-pagination" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-top:1px solid var(--border);">
                        <span id="log-page-info" style="font-size:0.85rem;color:var(--text-muted);">—</span>
                        <div style="display:flex;gap:8px;">
                            <button id="log-prev-btn" class="btn btn-secondary" style="padding:6px 14px;font-size:0.8rem;" onclick="Views.moderation.changePage(-1)" disabled>← Prev</button>
                            <button id="log-next-btn" class="btn btn-secondary" style="padding:6px 14px;font-size:0.8rem;" onclick="Views.moderation.changePage(1)" disabled>Next →</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Preview & Moderation Modal -->
            <div class="modal-overlay" id="moderation-modal">
                <div class="modal" style="width: 600px;">
                    <div class="modal-header">
                        <div class="modal-title" id="mod-modal-title">Review Creative</div>
                        <button class="modal-close" onclick="Views.moderation.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <div id="mod-modal-preview" style="background: #000; min-height: 300px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-bottom: 20px;">
                            <!-- Preview injected here -->
                        </div>
                        <div style="text-align: left; background: var(--bg-body); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <strong style="font-size: 0.9rem;">Brand:</strong>
                                <span id="mod-modal-brand" style="font-size: 0.9rem;">-</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <strong style="font-size: 0.9rem;">Media ID:</strong>
                                <span id="mod-modal-media-id" style="font-size: 0.9rem;">-</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <strong style="font-size: 0.9rem;">File Type:</strong>
                                <span id="mod-modal-type" style="font-size: 0.9rem;">-</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding-top: 10px;">
                        <div style="display: flex; gap: 10px; width: 100%;">
                            <button class="btn btn-secondary" onclick="Views.moderation.closeModal()" style="flex: 1;">Cancel</button>
                            <button class="btn btn-danger" id="mod-btn-reject" style="flex: 1; background: #ef4444;">Reject Content</button>
                            <button class="btn btn-primary" id="mod-btn-approve" style="flex: 1; background: #22c55e; border-color: #22c55e;">Approve Now</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ── State ──────────────────────────────────────────────────────────────────
    _currentPage: 1,
    _totalPages:  1,
    _searchTimer: null,
    _currentTab:  'moderation',

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.moderation = this;
        await this.loadPending();
        lucide.createIcons();
    },

    // ── Tabs ───────────────────────────────────────────────────────────────────
    switchTab(tab) {
        this._currentTab = tab;
        const tabs = ['moderation', 'logs'];
        tabs.forEach(t => {
            const panel = document.getElementById(`tab-panel-${t}`);
            const btn   = document.getElementById(`tab-btn-${t}`);
            if (!panel || !btn) return;
            const active = (t === tab);
            panel.style.display = active ? '' : 'none';
            btn.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
            btn.style.color             = active ? 'var(--accent)' : 'var(--text-muted)';
            btn.style.fontWeight        = active ? '600' : '500';
        });
        if (tab === 'logs') {
            this.loadLogs(1);
            this.loadStats();
        }
        lucide.createIcons();
    },

    // ── Moderation Tab ─────────────────────────────────────────────────────────
    async loadPending() {
        const tbody = document.getElementById('moderation-table-body');
        if (!tbody) return;
        try {
            const data = await Api.get('/admin/creatives/pending');
            tbody.innerHTML = '';
            if (data && data.length > 0) {
                const badge = document.getElementById('pending-count-badge');
                if (badge) { badge.innerText = `${data.length} Pending`; badge.style.display = 'inline-block'; }
                data.forEach(item => {
                    const tr = document.createElement('tr');
                    const tdPreview = document.createElement('td');
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'display:flex;align-items:center;gap:12px;';
                    const iconBox = document.createElement('div');
                    iconBox.style.cssText = 'width:50px;height:35px;background:rgba(59,130,246,0.1);border-radius:6px;display:flex;align-items:center;justify-content:center;';
                    const i = document.createElement('i');
                    i.setAttribute('data-lucide', item.mediaType === 'video' ? 'film' : 'image');
                    i.style.cssText = 'color:#3b82f6;width:18px;';
                    iconBox.appendChild(i); wrap.appendChild(iconBox);
                    const nameText = document.createElement('div');
                    nameText.style.fontWeight = '600';
                    nameText.textContent = item.name || 'Untitled Content';
                    wrap.appendChild(nameText); tdPreview.appendChild(wrap); tr.appendChild(tdPreview);
                    const tdBrand = document.createElement('td');
                    tdBrand.style.fontWeight = '500'; tdBrand.textContent = item.brand_name || 'System'; tr.appendChild(tdBrand);
                    const tdDate = document.createElement('td');
                    tdDate.style.cssText = 'color:var(--text-muted);font-size:0.85rem;';
                    tdDate.textContent = item.moderated_at ? new Date(item.moderated_at).toLocaleDateString() : 'Just Now'; tr.appendChild(tdDate);
                    const tdActions = document.createElement('td');
                    tdActions.style.textAlign = 'right';
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-primary'; btn.style.cssText = 'padding:6px 16px;font-size:0.8rem;';
                    btn.textContent = 'Review & Moderate'; btn.onclick = () => this.openModerationModal(item);
                    tdActions.appendChild(btn); tr.appendChild(tdActions); tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:50px;">☕ All clear! No creatives pending moderation.</td></tr>';
                const badge = document.getElementById('pending-count-badge');
                if (badge) badge.style.display = 'none';
            }
            lucide.createIcons();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:40px;">Failed to load moderation queue.</td></tr>';
        }
    },

    openModerationModal(media) {
        const modal = document.getElementById('moderation-modal');
        const preview = document.getElementById('mod-modal-preview');
        document.getElementById('mod-modal-title').innerText = `Review: ${media.name}`;
        document.getElementById('mod-modal-brand').innerText = media.brand_name;
        document.getElementById('mod-modal-media-id').innerText = media.mediaId;
        document.getElementById('mod-modal-type').innerText = media.mediaType.toUpperCase();
        preview.innerHTML = '';
        const i = document.createElement('i');
        i.setAttribute('data-lucide', media.mediaType === 'video' ? 'film' : 'image');
        i.style.cssText = 'width:64px;height:64px;color:#3b82f6;';
        preview.appendChild(i); lucide.createIcons();
        document.getElementById('mod-btn-approve').onclick = () => this.moderate(media.mediaId, 'approve');
        document.getElementById('mod-btn-reject').onclick  = () => this.moderate(media.mediaId, 'reject');
        modal.classList.add('active');
    },

    async moderate(mediaId, action) {
        const btn = document.getElementById(`mod-btn-${action}`);
        const originalText = btn.innerText;
        btn.disabled = true; btn.innerText = 'Processing...';
        try {
            const res = await fetch(`/admin/api/creatives/${mediaId}/${action}`, { method: 'PATCH' });
            const data = await res.json();
            if (data.success) {
                App.showToast(`Content ${action === 'approve' ? 'Approved' : 'Rejected'}`, 'success');
                this.closeModal(); this.loadPending();
            } else { App.showToast(data.error || 'Moderation failed', 'error'); }
        } catch (e) { App.showToast('Network error during moderation', 'error'); }
        finally { btn.disabled = false; btn.innerText = originalText; }
    },

    closeModal() { document.getElementById('moderation-modal').classList.remove('active'); },

    // ── Activity Log Tab ──────────────────────────────────────────────────────
    async loadStats() {
        try {
            const s = await Api.get('/activity-logs/stats');
            const actionMap = {};
            (s.actionBreakdown || []).forEach(a => { actionMap[a.action] = a.count; });
            const total = (s.actionBreakdown || []).reduce((sum, a) => sum + (a.count || 0), 0);
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '0'; };
            set('stat-total',   total);
            set('stat-creates', actionMap['CREATE']  || 0);
            set('stat-updates', actionMap['UPDATE']  || 0);
            set('stat-errors',  actionMap['ERROR']   || 0);
            set('stat-deletes', actionMap['DELETE']  || 0);
        } catch (e) { console.warn('[ActivityLog] Stats load failed:', e.message); }
    },

    async loadLogs(page = null) {
        if (page !== null) this._currentPage = page;
        const tbody = document.getElementById('activity-log-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">Loading...</td></tr>';

        const params = new URLSearchParams();
        params.set('page',  this._currentPage);
        params.set('limit', 50);
        const mod    = document.getElementById('log-filter-module')?.value;
        const action = document.getElementById('log-filter-action')?.value;
        const from   = document.getElementById('log-filter-from')?.value;
        const to     = document.getElementById('log-filter-to')?.value;
        const search = document.getElementById('log-search')?.value?.trim();
        if (mod)    params.set('module', mod);
        if (action) params.set('action', action);
        if (from)   params.set('from', from);
        if (to)     params.set('to', to + ' 23:59:59');
        if (search) params.set('search', search);

        try {
            const res = await Api.get(`/activity-logs?${params.toString()}`);
            this._totalPages = res.pages || 1;
            this._renderLogs(res.data || [], res.total || 0);
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:30px;">Failed to load activity logs.</td></tr>';
        }
    },

    _renderLogs(rows, total) {
        const tbody = document.getElementById('activity-log-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">No activity logs found matching your filters.</td></tr>';
        } else {
            rows.forEach(r => {
                const tr = document.createElement('tr');
                tr.style.transition = 'background 0.15s';
                tr.onmouseenter = () => tr.style.background = 'var(--bg-body)';
                tr.onmouseleave = () => tr.style.background = '';

                const ts = r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—';

                const actionColor = {
                    CREATE:    '#166534', UPDATE:   '#92400e', DELETE:    '#991b1b',
                    APPROVE:   '#1d4ed8', REJECT:   '#7c3aed', ERROR:     '#dc2626',
                    UPLOAD:    '#0369a1', PROVISION:'#7e22ce', SYNC:      '#0f766e',
                    ASSIGN:    '#15803d', UNASSIGN: '#b45309',
                    LOGIN:     '#065f46', LOGOUT:   '#581c87',
                }[r.action] || '#64748b';
                const actionBg = {
                    CREATE:    '#dcfce7', UPDATE:   '#fef3c7', DELETE:    '#fee2e2',
                    APPROVE:   '#dbeafe', REJECT:   '#ede9fe', ERROR:     '#fee2e2',
                    UPLOAD:    '#e0f2fe', PROVISION:'#f3e8ff', SYNC:      '#ccfbf1',
                    ASSIGN:    '#dcfce7', UNASSIGN: '#fef9c3',
                    LOGIN:     '#d1fae5', LOGOUT:   '#f3e8ff',
                }[r.action] || '#f1f5f9';

                const moduleBg = {
                    BRAND:'#dbeafe', PARTNER:'#dcfce7', SCREEN:'#fef3c7', CMS:'#ede9fe',
                    ERROR:'#fee2e2', DISPLAY:'#ccfbf1', CAMPAIGN:'#fce7f3', CREATIVE:'#e0f2fe',
                }[r.module] || '#f1f5f9';

                tr.innerHTML = `
                    <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">${ts}</td>
                    <td>
                        <span style="background:${moduleBg};color:#334155;padding:3px 8px;border-radius:20px;font-size:0.72rem;font-weight:700;letter-spacing:.3px;">
                            ${r.module}
                        </span>
                    </td>
                    <td>
                        <span style="background:${actionBg};color:${actionColor};padding:3px 8px;border-radius:20px;font-size:0.72rem;font-weight:700;letter-spacing:.3px;">
                            ${r.action}
                        </span>
                    </td>
                    <td style="font-size:0.85rem;max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.description}">${r.description}</td>
                    <td style="font-size:0.8rem;color:var(--text-muted);">${r.username || (r.user_id ? `#${r.user_id}` : '<span style="color:#94a3b8;font-style:italic;">system</span>')}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);font-family:monospace;">${r.ip_address || '—'}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Update pagination
        const start = (this._currentPage - 1) * 50 + 1;
        const end   = Math.min(this._currentPage * 50, total);
        const info  = document.getElementById('log-page-info');
        if (info) info.textContent = total > 0 ? `Showing ${start}–${end} of ${total} logs` : 'No logs found';
        const prev = document.getElementById('log-prev-btn');
        const next = document.getElementById('log-next-btn');
        if (prev) prev.disabled = this._currentPage <= 1;
        if (next) next.disabled = this._currentPage >= this._totalPages;
    },

    changePage(delta) {
        const newPage = this._currentPage + delta;
        if (newPage < 1 || newPage > this._totalPages) return;
        this.loadLogs(newPage);
    },

    clearFilters() {
        const ids = ['log-search','log-filter-module','log-filter-action','log-filter-from','log-filter-to'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        this.loadLogs(1);
    },

    _debounceSearch() {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.loadLogs(1), 350);
    },
});
