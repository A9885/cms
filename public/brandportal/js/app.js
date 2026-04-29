// public/brand/js/app.js
lucide.createIcons();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify Authentication
    let authed = false;
    try {
        const res = await fetch('/auth/me');
        const data = await res.json();
        if (!data.user || data.user.role !== 'Brand') {
            window.location.href = '/admin/login.html';
            return;
        }
        document.getElementById('user-display-name').innerText = data.user.username;
        document.getElementById('user-initial').innerText = data.user.username.charAt(0).toUpperCase();
        
        // Check for mandatory password reset
        if (data.user.forcePasswordReset) {
            document.getElementById('force-password-reset-modal').classList.add('active');
            // Disable sidebar interactions
            document.querySelector('.sidebar').style.pointerEvents = 'none';
            document.querySelector('.sidebar').style.filter = 'blur(2px)';
        }
        
        authed = true;
    } catch (e) {
        window.location.href = '/admin/login.html';
        return;
    }

    // 2. Navigation Setup (History API support)
    window.addEventListener('popstate', (e) => {
        const target = (e.state && e.state.view) || window.location.hash.substring(1) || 'dashboard';
        switchView(target, false);
    });

    // Handle initial load hash
    const initialHash = window.location.hash.substring(1);
    if (initialHash) {
        switchView(initialHash, false);
    } else {
        const activeNav = document.querySelector('.nav-item.active');
        const target = activeNav ? activeNav.getAttribute('data-target') : 'dashboard';
        switchView(target, false);
    }

    // 3. Setup Nav Click Handlers
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const target = item.getAttribute('data-target');
            if (target) {
                e.preventDefault();
                switchView(target);
            }
        });
    });

    // 4. Setup Logout
    const logoutBtn = document.getElementById('logout-trigger');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // 5. Real-time Socket.io connection
    if (authed && window.io) {
        const socket = io();
        socket.on('slot_assigned', (event) => {
            console.log('[Brand Portal] Slot update:', event);
            showToast(`⚡ Slot ${event.slot_number} on Display #${event.displayId} → ${event.brandName || 'updated'}`);
            refreshActiveView();
        });
    }

    // Auto-refresh every 5 minutes (reduced from 60s to prevent Xibo API overload)
    setInterval(() => {
        console.log('[Brand Portal] Auto-refreshing active view...');
        refreshActiveView(true);
    }, 300000);
});

/**
 * Handles view transitions and browser history.
 */
function switchView(target, push = true) {
    console.log(`[Brand Portal] Navigating to: ${target}`);
    
    // 1. Update UI
    document.querySelectorAll('.nav-item').forEach(i => {
        if (i.getAttribute('data-target') === target) i.classList.add('active');
        else i.classList.remove('active');
    });

    document.querySelectorAll('.view-section').forEach(v => {
        if (v.id === target) v.classList.add('active');
        else v.classList.remove('active');
    });

    // 2. Update History
    if (push) {
        history.pushState({ view: target }, '', `#${target}`);
    }

    // 3. Trigger map resize if needed
    if (target === 'dashboard' || target === 'screens') {
        if (window.dashMap) setTimeout(() => dashMap.invalidateSize(), 100);
        if (window.detailMap) setTimeout(() => detailMap.invalidateSize(), 100);
    }

    // 4. Load data for the selected tab
    if (target === 'dashboard') loadDashboard();
    else if (target === 'screens') loadScreens();
    else if (target === 'reports') loadPoP();
    else if (target === 'creatives') loadCreatives();
    else if (target === 'market') loadMarket();
    else if (target === 'billing') {
        if (typeof loadBilling === 'function') loadBilling();
        if (typeof loadSubscription === 'function') loadSubscription();
    }
    else if (target === 'account') loadAccount();
}

/**
 * Detects the active view and refreshes its data.
 * @param {boolean} background - If true, skip manual loading indicators.
 */
function refreshActiveView(background = false) {
    const activeNav = document.querySelector('.nav-item.active');
    const target = activeNav ? activeNav.getAttribute('data-target') : 'dashboard';
    
    if (target === 'dashboard') loadDashboard();
    else if (target === 'screens') loadScreens();
    else if (target === 'creatives') loadCreatives();
    else if (target === 'account') loadAccount();
    else if (target === 'reports') {
        const isDetail = document.getElementById('reports-detail-view').style.display === 'block';
        if (isDetail) {
            const refreshBtn = document.getElementById('report-refresh-btn');
            if (refreshBtn) refreshBtn.click();
        } else {
            loadPoP();
        }
    }
}


async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (res.status === 401 || res.status === 403) window.location.href = '/admin/login.html';
        const data = await res.json();
        
        if (data.syncing) {
            showSyncingBanner();
            return data.data || (Array.isArray(data.data) ? [] : {});
        }
        
        return data;
    } catch (e) {
        console.error('Fetch error:', e);
        return null;
    }
}

