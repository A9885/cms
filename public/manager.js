let currentDisplayId = null;
const loader = document.getElementById('loader');
let activeSlotId = null;
let isReplaceMode = false;
// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('Manager UI Initialized');
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
        alert('Error: Upload input not found. Please refresh.');
        return;
    }
    mInput.click();
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
        tabsContainer.innerHTML = `<div style="color: red; padding: 1rem;">Setup Error: ${err.message}</div>`;
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
        grid.innerHTML = `<div style="grid-column: span 5; color: red; padding: 2rem; background: white; border-radius: 8px; border: 1px solid #fee2e2;">
            <strong>Error:</strong> ${err.message}<br><br>
            Please check if this display has a default layout with a valid playlist.
        </div>`;
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
        alert("Upload Failed: " + err.message);
    } finally {
        showLoader(false);
    }
}

async function deleteMedia(widgetId, slotId) {
    if (!confirm("Are you sure you want to delete this media?")) return;
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
        alert("Delete Failed: " + err.message);
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

    const header = `
        <div class="slot-header">
            <span>Slot ${slot.slot}</span>
            <span class="duration-badge" style="background: ${barColor}20; color: ${barColor}">${slot.totalDuration}s / 13s</span>
        </div>
        <div style="height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
            <div style="width: ${usedPct}%; height: 100%; background: ${barColor};"></div>
        </div>
    `;

    let previewHtml = '';
    if (slot.media.length > 0) {
        const m = slot.media[0];
        const isVideo = m.name?.toLowerCase().endsWith('.mp4');
        previewHtml = `
            <div class="preview-box">
                ${isVideo ? '<div style="color:#64748b; font-size: 2rem;">▶</div>' : `<img src="${m.thumbnail}" alt="preview">`}
                <div class="media-overlay">${m.name.length > 20 ? m.name.substring(0, 17) + '...' : m.name}</div>
            </div>
        `;
    } else {
        previewHtml = `
            <div class="preview-box" style="border-style: dashed;">
                <span style="color: #cbd5e1; font-size: 0.8rem; font-weight: 500;">Empty Slot</span>
            </div>
        `;
    }

    const actions = `
        <div class="slot-actions">
            ${slot.totalDuration < 13 ? `<button class="btn btn-primary btn-full" onclick="triggerUpload(${slot.slot})">+ Add Slide</button>` : ''}
            ${slot.media.length > 0 ? `
                <button class="btn btn-replace" onclick="triggerUpload(${slot.slot}, true)">Replace</button>
                <button class="btn btn-delete" onclick="deleteMedia(${slot.media[0].widgetId}, ${slot.slot})">Delete</button>
            ` : ''}
        </div>
    `;

    card.innerHTML = header + previewHtml + actions;
    return card;
}

function showLoader(show) {
    loader.style.display = show ? 'flex' : 'none';
}

