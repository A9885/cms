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

    // 2. Load Dashboard initially
    loadDashboard();

    // 3. Real-time Socket.io connection
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
 * Detects the active view and refreshes its data.
 * @param {boolean} background - If true, skip manual loading indicators.
 */
function refreshActiveView(background = false) {
    const activeNav = document.querySelector('.nav-item.active');
    const target = activeNav ? activeNav.getAttribute('data-target') : 'dashboard';
    
    if (target === 'dashboard') loadDashboard();
    else if (target === 'screens') loadScreens();
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
        return await res.json();
    } catch (e) {
        console.error('Fetch error:', e);
        return null;
    }
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

async function logout() {
    await safeFetch('/auth/logout', { method: 'POST' });
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
                meta.textContent = `${r.displayName || 'Screen'} • ${r.playedAt ? new Date(r.playedAt).toLocaleTimeString() : '-'}`;
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
    initDashboardMap(data.recentPoP || []);
}

async function initDashboardCharts(dashData) {
    const canvas = document.getElementById('performance-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Premium Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const dummyData = [3000, 4500, 3800, dashData.totalPlays || 8240]; 

    if (performanceChart) performanceChart.destroy();

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Plays',
                data: dummyData,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#3b82f6',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { display: false, beginAtZero: true },
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11, family: "'Inter', sans-serif" } } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    backgroundColor: '#0d121f', 
                    padding: 12, 
                    titleFont: { size: 13, weight: '600' }, 
                    bodyFont: { size: 13 },
                    cornerRadius: 8,
                    displayColors: false
                }
            }
        }
    });
}

function initDashboardMap(recentPoP) {
    if (!dashMap) {
        dashMap = L.map('screens-map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(dashMap);
    }
    dashMarkers.forEach(m => dashMap.removeLayer(m));
    dashMarkers = [];

    // Fetch live GPS locations from the backend
    fetch('/brandportal/api/screens/locations')
        .then(r => r.json())
        .then(locations => {
            const validSpots = locations.filter(s => s.lat && s.lng);
            if (validSpots.length === 0) {
                // fallback if no GPS data
                const fallback = L.circleMarker([17.3850, 78.4867], {
                    radius: 8, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 0.8
                }).bindTooltip('Hyderabad').addTo(dashMap);
                dashMarkers.push(fallback);
                dashMap.setView([17.3850, 78.4867], 11);
                return;
            }
            validSpots.forEach(spot => {
                const marker = L.circleMarker([spot.lat, spot.lng], {
                    radius: 9, fillColor: "#3b82f6", color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.85
                }).bindTooltip(`<b>${spot.name}</b><br>${spot.city || ''}<br>${spot.slots?.length || 0} slot(s)`, { permanent: false })
                  .addTo(dashMap);
                dashMarkers.push(marker);
            });

            const bounds = L.latLngBounds(validSpots.map(s => [s.lat, s.lng]));
            dashMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
        })
        .catch(() => {
            // Silently fallback if location API fails
        });
}


// ─── SCREENS ───
async function loadScreens() {
    const data = await safeFetch('/brandportal/api/screens');
    const pop = await safeFetch('/brandportal/api/proof-of-play');
    const tbody = document.querySelector('#my-screens-table tbody');
    if (!tbody || !data) return;
    
    // Calculate page-level KPIs dynamically
    const totalPlays = pop ? pop.reduce((sum, r) => sum + (r.totalPlays || r.count || 0), 0) : 0;
    const onlineCount = data.filter(s => s.status === 'online').length;
    
    document.getElementById('detail-total-plays').innerText = totalPlays.toLocaleString();
    const viewsBadge = document.getElementById('screen-detail-panel').querySelector('.activity-item:last-child span');
    if (viewsBadge) viewsBadge.innerText = `${totalPlays.toLocaleString()} Views Total`;

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">No screens assigned to your brand yet.</td></tr>';
        return;
    }

    data.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = 'screen-row';
        tr.onclick = () => viewScreenDetail(s.displayId, s.name);
        
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
        tdMobility.textContent = 'Fixed';
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
    
    if (data.length > 0) viewScreenDetail(data[0].displayId, data[0].name);
}

async function viewScreenDetail(displayId, name) {
    document.getElementById('detail-display-id').innerText = displayId;
    
    // Init map for details if not exists
    if (!detailMap) {
        detailMap = L.map('large-screens-map', { zoomControl: false }).setView([17.3850, 78.4867], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(detailMap);
    }
    detailMarkers.forEach(m => detailMap.removeLayer(m));
    detailMarkers = [];

    const marker = L.marker([17.3850, 78.4867]).addTo(detailMap);
    detailMarkers.push(marker);
    detailMap.setView([17.3850, 78.4867], 13);

    // Sparkline Chart
    const canvas = document.getElementById('sparkline-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (sparklineChart) sparklineChart.destroy();
    
    sparklineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['W1', 'W2', 'W3', 'W4'],
            datasets: [{
                data: [4000, 6000, 5500, 8240],
                borderColor: '#3b82f6',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { display: false } },
            plugins: { legend: { display: false } }
        }
    });
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
        btn.onclick = () => openBuyModal(screen.displayId, screen.name, screen.availableSlots);
        footer.appendChild(btn);
        
        panel.appendChild(footer);
        grid.appendChild(panel);
    });
    lucide.createIcons();
}

let currentSelectedSlots = new Set();
function openBuyModal(displayId, screenName, availableSlotsArray) {
    document.getElementById('modal-screen-name').innerText = screenName;
    document.getElementById('modal-display-id').value = displayId;
    currentSelectedSlots.clear();

    const grid = document.getElementById('modal-slots-grid');
    let html = '';
    for (let i = 1; i <= 20; i++) {
        const isAvailable = availableSlotsArray.includes(i);
        html += `<div class="slot-item ${isAvailable ? '' : 'unavailable'}" 
                 onclick="${isAvailable ? `toggleSlotSelection(${i}, this)` : ''}">
                 Slot ${i}
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

function closeModal() {
    document.getElementById('buy-modal').classList.remove('active');
}

async function confirmPurchase() {
    if (currentSelectedSlots.size === 0) return showToast('Select at least one slot.', 'error');
    const displayId = document.getElementById('modal-display-id').value;
    const res = await safeFetch('/brand/slots/assign', {
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
                        <button class="btn btn-blue" style="background:#b91c1c; border:none; height:32px; font-size:0.75rem;" onclick="document.getElementById('report-sync-btn').click()">Fix Now</button>
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
