'use strict';

// ═══ API Helper ═════════════════════════════════════════════════════════════
const API_BASE = '/partnerportal/api';

async function api(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts
    });
    if (res.status === 401) { window.location.href = '/auth/login'; return null; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'API error'); }
    return res.json();
}

// ═══ App State ══════════════════════════════════════════════════════════════
const state = {
    dashData: null,
    screens: [],
    currentView: 'dashboard'
};

// ═══ Router ═════════════════════════════════════════════════════════════════
const views = {};

function registerView(name, fn) { views[name] = fn; }

function setActiveNav(view) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById(`nav-${view}`);
    if (el) el.classList.add('active');
    const titles = { dashboard: 'Dashboard', screens: 'My Screens', earnings: 'Earnings', support: 'Support', profile: 'Profile' };
    document.getElementById('page-title').textContent = titles[view] || view;
}

async function navigate(view) {
    state.currentView = view;
    setActiveNav(view);
    const wrap = document.getElementById('view-wrap');
    wrap.innerHTML = '<div class="loader-center"><div class="spinner"></div></div>';
    try {
        if (views[view]) await views[view](wrap);
        lucide.createIcons();
    } catch (err) {
        wrap.innerHTML = `<div class="empty-state"><i data-lucide="alert-circle"></i><p>Error loading view: ${err.message}</p></div>`;
        lucide.createIcons();
    }
}

// ─── NAV BINDING ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.view); });
});

// ═══ DASHBOARD VIEW ═════════════════════════════════════════════════════════
registerView('dashboard', async (wrap) => {
    const d = await api('/dashboard');
    if (!d) return;
    state.dashData = d;

    // Update header
    document.getElementById('partner-name-display').textContent = d.partner?.name || 'Partner';
    document.getElementById('partner-email-display').textContent = d.partner?.email || 'partner@signtral.com';
    document.getElementById('partner-avatar').textContent = (d.partner?.name || 'P')[0].toUpperCase();
    if (d.totalScreens !== undefined) {
        const badge = document.getElementById('badge-screens');
        if (badge) badge.textContent = d.totalScreens;
    }

    const revShare = d.partner?.revenue_share_percentage || 50;
    const myRevenue = Math.floor((d.currentRevenue || 0) * revShare / 100);
    const myPending = Math.floor((d.pendingPayments || 0) * revShare / 100);

    wrap.innerHTML = `<div class="view-anim">
        <!-- KPI Row -->
        <div class="kpi-grid">
            <div class="kpi accent">
                <div class="kpi-label">Total Screens</div>
                <div class="kpi-value">${d.totalScreens}</div>
                <div class="kpi-sub">${d.onlineScreens} online · ${d.offlineScreens} offline</div>
                <div class="kpi-icon"><i data-lucide="monitor"></i></div>
            </div>
            <div class="kpi kpi-success">
                <div class="kpi-label">Revenue (My Share)</div>
                <div class="kpi-value">₹${myRevenue.toLocaleString()}</div>
                <div class="kpi-sub">${revShare}% share · ${d.occupiedSlots} occupied slots</div>
                <div class="kpi-icon"><i data-lucide="indian-rupee"></i></div>
            </div>
            <div class="kpi kpi-warn">
                <div class="kpi-label">Pending Payment</div>
                <div class="kpi-value">₹${myPending.toLocaleString()}</div>
                <div class="kpi-sub">Awaiting settlement</div>
                <div class="kpi-icon"><i data-lucide="clock"></i></div>
            </div>
            <div class="kpi kpi-danger">
                <div class="kpi-label">Empty Slots</div>
                <div class="kpi-value">${d.emptySlots}</div>
                <div class="kpi-sub">${d.utilizationRate}% utilization rate</div>
                <div class="kpi-icon"><i data-lucide="layers"></i></div>
            </div>
        </div>

        <!-- Utilization + Brands Earnings -->
        <div class="dash-row" style="margin-bottom:1.5rem;">
            <div class="card">
                <div class="section-title"><i data-lucide="pie-chart"></i> Availability Stats</div>
                <div style="display:flex; gap:2rem; margin-bottom:1rem;">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Occupied</div>
                        <div style="font-size:1.5rem; font-weight:800; color:var(--accent);">${d.occupiedSlots}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Empty</div>
                        <div style="font-size:1.5rem; font-weight:800; color:var(--text-muted);">${d.emptySlots}</div>
                    </div>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Utilization Rate</div>
                <div class="util-bar"><div class="util-fill" style="width:${d.utilizationRate}%;"></div></div>
                <div style="font-size:0.8rem; font-weight:700; color:var(--accent); margin-top:4px;">${d.utilizationRate}%</div>
                <canvas id="util-chart" style="max-height:160px; margin-top:1rem;"></canvas>
            </div>

            <div class="card">
                <div class="section-title"><i data-lucide="zap"></i> Quick Actions</div>
                <div class="quick-actions">
                    <div class="qa-card" onclick="navigate('screens')">
                        <i data-lucide="monitor"></i>
                        <span>Manage Screens</span>
                    </div>
                    <div class="qa-card" onclick="navigate('earnings')">
                        <i data-lucide="indian-rupee"></i>
                        <span>View Earnings</span>
                    </div>
                    <div class="qa-card" onclick="navigate('support')">
                        <i data-lucide="life-buoy"></i>
                        <span>Report Issue</span>
                    </div>
                </div>
                <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border);">
                    <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin-bottom:10px;">Partner Details</div>
                    <div style="display:flex; flex-direction:column; gap:6px; font-size:0.75rem; color:var(--text-muted);">
                        <div style="display:flex; justify-content:space-between;"><span>Revenue Share:</span> <span style="font-weight:700; color:var(--accent);">${revShare}%</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>Company:</span> <span style="font-weight:600; color:var(--text-primary);">${d.partner?.company || '—'}</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>City:</span> <span style="font-weight:600; color:var(--text-primary);">${d.partner?.city || '—'}</span></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Plays Table -->
        <div class="card">
            <div class="section-title"><i data-lucide="activity"></i> Recent Proof of Play</div>
            ${d.recentPoP && d.recentPoP.length > 0 ? `
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Time</th><th>Ad Name</th><th>Display</th><th>Plays</th></tr></thead>
                        <tbody>
                            ${d.recentPoP.map(r => `
                                <tr>
                                    <td>${r.playedAt ? new Date(r.playedAt).toLocaleString() : '—'}</td>
                                    <td style="font-weight:600;">${r.adName || '—'}</td>
                                    <td>${r.displayName || r.displayId || '—'}</td>
                                    <td>${r.count || 1}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `<div class="empty-state"><i data-lucide="file-x"></i><p>No recent playback data from Xibo CMS</p></div>`}
        </div>
    </div>`;

    lucide.createIcons();

    // Draw utilization doughnut
    const ctx2 = document.getElementById('util-chart')?.getContext('2d');
    if (ctx2) {
        new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Occupied', 'Empty'],
                datasets: [{ data: [d.occupiedSlots, d.emptySlots], backgroundColor: ['#6366f1', '#e2e8f0'], borderWidth: 0 }]
            },
            options: { plugins: { legend: { position: 'right' } }, cutout: '70%', maintainAspectRatio: true }
        });
    }
});

