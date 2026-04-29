let currentDisplayId = null;
const loader = document.getElementById('loader');
let activeSlotId = null;
let isReplaceMode = false;
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Manager UI Initialized');
    initManager();

    // Logout Handling
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.href = '/admin/login.html';
        });
    }

    // File Selection Handling
    const mInput = document.getElementById('media-input');
    if (mInput) {
        mInput.addEventListener('change', async (e) => {
            console.log('File selection changed:', e.target.files[0]?.name);
            if (!e.target.files[0] || !activeSlotId) return;
            const file = e.target.files[0];
            const duration = 13;
            await uploadMedia(activeSlotId, file, duration, isReplaceMode);
            mInput.value = ''; // Reset
        });
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

async function initManager() {
    showLoader(true);
    const tabsContainer = document.getElementById('screen-tabs');
    tabsContainer.innerHTML = '';

    try {
        // ULTIMATE OPTIMIZATION: Fetch everything in one go
        const resp = await fetch('/api/manager/init');
        if (!resp.ok) {
            if (resp.status === 401) window.location.href = '/admin/login.html';
            throw new Error(`Init failed: ${resp.status}`);
        }
        
        const data = await resp.json();
        const { displays, initialSlots } = data;

        if (displays.length === 0) {
            tabsContainer.innerHTML = '<div style="color: #64748b; padding: 1rem;">No displays found in Xibo.</div>';
            return;
        }

        // 1. Render Tabs
        displays.forEach((d, idx) => {
            const btn = document.createElement('button');
            btn.className = idx === 0 ? 'tab active' : 'tab';
            btn.textContent = d.name;
            btn.dataset.displayId = d.displayId;
            btn.dataset.displayGroupId = d.displayGroupId;

            btn.addEventListener('click', () => {
                if (currentDisplayId === d.displayId) return;
                document.querySelector('.tab.active')?.classList.remove('active');
                btn.classList.add('active');
                currentDisplayId = d.displayId;
                switchDisplay(d);
            });

            tabsContainer.appendChild(btn);
        });

        // 2. Render Initial State (First Display)
        const first = displays[0];
        currentDisplayId = first.displayId;
        
        document.getElementById('screen-location').textContent = first.name;
        const statusEl = document.getElementById('screen-status');
        statusEl.textContent = first.isOnline ? 'Online' : 'Offline';
        statusEl.className = first.isOnline ? 'status-online' : 'status-offline';
        document.getElementById('playlist-title').textContent = `${first.name} Playlist`;

        // 3. Render Slots (Pre-fetched!)
        renderSlots(initialSlots);

    } catch (err) {
        console.error('Init failed:', err);
        tabsContainer.innerHTML = `<div style="color:red; padding:1rem;">Setup Error: ${err.message}</div>`;
    } finally {
        showLoader(false);
    }
}

function renderSlots(slots) {
    const grid = document.getElementById('slot-grid');
    grid.innerHTML = '';
    
    if (!slots || slots.length === 0) {
        grid.innerHTML = '<div style="grid-column: span 5; padding: 2rem; background: white; border-radius: 8px; text-align: center; color: #64748b;">No slots found for this screen.</div>';
        return;
    }

    slots.forEach(slot => {
        const card = createSlotCard(slot);
        grid.appendChild(card);
    });
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

        // If upload returned a mediaId, prompt to link it to a brand
        if (result.autoLinkedBrandId) {
            showToast(`Media automatically linked to Assigned Brand!`, 'success');
        } else if (result.mediaId) {
            openLinkModal(result.mediaId, slotId);
        }

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

    if (slot.lockedBrandName) {
        const lockBadge = document.createElement('div');
        lockBadge.className = 'locked-badge';
        lockBadge.innerHTML = `🔒 Locked to: ${slot.lockedBrandName}`;
        card.appendChild(lockBadge);
    }

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
        // Create a flex container for the two Add options
        const addContainer = document.createElement('div');
        addContainer.className = 'btn-full';
        addContainer.style.cssText = 'display:flex; gap:0.5rem;';

        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'btn btn-primary';
        uploadBtn.style.flex = '1';
        uploadBtn.textContent = '+ Upload';
        uploadBtn.onclick = () => triggerUpload(slot.slot);

        const brandBtn = document.createElement('button');
        brandBtn.className = 'btn btn-replace';
        brandBtn.style.flex = '1';
        brandBtn.textContent = 'From Brand';
        brandBtn.onclick = () => openBrandModal(slot);

        addContainer.appendChild(uploadBtn);
        addContainer.appendChild(brandBtn);
        actions.appendChild(addContainer);
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

// --- Brand & Creative Modal Logic ---

let assignSlotId = null;
let brandCreatives = [];

async function openBrandModal(slot) {
    assignSlotId = slot.slot;
    document.getElementById('brand-assign-modal').style.display = 'flex';
    
    // Reset form
    const brandSelect = document.getElementById('brand-select');
    const creativeSelect = document.getElementById('creative-select');
    creativeSelect.disabled = true;
    creativeSelect.innerHTML = '<option value="">-- Select Brand first --</option>';
    document.getElementById('creative-preview-img').style.display = 'none';
    document.getElementById('preview-placeholder').style.display = 'inline';
    
    // Fetch Brands
    try {
        const res = await fetch('/admin/api/brands');
        const brands = await res.json();
        brandSelect.innerHTML = '<option value="">-- Choose a Brand --</option>';
        brands.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            brandSelect.appendChild(opt);
        });

        if (slot.lockedBrandId) {
            brandSelect.value = slot.lockedBrandId;
            brandSelect.disabled = true; // Lock dropdown
            brandSelect.dispatchEvent(new Event('change')); // Auto fetch creatives
        } else {
            brandSelect.disabled = false;
        }

    } catch (err) {
        console.error('Failed to load brands:', err);
        showToast('Could not load brands', 'error');
    }
}

