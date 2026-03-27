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
            const activeNav = document.querySelector('.nav-item.active');
            const activeView = activeNav ? activeNav.getAttribute('data-target') : 'dashboard';
            if (activeView === 'dashboard') loadDashboard();
            else if (activeView === 'screens') loadScreens();
            else if (activeView === 'market') loadMarket();
        });
    }
});


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
        font-size:0.875rem; font-weight:500; box-shadow:0 4px 20px rgba(0,0,0,0.3);
        animation:slideInRight 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

async function logout() {
    await safeFetch('/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login.html';
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
        const pop = data.recentPoP || [];
        activityList.innerHTML = pop.length > 0
            ? pop.map(r => `
                <div class="activity-item">
                    <div class="activity-icon"><i data-lucide="play" size="16"></i></div>
                    <div style="flex:1;">
                        <div style="font-size:0.85rem; font-weight:600;">${r.adName || 'Ad played'}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${r.displayName || 'Screen'} • ${r.playedAt ? new Date(r.playedAt).toLocaleTimeString() : '-'}</div>
                    </div>
                    <div style="font-size:0.8rem; font-weight:700; color:var(--success);">+${r.count || 1}</div>
                </div>`).join('')
            : '<p style="color:var(--text-muted); font-size:0.85rem;">No recent activity.</p>';
        lucide.createIcons();
    }

    initDashboardCharts();
    initDashboardMap(data.recentPoP || []);
}

async function initDashboardCharts() {
    const canvas = document.getElementById('performance-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Premium Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const dummyData = [3000, 4500, 3800, 8240]; // Custom match to reference image

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
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#0d121f', padding: 10, titleFont: { size: 12 }, bodyFont: { size: 12 } }
            }
        }
    });
}

function initDashboardMap(recentPoP) {
    if (!dashMap) {
        dashMap = L.map('screens-map', { zoomControl: false }).setView([20, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(dashMap);
    }
    dashMarkers.forEach(m => dashMap.removeLayer(m));
    dashMarkers = [];

    // For demo, we'll just pick some random-ish spots if no real data
    const mockSpots = [
        { lat: 17.3850, lng: 78.4867, name: "Hyderabad Central" },
        { lat: 17.4483, lng: 78.3915, name: "Hitech City" }
    ];

    mockSpots.forEach(spot => {
        const marker = L.circleMarker([spot.lat, spot.lng], {
            radius: 8, fillColor: "#3b82f6", color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8
        }).addTo(dashMap);
        dashMarkers.push(marker);
    });

    if (mockSpots.length > 0) {
        const bounds = L.latLngBounds(mockSpots.map(s => [s.lat, s.lng]));
        dashMap.fitBounds(bounds, { padding: [20, 20] });
    }
}


// ─── SCREENS ───
async function loadScreens() {
    const data = await safeFetch('/brandportal/api/screens');
    const tbody = document.querySelector('#my-screens-table tbody');
    if (!tbody || !data) return;
    
    tbody.innerHTML = data.map(s => `
        <tr onclick="viewScreenDetail(${s.displayId}, '${s.name.replace(/'/g, "\\'")}')" style="cursor:pointer;">
            <td>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; border-radius:8px; background:#f1f5f9; display:flex; align-items:center; justify-content:center;">
                        <i data-lucide="tv" size="18" style="color:var(--text-muted);"></i>
                    </div>
                    <div>
                        <div style="font-weight:600;">${s.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${s.address || 'Location'}</div>
                    </div>
                </div>
            </td>
            <td style="color:var(--text-muted); font-size:0.85rem;">${s.city || '-'}</td>
            <td style="color:var(--text-muted); font-size:0.85rem;">Mobility</td>
            <td><span class="status-pill active">Active</span></td>
            <td><button class="btn btn-glass" style="padding:6px 12px; font-size:0.75rem;">View</button></td>
        </tr>
    `).join('');
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

    grid.innerHTML = data.map(screen => `
        <div class="glass-panel" style="margin-bottom:0;">
            <div style="font-weight:700; font-size:1.1rem; margin-bottom:4px;">${screen.name}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1.5rem;"><i data-lucide="map-pin" size="14"></i> ${screen.city || 'Unknown'}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:0.85rem; font-weight:600; color:var(--accent);">${screen.availableSlots.length} Slots Available</div>
                <button class="btn btn-blue" style="padding:8px 14px; font-size:0.8rem;" onclick="openBuyModal(${screen.displayId}, '${screen.name.replace(/'/g, "\\'")}', [${screen.availableSlots}])">Select</button>
            </div>
        </div>
    `).join('');
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
    if (currentSelectedSlots.size === 0) return alert('Select at least one slot.');
    const displayId = document.getElementById('modal-display-id').value;
    const res = await safeFetch('/brandportal/api/slots/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayId: parseInt(displayId), slot_numbers: Array.from(currentSelectedSlots) })
    });
    if (res && res.success) {
        closeModal();
        loadMarket();
        showToast('🚀 Campaign launched successfully!', 'success');
    }
}

// ─── REPORTS ───
async function loadPoP() {
    const data = await safeFetch('/brandportal/api/proof-of-play');
    const tbody = document.querySelector('#pop-table tbody');
    if (!tbody || !data) return;
    tbody.innerHTML = data.map(r => `
        <tr>
            <td>
                <div style="font-weight:600;">${r.screenName || 'Display #' + r.displayId}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${r.adName || 'Campaign Media'}</div>
            </td>
            <td style="color:var(--text-muted); font-size:0.85rem;">Jubilee Hills</td>
            <td><strong>${(r.count || 0).toLocaleString()}</strong></td>
            <td><strong>${(r.count || 0).toLocaleString()}</strong></td>
            <td><button class="btn btn-glass" style="padding:6px 12px; font-size:0.75rem;">View Playback</button></td>
        </tr>
    `).join('');
}

// ─── BILLING ───
async function loadBilling() {
    const data = await safeFetch('/brandportal/api/invoices');
    const tbody = document.querySelector('#billing-table tbody');
    if (!tbody || !data) return;
    tbody.innerHTML = data.map(inv => `
        <tr>
            <td><strong>#${inv.invoice_number}</strong></td>
            <td>$${inv.amount.toFixed(2)}</td>
            <td><span class="status-pill active">${inv.status}</span></td>
            <td>${inv.due_date || '-'}</td>
        </tr>
    `).join('');
}
