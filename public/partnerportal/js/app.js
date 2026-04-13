'use strict';

// ═══ API Helper ═════════════════════════════════════════════════════════════
const API_BASE = '/partnerportal/api';

async function api(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts
    });
    if (res.status === 401) { window.location.href = '/admin/login.html'; return null; }
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
        wrap.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'alert-circle');
        empty.appendChild(icon);
        const p = document.createElement('p');
        p.textContent = `Error loading view: ${err.message}`;
        empty.appendChild(p);
        wrap.appendChild(empty);
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

    const revShare = d.partner?.revenue_share_percentage || 0;
    const myRevenue = Math.floor(d.currentRevenue || 0); // Backend now calculates share!
    const myPending = Math.floor(d.pendingPayments || 0); 

    wrap.innerHTML = '';
    const anim = document.createElement('div');
    anim.className = 'view-anim';

    // Helper to create KPI
    const createKpi = (label, value, sub, iconName, colorClass) => {
        const kpi = document.createElement('div');
        kpi.className = `kpi ${colorClass}`;
        const lbl = document.createElement('div'); lbl.className = 'kpi-label'; lbl.textContent = label;
        const val = document.createElement('div'); val.className = 'kpi-value'; val.textContent = value;
        const sb = document.createElement('div'); sb.className = 'kpi-sub'; sb.textContent = sub;
        const icnWrap = document.createElement('div'); icnWrap.className = 'kpi-icon';
        const icn = document.createElement('i'); icn.setAttribute('data-lucide', iconName);
        icnWrap.appendChild(icn);
        kpi.append(lbl, val, sb, icnWrap);
        return kpi;
    };

    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'kpi-grid';
    kpiGrid.appendChild(createKpi('Total Screens', d.totalScreens, `${d.onlineScreens} online · ${d.offlineScreens} offline`, 'monitor', 'accent'));
    kpiGrid.appendChild(createKpi('Revenue (My Share)', `₹${myRevenue.toLocaleString()}`, `${revShare}% share · ${d.occupiedSlots} occupied slots`, 'indian-rupee', 'kpi-success'));
    kpiGrid.appendChild(createKpi('Pending Payment', `₹${myPending.toLocaleString()}`, 'Awaiting settlement', 'clock', 'kpi-warn'));
    kpiGrid.appendChild(createKpi('Empty Slots', d.emptySlots, `${d.utilizationRate}% utilization rate`, 'layers', 'kpi-danger'));
    
    anim.appendChild(kpiGrid);

    // Row for Stats and Earnings
    const dashRow = document.createElement('div');
    dashRow.className = 'dash-row';
    dashRow.style.marginBottom = '1.5rem';

    // Availability Card
    const availCard = document.createElement('div');
    availCard.className = 'card';
    availCard.innerHTML = `<div class="section-title"><i data-lucide="pie-chart"></i> Availability Stats</div>`;
    const statsFlex = document.createElement('div');
    statsFlex.style.cssText = 'display:flex; gap:2rem; margin-bottom:1rem;';
    const createStatItem = (label, val, color) => {
        const div = document.createElement('div');
        const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:0.75rem; color:var(--text-muted);'; lbl.textContent = label;
        const v = document.createElement('div'); v.style.cssText = `font-size:1.5rem; font-weight:800; color:${color};`; v.textContent = val;
        div.append(lbl, v);
        return div;
    };
    statsFlex.append(createStatItem('Occupied', d.occupiedSlots, 'var(--accent)'), createStatItem('Empty', d.emptySlots, 'var(--text-muted)'), createStatItem('Total Slots', d.totalSlots, 'inherit'));
    availCard.appendChild(statsFlex);
    const utilLabel = document.createElement('div'); utilLabel.style.cssText = 'font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;'; utilLabel.textContent = 'Utilization Rate';
    const utilBar = document.createElement('div'); utilBar.className = 'util-bar';
    const utilFill = document.createElement('div'); utilFill.className = 'util-fill'; utilFill.style.width = `${d.utilizationRate}%`;
    utilBar.appendChild(utilFill);
    const utilVal = document.createElement('div'); utilVal.style.cssText = 'font-size:0.8rem; font-weight:700; color:var(--accent); margin-top:4px;'; utilVal.textContent = `${d.utilizationRate}%`;
    const canvas = document.createElement('canvas'); canvas.id = 'util-chart'; canvas.style.cssText = 'max-height:160px; margin-top:1rem;';
    availCard.append(utilLabel, utilBar, utilVal, canvas);
    dashRow.appendChild(availCard);

    // Earnings Card
    const earnCard = document.createElement('div');
    earnCard.className = 'card';
    earnCard.innerHTML = `<div class="section-title"><i data-lucide="trending-up"></i> Earnings by Brand</div>`;
    if (d.earningsByBrand && d.earningsByBrand.length > 0) {
        const wrapTable = document.createElement('div'); wrapTable.className = 'table-wrap';
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr><th>Brand</th><th>Screens</th><th>Earnings</th></tr></thead>';
        const tbody = document.createElement('tbody');
        d.earningsByBrand.forEach(b => {
            const tr = document.createElement('tr');
            const tdBrand = document.createElement('td'); tdBrand.style.fontWeight = '600'; tdBrand.textContent = b.brand_name;
            const tdScreens = document.createElement('td'); tdScreens.textContent = b.screen_count;
            const tdEarn = document.createElement('td'); tdEarn.style.cssText = 'color:var(--success); font-weight:700;'; tdEarn.textContent = `₹${Math.floor((b.earnings||0)*revShare/100).toLocaleString()}`;
            tr.append(tdBrand, tdScreens, tdEarn);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapTable.appendChild(table);
        earnCard.appendChild(wrapTable);
    } else {
        earnCard.innerHTML += `<div class="empty-state"><i data-lucide="bar-chart-2"></i><p>No brand earnings data yet</p></div>`;
    }
    dashRow.appendChild(earnCard);
    anim.appendChild(dashRow);

    // Recent Proof of Play Card
    const popCard = document.createElement('div');
    popCard.className = 'card';
    popCard.innerHTML = `
        <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span><i data-lucide="activity"></i> Recent Proof of Play</span>
            <button class="btn btn-secondary" onclick="navigate('dashboard')" style="padding:4px 8px; font-size:0.75rem;">
                <i data-lucide="refresh-cw" style="width:14px; height:14px; margin-right:4px;"></i> Refresh
            </button>
        </div>
    `;
    if (d.recentPoP && d.recentPoP.length > 0) {
        const wrapTable = document.createElement('div'); wrapTable.className = 'table-wrap';
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr><th>Time</th><th>Ad Name</th><th>Display</th><th>Plays</th></tr></thead>';
        const tbody = document.createElement('tbody');
        d.recentPoP.forEach(r => {
            const tr = document.createElement('tr');
            let dateStr = '—';
            try {
                if (r.playedAt) {
                    const dt = new Date(r.playedAt);
                    dateStr = isNaN(dt.getTime()) ? 'Invalid Date' : dt.toLocaleString();
                }
            } catch (e) { dateStr = 'Error'; }

            const tdTime = document.createElement('td'); tdTime.textContent = dateStr;
            const tdAd = document.createElement('td'); tdAd.style.fontWeight = '600'; tdAd.textContent = r.adName || '—';
            const tdDisp = document.createElement('td'); tdDisp.textContent = r.displayName || r.displayId || '—';
            const tdCount = document.createElement('td'); tdCount.textContent = r.count || 1;
            tr.append(tdTime, tdAd, tdDisp, tdCount);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapTable.appendChild(table);
        popCard.appendChild(wrapTable);
    } else {
        popCard.innerHTML += `<div class="empty-state"><i data-lucide="file-x"></i><p>No recent playback data from Xibo CMS</p></div>`;
    }
    anim.appendChild(popCard);
    wrap.appendChild(anim);

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
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem;">
            <div style="font-size:0.85rem; color:var(--text-muted);">${screens.length} screen(s) assigned to your portfolio</div>
            <select id="status-filter" class="form-control" style="width:160px;">
                <option value="">All Statuses</option>
                ${allStatuses.map(s => `<option>${s}</option>`).join('')}
            </select>
        </div>
        <div class="screens-grid" id="screens-grid"></div>
    </div>`;

    function renderGrid(list) {
        const grid = document.getElementById('screens-grid');
        grid.innerHTML = '';
        if (list.length === 0) {
            const empty = document.createElement('div'); empty.className = 'empty-state';
            const p = document.createElement('p'); p.textContent = 'No screens match this filter.';
            empty.appendChild(p);
            grid.appendChild(empty);
            return;
        }

        list.forEach(s => {
            const card = document.createElement('div');
            card.className = 'screen-card';
            card.setAttribute('data-id', s.id);
            card.onclick = () => openScreenDetail(s.id);

            const header = document.createElement('div');
            header.className = 'screen-card-header';
            const infoWrap = document.createElement('div');
            const name = document.createElement('div'); name.className = 'screen-card-name'; name.textContent = s.name;
            const meta = document.createElement('div'); meta.className = 'screen-card-meta'; meta.textContent = `${s.city || 'No city'} · ID: ${s.id}`;
            infoWrap.append(name, meta);
            const badgeCls = s.liveStatus === 'Online' ? 'badge-online' : s.liveStatus === 'Offline' ? 'badge-offline' : 'badge-unlinked';
            const badge = document.createElement('span'); badge.className = `badge ${badgeCls}`; badge.textContent = s.liveStatus;
            header.append(infoWrap, badge);

            const details = document.createElement('div');
            details.style.cssText = 'margin-top:8px; font-size:0.78rem; color:var(--text-muted);';
            const addr = document.createElement('div'); addr.textContent = s.address || 'No address set';
            details.appendChild(addr);
            const xiboInfo = document.createElement('div'); xiboInfo.style.marginTop = '4px';
            if (s.xibo_display_id) {
                xiboInfo.textContent = `Xibo ID: ${s.xibo_display_id}`;
            } else {
                xiboInfo.style.color = '#f59e0b';
                xiboInfo.textContent = '⚠ Not linked to Xibo';
            }
            details.appendChild(xiboInfo);
            if (s.lastAccessed) {
                const seen = document.createElement('div'); seen.style.marginTop = '4px';
                seen.textContent = `Last seen: ${new Date(s.lastAccessed).toLocaleString()}`;
                details.appendChild(seen);
            }

            card.append(header, details);
            grid.appendChild(card);
        });
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
    const body = document.getElementById('sdm-body');
    body.innerHTML = '';
    
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;';
    const b = document.createElement('span'); b.className = `badge ${badgeCls}`; b.textContent = screen.liveStatus;
    const xInfo = document.createElement('div'); xInfo.style.cssText = 'font-size:0.75rem; color:var(--text-muted);'; xInfo.textContent = `Xibo ID: ${screen.xibo_display_id || 'Not linked'}`;
    headerRow.append(b, xInfo);
    body.appendChild(headerRow);

    const infoGrid = document.createElement('div');
    infoGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:1.5rem;';
    const addInfo = (lbl, val) => {
        const d = document.createElement('div');
        const l = document.createElement('label'); l.style.cssText = 'font-size:0.7rem; color:var(--text-muted);'; l.textContent = lbl;
        const v = document.createElement('div'); v.style.fontWeight = '600'; v.textContent = val || '—';
        d.append(l, v);
        return d;
    };
    infoGrid.append(addInfo('City', screen.city), addInfo('Partner', screen.partner_name), addInfo('Address', screen.address), addInfo('Slots', `${occupied}/${slots.length} occupied`));
    body.appendChild(infoGrid);

    if (slots.length > 0) {
        const slotTitle = document.createElement('div'); slotTitle.style.cssText = 'font-size:0.78rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;'; slotTitle.textContent = 'Slot Map';
        body.appendChild(slotTitle);
        const grid = document.createElement('div'); grid.className = 'slot-grid';
        slots.forEach(sl => {
            const sb = document.createElement('div'); sb.className = `slot-box ${sl.brand_name ? 'reserved' : 'available'}`; sb.title = sl.brand_name || 'Available';
            sb.textContent = `#${sl.slot_number}`;
            if (sl.brand_name) {
                const bDiv = document.createElement('div'); bDiv.style.cssText = 'font-size:0.6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'; bDiv.textContent = sl.brand_name;
                sb.appendChild(bDiv);
            }
            grid.appendChild(sb);
        });
        body.appendChild(grid);
    } else {
        const alert = document.createElement('div'); alert.className = 'alert-box warn';
        const icon = document.createElement('i'); icon.setAttribute('data-lucide', 'alert-triangle');
        const text = document.createElement('div'); text.textContent = 'Screen not yet linked to Xibo — no slot data available.';
        alert.append(icon, text);
        body.appendChild(alert);
    }

    const reportBtn = document.createElement('button');
    reportBtn.className = 'btn btn-secondary'; reportBtn.style.cssText = 'width:100%; margin-top:0.5rem;';
    reportBtn.onclick = () => { document.getElementById('screen-detail-modal').classList.remove('active'); navigate('support'); };
    const rIcon = document.createElement('i'); rIcon.setAttribute('data-lucide', 'life-buoy');
    reportBtn.append(rIcon, document.createTextNode(' Report Issue for This Screen'));
    body.appendChild(reportBtn);

    if (screen.xibo_display_id) {
        const syncBtn = document.createElement('button');
        syncBtn.className = 'btn btn-primary'; syncBtn.style.cssText = 'width:100%; margin-top:0.5rem;';
        syncBtn.id = `btn-sync-${screen.xibo_display_id}`;
        syncBtn.onclick = async () => {
            const btn = document.getElementById(`btn-sync-${screen.xibo_display_id}`);
            btn.innerHTML = '<i data-lucide="loader"></i> Syncing...';
            btn.disabled = true;
            try {
                await api(`/screens/${screen.xibo_display_id}/sync`, { method: 'POST' });
                showToast('Analytics synced successfully', 'success');
            } catch (err) {
                showToast('Failed to sync: ' + err.message, 'error');
            } finally {
                btn.innerHTML = '<i data-lucide="refresh-cw"></i> Force Sync Analytics';
                btn.disabled = false;
                lucide.createIcons();
            }
        };
        const sIcon = document.createElement('i'); sIcon.setAttribute('data-lucide', 'refresh-cw');
        syncBtn.append(sIcon, document.createTextNode(' Force Sync Analytics'));
        body.appendChild(syncBtn);
    }

    lucide.createIcons();
};

