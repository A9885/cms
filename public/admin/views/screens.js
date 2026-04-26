App.registerView('screens', {
    render() {
        return `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-title">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="tv"></i> Screens Management
                    </div>
                    <div class="table-header-actions">
                        <button class="btn btn-secondary" id="btn-view-map">Map View</button>
                        <button class="btn btn-secondary" id="btn-view-all-logs"><i data-lucide="history" style="width:14px; margin-right:4px;"></i>Global Logs</button>
                        <button class="btn btn-success" style="background: #10b981; color: white;" id="btn-open-register-xibo"><i data-lucide="monitor" style="width:14px; margin-right:4px;"></i>Register Xibo Display</button>
                        <button class="btn btn-primary" id="btn-open-create-screen">+ Add Screen</button>
                    </div>
                </div>
            </div>

            <div class="split-view">
                <!-- Left Side: Table -->
                <div id="screens-table-view" class="card" style="margin:0;">
                    <div class="table-header-actions" style="margin-bottom: 20px;">
                        <input type="text" id="screens-search" placeholder="🔍 Search screens..." style="width: 200px;">
                        <select id="filter-city"><option value="">All Cities</option></select>
                        <select id="filter-status">
                            <option value="">All Statuses</option>
                            <option value="Online">Online</option>
                            <option value="Offline">Offline</option>
                            <option value="Unlinked">Not Linked</option>
                        </select>
                        <select id="filter-partner"><option value="">All Partners</option></select>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Screen Name</th>
                                     <th>City</th>
                                    <th>Connection</th>
                                    <th style="text-align: right; padding-right: 20px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="screens-table-body">
                                <tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading screens...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right Side: Details -->
                <div id="screen-detail-panel" class="detail-panel">
                    <div id="detail-active-view" style="display:none;">
                        <div class="detail-header" style="border-bottom:none; padding-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:start;">
                                <div>
                                    <h3 id="det-name" style="margin:0;">—</h3>
                                    <div id="det-id-label" style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">ID: —</div>
                                </div>
                                <span id="det-status-badge" class="status-pill active">Online</span>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; padding: 0 20px 20px 20px; border-bottom: 1px solid var(--border);">
                            <button class="btn btn-secondary" style="font-size:0.8rem; height:36px; display:flex; align-items:center; justify-content:center; gap:6px;" id="btn-edit-screen">
                                <i data-lucide="edit-3" style="width:14px;"></i> Edit Info
                            </button>
                            <button class="btn btn-primary" style="font-size:0.8rem; height:36px; display:flex; align-items:center; justify-content:center; gap:6px;" id="btn-sync-screen">
                                <i data-lucide="refresh-cw" style="width:14px;"></i> Force Sync
                            </button>
                            <button class="btn btn-secondary" style="font-size:0.8rem; height:36px; display:flex; align-items:center; justify-content:center; gap:6px; grid-column: span 2; background:#f0f9ff; border:1px solid #bae6fd; color:#0369a1;" id="btn-open-location-modal">
                                <i data-lucide="map-pin" style="width:14px;"></i> Fix Location
                            </button>
                        </div>

                        <div class="detail-section">
                            <div class="detail-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                                Location & Hardware
                                <span id="det-location-source-badge" style="font-size:0.65rem; padding:2px 8px; border-radius:20px; font-weight:600; background:#e2e8f0; color:#64748b;">Unknown</span>
                            </div>
                            <div id="det-map" style="width:100%; height:160px; border-radius:12px; margin-bottom:12px; background:#f1f5f9; border:1px solid var(--border);"></div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">City</label>
                                    <div id="det-city" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Partner</label>
                                    <div id="det-partner" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                            </div>
                            <div style="margin-top:10px;">
                                <label style="font-size:0.7rem; color:var(--text-muted);">Full Address</label>
                                <div id="det-address" style="font-size:0.85rem; line-height:1.4;">—</div>
                            </div>
                            <div style="margin-top:8px;" id="det-fixed-badge-row"></div>
                        </div>

                        <div class="detail-section">
                            <div class="detail-section-title">Technical Specifications</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Orientation</label>
                                    <div id="det-orientation" style="font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:6px;">—</div>
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Resolution</label>
                                    <div id="det-resolution" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Brand/Model</label>
                                    <div id="det-hardware-model" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Connection IP</label>
                                    <div id="det-ip-address" style="font-size:0.85rem; font-weight:600; color:var(--primary);">—</div>
                                </div>
                                <div>
                                    <label style="font-size:0.7rem; color:var(--text-muted);">Date Created</label>
                                    <div id="det-created-date" style="font-size:0.85rem; font-weight:600;">—</div>
                                </div>
                            </div>
                            <div style="margin-top:10px;">
                                <label style="font-size:0.7rem; color:var(--text-muted);">MAC Address</label>
                                <div id="det-mac-address" style="font-size:0.75rem; font-family:monospace; color:var(--text-muted);">—</div>
                            </div>
                        </div>

                        <!-- Link Alert for Unlinked Screens -->
                        <div id="unlinked-alert" style="display:none; background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:15px; margin-bottom:1.5rem;">
                            <div style="display:flex; gap:10px; align-items:start;">
                                <i data-lucide="alert-triangle" style="color:#c2410c; width:20px;"></i>
                                <div style="flex:1;">
                                    <div style="font-size:0.85rem; font-weight:700; color:#9a3412;">Not Linked to Xibo</div>
                                    <div style="font-size:0.75rem; color:#c2410c; margin-top:4px; line-height:1.4;">This local record is not connected to a live Xibo player. Linking is required for content delivery.</div>
                                    <button type="button" class="btn btn-primary" style="margin-top:10px; background:#ea580c; width:100%;" id="btn-open-link-modal">Link Xibo Player Now</button>
                                </div>
                            </div>
                        </div>

                        <div class="detail-section" id="perf-section">
                            <div class="detail-section-title">Real-time Performance</div>
                            <div class="table-wrap" style="max-height: 180px; overflow-y: auto;">
                                <table class="mini-table">
                                    <thead>
                                        <tr><th>Time</th><th>Ad Name</th><th>Plays</th></tr>
                                    </thead>
                                    <tbody id="det-pop-body">
                                        <tr><td colspan="3" style="text-align:center; padding:10px; color:var(--text-muted);">No recent plays</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Offline Backfill & Sync Status Widget -->
                        <div class="detail-section" id="sync-status-section" style="border-top: 1px solid var(--border); padding-top: 15px;">
                            <div class="detail-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                                Sync & Connectivity
                                <span id="sync-status-indicator" style="font-size:0.7rem; font-weight:700;"></span>
                            </div>
                            
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-size: 0.75rem; color: #64748b;">Stat Buffer Status:</span>
                                    <span id="sync-pending-count" style="font-size: 0.75rem; font-weight: 600;"></span>
                                </div>
                                <div id="sync-offline-alert" style="display: none; color: #ef4444; font-size: 0.75rem; font-weight: 500; margin-top: 5px;">
                                    <i data-lucide="clock" style="width: 12px; margin-right: 4px;"></i>
                                    Offline since <span id="sync-offline-time"></span>
                                </div>
                            </div>

                            <button type="button" class="btn btn-secondary" style="width: 100%; font-size: 0.75rem; padding: 6px; margin-bottom: 10px;" onclick="window.Views.screens.toggleOfflineHistory()">
                                <i data-lucide="history" style="width: 12px; margin-right: 4px;"></i> 
                                View Connection History
                            </button>

                            <div id="offline-history-container" style="display: none; max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
                                <table class="mini-table" style="font-size: 0.7rem;">
                                    <thead>
                                        <tr>
                                            <th>Offline Start</th>
                                            <th>Came Back</th>
                                            <th>Flushed</th>
                                        </tr>
                                    </thead>
                                    <tbody id="offline-history-body"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Screen Activity Log -->
                        <div class="detail-section" id="activity-logs-section" style="border-top: 1px solid var(--border); padding-top: 15px;">
                            <div class="detail-section-title">Screen Activity Log</div>
                            <div class="table-wrap" style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                                <table class="mini-table" style="font-size: 0.72rem;">
                                    <thead>
                                        <tr>
                                            <th style="width: 130px;">Date & Time</th>
                                            <th>Event</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody id="det-event-logs-body">
                                        <tr><td colspan="3" style="text-align:center; padding:10px; color:var(--text-muted);">Loading logs...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style="margin-top:20px; padding: 0 20px 20px 20px;">
                            <button class="btn btn-secondary" style="width:100%; background:#fef2f2; color:#b91c1c; border:1px solid #fee2e2; padding:10px; font-weight:600; font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:8px;" id="btn-detail-delete-screen">
                                <i data-lucide="trash-2" style="width:14px;"></i> Delete Screen
                            </button>
                        </div>
                    </div>
                    <div id="detail-placeholder" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); text-align:center; padding:2rem;">
                        <i data-lucide="info" size="32" style="margin-bottom:12px; opacity:0.5;"></i>
                        <p style="font-size:0.9rem;">Select a screen from the list to view full details and performance.</p>
                    </div>
                </div>
            </div>

            <!-- Create Screen Modal -->
            <div id="create-screen-modal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">Add New Local Screen</span>
                        <button type="button" data-onclick="App.closeModal" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Screen Name *</label>
                            <input type="text" id="add-screen-name" placeholder="E.g., HYD-MALL-01" class="form-control">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" id="add-screen-city" placeholder="E.g., Hyderabad" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Partner</label>
                                <select id="add-screen-partner" class="form-control">
                                    <option value="">-- Select Partner --</option>
                                </select>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>Latitude</label>
                                <input type="number" step="any" id="add-screen-lat" placeholder="17.3850" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Longitude</label>
                                <input type="number" step="any" id="add-screen-lng" placeholder="78.4867" class="form-control">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <textarea id="add-screen-address" placeholder="Full address" class="form-control" style="height:60px;"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-onclick="App.closeModal">Cancel</button>
                        <button class="btn btn-primary" id="btn-submit-create">Create Screen</button>
                    </div>
                </div>
            </div>

            <!-- Edit Screen Modal -->
            <div id="edit-screen-modal" class="modal-overlay" style="z-index: 1001;">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">Edit Screen: <span id="edit-modal-title"></span></span>
                        <button type="button" data-onclick="App.closeModal" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                         <div class="form-group">
                            <label>Screen Name *</label>
                            <input type="text" id="edit-screen-name" class="form-control">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" id="edit-screen-city" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Partner</label>
                                <select id="edit-screen-partner-select" class="form-control">
                                    <option value="">-- No Partner --</option>
                                </select>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>Latitude</label>
                                <input type="number" step="any" id="edit-screen-lat" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Longitude</label>
                                <input type="number" step="any" id="edit-screen-lng" class="form-control">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <textarea id="edit-screen-address" class="form-control" style="height:60px;"></textarea>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>Presentation Orientation</label>
                                <select id="edit-screen-orientation" class="form-control">
                                    <option value="Landscape">Landscape</option>
                                    <option value="Portrait">Portrait</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Screen Dimensions</label>
                                <input type="text" id="edit-screen-resolution" class="form-control" placeholder="e.g., 1920x1080">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="edit-screen-notes" class="form-control" style="height:60px;"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" style="background:#fee2e2; color:#b91c1c; margin-right:auto;" id="btn-delete-screen">Delete Screen</button>
                        <button type="button" class="btn btn-secondary" data-onclick="App.closeModal">Cancel</button>
                        <button class="btn btn-primary" id="btn-submit-edit">Save Changes</button>
                    </div>
                </div>
            </div>

            <!-- Link Xibo Modal -->
            <div id="link-xibo-modal" class="modal-overlay" style="z-index: 1002;">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">Link Xibo Player</span>
                        <button type="button" data-onclick="App.closeModal" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Select Xibo Player</label>
                            <select id="link-xibo-select" class="form-control">
                                <option value="">-- Loading Xibo Displays... --</option>
                            </select>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">Connecting this local record to a live player allows real-time monitoring and analytics sync.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-onclick="App.closeModal">Cancel</button>
                        <button class="btn btn-primary" id="btn-submit-link">Confirm Connection</button>
                    </div>
                </div>
            </div>

            <!-- Fix Location Modal -->
            <div id="location-modal" class="modal-overlay" style="z-index: 1003;">
                <div class="modal" style="max-width: 560px; width:90%;">
                    <div class="modal-header">
                        <span class="modal-title">📍 Fix Screen Location</span>
                        <button type="button" data-onclick="App.closeModal" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" style="padding:0;">
                        <!-- Map picker -->
                        <div id="loc-modal-map" style="width:100%; height:260px; cursor:crosshair;"></div>
                        <div style="padding: 16px;">
                            <p style="font-size:0.75rem; color:#64748b; margin:0 0 12px;">Click the map to set pin, or enter coordinates below.</p>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                                <div>
                                    <label style="font-size:0.75rem; font-weight:600; display:block; margin-bottom:4px;">Latitude</label>
                                    <input type="number" step="any" id="loc-lat" class="form-control" placeholder="17.3850">
                                </div>
                                <div>
                                    <label style="font-size:0.75rem; font-weight:600; display:block; margin-bottom:4px;">Longitude</label>
                                    <input type="number" step="any" id="loc-lng" class="form-control" placeholder="78.4867">
                                </div>
                            </div>
                            <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
                                <button class="btn btn-secondary" id="btn-use-my-location" style="font-size:0.8rem; flex:1; min-width:130px;">
                                    🎯 Use My Location
                                </button>
                                <button class="btn btn-secondary" id="btn-reverse-geocode" style="font-size:0.8rem; flex:1; min-width:130px;">
                                    🔍 Lookup Address
                                </button>
                            </div>
                            <div style="margin-bottom:12px;">
                                <label style="font-size:0.75rem; font-weight:600; display:block; margin-bottom:4px;">Address (auto-filled)</label>
                                <input type="text" id="loc-address" class="form-control" placeholder="Address will appear here...">
                            </div>
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <div style="font-size:0.8rem; font-weight:600;">🔒 Lock Position</div>
                                    <div style="font-size:0.7rem; color:#64748b; margin-top:2px;">Prevent automated sync from overwriting these coordinates</div>
                                </div>
                                <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
                                    <input type="checkbox" id="loc-fixed" style="opacity:0; width:0; height:0;">
                                    <span id="loc-toggle-track" style="position:absolute; top:0; left:0; right:0; bottom:0; background:#cbd5e1; border-radius:24px; transition:0.3s;"></span>
                                    <span id="loc-toggle-thumb" style="position:absolute; height:18px; width:18px; left:3px; bottom:3px; background:white; border-radius:50%; transition:0.3s;"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-onclick="App.closeModal">Cancel</button>
                        <button class="btn btn-primary" id="btn-save-location">💾 Save Location</button>
                    </div>
                </div>
            </div>

            <!-- Register Xibo Modal -->
            <div id="register-xibo-modal" class="modal-overlay" style="z-index: 1004;">
                <div class="modal">
                    <div class="modal-header">
                        <span class="modal-title">🔗 Register New Xibo Display</span>
                        <button type="button" data-onclick="App.closeModal" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px; margin-bottom:16px; font-size:0.8rem; line-height:1.6;">
                            <strong>📋 Before registering:</strong><br>
                            1. Open the Xibo Player app on the display<br>
                            2. In player settings, set <strong>CMS Address</strong> to:<br>
                            <code id="reg-cms-url" style="background:#dbeafe; padding:2px 6px; border-radius:4px; font-size:0.85rem; font-weight:700;">https://cms.signtral.info</code><br>
                            3. The 6-digit code will appear on screen once connected
                        </div>
                        <div class="form-group">
                            <label>Display Name *</label>
                            <input type="text" id="reg-xibo-name" placeholder="E.g., Office-Entrance" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>Activation Code (shown on player screen) *</label>
                            <input type="text" id="reg-xibo-code" placeholder="E.g., 2399CC" class="form-control" style="text-transform: uppercase; font-size: 1.1rem; letter-spacing: 0.15em; font-weight: 700;">
                        </div>
                        <div id="reg-pending-list" style="display:none; margin-top:10px;"></div>
                    </div>
                    <div class="modal-footer" style="flex-direction: column; gap: 8px; align-items: stretch;">
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary" style="flex:1; font-size:0.8rem;" id="btn-scan-pending">🔍 Scan for Pending Displays</button>
                            <button class="btn btn-primary" style="flex:1;" id="btn-submit-registration">Authorize Player</button>
                        </div>
                        <button type="button" class="btn btn-secondary" data-onclick="App.closeModal">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Global Activity Log Modal -->
            <div id="global-screen-logs-modal" class="modal-overlay" style="z-index: 1006;">
                <div class="modal" style="max-width: 800px; width:95%; height: 80vh; display: flex; flex-direction: column;">
                    <div class="modal-header">
                        <span class="modal-title"><i data-lucide="history"></i> Global Screen Activity Logs</span>
                        <button type="button" data-onclick="App.closeModal" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" style="flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 20px;">
                        <div style="margin-bottom: 15px; display: flex; gap: 10px;">
                            <input type="text" id="log-search" placeholder="🔍 Search logs (screen name or event)..." class="form-control" style="flex: 1;">
                            <button class="btn btn-secondary" id="btn-refresh-global-logs"><i data-lucide="refresh-cw" style="width: 14px;"></i></button>
                        </div>
                        <div class="table-wrap" style="flex: 1; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 140px;">Time</th>
                                        <th style="width: 150px;">Screen</th>
                                        <th style="width: 120px;">Event</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody id="global-logs-body">
                                    <tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading global logs...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-onclick="App.closeModal">Close</button>
                    </div>
                </div>
            </div>
        `;
    },

    async mount(container, selectedId = null) {
        window.Views = window.Views || {};
        window.Views.screens = this;

        const [screens, partners, xiboDisplays] = await Promise.all([
            window.Api.get('/screens'),
            window.Api.get('/partners'),
            window.Api.getXiboAvailableDisplays()
        ]);

        this.localScreens = screens || [];
        this.partnersData = partners || [];
        
        // Handle Xibo Connectivity Errors or Success
        if (xiboDisplays && xiboDisplays.error) {
            console.warn('[Screens] Xibo Connection Issue:', xiboDisplays.error);
            this.xiboDisplays = [];
            this.allXiboDisplays = [];
            this.showXiboDiagnosticAlert(xiboDisplays);
        } else {
            this.allXiboDisplays = xiboDisplays || [];
            this.xiboDisplays = this.allXiboDisplays.filter(d => !this.localScreens.some(s => s.xibo_display_id === d.displayId));
            // Hide alert if it was previously shown
            const alert = document.getElementById('xibo-diag-alert');
            if (alert) alert.remove();
        }

        this.detMap = null;

        // Populate Partners Filter & Selects
        const pFilter = document.getElementById('filter-partner');
        const pAdd = document.getElementById('add-screen-partner');
        const pEdit = document.getElementById('edit-screen-partner-select');

        [pFilter, pAdd, pEdit].forEach(select => {
            if (!select) return;
            select.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = select === pFilter ? 'All Partners' : (select === pAdd ? '-- Select Partner --' : '-- No Partner --');
            select.appendChild(defaultOpt);

            this.partnersData.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        });

        // Populate Cities Filter
        const cities = [...new Set(this.localScreens.map(s => s.city).filter(Boolean))];
        const cFilter = document.getElementById('filter-city');
        if (cFilter) {
            cFilter.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = 'All Cities';
            cFilter.appendChild(allOpt);
            cities.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                cFilter.appendChild(opt);
            });
        }

        const btnViewMap = document.getElementById('btn-view-map');
        if (btnViewMap) {
            btnViewMap.onclick = () => this.showMapModal();
        }

        // Global Logs
        const btnViewLogs = document.getElementById('btn-view-all-logs');
        if (btnViewLogs) {
            btnViewLogs.onclick = () => this.showGlobalLogs();
        }
        
        const btnRefreshLogs = document.getElementById('btn-refresh-global-logs');
        if (btnRefreshLogs) {
            btnRefreshLogs.onclick = () => this.showGlobalLogs();
        }

        // Log Search
        const logSearch = document.getElementById('log-search');
        if (logSearch) {
            logSearch.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#global-logs-body tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            };
        }

        // Setup Create Screen Form
        const btnOpenAdd = document.getElementById('btn-open-create-screen');
        if (btnOpenAdd) {
            btnOpenAdd.onclick = () => document.getElementById('create-screen-modal').classList.add('active');
        }

        // Register Xibo Modal
        const btnOpenReg = document.getElementById('btn-open-register-xibo');
        if (btnOpenReg) {
            btnOpenReg.onclick = () => {
                document.getElementById('reg-xibo-name').value = '';
                document.getElementById('reg-xibo-code').value = '';
                document.getElementById('reg-pending-list').style.display = 'none';
                document.getElementById('register-xibo-modal').classList.add('active');
            };
        }

        // Scan for pending (unauthorized) displays
        const btnScanPending = document.getElementById('btn-scan-pending');
        if (btnScanPending) {
            btnScanPending.onclick = async () => {
                btnScanPending.disabled = true;
                btnScanPending.textContent = 'Scanning...';
                try {
                    const result = await window.Api.get('/screens/pending-displays');
                    const container = document.getElementById('reg-pending-list');
                    if (result && result.length > 0) {
                        container.style.display = 'block';
                        container.innerHTML = `
                            <div style="font-size:0.78rem; font-weight:600; margin-bottom:6px; color:#1e40af;">
                                🟡 ${result.length} pending display(s) waiting for authorization:
                            </div>
                            ${result.map(d => `
                                <div style="border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; cursor:pointer;"
                                     data-onclick="App.fillRegisterFields" data-code="${(d.license||'').slice(0,8)}" data-name="${d.display}">
                                    <div>
                                        <div style="font-size:0.85rem; font-weight:600;">${d.display}</div>
                                        <div style="font-size:0.7rem; color:#64748b;">ID: ${d.displayId} · Last seen: ${d.lastAccessed || 'Unknown'}</div>
                                    </div>
                                    <span style="font-size:0.7rem; background:#fef9c3; color:#854d0e; padding:2px 8px; border-radius:999px; font-weight:700;">Pending</span>
                                </div>
                            `).join('')}
                            <div style="font-size:0.72rem; color:#64748b;">Click a display above to auto-fill the code field, then click Authorize Player.</div>
                        `;
                    } else {
                        container.style.display = 'block';
                        container.innerHTML = '<div style="font-size:0.8rem; color:#64748b; padding:8px; background:#f8fafc; border-radius:8px;">No pending displays found. Make sure the player is connected to the CMS and showing the activation code.</div>';
                    }
                } catch(e) {
                    App.showToast('Scan failed: ' + e.message, 'error');
                }
                btnScanPending.disabled = false;
                btnScanPending.textContent = '🔍 Scan for Pending Displays';
            };
        }

        const btnSubmitReg = document.getElementById('btn-submit-registration');
        if (btnSubmitReg) {
            btnSubmitReg.onclick = async () => {
                const name = document.getElementById('reg-xibo-name').value.trim();
                const code = document.getElementById('reg-xibo-code').value.trim();
                if (!name || !code) return App.showToast('Please enter both display name and activation code', 'error');

                btnSubmitReg.disabled = true;
                btnSubmitReg.innerText = 'Authorizing...';

                try {
                    const res = await window.Api.post('/screens/register-xibo', { name, code });
                    if (res && res.success) {
                        App.showToast('✅ Display registered successfully!', 'success');
                        document.getElementById('register-xibo-modal').classList.remove('active');
                        this.mount(container);
                    } else {
                        const errMsg = (res && res.error) || 'Unknown error';
                        App.showToast('❌ ' + errMsg, 'error');
                    }
                } catch (err) {
                    App.showToast('Error: ' + err.message, 'error');
                } finally {
                    btnSubmitReg.disabled = false;
                    btnSubmitReg.innerText = 'Authorize Player';
                }
            };
        }

        const btnSubmitAdd = document.getElementById('btn-submit-create');
        if (btnSubmitAdd) {
            btnSubmitAdd.onclick = async () => {
                const name = document.getElementById('add-screen-name').value;
                const city = document.getElementById('add-screen-city').value;
                const address = document.getElementById('add-screen-address').value;
                const partner_id = document.getElementById('add-screen-partner').value;
                if (!name) return App.showToast('Name is required', 'error');
                btnSubmitAdd.innerText = 'Creating...';
                try {
                    const lat = document.getElementById('add-screen-lat').value || null;
                    const lng = document.getElementById('add-screen-lng').value || null;
                    await window.Api.post('/screens', { name, city, address, partner_id, latitude: lat, longitude: lng });
                    document.getElementById('create-screen-modal').classList.remove('active');
                    this.mount(container);
                } catch (err) { App.showToast(err.message, 'error'); }
                finally { btnSubmitAdd.innerText = 'Create Screen'; }
            };
        }

        // Setup Filters
        const sInput = document.getElementById('screens-search');
        const cFilt = document.getElementById('filter-city');
        const stFilt = document.getElementById('filter-status');
        const pFilt = document.getElementById('filter-partner');

        const applyFilters = () => {
            const q = sInput.value.toLowerCase();
            const city = cFilt.value;
            const status = stFilt.value;
            const pId = pFilt.value;

            const filtered = this.localScreens.filter(s => {
                const xibo = this.allXiboDisplays.find(xd => xd.displayId === s.xibo_display_id);
                const isLinked = !!s.xibo_display_id;
                const curSt = xibo ? (xibo.loggedIn ? 'Online' : 'Offline') : (isLinked ? 'Offline' : 'Unlinked');

                const matchQ = s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q);
                const matchC = !city || s.city === city;
                const matchS = !status || (status === 'Unlinked' ? !isLinked : curSt === status);
                const matchP = !pId || String(s.partner_id) === String(pId);
                return matchQ && matchC && matchS && matchP;
            });
            this.renderTable(filtered);
        };

        if (sInput) sInput.oninput = applyFilters;
        if (cFilt) cFilt.onchange = applyFilters;
        if (stFilt) stFilt.onchange = applyFilters;
        if (pFilt) pFilt.onchange = applyFilters;

        // Render Table
        this.renderTable(this.localScreens);
        lucide.createIcons();

        // Default Detail
        if (selectedId) {
            this.showDetails(selectedId);
        } else if (this.localScreens.length > 0) {
            this.showDetails(this.localScreens[0].id);
        }
    },

    renderTable(screens) {
        const tbody = document.getElementById('screens-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        screens.forEach(s => {
            const xibo = this.allXiboDisplays.find(xd => xd.displayId === s.xibo_display_id);
            const isLinked = !!s.xibo_display_id;
            let statusText = 'Not Linked';
            let badgeClass = 'offline'; // Gray/Red for unlinked

            if (isLinked) {
                const online = xibo ? xibo.loggedIn : false;
                statusText = online ? 'Online' : 'Offline';
                badgeClass = online ? 'online' : 'offline';
            } else {
                badgeClass = 'warning'; // Orange for unlinked
            }

            const tr = document.createElement('tr');
            tr.className = 'screen-row';
            tr.dataset.id = s.id;
            tr.style.cursor = 'pointer';
            tr.onclick = () => this.showDetails(s.id);

            const tdName = document.createElement('td');
            const nameDiv = document.createElement('div');
            nameDiv.style.fontWeight = '600';
            nameDiv.textContent = s.name;
            tdName.appendChild(nameDiv);
            const idDiv = document.createElement('div');
            idDiv.style.fontSize = '0.7rem';
            idDiv.style.color = 'var(--text-muted)';
            idDiv.textContent = `ID: ${s.id}${isLinked ? ' · Linked' : ''}`;
            tdName.appendChild(idDiv);
            tr.appendChild(tdName);

            const tdCity = document.createElement('td');
            tdCity.style.fontSize = '0.8rem';
            tdCity.textContent = s.city || '—';
            tr.appendChild(tdCity);

            const tdStatus = document.createElement('td');
            const span = document.createElement('span');
            span.className = `badge ${badgeClass}`;
            span.textContent = statusText;
            tdStatus.appendChild(span);
            tr.appendChild(tdStatus);

            const tdActions = document.createElement('td');
            tdActions.style.textAlign = 'right';
            tdActions.style.paddingRight = '20px';
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.style.color = '#ef4444';
            delBtn.innerHTML = '<i data-lucide="trash-2" style="width:16px;"></i>';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteScreen(s.id, s.name);
            };
            tdActions.appendChild(delBtn);
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        });
        if (screens.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.style.textAlign = 'center';
            td.style.padding = '30px';
            td.style.color = 'var(--text-muted)';
            td.textContent = 'No screens.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    },

    async deleteScreen(id, name) {
        if (!await App.showConfirm(`Permanent delete for "${name}"? This will remove all local records.`)) return;
        try {
            await window.Api.delete(`/screens/${id}`);
            App.showToast('Screen deleted', 'success');
            // Refresh view
            this.mount(document.getElementById('view-container'));
        } catch (err) {
            App.showToast('Failed to delete screen: ' + err.message, 'error');
        }
    },

    async showDetails(id) {
        id = parseInt(id, 10);
        const screen = this.localScreens.find(s => s.id === id);
        if (!screen) return;

        document.getElementById('detail-placeholder').style.display = 'none';
        document.getElementById('detail-active-view').style.display = 'block';

        // Highlight Row
        document.querySelectorAll('.screen-row').forEach(tr => tr.style.background = '');
        const row = document.querySelector(`.screen-row[data-id="${id}"]`);
        if (row) row.style.background = 'rgba(59, 130, 246, 0.08)';

        document.getElementById('det-name').innerText = screen.name;
        const isLinked = !!screen.xibo_display_id;
        document.getElementById('det-id-label').innerText = `ID: ${screen.id} ${isLinked ? '· Xibo: ' + screen.xibo_display_id : '· Not Linked'}`;
        document.getElementById('det-city').innerText = screen.city || '—';
        document.getElementById('det-partner').innerText = screen.partner_name || 'Unassigned';
        document.getElementById('det-address').innerText = screen.address || '—';

        // Location source badge
        const srcBadge = document.getElementById('det-location-source-badge');
        const srcColors = {
            GPS: ['#dcfce7', '#166534'],
            Manual: ['#dbeafe', '#1e40af'],
            IP: ['#ffedd5', '#9a3412'],
            'Awaiting GPS': ['#fef9c3', '#854d0e'],
            Unknown: ['#e2e8f0', '#64748b']
        };
        const src = screen.location_source || 'Unknown';
        const [bg, color] = srcColors[src] || ['#e2e8f0', '#64748b'];
        srcBadge.innerText = src === 'Awaiting GPS' ? '⏳ Awaiting GPS' : src;
        srcBadge.style.background = bg;
        srcBadge.style.color = color;

        // Fixed location badge
        const fixedRow = document.getElementById('det-fixed-badge-row');
        if (screen.is_fixed_location) {
            fixedRow.innerHTML = '<span style="font-size:0.7rem; background:#f3e8ff; color:#7e22ce; padding:3px 8px; border-radius:20px; font-weight:600;">🔒 Position Locked</span>';
        } else {
            fixedRow.innerHTML = '';
        }

        // Technical Specs
        const orientationDiv = document.getElementById('det-orientation');
        const orient = screen.orientation || 'Landscape';
        orientationDiv.innerHTML = `<i data-lucide="${orient === 'Portrait' ? 'smartphone' : 'monitor'}" style="width:14px;"></i> ${orient}`;
        document.getElementById('det-resolution').innerText = screen.resolution || '—';
        document.getElementById('det-hardware-model').innerText = `${screen.brand || ''} ${screen.device_model || ''}`.trim() || '—';
        document.getElementById('det-ip-address').innerText = screen.client_address || '—';
        document.getElementById('det-mac-address').innerText = screen.mac_address || '—';
        document.getElementById('det-created-date').innerText = screen.created_at ? new Date(screen.created_at).toLocaleDateString() : '—';
        
        lucide.createIcons();

        const xibo = this.allXiboDisplays.find(xd => xd.displayId === screen.xibo_display_id);
        const online = xibo ? xibo.loggedIn : false;
        const statusText = isLinked ? (online ? 'Online' : 'Offline') : 'Not Linked';
        const badge = document.getElementById('det-status-badge');
        badge.innerText = statusText;
        badge.className = `status-pill ${isLinked ? (online ? 'active' : 'inactive') : 'warning'}`;

        // Linked Alert
        document.getElementById('unlinked-alert').style.display = isLinked ? 'none' : 'block';
        document.getElementById('perf-section').style.opacity = isLinked ? '1' : '0.5';

        // Map
        const lat = screen.latitude || 17.3850;
        const lng = screen.longitude || 78.4867;
        const zoom = (screen.latitude && screen.longitude) ? 14 : 11;

        if (!this.detMap) {
            this.detMap = L.map('det-map', { zoomControl: false }).setView([lat, lng], zoom);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(this.detMap);
        }
        if (this.detMarker) this.detMap.removeLayer(this.detMarker);
        this.detMarker = L.marker([lat, lng]).addTo(this.detMap);
        this.detMap.setView([lat, lng], zoom);

        // PoP
        const pBody = document.getElementById('det-pop-body');
        pBody.innerHTML = '';
        if (isLinked) {
            const loadingTd = document.createElement('td');
            loadingTd.colSpan = 3;
            loadingTd.style.textAlign = 'center';
            loadingTd.style.padding = '10px';
            loadingTd.textContent = 'Loading...';
            const loadingTr = document.createElement('tr');
            loadingTr.appendChild(loadingTd);
            pBody.appendChild(loadingTr);

            try {
                const logs = await window.Api.get(`/screens/${id}/proof-of-play`);
                pBody.innerHTML = '';
                if (!logs || logs.length === 0) {
                    const emptyTd = document.createElement('td');
                    emptyTd.colSpan = 3;
                    emptyTd.style.textAlign = 'center';
                    emptyTd.style.padding = '10px';
                    emptyTd.style.color = 'var(--text-muted)';
                    emptyTd.textContent = 'No logs found.';
                    const emptyTr = document.createElement('tr');
                    emptyTr.appendChild(emptyTd);
                    pBody.appendChild(emptyTr);
                } else {
                    logs.forEach(l => {
                        const tr = document.createElement('tr');
                        const tdTime = document.createElement('td');
                        tdTime.textContent = new Date(l.playedAt).toLocaleTimeString();
                        tr.appendChild(tdTime);
                        const tdAd = document.createElement('td');
                        tdAd.textContent = App.cleanFilename(l.adName || 'Ad');
                        tr.appendChild(tdAd);
                        const tdCount = document.createElement('td');
                        tdCount.textContent = l.count || 1;
                        tr.appendChild(tdCount);
                        pBody.appendChild(tr);
                    });
                }
            } catch (e) {
                pBody.innerHTML = '';
                const errTd = document.createElement('td');
                errTd.colSpan = 3;
                errTd.textContent = 'Failed to load logs.';
                const errTr = document.createElement('tr');
                errTr.appendChild(errTd);
                pBody.appendChild(errTr);
            }
        } else {
            const emptyTd = document.createElement('td');
            emptyTd.colSpan = 3;
            emptyTd.style.textAlign = 'center';
            emptyTd.style.padding = '10px';
            emptyTd.style.color = 'var(--text-muted)';
            emptyTd.textContent = 'Link screen to view performance.';
            const emptyTr = document.createElement('tr');
            emptyTr.appendChild(emptyTd);
            pBody.appendChild(emptyTr);
        }

        // --- NEW: Load Screen Event Logs ---
        const logBody = document.getElementById('det-event-logs-body');
        if (logBody) {
            logBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px;">Loading...</td></tr>';
            try {
                const evLogs = await window.Api.get(`/screens/${id}/logs`);
                logBody.innerHTML = '';
                if (!evLogs || evLogs.length === 0) {
                    logBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:var(--text-muted);">No activity recorded.</td></tr>';
                } else {
                    evLogs.forEach(l => {
                        const tr = document.createElement('tr');
                        
                        const tdTime = document.createElement('td');
                        tdTime.style.whiteSpace = 'nowrap';
                        tdTime.style.color = '#64748b';
                        tdTime.textContent = new Date(l.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        
                        const tdType = document.createElement('td');
                        let typeHtml = `<span style="font-weight:600; color:#1e293b;">${l.event_type.replace('_', ' ').toUpperCase()}</span>`;
                        if (l.event_type === 'status_change') {
                            const isOnline = l.details.includes('ONLINE');
                            typeHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:700; color:${isOnline ? '#059669' : '#dc2626'};">
                                <span style="width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
                                ${isOnline ? 'ONLINE' : 'OFFLINE'}
                            </span>`;
                        }
                        tdType.innerHTML = typeHtml;

                        const tdDetails = document.createElement('td');
                        tdDetails.style.color = '#475569';
                        tdDetails.textContent = l.details || '—';
                        
                        tr.appendChild(tdTime);
                        tr.appendChild(tdType);
                        tr.appendChild(tdDetails);
                        logBody.appendChild(tr);
                    });
                }
            } catch (e) {
                logBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#ef4444;">Failed to load logs.</td></tr>';
            }
        }

        // Actions - use ID to always get the latest object from localScreens
        document.getElementById('btn-edit-screen').onclick = () => {
            const latest = this.localScreens.find(s => s.id === id);
            this.openEditModal(latest || screen);
        };
        document.getElementById('btn-detail-delete-screen').onclick = () => {
            const latest = this.localScreens.find(s => s.id === id);
            this.deleteScreen(id, latest ? latest.name : screen.name);
        };

        document.getElementById('btn-sync-screen').disabled = !isLinked;
        document.getElementById('btn-sync-screen').onclick = async () => {
            const b = document.getElementById('btn-sync-screen');
            if (!isLinked) return;
            b.innerText = 'Syncing...';
            try {
                // 1. Sync Content/Scheduling
                await window.Api.post(`/screens/${id}/sync`);

                // 2. Sync Location (GPS/IP)
                await window.Api.post(`/screens/${id}/sync-location`);

                App.showToast('Sync & Location refresh complete', 'success');

                // Refresh local data to show new coordinates
                const refreshed = await window.Api.get('/screens');
                if (refreshed) {
                    this.localScreens = refreshed;
                    this.showDetails(id);
                }
            } catch (err) { App.showToast('Sync fail', 'error'); }
            finally { b.innerText = 'Force Sync'; }
        };

        const btnLink = document.getElementById('btn-open-link-modal');
        if (btnLink) {
            btnLink.onclick = () => this.openLinkModal(screen);
        }

        const btnLoc = document.getElementById('btn-open-location-modal');
        if (btnLoc) {
            btnLoc.onclick = () => this.openLocationModal(screen);
        }
    },

    async showGlobalLogs() {
        const modal = document.getElementById('global-screen-logs-modal');
        const body = document.getElementById('global-logs-body');
        modal.classList.add('active');
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px;">Loading global logs...</td></tr>';
        
        try {
            const logs = await window.Api.get('/screens/logs');
            body.innerHTML = '';
            if (!logs || logs.length === 0) {
                body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No logs found.</td></tr>';
                return;
            }

            logs.forEach(l => {
                const tr = document.createElement('tr');
                
                const tdTime = document.createElement('td');
                tdTime.style.fontSize = '0.7rem';
                tdTime.style.color = '#64748b';
                tdTime.textContent = new Date(l.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                
                const tdScreen = document.createElement('td');
                tdScreen.style.fontWeight = '600';
                tdScreen.textContent = l.screen_name || 'Unknown';

                const tdType = document.createElement('td');
                let typeHtml = `<span style="font-size:0.65rem; font-weight:700; padding:2px 6px; border-radius:4px; background:#f1f5f9; color:#475569;">${l.event_type.toUpperCase()}</span>`;
                if (l.event_type === 'status_change') {
                    const isOnline = l.details.includes('ONLINE');
                    typeHtml = `<span style="font-size:0.65rem; font-weight:700; color:${isOnline ? '#059669' : '#dc2626'}; border:1px solid currentColor; padding:1px 6px; border-radius:4px;">${isOnline ? 'ONLINE' : 'OFFLINE'}</span>`;
                }
                tdType.innerHTML = typeHtml;

                const tdDetails = document.createElement('td');
                tdDetails.style.fontSize = '0.75rem';
                tdDetails.textContent = l.details || '—';

                tr.appendChild(tdTime);
                tr.appendChild(tdScreen);
                tr.appendChild(tdType);
                tr.appendChild(tdDetails);
                body.appendChild(tr);
            });
            lucide.createIcons();
        } catch (e) {
            body.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Error: ${e.message}</td></tr>`;
        }
    },

    openLocationModal(screen) {
        const modal = document.getElementById('location-modal');
        const latEl = document.getElementById('loc-lat');
        const lngEl = document.getElementById('loc-lng');
        const addrEl = document.getElementById('loc-address');
        const fixedEl = document.getElementById('loc-fixed');
        const track = document.getElementById('loc-toggle-track');
        const thumb = document.getElementById('loc-toggle-thumb');

        // Pre-fill from screen data
        latEl.value = screen.latitude || '';
        lngEl.value = screen.longitude || '';
        addrEl.value = screen.address || '';
        fixedEl.checked = !!screen.is_fixed_location;

        // Toggle styling
        const updateToggle = () => {
            track.style.background = fixedEl.checked ? '#7c3aed' : '#cbd5e1';
            thumb.style.transform = fixedEl.checked ? 'translateX(20px)' : 'translateX(0)';
        };
        updateToggle();
        fixedEl.onchange = updateToggle;

        modal.classList.add('active');

        // Init location picker map (destroy and recreate to avoid Leaflet reuse issues)
        const mapEl = document.getElementById('loc-modal-map');
        if (this._locMap) { this._locMap.remove(); this._locMap = null; }
        const initLat = parseFloat(screen.latitude) || 17.3850;
        const initLng = parseFloat(screen.longitude) || 78.4867;
        const locMap = L.map(mapEl, { zoomControl: true }).setView([initLat, initLng], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(locMap);
        let locMarker = L.marker([initLat, initLng], { draggable: true }).addTo(locMap);
        this._locMap = locMap;

        // Click map → move pin + update fields
        locMap.on('click', e => {
            const { lat, lng } = e.latlng;
            locMarker.setLatLng([lat, lng]);
            latEl.value = lat.toFixed(6);
            lngEl.value = lng.toFixed(6);
        });

        // Drag marker → update fields
        locMarker.on('dragend', () => {
            const { lat, lng } = locMarker.getLatLng();
            latEl.value = lat.toFixed(6);
            lngEl.value = lng.toFixed(6);
        });

        // Typing lat/lng → move map
        const syncMapFromInputs = () => {
            const lat = parseFloat(latEl.value);
            const lng = parseFloat(lngEl.value);
            if (!isNaN(lat) && !isNaN(lng)) {
                locMarker.setLatLng([lat, lng]);
                locMap.setView([lat, lng], 15);
            }
        };
        latEl.oninput = syncMapFromInputs;
        lngEl.oninput = syncMapFromInputs;

        // "Use My Location" — browser GPS
        document.getElementById('btn-use-my-location').onclick = () => {
            if (!navigator.geolocation) return App.showToast('Geolocation not supported', 'error');
            const btn = document.getElementById('btn-use-my-location');
            btn.innerText = '📡 Locating...';
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude: lat, longitude: lng } = pos.coords;
                latEl.value = lat.toFixed(6);
                lngEl.value = lng.toFixed(6);
                locMarker.setLatLng([lat, lng]);
                locMap.setView([lat, lng], 16);
                btn.innerText = '🎯 Use My Location';
            }, () => {
                App.showToast('Could not get location', 'error');
                btn.innerText = '🎯 Use My Location';
            });
        };

        // Reverse geocode
        document.getElementById('btn-reverse-geocode').onclick = async () => {
            const lat = parseFloat(latEl.value), lng = parseFloat(lngEl.value);
            if (isNaN(lat) || isNaN(lng)) return App.showToast('Enter coordinates first', 'error');
            const btn = document.getElementById('btn-reverse-geocode');
            btn.innerText = '⏳ Looking up...';
            try {
                const r = await fetch(`http://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
                const geo = await r.json();
                if (geo?.city) {
                    addrEl.value = [geo.city, geo.principalSubdivision, geo.countryName].filter(Boolean).join(', ');
                } else {
                    App.showToast('No address found for these coordinates', 'warning');
                }
            } catch { App.showToast('Geocode failed', 'error'); }
            finally { btn.innerText = '🔍 Lookup Address'; }
        };

        // Save
        document.getElementById('btn-save-location').onclick = async () => {
            const lat = parseFloat(latEl.value);
            const lng = parseFloat(lngEl.value);
            if (isNaN(lat) || isNaN(lng)) return App.showToast('Valid coordinates required', 'error');
            const saveBtn = document.getElementById('btn-save-location');
            saveBtn.innerText = 'Saving...';
            try {
                await window.Api.put(`/screens/${screen.id}`, {
                    ...screen,
                    latitude: lat,
                    longitude: lng,
                    address: addrEl.value,
                    is_fixed_location: fixedEl.checked ? 1 : 0,
                    location_source: 'Manual'
                });
                modal.classList.remove('active');
                App.showToast('Location saved!', 'success');
                // Refresh data & re-render detail panel
                const refreshed = await window.Api.get('/screens');
                if (refreshed) {
                    this.localScreens = refreshed;
                    this.showDetails(screen.id);
                }
            } catch (err) { App.showToast('Save failed: ' + err.message, 'error'); }
            finally { saveBtn.innerText = '💾 Save Location'; }
        };
    },

    openLinkModal(screen) {
        const modal = document.getElementById('link-xibo-modal');
        const select = document.getElementById('link-xibo-select');

        select.innerHTML = '';
        if (this.xiboDisplays.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '-- No available Xibo displays found --';
            select.appendChild(opt);
        } else {
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '-- Choose Connected Player --';
            select.appendChild(defaultOpt);
            this.xiboDisplays.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.displayId;
                opt.textContent = `${d.name} (ID:${d.displayId})`;
                select.appendChild(opt);
            });
        }

        modal.classList.add('active');

        document.getElementById('btn-submit-link').onclick = async () => {
            const displayId = select.value;
            if (!displayId) return App.showToast('Select a player', 'error');

            try {
                await window.Api.put(`/screens/${screen.id}`, {
                    ...screen,
                    xibo_display_id: parseInt(displayId, 10),
                    status: 'Linked'
                });
                modal.classList.remove('active');
                this.mount(document.getElementById('view-container'));
                App.showToast('Screen linked successfully!', 'success');
            } catch (err) { App.showToast('Link fail: ' + err.message, 'error'); }
        };
    },

    openEditModal(screen) {
        if (!screen) return;
        const id = screen.id;
        
        // Refresh object from master list just in case
        const latest = this.localScreens.find(s => s.id === id) || screen;
        
        document.getElementById('edit-modal-title').innerText = latest.name;
        document.getElementById('edit-screen-name').value = latest.name;
        document.getElementById('edit-screen-city').value = latest.city || '';
        document.getElementById('edit-screen-address').value = latest.address || '';
        document.getElementById('edit-screen-lat').value = latest.latitude || '';
        document.getElementById('edit-screen-lng').value = latest.longitude || '';
        document.getElementById('edit-screen-partner-select').value = latest.partner_id || '';
        document.getElementById('edit-screen-notes').value = latest.notes || '';
        document.getElementById('edit-screen-orientation').value = latest.orientation || 'Landscape';
        document.getElementById('edit-screen-resolution').value = latest.resolution || '';
        document.getElementById('edit-screen-modal').classList.add('active');

        document.getElementById('btn-submit-edit').onclick = async () => {
            const body = {
                ...latest,
                name: document.getElementById('edit-screen-name').value,
                city: document.getElementById('edit-screen-city').value,
                address: document.getElementById('edit-screen-address').value,
                latitude: document.getElementById('edit-screen-lat').value,
                longitude: document.getElementById('edit-screen-lng').value,
                partner_id: document.getElementById('edit-screen-partner-select').value || null,
                notes: document.getElementById('edit-screen-notes').value,
                orientation: document.getElementById('edit-screen-orientation').value,
                resolution: document.getElementById('edit-screen-resolution').value
            };
            try {
                await window.Api.put(`/screens/${id}`, body);
                document.getElementById('edit-screen-modal').classList.remove('active');
                await this.mount(document.getElementById('view-container'), id);
                App.showToast('Screen updated successfully', 'success');
            } catch (err) { App.showToast('Save failed', 'error'); }
        };

        document.getElementById('btn-delete-screen').onclick = async () => {
            if (!await App.showConfirm('Permanent delete?')) return;
            try {
                await window.Api.delete(`/screens/${screen.id}`);
                document.getElementById('edit-screen-modal').classList.remove('active');
                this.mount(document.getElementById('view-container'));
            } catch (err) { App.showToast('Delete failed', 'error'); }
        };
    },

    /**
     * Shows a diagnostic alert when Xibo API is unreachable.
     */
    showXiboDiagnosticAlert(err) {
        let alert = document.getElementById('xibo-diag-alert');
        if (!alert) {
            alert = document.createElement('div');
            alert.id = 'xibo-diag-alert';
            alert.className = 'alert alert-warning m-3 d-flex align-items-center justify-content-between';
            const container = document.getElementById('screens-view');
            if (container) container.prepend(alert);
        }

        const is404 = err.error?.includes('404') || err.message?.includes('404');
        const diagnosticMsg = is404 
            ? `<strong>Xibo API Unreachable (404)</strong>. This usually means Nginx rewrite rules are missing. <br><small>Try adding <code>/api/index.php</code> to your URL or check your server config.</small>`
            : `<strong>Xibo Connection Error</strong>: ${err.error || 'Check credentials'}`;

        alert.innerHTML = `
            <span>
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${diagnosticMsg}
            </span>
            <button class="btn btn-sm btn-outline-dark" data-onclick="window.location.reload">Retry</button>
        `;
    },
    async showMapModal() {
        const modal = document.getElementById('screens-map-modal');
        modal.classList.add('active');
        lucide.createIcons();

        // Small delay to ensure modal is visible for Leaflet to calculate size
        setTimeout(() => {
            if (this.globalMap) {
                this.globalMap.remove();
            }

            this.globalMap = L.map('global-map-container', { zoomControl: true }).setView([17.3850, 78.4867], 11);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(this.globalMap);

            const markers = [];
            this.localScreens.forEach(s => {
                const lat = s.latitude;
                const lng = s.longitude;
                if (!lat || !lng) return;

                const xibo = this.allXiboDisplays.find(xd => xd.displayId === s.xibo_display_id);
                const isLinked = !!s.xibo_display_id;
                const online = xibo ? xibo.loggedIn : false;

                let color = '#f59e0b'; // Unlinked (Orange)
                let stroke = '#92400e';
                if (isLinked) {
                    color = online ? '#10b981' : '#ef4444';
                    stroke = online ? '#065f46' : '#7f1d1d';
                }

                const customIcon = L.divIcon({
                    html: `<div style="background:${color}; width:16px; height:16px; border-radius:50%; border:2px solid ${stroke}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
                    className: '',
                    iconSize: [16, 16]
                });

                const popupHtml = `
                    <div style="font-family:'Inter', sans-serif; min-width: 150px;">
                        <div style="font-weight:700; margin-bottom:4px; font-size:0.9rem;">${s.name}</div>
                        <div style="font-size:0.75rem; color:#64748b; margin-bottom:8px;">${s.city || 'Unknown City'}</div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem;">
                            <span style="width:8px; height:8px; border-radius:50%; background:${color};"></span>
                            <span style="font-weight:600;">${isLinked ? (online ? 'Online' : 'Offline') : 'Not Linked'}</span>
                        </div>
                        <button class="btn btn-primary" style="width:100%; margin-top:10px; font-size:0.7rem; padding:4px 8px; height:auto;" onclick="window.Views.screens.showDetails(${s.id}); App.closeModal();">View Details</button>
                    </div>
                `;

                const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.globalMap).bindPopup(popupHtml);
                markers.push([lat, lng]);
            });

            if (markers.length > 0) {
                this.globalMap.fitBounds(markers, { padding: [50, 50] });
            }
        }, 300);
    },

    unmount() {
        if (this.globalMap) this.globalMap.remove();
        if (this.detMap) this.detMap.remove();
        if (this._locMap) this._locMap.remove();
    }
});
