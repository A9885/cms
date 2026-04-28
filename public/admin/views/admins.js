App.registerView('admins', {
    admins: [],

    async mount() {
        window.Views = window.Views || {};
        window.Views.admins = this;
        await this.loadAdmins();
    },

    async loadAdmins() {
        try {
            const data = await Api.get('/users');
            if (data.error) throw new Error(data.error);
            // Filter to only show Admin and SuperAdmin roles
            this.admins = data.filter(u => u.role === 'Admin' || u.role === 'SuperAdmin');
            this.renderTable();
            this.renderStats();
        } catch (err) {
            App.showToast('Failed to load admins: ' + err.message, 'error');
        }
    },

    renderStats() {
        const onlineCount = this.admins.filter(u => {
            if (!u.last_active) return false;
            const last = new Date(u.last_active).getTime();
            return (Date.now() - last) / (1000 * 60) < 15;
        }).length;

        const statsHtml = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <div class="icon-wrap blue"><i data-lucide="users"></i></div>
                    <div class="stat-info">
                        <div class="label">Total Admins</div>
                        <div class="value">${this.admins.length}</div>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <div class="icon-wrap green"><i data-lucide="shield-check"></i></div>
                    <div class="stat-info">
                        <div class="label">Active Now</div>
                        <div class="value">${onlineCount}</div>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <div class="icon-wrap purple"><i data-lucide="user-plus"></i></div>
                    <div class="stat-info">
                        <div class="label">Super Admins</div>
                        <div class="value">${this.admins.filter(u => u.role === 'SuperAdmin').length}</div>
                    </div>
                </div>
            </div>
        `;
        const container = document.getElementById('admin-stats-container');
        if (container) container.innerHTML = statsHtml;
        lucide.createIcons();
    },

    handleSearch(e) {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#admins-table-body tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    },

    getStatusBadge(lastActive) {
        if (!lastActive) return '<span class="status-badge offline">⚫ Offline</span>';
        
        const last = new Date(lastActive).getTime();
        const now = Date.now();
        const diffMin = (now - last) / (1000 * 60);

        if (diffMin < 15) return '<span class="status-badge online">🟢 Online</span>';
        if (diffMin < 60) return '<span class="status-badge idle">🟡 Idle</span>';
        return '<span class="status-badge offline">⚫ Offline</span>';
    },

    formatLastActive(lastActive) {
        if (!lastActive) return 'Never';
        const last = new Date(lastActive).getTime();
        const now = Date.now();
        const diffMin = Math.floor((now - last) / (1000 * 60));

        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
        return new Date(lastActive).toLocaleDateString();
    },

    renderTable() {
        const container = document.getElementById('admins-table-body');
        if (!container) return;

        if (this.admins.length === 0) {
            container.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No admin users found</td></tr>';
            return;
        }

        container.innerHTML = this.admins.map(user => `
            <tr>
                <td>
                    <div class="user-profile-cell">
                        <img class="user-avatar" src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.username)}&background=random&bold=true&color=fff" alt="">
                        <div class="user-info">
                            <div class="name">${App.esc(user.name || user.username)}</div>
                            <div class="email">${App.esc(user.email)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge ${user.role === 'SuperAdmin' ? 'badge-purple' : 'badge-blue'}">
                        ${user.role}
                    </span>
                </td>
                <td>${this.getStatusBadge(user.last_active)}</td>
                <td>
                    <div style="font-weight: 500; color: var(--text); font-size: 0.85rem;">${this.formatLastActive(user.last_active)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${user.last_active ? new Date(user.last_active).toLocaleDateString() : ''}</div>
                </td>
                <td>
                    <div class="actions">
                        <button class="btn-action" title="Security & Activity" data-onclick="Views.admins.showDetails" data-id="${user.id}">
                            <i data-lucide="shield"></i>
                        </button>
                        ${user.role !== 'SuperAdmin' || App.user.role === 'SuperAdmin' ? `
                        <button class="btn-action" title="Edit Permissions" data-onclick="Views.admins.showEditRole" data-id="${user.id}" data-role="${user.role}">
                            <i data-lucide="edit-3"></i>
                        </button>
                        ` : ''}
                        ${user.id !== App.user.id ? `
                        <button class="btn-action danger" title="Revoke Access" data-onclick="Views.admins.deleteUser" data-id="${user.id}">
                            <i data-lucide="user-minus"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    },

    // Build 3: Invite Admin Modal
    showInviteModal() {
        const modal = document.getElementById('invite-admin-modal');
        modal.classList.add('active');
        document.getElementById('invite-form').reset();
    },

    async handleInvite(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const body = Object.fromEntries(formData.entries());

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.innerText = 'Creating...';
        btn.disabled = true;

        try {
            const res = await Api.post('/users/invite', body);
            if (res.error) throw new Error(res.error);

            App.showToast('Admin created! They must change password on first login.', 'success');
            document.getElementById('invite-admin-modal').classList.remove('active');
            this.loadAdmins();
        } catch (err) {
            App.showToast(err.message, 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    // Build 5: Session Management & Activity Log
    async showDetails(e) {
        const userId = e.target.closest('[data-id]').dataset.id;
        const user = this.admins.find(u => u.id === userId);
        if (!user) return;

        const modal = document.getElementById('admin-details-modal');
        modal.classList.add('active');
        
        document.getElementById('details-name').innerText = user.name || user.username;
        document.getElementById('details-email').innerText = user.email;
        document.getElementById('details-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.username)}&background=3b82f6&color=fff&bold=true`;
        
        this.loadUserSessions(userId);
        this.loadUserActivity(userId);
    },

    async loadUserSessions(userId) {
        const container = document.getElementById('sessions-list');
        container.innerHTML = '<div style="text-align:center; padding:1rem;">Loading sessions...</div>';

        try {
            const sessions = await Api.get(`/users/${userId}/sessions`);
            if (sessions.error) throw new Error(sessions.error);

            if (sessions.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-muted);">No active sessions</div>';
                return;
            }

            container.innerHTML = `
                <table class="table" style="font-size: 0.8rem;">
                    <thead>
                        <tr>
                            <th>Device / IP</th>
                            <th>Last Active</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map(s => `
                            <tr>
                                <td>
                                    <div style="font-weight:600;">${App.esc(this.parseUA(s.userAgent))}</div>
                                    <div style="color:var(--text-muted); font-size:0.7rem;">${s.ipAddress}</div>
                                </td>
                                <td>${this.formatLastActive(s.updatedAt)}</td>
                                <td>
                                    <button class="btn btn-sm btn-danger" data-onclick="Views.admins.revokeSession" data-userid="${userId}" data-token="${s.token}">Revoke</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 1rem; text-align: right;">
                    <button class="btn btn-sm btn-outline-danger" data-onclick="Views.admins.revokeAllSessions" data-userid="${userId}">Revoke All Sessions</button>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<div style="color:var(--danger); padding:1rem;">Error: ${err.message}</div>`;
        }
    },

    parseUA(ua) {
        if (!ua) return 'Unknown Device';
        if (ua.includes('Windows')) return 'Chrome / Windows';
        if (ua.includes('Android')) return 'Mobile / Android';
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'Mobile / iOS';
        if (ua.includes('Macintosh')) return 'Safari / macOS';
        return ua.split(' ')[0] || 'Web Browser';
    },

    async loadUserActivity(userId) {
        const container = document.getElementById('activity-list');
        container.innerHTML = '<div style="text-align:center; padding:1rem;">Loading activity...</div>';

        try {
            const logs = await Api.get(`/users/${userId}/activity`);
            if (logs.error) throw new Error(logs.error);

            if (logs.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-muted);">No recent activity</div>';
                return;
            }

            container.innerHTML = logs.map(log => `
                <div style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.8rem;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600; color: #3b82f6;">${log.action}</span>
                        <span style="color: var(--text-muted); font-size: 0.7rem;">${new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <div style="color: var(--text-muted); margin-top: 2px;">${App.esc(log.description)}</div>
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<div style="color:var(--danger); padding:1rem;">Error: ${err.message}</div>`;
        }
    },

    async revokeSession(e) {
        const { userid, token } = e.target.dataset;
        if (!await App.showConfirm('Revoke Session', 'Are you sure you want to revoke this session? The user will be logged out on that device.')) return;

        try {
            const res = await Api.delete(`/users/${userid}/sessions/${token}`);
            if (res.error) throw new Error(res.error);
            App.showToast('Session revoked', 'success');
            this.loadUserSessions(userid);
        } catch (err) { App.showToast(err.message, 'error'); }
    },

    async revokeAllSessions(e) {
        const { userid } = e.target.dataset;
        if (!await App.showConfirm('Revoke All Sessions', 'Are you sure you want to revoke ALL active sessions for this user?')) return;

        try {
            const res = await Api.delete(`/users/${userid}/sessions`);
            if (res.error) throw new Error(res.error);
            App.showToast('All sessions revoked', 'success');
            this.loadUserSessions(userid);
        } catch (err) { App.showToast(err.message, 'error'); }
    },

    showEditRole(e) {
        const { id, role } = e.target.closest('[data-id]').dataset;
        const newRole = prompt('Enter new role (Admin or SuperAdmin):', role);
        if (!newRole || newRole === role) return;

        if (newRole !== 'Admin' && newRole !== 'SuperAdmin') {
            App.showToast('Invalid role. Must be Admin or SuperAdmin.', 'error');
            return;
        }

        this.updateRole(id, newRole);
    },

    async updateRole(userId, role) {
        try {
            const res = await Api.put(`/users/${userId}/role`, { role });
            if (res.error) throw new Error(res.error);
            App.showToast('Role updated successfully', 'success');
            this.loadAdmins();
        } catch (err) { App.showToast(err.message, 'error'); }
    },

    async deleteUser(e) {
        const userId = e.target.closest('[data-id]').dataset.id;
        if (!await App.showConfirm('Delete User', 'Are you sure you want to delete this admin? This action cannot be undone.')) return;

        try {
            const res = await Api.delete(`/users/${userId}`);
            if (res.error) throw new Error(res.error);
            App.showToast('User deleted successfully', 'success');
            this.loadAdmins();
        } catch (err) { App.showToast(err.message, 'error'); }
    },

    render() {
        return `
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem;">
                <div>
                    <h1 class="page-title" style="margin-bottom: 4px;">Administrative Access</h1>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Manage system administrators and monitor their security sessions.</p>
                </div>
                <button class="btn btn-primary btn-lg" data-onclick="Views.admins.showInviteModal" style="display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; font-weight: 700; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);">
                    <i data-lucide="user-plus" style="width: 18px;"></i> Invite New Admin
                </button>
            </div>

            <div id="admin-stats-container" style="margin-bottom: 2rem;"></div>

            <div class="card" style="padding: 0; border-radius: 16px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                <div style="padding: 20px; border-bottom: 1px solid var(--border); background: var(--bg-card); display: flex; justify-content: space-between; align-items: center;">
                    <div style="position: relative; width: 300px;">
                        <i data-lucide="search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; color: #94a3b8;"></i>
                        <input type="text" class="form-control" placeholder="Search administrators..." oninput="Views.admins.handleSearch(event)" style="padding-left: 40px; border-radius: 10px; background: #1e293b; border: 1px solid #334155; color: white;">
                    </div>
                    <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 500;">
                        Showing ${this.admins.length} administrators
                    </div>
                </div>
                <table class="table admin-table">
                    <thead>
                        <tr>
                            <th>Administrator</th>
                            <th>Role & Permissions</th>
                            <th>Connection Status</th>
                            <th>Last Activity</th>
                            <th style="text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admins-table-body">
                        <tr><td colspan="5" style="text-align:center; padding:4rem;">
                            <div class="spinner"></div>
                            <div style="margin-top: 1rem; color: var(--text-muted);">Syncing admin directory...</div>
                        </td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Invite Admin Modal -->
            <div id="invite-admin-modal" class="modal-overlay">
                <div class="modal-content" style="max-width: 500px; border-radius: 20px; padding: 0; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; color: white; position: relative;">
                        <h3 style="margin: 0; font-size: 1.5rem; font-weight: 800;">Invite Administrator</h3>
                        <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.9rem;">Grant secure access to the Signtral CMS.</p>
                        <button class="btn-icon" data-onclick="App.closeModal" style="position: absolute; top: 20px; right: 20px; color: white; background: rgba(255,255,255,0.2); border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;"><i data-lucide="x" style="width: 16px;"></i></button>
                    </div>
                    <form id="invite-form" data-onsubmit="Views.admins.handleInvite" style="padding: 30px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; display: block;">Full Name</label>
                            <input type="text" name="name" class="form-control" required placeholder="e.g. John Doe" style="border-radius: 10px; padding: 12px; border: 1px solid var(--border); background: var(--bg-dark); color: white;">
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; display: block;">Email Address</label>
                            <input type="email" name="email" class="form-control" required placeholder="email@example.com" style="border-radius: 10px; padding: 12px; border: 1px solid var(--border); background: var(--bg-dark); color: white;">
                        </div>
                        <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; display: block;">Security Role</label>
                                <select name="role" class="form-control" style="border-radius: 10px; padding: 12px; border: 1px solid var(--border); background: var(--bg-dark); height: 48px; color: white;">
                                    <option value="Admin">Admin</option>
                                    <option value="SuperAdmin">SuperAdmin</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; display: block;">Temp Password</label>
                                <input type="password" name="password" class="form-control" required minlength="6" style="border-radius: 10px; padding: 12px; border: 1px solid var(--border); background: var(--bg-dark); color: white;">
                            </div>
                        </div>
                        <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); padding: 12px; border-radius: 10px; display: flex; gap: 12px; align-items: flex-start; margin-top: 10px;">
                            <i data-lucide="info" style="width: 18px; color: #f59e0b; flex-shrink: 0;"></i>
                            <div style="font-size: 0.75rem; color: #d97706; line-height: 1.4;">New administrators are automatically flagged for a <strong>mandatory password reset</strong> on their first login for security compliance.</div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
                            <button type="button" class="btn btn-secondary" data-onclick="App.closeModal" style="border-radius: 10px; padding: 10px 20px; font-weight: 600;">Cancel</button>
                            <button type="submit" class="btn btn-primary" style="border-radius: 10px; padding: 10px 25px; font-weight: 700; background: #3b82f6;">Create Administrator</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Admin Details Modal -->
            <div id="admin-details-modal" class="modal-overlay">
                <div class="modal-content" style="max-width: 900px; width: 95%; border-radius: 20px; padding: 0; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 30px; color: white; position: relative; display: flex; align-items: center; gap: 20px;">
                        <img id="details-avatar" src="" style="width: 64px; height: 64px; border-radius: 16px; border: 2px solid rgba(255,255,255,0.1);">
                        <div>
                            <h3 id="details-name" style="margin: 0; font-size: 1.5rem; font-weight: 800;">Admin Name</h3>
                            <div id="details-email" style="font-size: 0.9rem; opacity: 0.7;">email@example.com</div>
                        </div>
                        <button class="btn-icon" data-onclick="App.closeModal" style="position: absolute; top: 20px; right: 20px; color: white; background: rgba(255,255,255,0.1); border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;"><i data-lucide="x" style="width: 16px;"></i></button>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 30px; padding: 30px; background: var(--bg-card);">
                        <div>
                            <h4 style="font-size: 0.9rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                                <div style="width: 32px; height: 32px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i data-lucide="monitor" style="width: 16px;"></i></div>
                                Active Device Sessions
                            </h4>
                            <div id="sessions-list" style="background: var(--bg-dark); border-radius: 16px; border: 1px solid var(--border); overflow: hidden;"></div>
                        </div>
                        <div>
                            <h4 style="font-size: 0.9rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                                <div style="width: 32px; height: 32px; background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i data-lucide="activity" style="width: 16px;"></i></div>
                                Recent Security Logs
                            </h4>
                            <div id="activity-list" style="max-height: 500px; overflow-y: auto; background: var(--bg-dark); border-radius: 16px; border: 1px solid var(--border); padding: 15px;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .admin-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
                .admin-stat-card { background: var(--bg-card); border: 1px solid var(--border); padding: 20px; border-radius: 16px; display: flex; align-items: center; gap: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
                .admin-stat-card .icon-wrap { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
                .admin-stat-card .icon-wrap.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
                .admin-stat-card .icon-wrap.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .admin-stat-card .icon-wrap.purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
                .admin-stat-card .icon-wrap i { width: 24px; height: 24px; }
                .admin-stat-card .stat-info .label { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
                .admin-stat-card .stat-info .value { font-size: 1.5rem; font-weight: 800; color: var(--text); line-height: 1.2; }

                .admin-table th { background: #f1f5f9; color: #475569; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; padding: 15px 20px; }
                .admin-table td { padding: 15px 20px; vertical-align: middle; border-bottom: 1px solid var(--border); }
                .admin-table tr:hover { background: rgba(59, 130, 246, 0.02); }

                .user-profile-cell { display: flex; align-items: center; gap: 12px; }
                .user-avatar { width: 40px; height: 40px; border-radius: 12px; object-fit: cover; border: 2px solid var(--bg-card); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                .user-info .name { font-weight: 700; color: var(--text); font-size: 0.95rem; line-height: 1.2; }
                .user-info .email { font-size: 0.75rem; color: var(--text-muted); }

                .status-badge { font-size: 0.75rem; font-weight: 700; padding: 6px 12px; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; }
                .status-badge.online { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
                .status-badge.idle { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }
                .status-badge.offline { background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.2); }
                
                .badge { font-weight: 700; font-size: 0.7rem; text-transform: uppercase; padding: 4px 8px; border-radius: 6px; }
                .badge-purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
                .badge-blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }

                .actions { display: flex; gap: 8px; justify-content: flex-end; }
                .btn-action { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted); cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
                .btn-action:hover { color: var(--primary); border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15); }
                .btn-action.danger:hover { color: #ef4444; border-color: #ef4444; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15); }
                .btn-action i { width: 16px; height: 16px; }

                .spinner { width: 24px; height: 24px; border: 3px solid rgba(59, 130, 246, 0.2); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* Fix for placeholder visibility on dark backgrounds */
                #invite-admin-modal input::placeholder { color: rgba(255,255,255,0.4); }
                #view-container input.form-control { color: inherit; }
            </style>
        `;
    }
});
