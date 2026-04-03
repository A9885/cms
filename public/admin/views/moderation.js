App.registerView('moderation', {
    render() {
        return `
            <div class="page-title">Content Moderation</div>
            <div class="card">
                <div class="table-header">
                    <h3 style="font-size: 1rem; font-weight: 600;">Pending Creative Approvals</h3>
                    <div style="display: flex; gap: 10px;">
                        <span id="pending-count-badge" class="badge-lastseen" style="background: var(--accent); color: white; display: none;">0 Pending</span>
                        <button class="btn btn-secondary" onclick="Views.moderation.loadPending()"><i data-lucide="refresh-cw" style="width: 14px;"></i> Refresh Queue</button>
                    </div>
                </div>
                <div class="table-wrap" style="border: none; border-radius: 0;">
                    <table>
                        <thead>
                            <tr>
                                <th>Creative Preview</th>
                                <th>Brand / Company</th>
                                <th>Upload Date</th>
                                <th style="text-align: right;">Moderation Actions</th>
                            </tr>
                        </thead>
                        <tbody id="moderation-table-body">
                            <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 40px;">Fetching moderation queue...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Preview & Moderation Modal -->
            <div class="modal-overlay" id="moderation-modal">
                <div class="modal" style="width: 600px;">
                    <div class="modal-header">
                        <div class="modal-title" id="mod-modal-title">Review Creative</div>
                        <button class="modal-close" onclick="Views.moderation.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <div id="mod-modal-preview" style="background: #000; min-height: 300px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-bottom: 20px;">
                            <!-- Preview injected here -->
                        </div>
                        <div style="text-align: left; background: var(--bg-body); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <strong style="font-size: 0.9rem;">Brand:</strong>
                                <span id="mod-modal-brand" style="font-size: 0.9rem;">-</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <strong style="font-size: 0.9rem;">Media ID:</strong>
                                <span id="mod-modal-media-id" style="font-size: 0.9rem;">-</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <strong style="font-size: 0.9rem;">File Type:</strong>
                                <span id="mod-modal-type" style="font-size: 0.9rem;">-</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding-top: 10px;">
                        <div style="display: flex; gap: 10px; width: 100%;">
                            <button class="btn btn-secondary" onclick="Views.moderation.closeModal()" style="flex: 1;">Cancel</button>
                            <button class="btn btn-danger" id="mod-btn-reject" style="flex: 1; background: #ef4444;">Reject Content</button>
                            <button class="btn btn-primary" id="mod-btn-approve" style="flex: 1; background: #22c55e; border-color: #22c55e;">Approve Now</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container) {
        window.Views = window.Views || {};
        window.Views.moderation = this;
        await this.loadPending();
        lucide.createIcons();
    },

    async loadPending() {
        const tbody = document.getElementById('moderation-table-body');
        if (!tbody) return;

        try {
            const data = await Api.get('/admin/creatives/pending');
            tbody.innerHTML = '';

            if (data && data.length > 0) {
                const badge = document.getElementById('pending-count-badge');
                if (badge) {
                    badge.innerText = `${data.length} Pending`;
                    badge.style.display = 'inline-block';
                }

                data.forEach(item => {
                    const tr = document.createElement('tr');
                    
                    const tdPreview = document.createElement('td');
                    const wrap = document.createElement('div');
                    wrap.style.display = 'flex';
                    wrap.style.alignItems = 'center';
                    wrap.style.gap = '12px';
                    
                    const iconBox = document.createElement('div');
                    iconBox.style.width = '50px';
                    iconBox.style.height = '35px';
                    iconBox.style.background = 'rgba(59, 130, 246, 0.1)';
                    iconBox.style.borderRadius = '6px';
                    iconBox.style.display = 'flex';
                    iconBox.style.alignItems = 'center';
                    iconBox.style.justifyContent = 'center';
                    const i = document.createElement('i');
                    i.setAttribute('data-lucide', item.mediaType === 'video' ? 'film' : 'image');
                    i.style.color = '#3b82f6';
                    i.style.width = '18px';
                    iconBox.appendChild(i);
                    wrap.appendChild(iconBox);
                    
                    const nameText = document.createElement('div');
                    nameText.style.fontWeight = '600';
                    nameText.textContent = item.name || 'Untitled Content';
                    wrap.appendChild(nameText);
                    tdPreview.appendChild(wrap);
                    tr.appendChild(tdPreview);

                    const tdBrand = document.createElement('td');
                    tdBrand.style.fontWeight = '500';
                    tdBrand.textContent = item.brand_name || 'System';
                    tr.appendChild(tdBrand);

                    const tdDate = document.createElement('td');
                    tdDate.style.color = 'var(--text-muted)';
                    tdDate.style.fontSize = '0.85rem';
                    tdDate.textContent = item.moderated_at ? new Date(item.moderated_at).toLocaleDateString() : 'Just Now';
                    tr.appendChild(tdDate);

                    const tdActions = document.createElement('td');
                    tdActions.style.textAlign = 'right';
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-primary';
                    btn.style.padding = '6px 16px';
                    btn.style.fontSize = '0.8rem';
                    btn.textContent = 'Review & Moderate';
                    btn.onclick = () => this.openModerationModal(item);
                    tdActions.appendChild(btn);
                    tr.appendChild(tdActions);

                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 50px;">☕ All clear! No creatives pending moderation.</td></tr>';
                const badge = document.getElementById('pending-count-badge');
                if (badge) badge.style.display = 'none';
            }
            lucide.createIcons();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444; padding: 40px;">Failed to load moderation queue.</td></tr>';
        }
    },

    openModerationModal(media) {
        const modal = document.getElementById('moderation-modal');
        const preview = document.getElementById('mod-modal-preview');
        
        document.getElementById('mod-modal-title').innerText = `Review: ${media.name}`;
        document.getElementById('mod-modal-brand').innerText = media.brand_name;
        document.getElementById('mod-modal-media-id').innerText = media.mediaId;
        document.getElementById('mod-modal-type').innerText = media.mediaType.toUpperCase();

        preview.innerHTML = '';
        const i = document.createElement('i');
        i.setAttribute('data-lucide', media.mediaType === 'video' ? 'film' : 'image');
        i.style.width = '64px';
        i.style.height = '64px';
        i.style.color = '#3b82f6';
        preview.appendChild(i);
        lucide.createIcons();

        document.getElementById('mod-btn-approve').onclick = () => this.moderate(media.mediaId, 'approve');
        document.getElementById('mod-btn-reject').onclick = () => this.moderate(media.mediaId, 'reject');

        modal.classList.add('active');
    },

    async moderate(mediaId, action) {
        const btn = document.getElementById(`mod-btn-${action}`);
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'Processing...';

        try {
            const res = await fetch(`/api/admin/creatives/${mediaId}/${action}`, { method: 'PATCH' });
            const data = await res.json();
            if (data.success) {
                App.showToast(`Content ${action === 'approve' ? 'Approved' : 'Rejected'}`, 'success');
                this.closeModal();
                this.loadPending();
            } else {
                App.showToast(data.error || 'Moderation failed', 'error');
            }
        } catch (e) {
            App.showToast('Network error during moderation', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    },

    closeModal() {
        document.getElementById('moderation-modal').classList.remove('active');
    }
});
