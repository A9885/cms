let currentDisplayId = null;
const loader = document.getElementById('loader');
let activeSlotId = null;
let isReplaceMode = false;
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Manager UI Initialized');

    // Auth Check
    try {
        const authRes = await fetch('/auth/me');
        if (!authRes.ok) {
            window.location.href = '/admin/login.html';
            return;
        }
    } catch (e) {
        window.location.href = '/admin/login.html';
        return;
    }

    // Logout Handling
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.href = '/admin/login.html';
        });
    }

    initDisplays();

    // File Selection Handling
    const mInput = document.getElementById('media-input');
    if (mInput) {
        mInput.addEventListener('change', async (e) => {
            console.log('File selection changed:', e.target.files[0]?.name);
            if (!e.target.files[0] || !activeSlotId) return;
            const file = e.target.files[0];
            
            // Default 13 seconds as per requirements
            const duration = 13;
            console.log('Using default duration:', duration, 'isReplaceMode:', isReplaceMode);

            await uploadMedia(activeSlotId, file, duration, isReplaceMode);
            mInput.value = ''; // Reset
        });
    } else {
        console.error('Critical: media-input element not found on DOMContentLoaded!');
    }
});

function triggerUpload(slotId, isReplace = false) {
    console.log('triggerUpload called for slot:', slotId, 'replace mode:', isReplace);
    activeSlotId = slotId;
    isReplaceMode = isReplace;
    const mInput = document.getElementById('media-input');
    if (!mInput) {
        showToast('Error: Upload input not found. Please refresh.', 'error');
        return;
    }
    mInput.click();
}