function closeBrandModal(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    document.getElementById('brand-assign-modal').style.display = 'none';
    assignSlotId = null;
}

// Handle Brand Selection
document.getElementById('brand-select')?.addEventListener('change', async (e) => {
    const brandId = e.target.value;
    const creativeSelect = document.getElementById('creative-select');
    
    if (!brandId) {
        creativeSelect.disabled = true;
        creativeSelect.innerHTML = '<option value="">-- Select Brand first --</option>';
        document.getElementById('creative-preview-img').style.display = 'none';
        document.getElementById('preview-placeholder').style.display = 'inline';
        return;
    }

    try {
        creativeSelect.disabled = true;
        creativeSelect.innerHTML = '<option value="">Loading...</option>';
        const res = await fetch(`/admin/api/brands/${brandId}/creatives`);
        brandCreatives = await res.json();

        creativeSelect.innerHTML = '<option value="">-- Choose an Option --</option>';
        brandCreatives.forEach(c => {
            // Strict moderation: Only show Approved or Active creatives in the manager
            if (c.status === 'Approved' || c.status === 'Active') {
                const opt = document.createElement('option');
                opt.value = c.mediaId;
                opt.textContent = c.name;
                creativeSelect.appendChild(opt);
            }
        });
        creativeSelect.disabled = false;
    } catch (err) {
        console.error('Failed to load creatives:', err);
        creativeSelect.innerHTML = '<option value="">Error loading creatives</option>';
    }
});

// Handle Creative Selection & Preview Fetch
document.getElementById('creative-select')?.addEventListener('change', (e) => {
    const mediaId = e.target.value;
    const previewImg = document.getElementById('creative-preview-img');
    const placeholder = document.getElementById('preview-placeholder');

    if (!mediaId) {
        previewImg.style.display = 'none';
        placeholder.style.display = 'inline';
        return;
    }

    const creative = brandCreatives.find(c => String(c.mediaId) === String(mediaId));
    // Use the new server-side proxy for previews to avoid auth issues if possible
    const thumbUrl = creative ? `/xibo/library/download/${mediaId}?thumbnail=1` : null;
    
    if (thumbUrl) {
        previewImg.src = thumbUrl;
        previewImg.style.display = 'inline';
        placeholder.style.display = 'none';
    } else {
        previewImg.src = `/xibo/proxy/thumbnail/${mediaId}`; // Fallback route
        previewImg.style.display = 'inline';
        placeholder.style.display = 'none';
    }
});

// Submit Assignment
document.getElementById('submit-assign-btn')?.addEventListener('click', async () => {
    const mediaId = document.getElementById('creative-select').value;
    const brandId = document.getElementById('brand-select').value;
    
    if (!mediaId || !brandId) {
        showToast('Please select a Brand and Creative option.', 'error');
        return;
    }

    showLoader(true);

    const btn = document.querySelector(`.tab.active`);
    const displayGroupId = btn ? btn.dataset.displayGroupId : null;

    try {
        const resp = await fetch('/xibo/slots/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                displayId: currentDisplayId,
                displayGroupId: displayGroupId,
                slotId: assignSlotId,
                mediaId: mediaId,
                brandId: brandId,
                duration: 13,
                replace: false
            })
        });

        const result = await resp.json();
        if (result.error) throw new Error(result.error);
        
        loadSlots(currentDisplayId);
        showToast('Creative assigned successfully!');
    } catch (err) {
        showToast("Assignment Failed: " + err.message, "error");
    } finally {
        showLoader(false);
        closeBrandModal();
    }
});

// --- Brand Link Post-Upload Modal Logic ---
let uploadedMediaIdToLink = null;
let uploadedSlotIdToLink = null;

async function openLinkModal(mediaId, slotId) {
    uploadedMediaIdToLink = mediaId;
    uploadedSlotIdToLink = slotId;
    document.getElementById('brand-link-modal').style.display = 'flex';
    
    // Fetch Brands for linking
    try {
        const res = await fetch('/admin/api/brands');
        const brands = await res.json();
        const brandSelect = document.getElementById('link-brand-select');
        brandSelect.innerHTML = '<option value="">-- Optional: Assign to Brand --</option>';
        brands.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            brandSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load brands for linking:', err);
    }
}

function closeLinkModal(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    document.getElementById('brand-link-modal').style.display = 'none';
    uploadedMediaIdToLink = null;
}

document.getElementById('submit-link-btn')?.addEventListener('click', async () => {
    const brandId = document.getElementById('link-brand-select').value;
    if (!brandId) {
        closeLinkModal();
        return; // Skip if no brand selected
    }

    try {
        showLoader(true);
        const resp = await fetch('/admin/api/media/link-brand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mediaId: uploadedMediaIdToLink, 
                brandId,
                displayId: currentDisplayId,    // Native mapping anchor
                slotId: uploadedSlotIdToLink    // Natively binds slot structure lock
            })
        });
        const result = await resp.json();
        if (result.error) throw new Error(result.error);
        
        loadSlots(currentDisplayId); // Refresh to display the lock badge
        showToast('Media linked to brand successfully!');
    } catch (err) {
        showToast("Link Failed: " + err.message, "error");
    } finally {
        showLoader(false);
        closeLinkModal();
    }
});