function showSyncingBanner() {
    if (document.getElementById('xibo-sync-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'xibo-sync-banner';
    banner.innerHTML = '⚠️ Xibo Connection Syncing... Some data may be outdated.';
    
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        background: #FFF3CD;
        border-bottom: 1px solid #FFC107;
        color: #856404;
        padding: 12px;
        text-align: center;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        animation: bannerFadeIn 0.3s ease-out;
        transition: opacity 1s ease-out;
    `;

    if (!document.getElementById('banner-anims')) {
        const style = document.createElement('style');
        style.id = 'banner-anims';
        style.innerHTML = `
            @keyframes bannerFadeIn {
                from { transform: translateY(-100%); }
                to { transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.prepend(banner);

    setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 1000);
    }, 10000);
}

function showToast(message, type = 'info') {
    const existing = document.getElementById('bp-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'bp-toast';
    toast.innerText = message;
    toast.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        background:${type === 'success' ? '#22c55e' : '#3b82f6'};
        color:#fff; padding:12px 20px; border-radius:10px;
        font-size:0.875rem; font-weight:500; box-shadow:0 10px 30px rgba(0,0,0,0.3);
        animation:slideInRight 0.3s ease; border-left: 4px solid rgba(255,255,255,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

async function refreshDashboard() {
    const btn = document.getElementById('refresh-dashboard-btn');
    if (!btn) return;

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = '<i data-lucide="refresh-cw" class="spin" size="16"></i> Refreshing...';
    lucide.createIcons();

    try {
        const res = await fetch('/brandportal/api/sync-stats', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Dashboard updated with latest stats.', 'success');
            await loadDashboard(); 
        } else {
            showToast(data.error || 'Refresh failed.', 'error');
        }
    } catch (e) {
        showToast('Connection error during sync.', 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = originalContent;
        lucide.createIcons();
    }
}

async function logout() {
    try {
        await fetch('/auth/logout', { method: 'POST' });
    } catch (e) {
        console.error('Logout request failed', e);
    }
    window.location.href = '/admin/login.html';
}

async function handleForcePasswordChange() {
    const newPass = document.getElementById('new-password-input').value;
    const confirmPass = document.getElementById('confirm-password-input').value;
    const btn = document.getElementById('submit-password-btn');

    if (!newPass || newPass.length < 6) return showToast('Password must be at least 6 characters.', 'error');
    if (newPass !== confirmPass) return showToast('Passwords do not match.', 'error');

    btn.disabled = true;
    btn.innerText = 'Updating...';

    try {
        const res = await fetch('/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword: newPass })
        });
        const data = await res.json();

        if (data.success) {
            showToast('✅ Password updated! Welcome to SIGTRAL.', 'success');
            document.getElementById('force-password-reset-modal').classList.remove('active');
            document.querySelector('.sidebar').style.pointerEvents = 'auto';
            document.querySelector('.sidebar').style.filter = 'none';
            loadDashboard();
        } else {
            showToast(data.error || 'Failed to update password.', 'error');
        }
    } catch (e) {
        showToast('Connection error. Try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Update & Continue';
    }
}


// Global instances
let performanceChart = null;
let sparklineChart = null;
let dashMap = null;
let detailMap = null;
let dashMarkers = [];
let detailMarkers = [];

// ─── DASHBOARD ───
async function loadDashboard() {
    const data = await safeFetch('/brandportal/api/dashboard');
    if (!data) return;

    document.getElementById('dash-active-screens').innerText = data.activeScreens || 0;
    document.getElementById('dash-total-screens').innerText = data.totalSlots || 0;
    document.getElementById('dash-total-plays').innerText    = (data.totalPlays || 0).toLocaleString();

    // ─── SUBSCRIPTION KPI ───
    const planNameEl = document.getElementById('dash-plan-name');
    const planStatusEl = document.getElementById('dash-plan-status');
    if (planNameEl && planStatusEl) {
        const sub = await safeFetch('/brandportal/api/subscription');
        if (sub) {
            planNameEl.textContent = sub.planName || 'Active Plan';
            planStatusEl.textContent = sub.daysRemaining > 0 
                ? `${sub.daysRemaining} days remaining` 
                : (sub.daysRemaining === 0 ? 'Expires today' : 'Subscription expired');
        } else {
            planNameEl.textContent = 'No Plan';
            planStatusEl.textContent = 'Contact sales to subscribe';
        }
    }

    // Render recent Activity
    const activityList = document.getElementById('recent-activity-list');
    if (activityList) {
        activityList.innerHTML = '';
        const pop = data.recentPoP || [];
        if (pop.length > 0) {
            pop.forEach(r => {
                const item = document.createElement('div');
                item.className = 'activity-item';
                
                const icon = document.createElement('div');
                icon.className = 'activity-icon';
                const i = document.createElement('i');
                i.setAttribute('data-lucide', 'play');
                i.setAttribute('size', '16');
                icon.appendChild(i);
                item.appendChild(icon);

                const content = document.createElement('div');
                content.style.flex = '1';
                
                const title = document.createElement('div');
                title.style.fontSize = '0.85rem';
                title.style.fontWeight = '600';
                title.textContent = r.adName || 'Ad played';
                content.appendChild(title);

                const meta = document.createElement('div');
                meta.style.fontSize = '0.75rem';
                meta.style.color = 'var(--text-muted)';
                const slotText = r.slotNumber ? `Slot ${r.slotNumber} • ` : '';
                meta.textContent = `${slotText}${r.displayName || 'Screen'} • ${r.playedAt ? new Date(r.playedAt).toLocaleTimeString() : '-'}`;
                content.appendChild(meta);

                
                item.appendChild(content);

                const count = document.createElement('div');
                count.style.fontSize = '0.8rem';
                count.style.fontWeight = '700';
                count.style.color = 'var(--success)';
                count.textContent = `+${r.count || 1}`;
                item.appendChild(count);

                activityList.appendChild(item);
            });
        } else {
            const empty = document.createElement('div');
            empty.style.textAlign = 'center';
            empty.style.padding = '2rem 0';
            empty.innerHTML = `
                <i data-lucide="clipboard-list" style="width:32px; height:32px; color:var(--text-muted); opacity:0.3; margin-bottom:0.5rem;"></i>
                <p style="color:var(--text-muted); font-size:0.85rem;">No recent playback activity found.</p>
            `;
            activityList.appendChild(empty);
        }
        lucide.createIcons();
    }

    initDashboardCharts(data);
    initDashboardMap(data.brandScreens || []);
}

async function initDashboardCharts(dashData) {
    const canvas = document.getElementById('performance-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dailyStats = dashData.dailyStats || [];
    const labels = dailyStats.map(s => {
        const d = new Date(s.date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const counts = dailyStats.map(s => s.count);

    // Premium Gradient for Bars
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');

    if (performanceChart) performanceChart.destroy();

    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                label: 'Daily Plays',
                data: counts.length ? counts : [0],
                backgroundColor: gradient,
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 8,
                borderSkipped: false,
                hoverBackgroundColor: '#2563eb',
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.5)', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#94a3b8', font: { size: 11, weight: '500' } } 
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    backgroundColor: '#1e293b', 
                    padding: 12, 
                    titleFont: { size: 13, weight: '600', family: "'Outfit', sans-serif" }, 
                    bodyFont: { size: 13, family: "'Inter', sans-serif" },
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: (context) => ` ${context.parsed.y.toLocaleString()} Plays`
                    }
                }
            }
        }
    });
}

function initDashboardMap(brandScreens) {
    if (!dashMap) {
        dashMap = L.map('screens-map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(dashMap);
    }
    dashMarkers.forEach(m => dashMap.removeLayer(m));
    dashMarkers = [];

    const screens = brandScreens || [];
    const validSpots = screens.filter(s => s.latitude && s.longitude);

    if (validSpots.length === 0) {
        // Fallback to a clear state if no screens
        return;
    }

    validSpots.forEach(spot => {
        const isActive = spot.status === 'online' || spot.status === 'Active';
        const markerColor = isActive ? "#3b82f6" : "#94a3b8"; // Blue for active, Gray for inactive
        
        const marker = L.circleMarker([spot.latitude, spot.longitude], {
            radius: 8, fillColor: markerColor, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.85
        }).bindTooltip(`<b>${spot.name}</b><br>ID: ${spot.displayId}<br>Status: ${spot.status}`, { permanent: false })
          .addTo(dashMap);
        dashMarkers.push(marker);
    });

    const bounds = L.latLngBounds(validSpots.map(s => [s.latitude, s.longitude]));
    dashMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
}

// ─── SCREENS ───
async function loadScreens() {
    const data = await safeFetch('/brandportal/api/screens');
    const pop = await safeFetch('/brandportal/api/proof-of-play');
    const tbody = document.querySelector('#my-screens-table tbody');
    if (!tbody) return;

    // Guard: data must be a non-null array
    const screens = Array.isArray(data) ? data : [];

    tbody.innerHTML = '';
    if (screens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">No screens assigned to your brand yet.</td></tr>';
        return;
    }


    screens.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = 'screen-row';
        tr.onclick = () => viewScreenDetail(s.displayId, s);
        
        const tdInfo = document.createElement('td');
        const infoWrap = document.createElement('div');
        infoWrap.style.display = 'flex';
        infoWrap.style.alignItems = 'center';
        infoWrap.style.gap = '12px';
        
        const iconWrap = document.createElement('div');
        iconWrap.style.width = '42px';
        iconWrap.style.height = '42px';
        iconWrap.style.borderRadius = '10px';
        iconWrap.style.background = s.status === 'online' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(241, 245, 249, 1)';
        iconWrap.style.display = 'flex';
        iconWrap.style.alignItems = 'center';
        iconWrap.style.justifyContent = 'center';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'tv');
        icon.setAttribute('size', '20');
        icon.style.color = s.status === 'online' ? '#22c55e' : 'var(--text-muted)';
        iconWrap.appendChild(icon);
        infoWrap.appendChild(iconWrap);
        
        const textWrap = document.createElement('div');
        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '600';
        nameDiv.style.color = 'var(--text-primary)';
        nameDiv.textContent = s.name;
        textWrap.appendChild(nameDiv);
        const addrDiv = document.createElement('div');
        addrDiv.style.fontSize = '0.75rem';
        addrDiv.style.color = 'var(--text-muted)';
        addrDiv.textContent = s.address || 'Location';
        textWrap.appendChild(addrDiv);
        infoWrap.appendChild(textWrap);
        tdInfo.appendChild(infoWrap);
        tr.appendChild(tdInfo);

        const tdCity = document.createElement('td');
        tdCity.style.color = 'var(--text-muted)';
        tdCity.style.fontSize = '0.85rem';
        tdCity.textContent = s.city || '-';
        tr.appendChild(tdCity);

        const tdMobility = document.createElement('td');
        tdMobility.style.color = 'var(--text-muted)';
        tdMobility.style.fontSize = '0.85rem';
        tdMobility.innerHTML = '<i data-lucide="map-pin" size="14" style="margin-right:4px;"></i>GPS';
        tr.appendChild(tdMobility);

        const tdStatus = document.createElement('td');
        const span = document.createElement('span');
        span.className = `status-pill ${s.status === 'online' ? 'active' : 'offline'}`;
        span.textContent = s.status === 'online' ? 'Online' : 'Offline';
        tdStatus.appendChild(span);
        tr.appendChild(tdStatus);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-glass';
        btn.style.padding = '6px 14px';
        btn.style.fontSize = '0.75rem';
        btn.textContent = 'Details';
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
    lucide.createIcons();
    
    if (screens.length > 0) viewScreenDetail(screens[0].displayId, screens[0]);
}

// ─── SCREEN DETAIL ───
async function viewScreenDetail(displayId, screenOrName) {
    const panel = document.getElementById('screen-detail-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div style="padding:3rem; text-align:center; color:var(--text-muted);">
            <div style="width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1rem;"></div>
            <p style="font-size:0.9rem;">Loading screen details...</p>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;

    // Fetch real data from backend
    let detail = null;
    try {
        const res = await fetch(`/brandportal/api/screens/${displayId}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            panel.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--danger); font-size:0.9rem;">⚠️ ${err.error || 'Could not load screen details.'}</div>`;
            return;
        }
        detail = await res.json();
    } catch (e) {
        console.error('[Screens] fetch error:', e);
        panel.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--danger); font-size:0.9rem;">⚠️ Network error. Please refresh.</div>`;
        return;
    }

    if (!detail || detail.error) {
        panel.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--danger); font-size:0.9rem;">⚠️ ${detail?.error || 'Screen not found.'}</div>`;
        return;
    }

    // ── Map coordinates (real lat/lng or India center fallback) ──
    const screenInfo = (typeof screenOrName === 'object' && screenOrName) ? screenOrName : {};
    const lat = detail.lat || screenInfo.lat || null;
    const lng = detail.lng || screenInfo.lng || null;
    const DEFAULT_LAT = 20.5937, DEFAULT_LNG = 78.9629;

    const isOnline = detail.status === 'online';
    const statusLabel = isOnline ? '🟢 Online' : '🔴 Offline';
    const location = [detail.address, detail.city].filter(v => v && v !== '-').join(', ') || 'Location not set';

    // ── Build slot rows with per-slot plays ──
    const slotRows = (detail.slots || []).map(sl => {
        let statusHtml = '';
        let rowStyle = '';
        
        if (sl.isOwnedByMe) {
            const icon = sl.status === 'Active' ? '✅' : '⏳';
            statusHtml = `<span style="color:#3b82f6; font-weight:700;">${icon} Your Slot</span>`;
            rowStyle = 'background: rgba(59, 130, 246, 0.05);';
        } else if (sl.status === 'Available') {
            statusHtml = `<span style="color:#22c55e;">🔓 Available</span>`;
        } else {
            statusHtml = `<span style="color:#94a3b8;">🔒 Occupied</span>`;
        }

        const mediaName = sl.isOwnedByMe 
            ? (sl.media_name || (sl.mediaId ? `Media #${sl.mediaId}` : '<span style="color:#94a3b8">No Media</span>'))
            : '<span style="color:#cbd5e1">—</span>';
            
        const plays = sl.isOwnedByMe ? (sl.plays || 0).toLocaleString() : '—';
        
        return `<tr style="${rowStyle} border-bottom:1px solid #f8fafc;">
            <td style="font-weight:800; color:var(--accent); font-size:0.9rem; padding:6px 10px;">S${sl.slot_number}</td>
            <td style="padding:6px 10px; font-size:0.75rem;">${statusHtml}</td>
            <td style="font-size:0.8rem; color:var(--text-muted); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:6px 10px;" title="${sl.media_name || ''}">${mediaName}</td>
            <td style="font-weight:700; color:var(--text-primary); text-align:right; padding:6px 10px;">${plays}</td>
        </tr>`;
    }).join('');

    const lastSeenStr = detail.lastAccess
        ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Last seen: ${new Date(detail.lastAccess).toLocaleString()}</div>`
        : '';

    panel.innerHTML = `
        <div id="large-screens-map" style="height:180px; border-radius:var(--radius-sm); overflow:hidden; margin-bottom:1.25rem; background:#f1f5f9;"></div>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
            <div>
                <div style="font-weight:800; font-size:1.05rem; color:var(--text-primary);">${detail.name}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">📍 ${location}</div>
                ${lastSeenStr}
            </div>
            <span class="status-pill ${isOnline ? 'active' : 'offline'}" style="font-size:0.72rem; flex-shrink:0;">${statusLabel}</span>
        </div>

        <div style="background:#f8fafc; border-radius:8px; padding:8px 12px; font-size:0.75rem; color:var(--text-muted); margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center;">
            <div>🖥 ID: <strong style="color:var(--text-primary);">${detail.displayId}</strong></div>
            <div>🤝 Partner: <strong style="color:var(--text-primary);">${detail.partnerName || 'Central'}</strong></div>
        </div>

        <div style="margin-bottom:1rem;">
            <div style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.06em; margin-bottom:8px; display:flex; justify-content:space-between;">
                <span>Screen Capacity (20 Slots)</span>
                <span style="color:var(--accent);">${detail.slots?.filter(s => s.isOwnedByMe).length || 0} Owned</span>
            </div>
            <div style="max-height:300px; overflow-y:auto; border:1px solid #f1f5f9; border-radius:8px;">
                <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead style="position:sticky; top:0; background:#fff; box-shadow:0 1px 0 #f1f5f9;">
                        <tr>
                            <th style="text-align:left; padding:8px 10px; color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Slot</th>
                            <th style="text-align:left; padding:8px 10px; color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Status</th>
                            <th style="text-align:left; padding:8px 10px; color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Media</th>
                            <th style="text-align:right; padding:8px 10px; color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Plays</th>
                        </tr>
                    </thead>
                    <tbody>${slotRows}</tbody>
                </table>
            </div>
        </div>

        <div style="border-top:1px solid #f1f5f9; padding-top:0.875rem; display:flex; align-items:center; justify-content:space-between;">
            <div>
                <div style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Total Plays (Yours)</div>
                <div style="font-size:1.6rem; font-weight:800; color:var(--text-primary);">${(detail.totalPlays || 0).toLocaleString()}</div>
            </div>
            <button class="btn btn-primary" style="padding:6px 14px; font-size:0.75rem;" onclick="window.location.hash='#marketplace'">Buy More Slots</button>
        </div>
    `;


    // Mount map AFTER innerHTML is set so the div exists
    if (detailMap) { detailMap.remove(); detailMap = null; detailMarkers = []; }
    const mapDiv = document.getElementById('large-screens-map');
    if (mapDiv) {
        detailMap = L.map('large-screens-map', { zoomControl: false }).setView(
            lat && lng ? [lat, lng] : [DEFAULT_LAT, DEFAULT_LNG],
            lat && lng ? 14 : 5
        );
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '' }).addTo(detailMap);
        if (lat && lng) {
            L.marker([lat, lng]).bindPopup(`<b>${detail.name}</b>`).addTo(detailMap).openPopup();
        }
        setTimeout(() => detailMap.invalidateSize(), 200);
    }
    lucide.createIcons();
}

// ─── MARKET ───
async function loadMarket() {
    const data = await safeFetch('/brandportal/api/screens/available');
    const grid = document.getElementById('market-grid');
    if (!grid || !data) return;

    grid.innerHTML = '';
    data.forEach(screen => {
        const panel = document.createElement('div');
        panel.className = 'glass-panel';
        panel.style.marginBottom = '0';
        
        const name = document.createElement('div');
        name.style.fontWeight = '700';
        name.style.fontSize = '1.1rem';
        name.style.marginBottom = '4px';
        name.textContent = screen.name;
        panel.appendChild(name);

        const loc = document.createElement('div');
        loc.style.fontSize = '0.8rem';
        loc.style.color = 'var(--text-muted)';
        loc.style.marginBottom = '1.5rem';
        const pin = document.createElement('i');
        pin.setAttribute('data-lucide', 'map-pin');
        pin.setAttribute('size', '14');
        loc.appendChild(pin);
        loc.appendChild(document.createTextNode(` ${screen.city || 'Unknown'}`));
        panel.appendChild(loc);

        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.alignItems = 'center';
        
        const slots = document.createElement('div');
        slots.style.fontSize = '0.85rem';
        slots.style.fontWeight = '600';
        slots.style.color = 'var(--accent)';
        slots.textContent = `${screen.availableSlots.length} Slots Available`;
        footer.appendChild(slots);

        const btn = document.createElement('button');
        btn.className = 'btn btn-blue';
        btn.style.padding = '8px 14px';
        btn.style.fontSize = '0.8rem';
        btn.textContent = 'Select';
        btn.onclick = () => openBuyModal(screen.displayId, screen.name, screen.availableSlots, screen.resolution);
        footer.appendChild(btn);
        
        panel.appendChild(footer);
        grid.appendChild(panel);
    });
    lucide.createIcons();
}

let currentSelectedSlots = new Set();
function openBuyModal(displayId, screenName, availableSlotsArray, resolution) {
    document.getElementById('modal-screen-name').innerText = screenName;
    document.getElementById('modal-display-id').value = displayId;
    currentSelectedSlots.clear();

    const res = resolution || "";
    const parts = res.toLowerCase().split('x');
    const isPortrait = parts.length === 2 && parseInt(parts[1]) > parseInt(parts[0]);

    const grid = document.getElementById('modal-slots-grid');
    if (grid) {
        grid.style.gridTemplateColumns = isPortrait ? 'repeat(5, 1fr)' : 'repeat(5, 1fr)'; // keep 5 cols
        // We can adjust the gap or item size if needed
    }

    let html = '';
    for (let i = 1; i <= 20; i++) {
        const isAvailable = availableSlotsArray.includes(i);
        const style = isPortrait ? 'aspect-ratio: 9/16; height: auto; min-height: 80px;' : 'aspect-ratio: 16/9;';
        html += `<div class="slot-item ${isAvailable ? '' : 'unavailable'}" 
                 style="${style}"
                 onclick="${isAvailable ? `toggleSlotSelection(${i}, this)` : ''}">
                 <div style="font-size: 0.65rem; opacity: 0.7;">Slot</div>
                 <div style="font-size: 1.1rem; font-weight: 800;">${i}</div>
                 </div>`;
    }
    grid.innerHTML = html;
    document.getElementById('buy-modal').classList.add('active');
}

function toggleSlotSelection(slotNum, element) {
    if (currentSelectedSlots.has(slotNum)) {
        currentSelectedSlots.delete(slotNum);
        element.classList.remove('selected');
    } else {
        currentSelectedSlots.add(slotNum);
        element.classList.add('selected');
    }
}

function closeModal(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    document.getElementById('buy-modal').classList.remove('active');
}

async function confirmPurchase() {
    if (currentSelectedSlots.size === 0) return showToast('Select at least one slot.', 'error');
    const displayId = document.getElementById('modal-display-id').value;
    const res = await safeFetch('/brandportal/api/slots/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayId: parseInt(displayId, 10), slot_numbers: Array.from(currentSelectedSlots) })
    });
    if (res && res.success) {
        closeModal();
        loadMarket();
        showToast('🚀 Campaign launched successfully!', 'success');
    }
}

// ─── REPORTS ───
// --- REPORTS UI HELPERS ---
window.toggleFilterDropdown = function(id) {
    document.getElementById(id).classList.toggle('active');
};

window.toggleAllFilters = function(type) {
    const isChecked = document.getElementById(`all-${type}s-check`).checked;
    const options = document.getElementById(`${type}-options`).querySelectorAll('input');
    options.forEach(opt => opt.checked = isChecked);
};

window.applyPoPFilters = function() {
    loadPoP();
    document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('active'));
};

let _popRawData = []; // Local cache for filtering

async function loadPoP() {
    const data = await safeFetch('/brandportal/api/proof-of-play');
    const tbody = document.querySelector('#pop-table tbody');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:4rem; color:var(--text-muted);">No playback logs available yet.</td></tr>';
        return;
    }

    _popRawData = data;

    // 1. Update Filter Options (Only if not already populated or if data changed)
    const screenOpts = document.getElementById('screen-options');
    const slotOpts = document.getElementById('slot-options');
    
    if (screenOpts.innerHTML === '') {
        const screens = [...new Set(data.map(r => r.screenName))].sort();
        screenOpts.innerHTML = screens.map(s => `<label><input type="checkbox" class="screen-check" value="${s}" checked> ${s}</label>`).join('');
    }
    
    if (slotOpts.innerHTML === '') {
        const slots = [...new Set(data.map(r => r.slotNumber))].sort((a,b) => a-b);
        slotOpts.innerHTML = slots.map(s => `<label><input type="checkbox" class="slot-check" value="${s}" checked> Slot ${s}</label>`).join('');
    }

    // 2. Apply Filters
    const selectedScreens = Array.from(document.querySelectorAll('.screen-check:checked')).map(cb => cb.value);
    const selectedSlots = Array.from(document.querySelectorAll('.slot-check:checked')).map(cb => cb.value);

    const filtered = data.filter(r => 
        selectedScreens.includes(r.screenName) && 
        selectedSlots.includes(String(r.slotNumber))
    );

    // 3. Update Labels
    document.getElementById('screen-filter-label').innerText = selectedScreens.length === 0 ? 'None' : (selectedScreens.length === screenOpts.querySelectorAll('input').length ? 'All Screens' : `${selectedScreens.length} Selected`);
    document.getElementById('slot-filter-label').innerText = selectedSlots.length === 0 ? 'None' : (selectedSlots.length === slotOpts.querySelectorAll('input').length ? 'All Slots' : `${selectedSlots.length} Selected`);

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:4rem; color:var(--text-muted);">No logs match your filters.</td></tr>';
        return;
    }

    filtered.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'pop-row';
        
        const tdName = document.createElement('td');
        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '600';
        nameDiv.style.color = 'var(--text-primary)';
        nameDiv.textContent = r.screenName || 'Display #' + r.displayId;
        tdName.appendChild(nameDiv);
        const adDiv = document.createElement('div');
        adDiv.style.fontSize = '0.75rem';
        adDiv.style.color = 'var(--accent)';
        adDiv.textContent = r.adName || 'Campaign Media';
        tdName.appendChild(adDiv);
        tr.appendChild(tdName);

        const tdSlot = document.createElement('td');
        const slotSpan = document.createElement('span');
        slotSpan.style.cssText = 'background:rgba(59,130,246,0.1); color:#3b82f6; font-weight:800; font-size:0.7rem; padding:2px 8px; border-radius:12px;';
        slotSpan.textContent = `SLOT ${r.slotNumber}`;
        tdSlot.appendChild(slotSpan);
        tr.appendChild(tdSlot);

        const tdLoc = document.createElement('td');
        tdLoc.style.color = 'var(--text-muted)';
        tdLoc.style.fontSize = '0.85rem';
        tdLoc.textContent = r.location || 'Central';
        tr.appendChild(tdLoc);

        const tdCount = document.createElement('td');
        const countSpan = document.createElement('span');
        countSpan.style.fontWeight = '700';
        countSpan.style.color = 'var(--text-primary)';
        countSpan.textContent = (r.count || 0).toLocaleString();
        tdCount.appendChild(countSpan);
        tr.appendChild(tdCount);

        const tdTotal = document.createElement('td');
        const totalSpan = document.createElement('span');
        totalSpan.style.fontWeight = '700';
        totalSpan.style.color = 'var(--text-primary)';
        totalSpan.textContent = (r.totalPlays || r.count || 0).toLocaleString();
        tdTotal.appendChild(totalSpan);
        tr.appendChild(tdTotal);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-glass';
        btn.style.padding = '6px 16px';
        btn.style.fontSize = '0.75rem';
        btn.innerHTML = 'View History';
        btn.onclick = () => showReportsDetail(r.mediaId, r.screenName, r.displayId, r.adName, r.slotNumber);
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
}

function showReportsList() {
    document.getElementById('reports-list-view').style.display = 'block';
    document.getElementById('reports-detail-view').style.display = 'none';
    document.getElementById('reports-nav').style.display = 'none';
    loadPoP();
}

async function showReportsDetail(mediaId, screenName, displayId, adName, slotNumber = 1) {
    document.getElementById('reports-list-view').style.display = 'none';
    document.getElementById('reports-detail-view').style.display = 'block';
    document.getElementById('reports-nav').style.display = 'block';
    document.getElementById('reports-nav-current').textContent = screenName;
    
    document.getElementById('report-media-name').textContent = adName || 'Campaign Media';
    document.getElementById('report-screen-id').textContent = `Slot ${slotNumber} · ${screenName} · Media ID: ${mediaId}`;
    
    // Reset View
    document.getElementById('report-total-plays').textContent = '...';
    document.getElementById('report-plays-24h').textContent = '...';
    document.getElementById('report-last-play').textContent = '...';
    document.getElementById('report-lastseen-wrap').innerHTML = '';
    document.getElementById('report-history-wrap').innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-muted);"><div class="loader-pulse"></div><p style="margin-top:1rem;">Fetching playback history...</p></div>';

    // Hook buttons
    document.getElementById('report-refresh-btn').onclick = () => showReportsDetail(mediaId, screenName, displayId, adName);
    document.getElementById('report-sync-btn').onclick = async () => {
        const btn = document.getElementById('report-sync-btn');
        btn.disabled = true; btn.textContent = 'Syncing...';
        try {
            await fetch(`/xibo/displays/${displayId}/sync`, { method: 'POST' });
            showToast('⚡ Sync requested. Data will refresh in 30-60s.', 'success');
            setTimeout(() => showReportsDetail(mediaId, screenName, displayId, adName), 30000);
        } catch (e) { showToast('Sync failed.', 'error'); }
        finally { btn.disabled = false; btn.textContent = '⚡ Force Sync All'; }
    };

    try {
        const res = await fetch(`/xibo/stats?mediaId=${mediaId}&displayId=${displayId}&t=${Date.now()}`);
        const data = await res.json();
        const history = data.history || [];
        
        // 1. Connectivity Badge
        if (data.lastCheckIn) {
            const checkInDate = new Date(data.lastCheckIn + ' UTC');
            const diffMins = Math.floor((Date.now() - checkInDate.getTime()) / 60000);
            const timeStr = diffMins < 1 ? 'just now' : diffMins + 'm ago';
            document.getElementById('report-lastseen-wrap').innerHTML = `<span class="badge-lastseen">● Player Last Seen: ${timeStr}</span>`;
        }

        // 2. Stats
        const now = Date.now();
        const last24h = history.filter(r => (now - new Date(r.time).getTime()) < 86400000).length;
        document.getElementById('report-total-plays').textContent = (data.playCount || 0).toLocaleString();
        document.getElementById('report-plays-24h').textContent = last24h.toLocaleString();
        
        if (history.length > 0) {
            const lastPlay = new Date(history[0].time);
            document.getElementById('report-last-play').textContent = lastPlay.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
            
            // Stale Check
            const hoursOld = (now - lastPlay.getTime()) / 3600000;
            if (hoursOld > 24) {
                const days = Math.floor(hoursOld / 24);
                document.getElementById('report-stale-notice').innerHTML = `
                    <div class="stale-banner">
                        <div>⚠️ <strong>Data is ${days} day${days>1?'s':''} out of date.</strong> Last verified play was on ${lastPlay.toLocaleDateString()}.</div>
                        <button type="button" class="btn btn-blue" style="background:#b91c1c; border:none; height:32px; font-size:0.75rem;" onclick="document.getElementById('report-sync-btn').click()">Fix Now</button>
                    </div>`;
            } else {
                document.getElementById('report-stale-notice').innerHTML = '';
            }
        }

        // 3. Table
        if (history.length === 0) {
            document.getElementById('report-history-wrap').innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-muted);">No verified plays found for this media.</div>';
        } else {
            let html = `<table class="pop-table">
                <thead><tr><th>Verification Time</th><th>Display</th><th>Slot</th><th>Location</th></tr></thead>
                <tbody>`;
            history.forEach(r => {
                const dt = new Date(r.time);
                const isLive = (now - dt.getTime()) < 300000;
                html += `<tr>
                    <td>${dt.toLocaleString()}${isLive ? '<span class="badge-live">LIVE</span>' : ''}</td>
                    <td style="font-weight:600;">${r.display || screenName}</td>
                    <td><span style="color:var(--accent); font-weight:700;">Slot ${r.slot || 1}</span></td>
                    <td style="color:var(--text-muted); font-size:0.8rem;">${r.location || 'Hyderabad'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            document.getElementById('report-history-wrap').innerHTML = html;
        }
    } catch (e) {
        document.getElementById('report-history-wrap').innerHTML = '<div style="padding:4rem; text-align:center; color:var(--danger);">Failed to load detailed report.</div>';
    }
}