function showToast(message, type = 'info') {
    const existing = document.getElementById('m-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'm-toast';
    toast.innerText = message;
    toast.style.cssText = `
        position:fixed; bottom:20px; right:20px; z-index:9999;
        background:${type === 'error' ? '#ef4444' : '#2563eb'};
        color:white; padding:12px 24px; border-radius:8px;
        box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); font-weight:500;
        animation: slideIn 0.3s ease;
    `;
    if (!document.getElementById('m-toast-anims')) {
        const style = document.createElement('style');
        style.id = 'm-toast-anims';
        style.innerHTML = '@keyframes slideIn { from { transform:translateX(100%); } to { transform:translateX(0); } }';
        document.head.appendChild(style);
    }
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:inherit;';
        const modal = document.createElement('div');
        modal.style.cssText = 'background:white; padding:24px; border-radius:12px; width:350px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);';
        
        const msg = document.createElement('div');
        msg.style.cssText = 'margin-bottom:24px; color:#1e293b; font-size:0.95rem; line-height:1.5;';
        msg.textContent = message;
        
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex; justify-content:flex-end; gap:12px;';
        
        const btnCancel = document.createElement('button');
        btnCancel.style.cssText = 'background:#f1f5f9; color:#475569; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:500;';
        btnCancel.textContent = 'Cancel';
        btnCancel.onclick = () => { overlay.remove(); resolve(false); };
        
        const btnConfirm = document.createElement('button');
        btnConfirm.style.cssText = 'background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600;';
        btnConfirm.textContent = 'Delete';
        btnConfirm.onclick = () => { overlay.remove(); resolve(true); };
        
        footer.append(btnCancel, btnConfirm);
        modal.append(msg, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}



async function initDisplays() {
    showLoader(true);
    const tabsContainer = document.getElementById('screen-tabs');
    tabsContainer.innerHTML = '';

    try {
        const resp = await fetch('/xibo/displays');
        const displays = await resp.json();

        if (displays.error) throw new Error(displays.error);
        if (displays.length === 0) {
            tabsContainer.innerHTML = '<div style="color: #64748b; padding: 1rem;">No displays found in Xibo.</div>';
            return;
        }

        displays.forEach((d, idx) => {
            const btn = document.createElement('button');
            btn.className = idx === 0 ? 'tab active' : 'tab';
            btn.textContent = d.name;
            btn.dataset.displayId = d.displayId;
            btn.dataset.displayGroupId = d.displayGroupId;
            btn.dataset.name = d.name;
            btn.dataset.status = d.isOnline ? 'Online' : 'Offline';

            btn.addEventListener('click', () => {
                document.querySelector('.tab.active')?.classList.remove('active');
                btn.classList.add('active');
                currentDisplayId = d.displayId;
                switchDisplay(d);
            });

            tabsContainer.appendChild(btn);
        });

        // Initialize with first display
        currentDisplayId = displays[0].displayId;
        switchDisplay(displays[0]);

    } catch (err) {
        console.error('Init failed:', err);
        if (err.message.includes('401')) {
            window.location.href = '/admin/login.html';
            return;
        }
        tabsContainer.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.style.color = 'red';
        errDiv.style.padding = '1rem';
        errDiv.textContent = `Setup Error: ${err.message}`;
        tabsContainer.appendChild(errDiv);
    } finally {
        showLoader(false);
    }
}

function switchDisplay(display) {
    document.getElementById('screen-location').textContent = display.name;
    const statusEl = document.getElementById('screen-status');
    statusEl.textContent = display.isOnline ? 'Online' : 'Offline';
    statusEl.className = display.isOnline ? 'status-online' : 'status-offline';
    document.getElementById('playlist-title').textContent = `${display.name} Playlist`;
    loadSlots(display.displayId);
}

// --- API Calls ---

async function loadSlots(displayId) {
    showLoader(true);
    const grid = document.getElementById('slot-grid');
    grid.innerHTML = '';
    
    try {
        const resp = await fetch(`/xibo/slots/display/${displayId}`);
        const data = await resp.json();
        
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data)) throw new Error('Invalid response from server: expected an array of slots.');

        data.forEach(slot => {
            const card = createSlotCard(slot);
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.style.gridColumn = 'span 5';
        errDiv.style.color = 'red';
        errDiv.style.padding = '2rem';
        errDiv.style.background = 'white';
        errDiv.style.borderRadius = '8px';
        errDiv.style.border = '1px solid #fee2e2';
        
        const strong = document.createElement('strong');
        strong.textContent = 'Error:';
        errDiv.appendChild(strong);
        errDiv.appendChild(document.createTextNode(` ${err.message}`));
        errDiv.appendChild(document.createElement('br'));
        errDiv.appendChild(document.createElement('br'));
        errDiv.appendChild(document.createTextNode('Please check if this display has a default layout with a valid playlist.'));
        
        grid.appendChild(errDiv);
    } finally {
        showLoader(false);
    }
}

async function uploadMedia(slotId, file, duration, replace = false) {
    showLoader(true);
    const btn = document.querySelector(`.tab.active`);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('displayId', currentDisplayId);
    if (btn) formData.append('displayGroupId', btn.dataset.displayGroupId);
    formData.append('slotId', slotId);
    formData.append('duration', duration);
    formData.append('replace', replace);

    try {
        const resp = await fetch('/xibo/slots/add', {
            method: 'POST',
            body: formData
        });
        const result = await resp.json();
        if (result.error) throw new Error(result.error);
        
        loadSlots(currentDisplayId);
    } catch (err) {
        showToast("Upload Failed: " + err.message, "error");
    } finally {
        showLoader(false);
    }
}

async function deleteMedia(widgetId, slotId) {
    if (!await showConfirm("Are you sure you want to delete this media?")) return;
    showLoader(true);
    try {
        const btn = document.querySelector(`.tab[data-display-id="${currentDisplayId}"]`);
        const displayGroupId = btn?.dataset.displayGroupId || currentDisplayId;
        const resp = await fetch(`/xibo/slots/media/${widgetId}?displayId=${currentDisplayId}&displayGroupId=${displayGroupId}&slotId=${slotId}`, { 
            method: 'DELETE' 
        });
        const result = await resp.json();
        if (result.error) throw new Error(result.error);
        loadSlots(currentDisplayId);
    } catch (err) {
        showToast("Delete Failed: " + err.message, "error");
    } finally {
        showLoader(false);
    }
}

// --- UI Helpers ---

function createSlotCard(slot) {
    const card = document.createElement('div');
    card.className = 'slot-card';

    const usedPct = Math.min((slot.totalDuration / 13) * 100, 100);
    const barColor = slot.totalDuration >= 13 ? '#ef4444' : (slot.totalDuration > 10 ? '#f59e0b' : '#3b82f6');

    // Header
    const header = document.createElement('div');
    header.className = 'slot-header';
    const title = document.createElement('span');
    title.textContent = `Slot ${slot.slot}`;
    header.appendChild(title);
    const badge = document.createElement('span');
    badge.className = 'duration-badge';
    badge.style.background = `${barColor}20`;
    badge.style.color = barColor;
    badge.textContent = `${slot.totalDuration}s / 13s`;
    header.appendChild(badge);
    card.appendChild(header);

    // Progress bar
    const barContainer = document.createElement('div');
    barContainer.style.height = '4px';
    barContainer.style.background = '#e2e8f0';
    barContainer.style.borderRadius = '2px';
    barContainer.style.overflow = 'hidden';
    const bar = document.createElement('div');
    bar.style.width = `${usedPct}%`;
    bar.style.height = '100%';
    bar.style.background = barColor;
    barContainer.appendChild(bar);
    card.appendChild(barContainer);

    // Preview
    const previewBox = document.createElement('div');
    previewBox.className = 'preview-box';
    if (slot.media.length > 0) {
        const m = slot.media[0];
        const isVideo = m.name?.toLowerCase().endsWith('.mp4');
        if (isVideo) {
            const playIcon = document.createElement('div');
            playIcon.style.color = '#64748b';
            playIcon.style.fontSize = '2rem';
            playIcon.textContent = '▶';
            previewBox.appendChild(playIcon);
        } else {
            const img = document.createElement('img');
            img.src = m.thumbnail;
            img.alt = 'preview';
            previewBox.appendChild(img);
        }
        const overlay = document.createElement('div');
        overlay.className = 'media-overlay';
        overlay.textContent = m.name.length > 20 ? m.name.substring(0, 17) + '...' : m.name;
        previewBox.appendChild(overlay);
    } else {
        previewBox.style.borderStyle = 'dashed';
        const emptyText = document.createElement('span');
        emptyText.style.color = '#cbd5e1';
        emptyText.style.fontSize = '0.8rem';
        emptyText.style.fontWeight = '500';
        emptyText.textContent = 'Empty Slot';
        previewBox.appendChild(emptyText);
    }
    card.appendChild(previewBox);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'slot-actions';
    if (slot.totalDuration < 13) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-primary btn-full';
        addBtn.textContent = '+ Add Slide';
        addBtn.onclick = () => triggerUpload(slot.slot);
        actions.appendChild(addBtn);
    }
    if (slot.media.length > 0) {
        const replaceBtn = document.createElement('button');
        replaceBtn.className = 'btn btn-replace';
        replaceBtn.textContent = 'Replace';
        replaceBtn.onclick = () => triggerUpload(slot.slot, true);
        actions.appendChild(replaceBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteMedia(slot.media[0].widgetId, slot.slot);
        actions.appendChild(deleteBtn);
    }
    card.appendChild(actions);

    return card;
}

function showLoader(show) {
    loader.style.display = show ? 'flex' : 'none';
}

