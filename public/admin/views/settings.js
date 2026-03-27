App.registerView('settings', {
    render() {
        return `
            <div class="page-title">Admin Settings</div>
            
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 2rem;">
                <div class="card">
                    <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem;">Profile Settings</h3>
                    <div class="form-group">
                        <label>Admin Name</label>
                        <input type="text" class="form-control" value="Super Admin">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" class="form-control" value="admin@dooh-network.com">
                    </div>
                    <div class="form-group">
                        <label>Timezone</label>
                        <select class="form-control">
                            <option>Asia/Kolkata (IST)</option>
                            <option>UTC</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Save Changes</button>
                </div>

                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="font-size: 1rem; font-weight: 600;">System Logs</h3>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">Download Logs</button>
                    </div>
                    <div style="background: var(--bg-dark); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">
                        <div>[INFO] System initialized. API healthy.</div>
                        <div>[INFO] Fetched 120 screens from Xibo API.</div>
                        <div>[WARN] Screen HYD-12 missed 3 heartbeats. Marking offline.</div>
                        <div style="color: var(--success); margin-top: 10px;">[INFO] Campaign "Gym Offer" sync triggered successfully.</div>
                        <div style="color: var(--danger); margin-top: 10px;">[ERROR] Partner API unreachable - Retrying...</div>
                        <div>[INFO] Fetched 120 screens from Xibo API.</div>
                    </div>
                </div>
            </div>
        `;
    }
});