// ═══ EARNINGS VIEW ══════════════════════════════════════════════════════════
registerView('earnings', async (wrap) => {
    const data = await api('/earnings');
    const payouts = await api('/payouts');
    if (!data || !payouts) return;

    wrap.innerHTML = '';
    const anim = document.createElement('div'); anim.className = 'view-anim';

    // 1. KPI Summary
    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'kpi-grid';
    kpiGrid.style.cssText = 'grid-template-columns: repeat(3,1fr); max-width:800px; margin-bottom:1.5rem;';
    
    const createKpi = (label, value, sub, iconName, colorClass) => {
        const kpi = document.createElement('div');
        kpi.className = `kpi ${colorClass}`;
        kpi.innerHTML = `<div class="kpi-label"></div><div class="kpi-value"></div><div class="kpi-sub"></div><div class="kpi-icon"><i data-lucide="${iconName}"></i></div>`;
        kpi.querySelector('.kpi-label').textContent = label;
        kpi.querySelector('.kpi-value').textContent = value;
        kpi.querySelector('.kpi-sub').textContent = sub;
        return kpi;
    };

    kpiGrid.appendChild(createKpi('Total Earned', `₹${Math.floor(data.summary?.totalPaid||0).toLocaleString()}`, 'All-time share', 'check-circle', 'kpi-success'));
    kpiGrid.appendChild(createKpi('Current Balance', `₹${Math.floor(data.summary?.totalPending||0).toLocaleString()}`, 'Awaiting payout', 'clock', 'kpi-warn'));
    kpiGrid.appendChild(createKpi('Payout History', payouts.length, 'Completed requests', 'users', 'accent'));
    anim.appendChild(kpiGrid);

    // 2. Monthly Earnings Breakdown
    const earnCard = document.createElement('div');
    earnCard.className = 'card';
    earnCard.style.marginBottom = '1.5rem';
    earnCard.innerHTML = `
        <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span><i data-lucide="bar-chart-2"></i> Monthly Earnings History</span>
            <button class="btn btn-primary btn-sm" id="btn-request-payout-init">
                <i data-lucide="send"></i> Request Payout
            </button>
        </div>`;
    
    if (data.history && data.history.length > 0) {
        const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr><th>Month</th><th>Campaigns</th><th>Platform Revenue</th><th>My Share</th></tr></thead>';
        const tbody = document.createElement('tbody');
        data.history.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:700;">${h.month}</td>
                <td>${h.campaign_count}</td>
                <td>₹${(h.gross_revenue||0).toLocaleString()}</td>
                <td style="color:var(--success); font-weight:700;">₹${(h.partner_share||0).toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        earnCard.appendChild(tableWrap);
    } else {
        earnCard.innerHTML += `<div class="empty-state"><p>No monthly history yet.</p></div>`;
    }
    anim.appendChild(earnCard);

    // 3. Payout Requests
    const payoutCard = document.createElement('div');
    payoutCard.className = 'card';
    payoutCard.innerHTML = `<div class="section-title"><i data-lucide="history"></i> Payout Status</div>`;
    if (payouts.length > 0) {
        const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr><th>Requested On</th><th>Month</th><th>Amount</th><th>Status</th></tr></thead>';
        const tbody = document.createElement('tbody');
        payouts.forEach(p => {
            const tr = document.createElement('tr');
            const cls = p.status === 'Paid' ? 'badge-success' : 'badge-warn';
            tr.innerHTML = `
                <td>${new Date(p.created_at).toLocaleDateString()}</td>
                <td style="font-weight:600;">${p.month}</td>
                <td>₹${(p.amount||0).toLocaleString()}</td>
                <td><span class="badge ${cls}">${p.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        payoutCard.appendChild(tableWrap);
    } else {
        payoutCard.innerHTML += `<div class="empty-state"><p>No payout requests found.</p></div>`;
    }
    anim.appendChild(payoutCard);

    // 4. Request Modal
    const modal = document.createElement('div'); modal.id = 'payout-modal'; modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="width:400px;">
            <div class="modal-header">
                <span class="modal-title">Request Settlement</span>
                <button class="modal-close" onclick="document.getElementById('payout-modal').classList.remove('active')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Month (YYYY-MM)</label>
                    <select id="payout-month-select" class="form-control">
                        ${data.history.map(h => `<option value="${h.month}">${h.month} (₹${h.partner_share})</option>`).join('')}
                    </select>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:1rem;">
                    Settlements are processed within 2-3 business days after approval.
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="document.getElementById('payout-modal').classList.remove('active')">Cancel</button>
                <button class="btn btn-primary" id="btn-submit-payout">Submit Request</button>
            </div>
        </div>`;
    anim.appendChild(modal);

    wrap.appendChild(anim);
    lucide.createIcons();

    // Bindings
    document.getElementById('btn-request-payout-init').onclick = () => document.getElementById('payout-modal').classList.add('active');
    document.getElementById('btn-submit-payout').onclick = async () => {
        const btn = document.getElementById('btn-submit-payout');
        const month = document.getElementById('payout-month-select').value;
        btn.textContent = 'Submitting…';
        try {
            await api('/payouts/request', {
                method: 'POST',
                body: JSON.stringify({ month })
            });
            showToast('Payout request submitted successfully!', 'success');
            navigate('earnings');
        } catch (err) {
            showToast('Request failed: ' + err.message, 'error');
        } finally {
            btn.textContent = 'Submit Request';
        }
    };
});


// ═══ SUPPORT VIEW ════════════════════════════════════════════════════════════
registerView('support', async (wrap) => {
    const symbols = await api('/tickets');
    if (symbols === null) return;
    const tickets = symbols;

    wrap.innerHTML = '';
    const anim = document.createElement('div'); anim.className = 'view-anim';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;';
    const info = document.createElement('div'); info.style.cssText = 'font-size:0.85rem; color:var(--text-muted);';
    info.textContent = `${tickets.length} open/recent ticket(s)`;
    const btn = document.createElement('button'); btn.className = 'btn btn-primary';
    btn.onclick = () => openTicketModal();
    btn.innerHTML = '<i data-lucide="plus"></i> Raise a Ticket';
    header.append(info, btn);
    anim.appendChild(header);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="section-title"><i data-lucide="life-buoy"></i> Your Support Tickets</div>`;
    
    if (tickets.length > 0) {
        const list = document.createElement('div');
        tickets.forEach(t => {
            const statusMap = { Open: 'badge-open', Resolved: 'badge-resolved', 'In Progress': 'badge-progress' };
            const dotMap = { Open: 'open', Resolved: 'resolved', 'In Progress': 'in_progress' };
            const item = document.createElement('div'); item.className = 'ticket-item';
            const dot = document.createElement('div'); dot.className = `ticket-dot ${dotMap[t.status] || 'open'}`;
            const content = document.createElement('div'); content.style.flex = '1';
            const name = document.createElement('div'); name.style.cssText = 'font-weight:700; font-size:0.85rem;'; name.textContent = t.screen_name || 'General';
            const issue = document.createElement('div'); issue.style.cssText = 'font-size:0.8rem; color:var(--text-muted); margin-top:2px;'; issue.textContent = t.issue;
            content.append(name, issue);
            const side = document.createElement('div'); side.style.textAlign = 'right';
            const badge = document.createElement('span'); badge.className = `badge ${statusMap[t.status] || 'badge-open'}`; badge.textContent = t.status;
            const date = document.createElement('div'); date.style.cssText = 'font-size:0.68rem; color:var(--text-muted); margin-top:4px;'; date.textContent = new Date(t.created_at).toLocaleDateString();
            side.append(badge, date);
            item.append(dot, content, side);
            list.appendChild(item);
        });
        card.appendChild(list);
    } else {
        const empty = document.createElement('div'); empty.className = 'empty-state';
        empty.innerHTML = '<i data-lucide="check-circle"></i>';
        const p = document.createElement('p'); p.textContent = 'No tickets yet. All looks good!';
        empty.appendChild(p);
        card.appendChild(empty);
    }
    anim.appendChild(card);

    // Modal
    const modal = document.createElement('div'); modal.id = 'ticket-modal'; modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <span class="modal-title">Raise a Support Ticket</span>
                <button class="modal-close" onclick="document.getElementById('ticket-modal').classList.remove('active')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group"><label>Screen (Optional)</label><select id="ticket-screen" class="form-control"><option value="">— General Issue —</option></select></div>
                <div class="form-group"><label>Issue Description *</label><textarea id="ticket-issue" class="form-control" placeholder="Describe the issue in detail…"></textarea></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="document.getElementById('ticket-modal').classList.remove('active')">Cancel</button>
                <button class="btn btn-primary" id="btn-submit-ticket">Submit Ticket</button>
            </div>
        </div>`;
    const select = modal.querySelector('#ticket-screen');
    state.screens.forEach(s => {
        const opt = document.createElement('option'); opt.value = s.id; opt.textContent = `${s.name} (${s.city || 'No city'})`;
        opt.setAttribute('data-name', s.name);
        select.appendChild(opt);
    });
    anim.appendChild(modal);
    wrap.appendChild(anim);

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
                showToast('Your ticket has been submitted. We will contact you soon.', 'success');
                navigate('dashboard');
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
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

    wrap.innerHTML = '';
    const anim = document.createElement('div'); anim.className = 'view-anim'; anim.style.maxWidth = '600px';

    const profileCard = document.createElement('div');
    profileCard.className = 'card'; profileCard.style.marginBottom = '1.5rem';
    profileCard.innerHTML = `<div class="section-title" style="margin-bottom:1.25rem;"><i data-lucide="user"></i> Partner Profile</div>`;
    
    const createField = (label, val, id, type='text') => {
        const d = document.createElement('div'); d.className = 'form-group';
        const l = document.createElement('label'); l.textContent = label;
        const i = document.createElement('input'); i.type = type; i.id = id; i.className = 'form-control'; i.value = val || '';
        d.append(l, i);
        return d;
    };

    profileCard.appendChild(createField('Partner / Contact Name', partner?.name, 'pf-name'));
    const grid = document.createElement('div'); grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px;';
    grid.appendChild(createField('Company', partner?.company, 'pf-company'));
    grid.appendChild(createField('City', partner?.city, 'pf-city'));
    grid.appendChild(createField('Email', partner?.email, 'pf-email', 'email'));
    grid.appendChild(createField('Phone', partner?.phone, 'pf-phone', 'tel'));
    profileCard.appendChild(grid);
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary'; saveBtn.id = 'btn-save-profile';
    saveBtn.innerHTML = '<i data-lucide="save"></i> Save Changes';
    profileCard.appendChild(saveBtn);
    anim.appendChild(profileCard);

    const infoCard = document.createElement('div');
    infoCard.className = 'card';
    infoCard.innerHTML = `<div class="section-title"><i data-lucide="shield"></i> Account Info</div>`;
    const infoGrid = document.createElement('div'); infoGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:1rem;';
    const addAccountInfo = (lbl, val, color) => {
        const d = document.createElement('div');
        const l = document.createElement('label'); l.style.cssText = 'font-size:0.7rem; color:var(--text-muted);'; l.textContent = lbl;
        const v = document.createElement('div'); v.style.fontWeight = '600'; if(color) v.style.color = color; v.textContent = val || '—';
        d.append(l, v);
        return d;
    };
    infoGrid.appendChild(addAccountInfo('Login (Username)', user?.username));
    infoGrid.appendChild(addAccountInfo('Role', user?.role));
    infoGrid.appendChild(addAccountInfo('Revenue Share', `${partner?.revenue_share_percentage || 50}%`, 'var(--accent)'));
    const statusDiv = document.createElement('div');
    statusDiv.innerHTML = '<label style="font-size:0.7rem; color:var(--text-muted);">Status</label><div><span class="badge badge-online">Active</span></div>';
    infoGrid.appendChild(statusDiv);
    infoCard.appendChild(infoGrid);
    anim.appendChild(infoCard);

    wrap.appendChild(anim);

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
        } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
        finally { /* keep btn text for a moment */ }
    };
});

// ═══ TOAST NOTIFICATIONS ═════════════════════════════════════════════════════
function showToast(message, type = 'info') {
    const existing = document.getElementById('toast-box');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'toast-box';
    toast.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; z-index: 10000;
        padding: 12px 24px; border-radius: 12px; color: white;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
        font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.textContent = message;
    
    if (!document.getElementById('toast-anims')) {
        const style = document.createElement('style');
        style.id = 'toast-anims';
        style.textContent = '@keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ═══ INIT ════════════════════════════════════════════════════════════════════
window.navigate = navigate;

async function init() {
    // Proactive Session Check
    try {
        const res = await fetch('/auth/me');
        const data = await res.json();
        if (!res.ok || data.user.role !== 'Partner') {
            window.location.href = '/admin/login.html';
            return;
        }
        
        // Success - Populate Header
        const user = data.user;
        document.getElementById('partner-name-display').textContent = user.username || 'Partner';
        document.getElementById('partner-email-display').textContent = user.email || '';
        document.getElementById('partner-avatar').textContent = (user.username || 'P')[0].toUpperCase();

        await navigate('dashboard');
    } catch (e) {
        window.location.href = '/admin/login.html';
    }
}

init();

// Auto-refresh timer: every 5 minutes (reduced to prevent API overload)
setInterval(() => {
    if (state.currentView === 'dashboard' || state.currentView === 'screens') {
        console.log(`[Auto-refresh] Refreshing ${state.currentView}...`);
        navigate(state.currentView);
    }
}, 300000);