// ─── BILLING ───
async function loadBilling() {
    const data = await safeFetch('/brandportal/api/invoices');
    const tbody = document.querySelector('#billing-table tbody');
    if (!tbody || !data) return;
    tbody.innerHTML = '';
    data.forEach(inv => {
        const tr = document.createElement('tr');
        
        const tdNum = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = `#${inv.invoice_number}`;
        tdNum.appendChild(strong);
        tr.appendChild(tdNum);

        const tdAmount = document.createElement('td');
        tdAmount.textContent = `$${inv.amount.toFixed(2)}`;
        tr.appendChild(tdAmount);

        const tdStatus = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'status-pill active';
        span.textContent = inv.status;
        tdStatus.appendChild(span);
        tr.appendChild(tdStatus);

        const tdDue = document.createElement('td');
        tdDue.textContent = inv.due_date || '-';
        tr.appendChild(tdDue);

        tbody.appendChild(tr);
    });
}

// ─── SUBSCRIPTION SUMMARY ───
async function loadSubscription() {
    const sub = await safeFetch('/brandportal/api/subscription');
    const loading = document.getElementById('sub-loading');
    const content = document.getElementById('sub-content');
    const empty = document.getElementById('sub-empty');
    if (!loading || !content || !empty) return;

    loading.style.display = 'none';

    if (!sub) {
        empty.style.display = 'block';
        return;
    }

    content.style.display = 'block';

    // Plan
    document.getElementById('sub-plan-name-display').textContent = sub.planName || '—';

    // Status Badge
    const statusColors = {
        Active: 'color:#166534;background:#dcfce7',
        Draft: 'color:#374151;background:#f3f4f6',
        'Awaiting Payment': 'color:#92400e;background:#fef3c7',
        Paused: 'color:#1e40af;background:#dbeafe',
        Expired: 'color:#991b1b;background:#fee2e2',
        Cancelled: 'color:#374151;background:#e5e7eb'
    };
    const badge = document.getElementById('sub-status-badge');
    badge.textContent = sub.status || '—';
    badge.style.cssText += ';' + (statusColors[sub.status] || 'color:#374151;background:#f3f4f6');

    // Dates
    document.getElementById('sub-dates-display').textContent = `${sub.startDate || '—'} to ${sub.endDate || '—'}`;
    document.getElementById('sub-days-display').textContent = sub.daysRemaining > 0 ? `${sub.daysRemaining} days remaining` : 'Expired';

    // Payment
    document.getElementById('sub-payment-display').textContent = sub.paymentStatus || '—';
    document.getElementById('sub-cities-display').textContent = sub.cities ? `Coverage: ${sub.cities}` : '';

    // Screen scope bar
    const screensEl = document.getElementById('sub-screens-used');
    const screensIncEl = document.getElementById('sub-screens-included');
    const screensBar = document.getElementById('sub-screens-bar');
    if (screensEl) screensEl.textContent = sub.screensUsed || 0;
    if (screensIncEl) screensIncEl.textContent = sub.screensIncluded || 0;
    if (screensBar && sub.screensIncluded > 0) {
        screensBar.style.width = Math.min(100, Math.round((sub.screensUsed / sub.screensIncluded) * 100)) + '%';
    }

    // Slot scope bar
    const slotsEl = document.getElementById('sub-slots-used');
    const slotsIncEl = document.getElementById('sub-slots-included');
    const slotsBar = document.getElementById('sub-slots-bar');
    if (slotsEl) slotsEl.textContent = sub.slotsUsed || 0;
    if (slotsIncEl) slotsIncEl.textContent = sub.slotsIncluded || 0;
    if (slotsBar && sub.slotsIncluded > 0) {
        slotsBar.style.width = Math.min(100, Math.round((sub.slotsUsed / sub.slotsIncluded) * 100)) + '%';
    }

    // Load Active Campaigns / Slots
    const campaignsContainer = document.getElementById('sub-active-slots-container');
    const campaignsBody = document.getElementById('sub-campaigns-body');
    if (campaignsContainer && campaignsBody) {
        const campaigns = await safeFetch('/brandportal/api/campaigns');
        if (campaigns && campaigns.length > 0) {
            campaignsContainer.style.display = 'block';
            campaignsBody.innerHTML = '';
            campaigns.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:600;">${c.name}</td>
                    <td>${c.screen} <span style="display:block;font-size:0.75rem;color:var(--text-muted);">${c.location}</span></td>
                    <td><div class="badge-lastseen" style="display:inline-block;">Slot ${c.slot}</div></td>
                    <td style="font-size:0.85rem;color:var(--text-muted);">${c.startDate} to ${c.endDate}</td>
                    <td style="font-weight:700;color:#3b82f6;">${c.plays > 0 ? c.plays + ' plays' : '-'}</td>
                    <td><span class="status-pill status-active" style="padding:2px 8px;font-size:0.7rem;font-weight:700;">${c.status}</span></td>
                `;
                campaignsBody.appendChild(tr);
            });
        } else {
            campaignsContainer.style.display = 'block';
            campaignsBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No active slot assignments found.</td></tr>`;
        }
    }
    // Renewal Warning
    const warnEl = document.getElementById('sub-renewal-warn');
    if (warnEl && sub) {
        if (sub.daysRemaining <= 30 && sub.daysRemaining > 0) {
            warnEl.style.display = 'block';
            warnEl.textContent = `⚠️ Your subscription expires in ${sub.daysRemaining} day${sub.daysRemaining === 1 ? '' : 's'}. Contact your account manager to renew.`;
        } else if (sub.daysRemaining === 0) {
            warnEl.style.display = 'block';
            warnEl.textContent = '🚫 Your subscription has expired. Contact your account manager to reactivate.';
        } else {
            warnEl.style.display = 'none';
        }
    }

    // Load Subscription History
    const historyBody = document.getElementById('sub-history-body');
    if (historyBody) {
        const history = await safeFetch('/brandportal/api/subscriptions/history');
        if (history && history.length > 0) {
            historyBody.innerHTML = '';
            history.forEach(h => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:600;">${h.planName}</td>
                    <td style="font-size:0.85rem;">${h.startDate} to ${h.endDate}</td>
                    <td style="font-size:0.85rem;color:var(--text-muted);">${h.screensIncluded} Screens / ${h.slotsIncluded} Slots</td>
                    <td><span style="font-size:0.75rem;font-weight:600;color:${h.paymentStatus === 'Paid' ? '#10b981' : '#f59e0b'};">${h.paymentStatus}</span></td>
                    <td><span class="status-pill ${h.status === 'Active' ? 'active' : 'offline'}" style="padding:2px 10px;font-size:0.7rem;">${h.status}</span></td>
                `;
                historyBody.appendChild(tr);
            });
        }
    }
}
async function loadCreatives() {
    const data = await safeFetch('/api/creative/list');
    const tbody = document.getElementById('creatives-table-body');
    if (!tbody) return;

    if (!data) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--danger);">Error loading library. Please refresh.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-muted);">No creatives found. Upload your first media!</td></tr>';
        return;
    }

    data.forEach(m => {
        const tr = document.createElement('tr');
        
        const tdPrev = document.createElement('td');
        const iconWrap = document.createElement('div');
        iconWrap.style.cssText = 'width:60px; height:45px; background:#f8fafc; border-radius:6px; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #e2e8f0;';
        
        if (m.thumbnailUrl) {
            const img = document.createElement('img');
            img.src = m.thumbnailUrl;
            img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            iconWrap.appendChild(img);
        } else {
            const i = document.createElement('i');
            const mediaType = m.mediaType || m.type || 'image';
            i.setAttribute('data-lucide', mediaType === 'video' ? 'film' : 'image');
            i.style.color = '#3b82f6';
            iconWrap.appendChild(i);
        }
        tdPrev.appendChild(iconWrap);
        tr.appendChild(tdPrev);

        const tdName = document.createElement('td');
        tdName.style.fontWeight = '600';
        tdName.textContent = m.name;
        tr.appendChild(tdName);

        const tdType = document.createElement('td');
        tdType.style.textTransform = 'capitalize';
        tdType.textContent = m.mediaType || m.type || 'image';
        tr.appendChild(tdType);

        const tdStatus = document.createElement('td');
        const status = m.status || 'Pending';
        const pill = document.createElement('span');
        pill.className = `status-pill ${status.toLowerCase()}`;
        pill.style.cssText = `
            font-size: 0.7rem; font-weight: 700; padding: 2px 10px; border-radius: 20px;
            text-transform: uppercase;
        `;
        
        if (status === 'Approved') {
            pill.style.background = 'rgba(34, 197, 94, 0.15)';
            pill.style.color = '#15803d';
        } else if (status === 'Rejected') {
            pill.style.background = 'rgba(239, 68, 68, 0.15)';
            pill.style.color = '#b91c1c';
        } else {
            pill.style.background = 'rgba(245, 158, 11, 0.15)';
            pill.style.color = '#b45309';
        }
        
        pill.textContent = status;
        tdStatus.appendChild(pill);
        if (status === 'Pending') {
            const tip = document.createElement('div');
            tip.style.fontSize = '0.65rem';
            tip.style.color = 'var(--text-muted)';
            tip.textContent = 'Under Admin Review';
            tdStatus.appendChild(tip);
        }
        tr.appendChild(tdStatus);

        const tdAssigned = document.createElement('td');
        const assignedSlots = m.assignedSlots || [];
        if (assignedSlots.length === 0) {
            const span = document.createElement('span');
            span.style.color = '#94a3b8';
            span.style.fontSize = '0.8rem';
            span.textContent = 'Unassigned';
            tdAssigned.appendChild(span);
        } else {
            assignedSlots.forEach(slotInfo => {
                const badge = document.createElement('div');
                badge.className = 'badge-lastseen';
                badge.style.display = 'inline-block';
                badge.style.margin = '2px';
                badge.style.background = 'rgba(59, 130, 246, 0.08)';
                badge.style.color = '#3b82f6';
                badge.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                badge.textContent = slotInfo;
                tdAssigned.appendChild(badge);
            });
        }
        tr.appendChild(tdAssigned);

        // ── PLAYS column ──
        const tdPlays = document.createElement('td');
        const plays = m.totalPlays || 0;
        tdPlays.style.fontWeight = '700';
        tdPlays.style.fontSize = '1rem';
        tdPlays.style.color = plays > 0 ? 'var(--text-primary)' : 'var(--text-muted)';
        tdPlays.textContent = plays.toLocaleString();
        tr.appendChild(tdPlays);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-glass';
        btn.style.padding = '5px 12px';
        btn.style.fontSize = '0.75rem';
        btn.textContent = 'Preview';
        btn.onclick = () => openCreativePreview(m);
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

async function loadAccount() {
    console.log('[Brand Portal] Loading account profile...');
    const brand = await safeFetch('/brandportal/api/profile');
    if (!brand) {
        console.error('[Brand Portal] Brand profile fetch failed');
        return;
    }
    if (brand.error) {
        console.error('[Brand Portal] API Error:', brand.error);
        return;
    }

    console.log('[Brand Portal] Brand data:', brand);

    // Update Company Name
    const nameInput = document.getElementById('acc-company-name');
    if (nameInput) {
        nameInput.value = brand.name || '';
        console.log('[Brand Portal] Updated company name to:', brand.name);
    }

    // Render Custom Attributes
    const panel = document.getElementById('custom-attributes-panel');
    const list = document.getElementById('custom-attributes-list');
    
    if (panel && list) {
        list.innerHTML = '';
        
        let customFieldsList = [];
        try {
            let parsed = brand.custom_fields;
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed); // Catch double stringification
            customFieldsList = parsed || [];
        } catch(e) {
            console.error('[Brand Portal] Failed to parse custom_fields:', e);
        }

        if (Array.isArray(customFieldsList) && customFieldsList.length > 0) {
            panel.style.display = 'block';
            customFieldsList.forEach(field => {
                if (field && field.key && field.value) {
                    const item = document.createElement('div');
                    item.className = 'form-group';
                    item.style.marginBottom = '0';
                    item.innerHTML = `
                        <label style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; font-weight:700;">${field.key}</label>
                        <div style="font-weight:600; font-size:1rem; padding: 10px 0; border-bottom:1px solid #f1f5f9;">${field.value}</div>
                    `;
                    list.appendChild(item);
                }
            });
            if (list.children.length === 0) panel.style.display = 'none';
        } else {
            panel.style.display = 'none';
        }
    }
}

function openCreativePreview(media) {
    const modal = document.getElementById('creative-preview-modal');
    const content = document.getElementById('preview-modal-content');
    document.getElementById('preview-modal-title').textContent = media.name;
    
    content.innerHTML = '';
    const mediaType = media.mediaType || media.type || 'image';
    
    if (media.previewUrl) {
        if (mediaType === 'video') {
            const video = document.createElement('video');
            video.src = media.previewUrl;
            video.controls = true;
            video.autoplay = true;
            video.style.cssText = 'max-width:100%; max-height:400px;';
            content.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = media.previewUrl;
            img.style.cssText = 'max-width:100%; max-height:400px; object-fit:contain;';
            content.appendChild(img);
        }
    } else {
        content.innerHTML = '<i data-lucide="image" size="48" style="color:#cbd5e1;"></i>';
        lucide.createIcons();
    }
    
    modal.classList.add('active');
}

async function uploadCreative(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const btn = document.querySelector('button[onclick*="upload-creative-input"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Uploading...';

    try {
        const res = await fetch('/api/creative/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Creative uploaded and sent for moderation!', 'success');
            loadCreatives();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (e) {
        showToast('Connection error during upload', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
        input.value = '';
    }
}