// ═══ MY SCREENS VIEW ════════════════════════════════════════════════════════
registerView('screens', async (wrap) => {
    const screens = await api('/screens');
    if (!screens) return;
    state.screens = screens;

    if (screens.length === 0) {
        wrap.innerHTML = `<div class="empty-state" style="margin-top:4rem;"><i data-lucide="monitor-x"></i><p>No screens assigned to your account yet.</p></div>`;
        lucide.createIcons(); return;
    }

    const allStatuses = [...new Set(screens.map(s => s.liveStatus))];

    wrap.innerHTML = `<div class="view-anim">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
            <div class="search-box-wrap">
                <i data-lucide="search"></i>
                <input type="text" id="screen-search" class="form-control" placeholder="Search by name or city…">
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="font-size:0.82rem; color:var(--text-muted);">${screens.length} screens</div>
                <select id="status-filter" class="form-control" style="width:160px;">
                    <option value="">All Statuses</option>
                    ${allStatuses.map(s => `<option>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="screens-grid" id="screens-grid"></div>
    </div>`;

    const searchInput = document.getElementById('screen-search');
    const statusSelect = document.getElementById('status-filter');

    function updateGrid() {
        const q = searchInput.value.toLowerCase();
        const s = statusSelect.value;
        const filtered = screens.filter(x => {
            const matchQ = !q || x.name.toLowerCase().includes(q) || (x.city||'').toLowerCase().includes(q);
            const matchS = !s || x.liveStatus === s;
            return matchQ && matchS;
        });
        renderGrid(filtered);
    }

    searchInput.addEventListener('input', updateGrid);
    statusSelect.addEventListener('change', updateGrid);

    function renderGrid(list) {
        document.getElementById('screens-grid').innerHTML = list.map(s => {
            const badgeCls = s.liveStatus === 'Online' ? 'badge-online' : s.liveStatus === 'Offline' ? 'badge-offline' : 'badge-unlinked';
            return `
                <div class="screen-card" data-id="${s.id}" onclick="openScreenDetail(${s.id})">
                    <div class="screen-card-header">
                        <div>
                            <div class="screen-card-name">${s.name}</div>
                            <div class="screen-card-meta">${s.city || 'No city'} · ID: ${s.id}</div>
                        </div>
                        <span class="badge ${badgeCls}">${s.liveStatus}</span>
                    </div>
                    <div style="margin-top:8px; font-size:0.78rem; color:var(--text-muted);">
                        <div>${s.address || 'No address set'}</div>
                        ${s.xibo_display_id ? `<div style="margin-top:4px;">Xibo ID: ${s.xibo_display_id}</div>` : '<div style="color:#f59e0b; margin-top:4px;">⚠ Not linked to Xibo</div>'}
                        ${s.lastAccessed ? `<div style="margin-top:4px;">Last seen: ${new Date(s.lastAccessed).toLocaleString()}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('') || '<div class="empty-state"><p>No screens match this filter.</p></div>';
    }

    renderGrid(screens);
    document.getElementById('status-filter').addEventListener('change', e => {
        const v = e.target.value;
        renderGrid(v ? screens.filter(s => s.liveStatus === v) : screens);
    });

    lucide.createIcons();
});

// ─── Screen Detail Modal ──────────────────────────────────────────────────────
window.openScreenDetail = async function(id) {
    const screen = state.screens.find(s => s.id === id);
    if (!screen) return;

    let modalEl = document.getElementById('screen-detail-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'screen-detail-modal';
        modalEl.className = 'modal-overlay';
        modalEl.innerHTML = `
            <div class="modal" style="width:520px;">
                <div class="modal-header">
                    <span class="modal-title" id="sdm-title">Screen Detail</span>
                    <button class="modal-close" onclick="document.getElementById('screen-detail-modal').classList.remove('active')">&times;</button>
                </div>
                <div class="modal-body" id="sdm-body"></div>
            </div>`;
        document.body.appendChild(modalEl);
    }

    document.getElementById('sdm-title').textContent = screen.name;
    document.getElementById('sdm-body').innerHTML = '<div class="loader-center"><div class="spinner"></div></div>';
    modalEl.classList.add('active');

    // Fetch slots for this screen
    let slots = [];
    if (screen.xibo_display_id) {
        try { slots = await api(`/screens/${screen.xibo_display_id}/slots`); } catch (e) {}
    }

    const occupied = slots.filter(s => s.status === 'Reserved' || s.brand_name).length;
    const badgeCls = screen.liveStatus === 'Online' ? 'badge-online' : screen.liveStatus === 'Offline' ? 'badge-offline' : 'badge-unlinked';

    document.getElementById('sdm-body').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
            <div><span class="badge ${badgeCls}">${screen.liveStatus}</span></div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Xibo ID: ${screen.xibo_display_id || 'Not linked'}</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:1.5rem;">
            <div><label style="font-size:0.7rem; color:var(--text-muted);">City</label><div style="font-weight:600;">${screen.city || '—'}</div></div>
            <div><label style="font-size:0.7rem; color:var(--text-muted);">Partner</label><div style="font-weight:600;">${screen.partner_name || '—'}</div></div>
            <div><label style="font-size:0.7rem; color:var(--text-muted);">Address</label><div style="font-weight:600;">${screen.address || '—'}</div></div>
            <div><label style="font-size:0.7rem; color:var(--text-muted);">Slots</label><div style="font-weight:600;">${occupied}/${slots.length} occupied</div></div>
        </div>
        ${slots.length > 0 ? `
        <div style="margin-bottom:1.25rem;">
            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Slot Map</div>
            <div class="slot-grid">
                ${slots.map(sl => `
                    <div class="slot-box ${sl.brand_name ? 'reserved' : 'available'}" title="${sl.brand_name || 'Available'}">
                        #${sl.slot_number}
                        ${sl.brand_name ? `<div style="font-size:0.6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sl.brand_name}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>` : `<div class="alert-box warn"><i data-lucide="alert-triangle"></i><div>Screen not yet linked to Xibo — no slot data available.</div></div>`}
        <button class="btn btn-primary" style="width:100%; margin-top:0.5rem;" onclick="document.getElementById('screen-detail-modal').classList.remove('active'); navigate('support');">
            <i data-lucide="life-buoy"></i> Report Issue for This Screen
        </button>
    `;
    lucide.createIcons();
};

// ═══ EARNINGS VIEW ══════════════════════════════════════════════════════════
registerView('earnings', async (wrap) => {
    const data = await api('/earnings');
    if (!data) return;

    // Use revenue_share from dashboard data if available
    const revShare = state.dashData?.partner?.revenue_share_percentage || 50;

    wrap.innerHTML = `<div class="view-anim">
        <div class="kpi-grid" style="grid-template-columns: repeat(3,1fr); max-width:700px; margin-bottom:1.5rem;">
            <div class="kpi kpi-success">
                <div class="kpi-label">Total Earned (My Share)</div>
                <div class="kpi-value">₹${Math.floor((data.summary?.totalPaid||0)*revShare/100).toLocaleString()}</div>
                <div class="kpi-sub">${revShare}% revenue share</div>
                <div class="kpi-icon"><i data-lucide="check-circle"></i></div>
            </div>
            <div class="kpi kpi-warn">
                <div class="kpi-label">Pending Settlement</div>
                <div class="kpi-value">₹${Math.floor((data.summary?.totalPending||0)*revShare/100).toLocaleString()}</div>
                <div class="kpi-sub">Awaiting payment</div>
                <div class="kpi-icon"><i data-lucide="clock"></i></div>
            </div>
            <div class="kpi accent">
                <div class="kpi-label">Active Brands</div>
                <div class="kpi-value">${data.byBrand?.length || 0}</div>
                <div class="kpi-sub">Brands using your screens</div>
                <div class="kpi-icon"><i data-lucide="users"></i></div>
            </div>
        </div>

        <div class="card">
            <div class="section-title"><i data-lucide="bar-chart-2"></i> Earnings Report by Brand</div>
            ${data.byBrand && data.byBrand.length > 0 ? `
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Brand</th>
                                <th>No. of Screens</th>
                                <th>Gross Earnings</th>
                                <th>My Share (${revShare}%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.byBrand.map(b => `
                                <tr>
                                    <td style="font-weight:700;">${b.brand_name}</td>
                                    <td>${b.screen_count}</td>
                                    <td>₹${(b.earnings||0).toLocaleString()}</td>
                                    <td style="color:var(--success); font-weight:700;">₹${Math.floor((b.earnings||0)*revShare/100).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `<div class="empty-state"><i data-lucide="bar-chart"></i><p>No brand earnings data yet. Earnings appear once brands book slots on your screens.</p></div>`}
        </div>
    </div>`;
    lucide.createIcons();
});

// ═══ SUPPORT VIEW ════════════════════════════════════════════════════════════
registerView('support', async (wrap) => {
    const tickets = await api('/tickets');
    if (tickets === null) return;

    wrap.innerHTML = `<div class="view-anim">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
            <div style="font-size:0.85rem; color:var(--text-muted);">${tickets.length} open/recent ticket(s)</div>
            <button class="btn btn-primary" onclick="openTicketModal()"><i data-lucide="plus"></i> Raise a Ticket</button>
        </div>

        <div class="card">
            <div class="section-title"><i data-lucide="life-buoy"></i> Your Support Tickets</div>
            ${tickets.length > 0 ? `
                <div>
                    ${tickets.map(t => {
                        const statusMap = { Open: 'badge-open', Resolved: 'badge-resolved', 'In Progress': 'badge-progress' };
                        const dotMap = { Open: 'open', Resolved: 'resolved', 'In Progress': 'in_progress' };
                        return `
                        <div class="ticket-item">
                            <div class="ticket-dot ${dotMap[t.status] || 'open'}"></div>
                            <div style="flex:1;">
                                <div style="font-weight:700; font-size:0.85rem;">${t.screen_name || 'General'}</div>
                                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${t.issue}</div>
                            </div>
                            <div style="text-align:right;">
                                <span class="badge ${statusMap[t.status] || 'badge-open'}">${t.status}</span>
                                <div style='font-size:0.68rem; color:var(--text-muted); margin-top:4px;'>${new Date(t.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            ` : `<div class="empty-state"><i data-lucide="check-circle"></i><p>No tickets yet. All looks good!</p></div>`}
        </div>

        <!-- Raise Ticket Modal -->
        <div id="ticket-modal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <span class="modal-title">Raise a Support Ticket</span>
                    <button class="modal-close" onclick="document.getElementById('ticket-modal').classList.remove('active')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Screen (Optional)</label>
                        <select id="ticket-screen" class="form-control">
                            <option value="">— General Issue —</option>
                            ${state.screens.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name} (${s.city || 'No city'})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Issue Description *</label>
                        <textarea id="ticket-issue" class="form-control" placeholder="Describe the issue in detail…"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('ticket-modal').classList.remove('active')">Cancel</button>
                    <button class="btn btn-primary" id="btn-submit-ticket">Submit Ticket</button>
                </div>
            </div>
        </div>
    </div>`;

    lucide.createIcons();

    const submitBtn = document.getElementById('btn-submit-ticket');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const screenEl = document.getElementById('ticket-screen');
            const issueEl = document.getElementById('ticket-issue');
            const issue = issueEl.value.trim();
            if (!issue) { issueEl.style.borderColor = 'var(--danger)'; return; }

            const selectedOpt = screenEl.selectedOptions[0];
            const screenName = selectedOpt?.dataset?.name || '';

            submitBtn.textContent = 'Submitting…';
            try {
                await api('/tickets', {
                    method: 'POST',
                    body: JSON.stringify({ screen_id: screenEl.value || null, screen_name: screenName, issue })
                });
                document.getElementById('ticket-modal').classList.remove('active');
                navigate('support');
            } catch (err) { alert('Failed: ' + err.message); }
            finally { submitBtn.textContent = 'Submit Ticket'; }
        };
    }
});

window.openTicketModal = function() {
    const m = document.getElementById('ticket-modal');
    if (m) m.classList.add('active');
    lucide.createIcons();
};

// ═══ PROFILE VIEW ═══════════════════════════════════════════════════════════
registerView('profile', async (wrap) => {
    const data = await api('/profile');
    if (!data) return;
    const { partner, user } = data;

    wrap.innerHTML = `<div class="view-anim" style="max-width:600px;">
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="section-title" style="margin-bottom:1.25rem;"><i data-lucide="user"></i> Partner Profile</div>
            <div class="form-group">
                <label>Partner / Contact Name</label>
                <input type="text" id="pf-name" class="form-control" value="${partner?.name || ''}">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div class="form-group">
                    <label>Company</label>
                    <input type="text" id="pf-company" class="form-control" value="${partner?.company || ''}">
                </div>
                <div class="form-group">
                    <label>City</label>
                    <input type="text" id="pf-city" class="form-control" value="${partner?.city || ''}">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="pf-email" class="form-control" value="${partner?.email || ''}">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" id="pf-phone" class="form-control" value="${partner?.phone || ''}">
                </div>
            </div>
            <button class="btn btn-primary" id="btn-save-profile"><i data-lucide="save"></i> Save Changes</button>
        </div>
        <div class="card">
            <div class="section-title"><i data-lucide="shield"></i> Account Info</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:1rem;">
                <div><label style="font-size:0.7rem; color:var(--text-muted);">Login (Username)</label><div style="font-weight:600;">${user?.username || '—'}</div></div>
                <div><label style="font-size:0.7rem; color:var(--text-muted);">Role</label><div style="font-weight:600;">${user?.role || '—'}</div></div>
                <div><label style="font-size:0.7rem; color:var(--text-muted);">Revenue Share</label><div style="font-weight:600; color:var(--accent);">${partner?.revenue_share_percentage || 50}%</div></div>
                <div><label style="font-size:0.7rem; color:var(--text-muted);">Status</label><div><span class="badge badge-online">Active</span></div></div>
            </div>
        </div>
    </div>`;

    lucide.createIcons();

    document.getElementById('btn-save-profile').onclick = async () => {
        const btn = document.getElementById('btn-save-profile');
        btn.textContent = 'Saving…';
        try {
            await api('/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    name: document.getElementById('pf-name').value,
                    company: document.getElementById('pf-company').value,
                    city: document.getElementById('pf-city').value,
                    email: document.getElementById('pf-email').value,
                    phone: document.getElementById('pf-phone').value
                })
            });
            btn.innerHTML = '<span>✓ Saved!</span>';
            setTimeout(() => { btn.innerHTML = '<i data-lucide="save"></i> Save Changes'; lucide.createIcons(); }, 2000);
        } catch (err) { alert('Save failed: ' + err.message); }
        finally { /* keep btn text for a moment */ }
    };
});

// ═══ INIT ════════════════════════════════════════════════════════════════════
window.navigate = navigate;
navigate('dashboard');
