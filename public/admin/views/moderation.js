const ModerationView = {
    render() {
        return `
            <div class="page-title">Activity Log</div>

            <!-- Stats Overview -->
            <div class="dash-kpi-row" id="log-stats-row">
                <div class="kpi-card kpi-darkblue">
                    <div class="kpi-header"><i data-lucide="activity"></i> Total (30d)</div>
                    <h2 id="stat-total">—</h2>
                    <div style="font-size:0.7rem; opacity:0.8; margin-top:4px;">System-wide operations</div>
                </div>
                <div class="kpi-card kpi-blue" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    <div class="kpi-header"><i data-lucide="plus-circle"></i> Creates</div>
                    <h2 id="stat-creates">—</h2>
                    <div style="font-size:0.7rem; opacity:0.8; margin-top:4px;">New resources added</div>
                </div>
                <div class="kpi-card kpi-orange" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                    <div class="kpi-header"><i data-lucide="edit-3"></i> Updates</div>
                    <h2 id="stat-updates">—</h2>
                    <div style="font-size:0.7rem; opacity:0.8; margin-top:4px;">Modified configurations</div>
                </div>
                <div class="kpi-card kpi-red" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                    <div class="kpi-header"><i data-lucide="alert-circle"></i> Errors</div>
                    <h2 id="stat-errors">—</h2>
                    <div style="font-size:0.7rem; opacity:0.8; margin-top:4px;">Failed operations</div>
                </div>
            </div>

            <!-- Filters & Search -->
            <div class="card" style="margin-bottom:20px; padding: 20px;">
                <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end;">
                    <div style="flex:2; min-width:250px; position:relative;">
                        <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:8px;">Search Descriptions</label>
                        <div style="position:relative;">
                            <i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:16px; color:var(--text-muted);"></i>
                            <input id="log-search" type="text" placeholder="e.g. 'Created brand' or 'Sync failed'..." 
                                style="width:100%; padding:10px 12px 10px 38px; border:1px solid #e2e8f0; border-radius:10px; font-size:0.9rem; background:#f8fafc;" 
                                data-oninput="Views.moderation._debounceSearch">
                        </div>
                    </div>
                    <div style="flex:1; min-width:140px;">
                        <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:8px;">Module</label>
                        <select id="log-filter-module" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:0.875rem; background:#f8fafc;" data-onchange="Views.moderation.loadLogs">
                            <option value="">All Modules</option>
                            <option>BRAND</option><option>PARTNER</option><option>SCREEN</option>
                            <option>DISPLAY</option><option>CMS</option><option>CAMPAIGN</option>
                            <option>CREATIVE</option><option>LAYOUT</option><option>MODERATION</option>
                            <option>BILLING</option><option>USER</option><option>SYSTEM</option>
                            <option>AUTH</option><option>SLOT</option>
                        </select>
                    </div>
                    <div style="flex:1; min-width:140px;">
                        <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:8px;">Date Range</label>
                        <div style="display:flex; gap:8px;">
                            <input id="log-filter-from" type="date" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:0.875rem; background:#f8fafc;" data-onchange="Views.moderation.loadLogs">
                            <input id="log-filter-to" type="date" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:0.875rem; background:#f8fafc;" data-onchange="Views.moderation.loadLogs">
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-secondary" data-onclick="Views.moderation.clearFilters" style="padding:10px 16px; border-radius:10px; background:#f1f5f9; border:none; color:var(--text-primary); font-weight:600;">
                            <i data-lucide="rotate-ccw" style="width:16px; vertical-align:middle; margin-right:4px;"></i> Reset
                        </button>
                        <button class="btn btn-primary" data-onclick="Views.moderation.loadLogs" style="padding:10px 20px; border-radius:10px; font-weight:600;">
                            <i data-lucide="refresh-cw" style="width:16px; vertical-align:middle; margin-right:4px;"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>

            <!-- Activity Log Table -->
            <div class="card" style="border:none; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                <div class="table-wrap" style="border:none; border-radius:0;">
                    <table id="activity-log-table">
                        <thead>
                            <tr style="background:#f8fafc;">
                                <th style="width:180px; padding: 15px 20px;">Timestamp</th>
                                <th style="width:120px;">Scope</th>
                                <th style="width:120px;">Action</th>
                                <th>Activity Description</th>
                                <th style="width:140px;">Initiator</th>
                                <th style="width:130px; text-align:right; padding-right:20px;">Origin IP</th>
                            </tr>
                        </thead>
                        <tbody id="activity-log-body">
                            <tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:60px;">
                                <div class="spinner" style="margin:0 auto 15px;"></div>
                                Synchronizing activity records...
                            </td></tr>
                        </tbody>
                    </table>
                </div>
                
                <!-- Pagination -->
                <div id="log-pagination" style="display:flex; justify-content:space-between; align-items:center; padding:20px; border-top:1px solid #f1f5f9; background:#fff; border-radius: 0 0 16px 16px;">
                    <div id="log-page-info" style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">—</div>
                    <div style="display:flex; gap:10px;">
                        <button id="log-prev-btn" class="btn btn-secondary" style="padding:8px 16px; font-size:0.8rem; border-radius:8px; display:flex; align-items:center; gap:6px;" data-onclick="Views.moderation.changePage" data-dir="-1" disabled>
                            <i data-lucide="chevron-left" style="width:14px;"></i> Previous
                        </button>
                        <button id="log-next-btn" class="btn btn-secondary" style="padding:8px 16px; font-size:0.8rem; border-radius:8px; display:flex; align-items:center; gap:6px;" data-onclick="Views.moderation.changePage" data-dir="1" disabled>
                            Next <i data-lucide="chevron-right" style="width:14px;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    _currentPage: 1,
    _totalPages: 1,
    _searchTimer: null,

    async mount(container) {
        // Ensure global access
        window.Views = window.Views || {};
        window.Views.moderation = this;

        await Promise.all([
            this.loadLogs(1),
            this.loadStats()
        ]);
        lucide.createIcons();
    },

    async loadStats() {
        try {
            const s = await Api.get('/activity-logs/stats');
            const actionMap = {};
            (s.actionBreakdown || []).forEach(a => { actionMap[a.action] = a.count; });
            const total = (s.actionBreakdown || []).reduce((sum, a) => sum + (a.count || 0), 0);
            
            const set = (id, val) => { 
                const el = document.getElementById(id); 
                if (el) el.textContent = (val !== undefined) ? val.toLocaleString() : '0'; 
            };
            
            set('stat-total', total);
            set('stat-creates', actionMap['CREATE'] || 0);
            set('stat-updates', actionMap['UPDATE'] || 0);
            set('stat-errors', actionMap['ERROR'] || 0);
        } catch (e) { 
            console.warn('[ActivityLog] Stats load failed:', e.message); 
        }
    },

    async loadLogs(page = null) {
        if (typeof page === 'object') page = 1;
        if (page !== null) this._currentPage = page;
        
        const tbody = document.getElementById('activity-log-body');
        if (!tbody) return;
        
        const params = new URLSearchParams();
        params.set('page', this._currentPage);
        params.set('limit', 50);
        
        const mod = document.getElementById('log-filter-module')?.value;
        const from = document.getElementById('log-filter-from')?.value;
        const to = document.getElementById('log-filter-to')?.value;
        const search = document.getElementById('log-search')?.value?.trim();
        
        if (mod) params.set('module', mod);
        if (from) params.set('from', from);
        if (to) params.set('to', to + ' 23:59:59');
        if (search) params.set('search', search);

        try {
            const res = await Api.get(`/activity-logs?${params.toString()}`);
            if (res && res.error) throw new Error(res.error);
            
            this._totalPages = res.pages || 1;
            this._renderLogs(res.data || [], res.total || 0);
        } catch (e) {
            console.error('[ActivityLog] Load failed:', e);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:40px; font-weight:600;">⚠️ Connection Error: ${e.message}</td></tr>`;
        }
    },

    _renderLogs(rows, total) {
        const tbody = document.getElementById('activity-log-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:60px;">No activity records found matching your criteria.</td></tr>';
        } else {
            rows.forEach(r => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #f1f5f9';
                
                const ts = r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { 
                    day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' 
                }) : '—';

                const actionStyle = this._getActionStyle(r.action);
                const moduleStyle = this._getModuleStyle(r.module);

                tr.innerHTML = `
                    <td style="padding: 15px 20px; font-size:0.8rem; color:var(--text-muted); font-weight:500;">${ts}</td>
                    <td><span style="${moduleStyle}">${r.module}</span></td>
                    <td><span style="${actionStyle}">${r.action}</span></td>
                    <td style="font-size:0.875rem; color:#1e293b; font-weight:500; max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.description}">${r.description}</td>
                    <td style="font-size:0.82rem; color:var(--text-primary); font-weight:600;">${r.username || '<span style="color:#94a3b8; font-style:italic; font-weight:400;">system</span>'}</td>
                    <td style="font-size:0.78rem; color:var(--text-muted); font-family:monospace; text-align:right; padding-right:20px;">${r.ip_address || '—'}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Pagination UI
        const start = (this._currentPage - 1) * 50 + 1;
        const end = Math.min(this._currentPage * 50, total);
        const info = document.getElementById('log-page-info');
        if (info) info.textContent = total > 0 ? `Showing records ${start} to ${end} of ${total.toLocaleString()}` : 'No records';
        
        const prev = document.getElementById('log-prev-btn');
        const next = document.getElementById('log-next-btn');
        if (prev) prev.disabled = this._currentPage <= 1;
        if (next) next.disabled = this._currentPage >= this._totalPages;
        
        lucide.createIcons();
    },

    _getActionStyle(action) {
        const styles = {
            CREATE: 'background:#dcfce7; color:#166534;',
            UPDATE: 'background:#fef3c7; color:#92400e;',
            DELETE: 'background:#fee2e2; color:#991b1b;',
            ERROR: 'background:#fee2e2; color:#dc2626; border:1px solid #fca5a5;',
            APPROVE: 'background:#dbeafe; color:#1e40af;',
            REJECT: 'background:#fce7f3; color:#9d174d;',
            LOGIN: 'background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;',
            SYNC: 'background:#ccfbf1; color:#0f766e;'
        };
        const base = 'padding:4px 10px; border-radius:20px; font-size:0.68rem; font-weight:800; letter-spacing:0.4px; display:inline-block;';
        return base + (styles[action] || 'background:#f1f5f9; color:#475569;');
    },

    _getModuleStyle(mod) {
        const styles = {
            BRAND: 'background:#e0f2fe; color:#0369a1;',
            PARTNER: 'background:#f0fdf4; color:#15803d;',
            SCREEN: 'background:#fef9c3; color:#854d0e;',
            CAMPAIGN: 'background:#fdf2f8; color:#be185d;',
            AUTH: 'background:#f5f3ff; color:#5b21b6;'
        };
        const base = 'padding:4px 10px; border-radius:6px; font-size:0.68rem; font-weight:700; display:inline-block;';
        return base + (styles[mod] || 'background:#f8fafc; color:#64748b; border:1px solid #e2e8f0;');
    },

    changePage(e) {
        const btn = e.target.closest('button');
        const dir = parseInt(btn.dataset.dir || '0', 10);
        if (dir === 0) return;
        const newPage = this._currentPage + dir;
        if (newPage >= 1 && newPage <= this._totalPages) {
            this.loadLogs(newPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    clearFilters() {
        const ids = ['log-search', 'log-filter-module', 'log-filter-from', 'log-filter-to'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        this.loadLogs(1);
    },

    _debounceSearch() {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.loadLogs(1), 400);
    },
};

// Global Registration
window.Views = window.Views || {};
window.Views.moderation = ModerationView;
App.registerView('moderation', ModerationView);
