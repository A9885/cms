App.registerView('settings', {
    user: null,

    async mount() {
        window.Views = window.Views || {};
        window.Views.settings = this;
        await Promise.all([
            this.loadProfile(),
            this.loadLogs()
        ]);
        lucide.createIcons();
    },

    async loadProfile() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            if (data && data.user) {
                this.user = data.user;
                this.populateFields();
            }
        } catch (err) {
            App.showToast('Failed to load profile data', 'error');
        }
    },

    async loadLogs() {
        const tbody = document.getElementById('activity-logs-body');
        if (!tbody) return;

        try {
            const res = await Api.get('/activity-logs?limit=10');
            const logs = (res && res.data) || [];
            
            tbody.innerHTML = '';
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">No activity logs found.</td></tr>';
                return;
            }

            logs.forEach(log => {
                const tr = document.createElement('tr');
                const date = new Date(log.created_at).toLocaleString();
                
                let actionClass = 'badge-blue';
                if (log.action === 'CREATE') actionClass = 'badge-green';
                if (log.action === 'DELETE') actionClass = 'badge-red';
                if (log.action === 'ERROR') actionClass = 'badge-red';

                tr.innerHTML = `
                    <td style="font-size:0.8rem; color:var(--text-muted);">${date}</td>
                    <td><span class="badge ${actionClass}" style="font-size:0.65rem;">${log.action}</span></td>
                    <td style="font-size:0.85rem; font-weight:600;">${log.module}</td>
                    <td style="font-size:0.85rem; color:var(--text-primary);">${log.description}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--danger);">Failed to load activity logs.</td></tr>';
        }
    },

    populateFields() {
        const nameInput = document.getElementById('settings-name');
        const emailInput = document.getElementById('settings-email');
        const roleBadge = document.getElementById('settings-role-badge');
        const timezoneSelect = document.getElementById('settings-timezone');

        if (nameInput) nameInput.value = this.user.name || this.user.username || '';
        if (emailInput) emailInput.value = this.user.email || '';
        if (roleBadge) {
            roleBadge.innerText = this.user.role || 'Admin';
            roleBadge.className = 'badge badge-' + (this.user.role === 'SuperAdmin' ? 'purple' : 'blue');
        }
        if (timezoneSelect) timezoneSelect.value = this.user.timezone || 'Asia/Kolkata';
    },

    async saveProfile() {
        const name = document.getElementById('settings-name').value;
        const email = document.getElementById('settings-email').value;
        const timezone = document.getElementById('settings-timezone').value;

        if (!name || !email) {
            return App.showToast('Name and email are required', 'error');
        }

        const btn = document.getElementById('save-profile-btn');
        const originalText = btn.innerText;
        btn.innerText = 'Saving...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/auth/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, timezone })
            });
            const data = await res.json();

            if (res.ok) {
                App.showToast('Profile updated successfully!', 'success');
                // Update global header info
                document.getElementById('admin-user-name').innerText = name;
                document.getElementById('admin-user-email').innerText = email;
            } else {
                App.showToast(data.error || 'Failed to update profile', 'error');
            }
        } catch (err) {
            App.showToast('Network error', 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async changePassword(e) {
        e.preventDefault();
        const currentPassword = document.getElementById('pwd-current').value;
        const newPassword = document.getElementById('pwd-new').value;
        const confirmPassword = document.getElementById('pwd-confirm').value;
        const statusEl = document.getElementById('pwd-status');

        if (!newPassword || newPassword.length < 6) {
            statusEl.innerText = 'Password must be at least 6 characters.';
            statusEl.style.color = 'var(--danger)';
            return;
        }

        if (newPassword !== confirmPassword) {
            statusEl.innerText = 'Passwords do not match.';
            statusEl.style.color = 'var(--danger)';
            return;
        }

        const btn = e.target.querySelector('button');
        const originalText = btn.innerText;
        btn.innerText = 'Changing...';
        btn.disabled = true;
        statusEl.innerText = '';

        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json();

            if (res.ok) {
                statusEl.innerText = 'Password updated successfully!';
                statusEl.style.color = 'var(--success)';
                e.target.reset();
            } else {
                statusEl.innerText = data.error || 'Failed to change password.';
                statusEl.style.color = 'var(--danger)';
            }
        } catch (err) {
            statusEl.innerText = 'Network error.';
            statusEl.style.color = 'var(--danger)';
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    render() {
        const timezones = [
            'Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 
            'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'
        ];

        return `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 2rem;">
                <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="settings" style="width: 24px;"></i>
                </div>
                <div>
                    <h1 class="page-title" style="margin: 0;">Account Configuration</h1>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Maintain your profile security and personalization settings.</p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; max-width: 1200px; margin-bottom: 2rem;">
                <!-- Profile Section -->
                <div class="card" style="border-radius: 20px; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.05); padding: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
                        <div>
                            <h3 style="font-size: 1.2rem; font-weight: 800; margin: 0;">Personal Identity</h3>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Update your public-facing administrator profile.</p>
                        </div>
                        <span id="settings-role-badge" class="badge">Admin</span>
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 8px; display: block;">Full Name</label>
                        <input type="text" id="settings-name" class="form-control" placeholder="Your Name" style="border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid var(--border); color: var(--text-primary);">
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 8px; display: block;">Email Address</label>
                        <input type="email" id="settings-email" class="form-control" placeholder="email@example.com" style="border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid var(--border); color: var(--text-primary);">
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 8px; display: block;">Preferred Timezone</label>
                        <select id="settings-timezone" class="form-control" style="border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid var(--border); height: 48px; color: var(--text-primary);">
                            ${timezones.map(tz => `<option value="${tz}">${tz}</option>`).join('')}
                        </select>
                    </div>

                    <div style="margin-top: 2rem;">
                        <button id="save-profile-btn" class="btn btn-primary btn-lg" style="width: 100%; border-radius: 12px; font-weight: 700; padding: 12px;" 
                            data-onclick="Views.settings.saveProfile">
                            Update Profile Details
                        </button>
                    </div>
                </div>

                <!-- Security Section -->
                <div class="card" style="border-radius: 20px; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.05); padding: 30px;">
                    <div style="margin-bottom: 2rem;">
                        <h3 style="font-size: 1.2rem; font-weight: 800; margin: 0;">Security Credentials</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Manage your password to ensure account safety.</p>
                    </div>

                    <form data-onsubmit="Views.settings.changePassword">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 8px; display: block;">Current Password</label>
                            <input type="password" id="pwd-current" class="form-control" required placeholder="••••••••" style="border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid var(--border); color: var(--text-primary);">
                        </div>

                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 8px; display: block;">New Access Password</label>
                            <input type="password" id="pwd-new" class="form-control" required placeholder="Min. 6 characters" style="border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid var(--border); color: var(--text-primary);">
                        </div>

                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 8px; display: block;">Confirm New Password</label>
                            <input type="password" id="pwd-confirm" class="form-control" required placeholder="Repeat new password" style="border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid var(--border); color: var(--text-primary);">
                        </div>

                        <div id="pwd-status" style="font-size: 0.8rem; margin: 15px 0; min-height: 1.2rem; font-weight: 600;"></div>

                        <button type="submit" class="btn btn-secondary btn-lg" style="width: 100%; border-radius: 12px; font-weight: 700; padding: 12px;">
                            Rotate Security Password
                        </button>
                    </form>
                    
                    <div style="margin-top: 2rem; background: rgba(59, 130, 246, 0.05); padding: 15px; border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.1); display: flex; gap: 12px;">
                        <i data-lucide="shield-check" style="width: 20px; color: #3b82f6; flex-shrink: 0;"></i>
                        <p style="font-size: 0.75rem; color: #1e40af; line-height: 1.4; margin: 0;">
                            Changing your password will <strong>automatically revoke</strong> all other active sessions for this account across all devices for security purposes.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Admin Activity Logs Section -->
            <div class="card" style="max-width: 1200px; border-radius: 20px; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.05); padding: 30px; margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <div>
                        <h3 style="font-size: 1.2rem; font-weight: 800; margin: 0;">System Activity Logs</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Recent administrative actions and security events.</p>
                    </div>
                    <button class="btn btn-secondary" style="font-size: 0.75rem; border-radius: 8px; padding: 6px 12px;" data-onclick="Views.settings.loadLogs">
                        <i data-lucide="refresh-cw" style="width: 14px; margin-right: 6px;"></i> Refresh
                    </button>
                </div>

                <div class="table-wrap" style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 1px solid var(--border);">
                                <th style="text-align: left; padding: 12px 15px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700;">Timestamp</th>
                                <th style="text-align: left; padding: 12px 15px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700;">Action</th>
                                <th style="text-align: left; padding: 12px 15px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700;">Module</th>
                                <th style="text-align: left; padding: 12px 15px; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700;">Description</th>
                            </tr>
                        </thead>
                        <tbody id="activity-logs-body">
                            <tr><td colspan="4" style="text-align: center; padding: 30px; color: var(--text-muted);">Initializing activity audit stream...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 15px; text-align: right;">
                    <a href="#moderation" style="font-size: 0.8rem; color: #3b82f6; font-weight: 600; text-decoration: none;">View Detailed Audit Log →</a>
                </div>
            </div>

            <style>
                .badge { font-weight: 700; font-size: 0.75rem; text-transform: uppercase; padding: 4px 10px; border-radius: 8px; display: inline-flex; align-items: center; }
                .badge-purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.2); }
                .badge-blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); }
                .badge-green { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
                .badge-red { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
                
                #activity-logs-body tr { border-bottom: 1px solid var(--border); transition: background 0.2s; }
                #activity-logs-body tr:hover { background: #f8fafc; }
                #activity-logs-body td { padding: 12px 15px; }
            </style>
        `;
    }
});
