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
            const empty = document.createElement('p');
            empty.style.color = 'var(--text-muted)';
            empty.style.fontSize = '0.85rem';
            empty.textContent = 'No recent activity.';
            activityList.appendChild(empty);
        }
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
    
    tbody.innerHTML = '';
    data.forEach(s => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => viewScreenDetail(s.displayId, s.name);
        
        const tdInfo = document.createElement('td');
        const infoWrap = document.createElement('div');
        infoWrap.style.display = 'flex';
        infoWrap.style.alignItems = 'center';
        infoWrap.style.gap = '12px';
        
        const iconWrap = document.createElement('div');
        iconWrap.style.width = '40px';
        iconWrap.style.height = '40px';
        iconWrap.style.borderRadius = '8px';
        iconWrap.style.background = '#f1f5f9';
        iconWrap.style.display = 'flex';
        iconWrap.style.alignItems = 'center';
        iconWrap.style.justifyContent = 'center';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'tv');
        icon.setAttribute('size', '18');
        icon.style.color = 'var(--text-muted)';
        iconWrap.appendChild(icon);
        infoWrap.appendChild(iconWrap);
        
        const textWrap = document.createElement('div');
        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '600';
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
        tdMobility.textContent = 'Mobility';
        tr.appendChild(tdMobility);

        const tdStatus = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'status-pill active';
        span.textContent = 'Active';
        tdStatus.appendChild(span);
        tr.appendChild(tdStatus);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-glass';
        btn.style.padding = '6px 12px';
        btn.style.fontSize = '0.75rem';
        btn.textContent = 'View';
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
async function loadPoP() {
    const data = await safeFetch('/brandportal/api/proof-of-play');
    const tbody = document.querySelector('#pop-table tbody');
    if (!tbody || !data) return;
    tbody.innerHTML = '';
    data.forEach(r => {
        const tr = document.createElement('tr');
        
        const tdName = document.createElement('td');
        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '600';
        nameDiv.textContent = r.screenName || 'Display #' + r.displayId;
        tdName.appendChild(nameDiv);
        const adDiv = document.createElement('div');
        adDiv.style.fontSize = '0.75rem';
        adDiv.style.color = 'var(--text-muted)';
        adDiv.textContent = r.adName || 'Campaign Media';
        tdName.appendChild(adDiv);
        tr.appendChild(tdName);

        const tdLoc = document.createElement('td');
        tdLoc.style.color = 'var(--text-muted)';
        tdLoc.style.fontSize = '0.85rem';
        tdLoc.textContent = 'Jubilee Hills';
        tr.appendChild(tdLoc);

        const tdCount = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = (r.count || 0).toLocaleString();
        tdCount.appendChild(strong);
        tr.appendChild(tdCount);

        const tdTotal = document.createElement('td');
        const strongTotal = document.createElement('strong');
        strongTotal.textContent = (r.count || 0).toLocaleString();
        tdTotal.appendChild(strongTotal);
        tr.appendChild(tdTotal);

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-glass';
        btn.style.padding = '6px 12px';
        btn.style.fontSize = '0.75rem';
        btn.textContent = 'View Playback';
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
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
