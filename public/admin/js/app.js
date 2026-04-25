/**
 * app.js - Core application logic and routing
 */

const App = {
    views: {},
    currentView: null,

    async init() {
        console.log("Admin Portal Initialized");
        
        // Authentication check
        try {
            const authRes = await fetch('/auth/me');
            if (!authRes.ok) {
                window.location.href = '/admin/login.html';
                return;
            }
            const authData = await authRes.json();
            const user = authData.user;
            
            // Populate Profile UI
            document.getElementById('admin-user-name').innerText = user.username || 'Admin';
            document.getElementById('admin-user-email').innerText = user.email || '';
            document.getElementById('user-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`;

            if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
                 // Protect Admin portal from other roles
                 window.location.href = '/admin/login.html';
                 return;
            }
        } catch (e) {
            window.location.href = '/admin/login.html';
            return;
        }

        // Globally hide Campaigns tab — feature not in use
        const hiddenStyle = document.createElement('style');
        hiddenStyle.textContent = `a[data-view="campaigns"] { display: none !important; }`;
        document.head.appendChild(hiddenStyle);
        
        // Mobile Sidebar Toggle
        const menuBtn = document.querySelector('.icon-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('active');
            });
        }

        // WebSockets Setup
        if (window.io) {
            const socket = io();
            socket.on('stats_updated', () => {
                console.log('Real-time updates pulled via WebSocket');
                if (window.location.hash === '' || window.location.hash === '#dashboard') {
                    this.navigate('dashboard');
                }
            });
        }

        // Handle initial route — hashchange fires if user edits URL bar manually
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1);
            if (hash && this.views[hash]) {
                this.navigate(hash, true); // true = replace (already in history)
            }
        });

        // popstate fires when the user clicks back/forward
        window.addEventListener('popstate', (e) => {
            const hash = (e.state && e.state.view) || window.location.hash.substring(1) || 'dashboard';
            if (this.views[hash]) {
                this.navigate(hash, true); // true = replace (already in history)
            }
        });

        // Navigation Setup
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            if (item.getAttribute('href') === '/') return; // external link
            
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = item.dataset.view;
                this.navigate(viewName);
            });
        });

        // Handle initial load — use replaceState so the entry is in history but doesn't double-push
        this.handleRoute(true);

        // --- CSP-Safe Event Delegation ---
        // This replaces inline onclick="..." and onsubmit="..." which are blocked by production CSP
        const container = document.getElementById('view-container');
        if (container) {
            container.addEventListener('click', (e) => {
                const target = e.target.closest('[data-onclick]');
                if (!target) return;
                
                const action = target.getAttribute('data-onclick');
                const parts = action.split('.');
                let context = window;
                let fn = window;
                
                for (let i = 0; i < parts.length; i++) {
                    if (i < parts.length - 1) context = context[parts[i]];
                    fn = fn ? fn[parts[i]] : null;
                }
                
                if (typeof fn === 'function') {
                    fn.call(context, e);
                }
            });

            container.addEventListener('submit', (e) => {
                const target = e.target.closest('[data-onsubmit]');
                if (!target) return;
                
                const action = target.getAttribute('data-onsubmit');
                const parts = action.split('.');
                let context = window;
                let fn = window;
                
                for (let i = 0; i < parts.length; i++) {
                    if (i < parts.length - 1) context = context[parts[i]];
                    fn = fn ? fn[parts[i]] : null;
                }
                
                if (typeof fn === 'function') {
                    fn.call(context, e);
                }
            });
        }
    },

    handleRoute(replace = false) {
        let hash = window.location.hash.substring(1);
        if (!hash || !this.views[hash]) {
            hash = 'dashboard';
        }
        this.navigate(hash, replace);
    },

    registerView(name, viewObj) {
        this.views[name] = viewObj;
    },

    closeModal(e) {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
    },

    fillRegisterFields(e) {
        const target = e.target.closest('[data-onclick]');
        if (target) {
            document.getElementById('reg-xibo-code').value = target.dataset.code;
            document.getElementById('reg-xibo-name').value = target.dataset.name;
        }
    },

    async navigate(viewName, replace = false) {
        if (!this.views[viewName]) {
            console.error(`View ${viewName} not found`);
            return;
        }

        // Unmount current view (clean up timers etc.)
        if (this.currentView && this.views[this.currentView] && typeof this.views[this.currentView].unmount === 'function') {
            this.views[this.currentView].unmount();
        }
        // Remove any persistent DOM badges left by previous views
        const leftover = document.getElementById('inv-countdown');
        if (leftover) leftover.remove();

        // Update Nav UI
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (activeNav) activeNav.classList.add('active');

        // Push a real history entry so back/forward works within the SPA.
        // replaceState is used on initial load or when handling popstate/hashchange
        // (the entry already exists in history in those cases).
        const stateObj = { view: viewName };
        if (replace) {
            history.replaceState(stateObj, '', `#${viewName}`);
        } else {
            history.pushState(stateObj, '', `#${viewName}`);
        }

        const container = document.getElementById('view-container');
        
        // Render View Outline
        container.innerHTML = this.views[viewName].render();
        lucide.createIcons(); // refresh icons generated dynamically

        // Call View mount/data fetch lifecycle
        if (typeof this.views[viewName].mount === 'function') {
            await this.views[viewName].mount(container);
            lucide.createIcons(); // refresh icons again for async content
        }

        this.currentView = viewName;
    },

    showToast(message, type = 'info') {
        const existing = document.getElementById('admin-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'admin-toast';
        toast.innerText = message;
        
        // Premium Toast Styling
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 10000;
            padding: 12px 24px;
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        if (!document.getElementById('toast-anims')) {
            const style = document.createElement('style');
            style.id = 'toast-anims';
            style.innerHTML = `
                @keyframes toastSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 4000);
    },

    showSyncingBanner() {
        if (document.getElementById('xibo-sync-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'xibo-sync-banner';
        banner.innerHTML = '⚠️ Xibo Connection Syncing... Some data may be outdated.';
        
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: #FFF3CD;
            border-bottom: 1px solid #FFC107;
            color: #856404;
            padding: 12px;
            text-align: center;
            font-weight: 600;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            animation: bannerFadeIn 0.3s ease-out;
            transition: opacity 1s ease-out;
        `;

        // Add animation if not present
        if (!document.getElementById('banner-anims')) {
            const style = document.createElement('style');
            style.id = 'banner-anims';
            style.innerHTML = `
                @keyframes bannerFadeIn {
                    from { transform: translateY(-100%); }
                    to { transform: translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.prepend(banner);

        setTimeout(() => {
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 1000);
        }, 10000);
    },

    showConfirm(title, message) {
        // Handle case where only one argument is passed
        if (!message) {
            message = title;
            title = 'Confirmation Required';
        }

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:20000;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;';
            const modal = document.createElement('div');
            modal.style.cssText = 'background:#1e293b; color:#fff; padding:24px; border-radius:16px; width:400px; box-shadow:0 20px 50px rgba(0,0,0,0.3); border:1px solid #334155;';
            
            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-weight:600; font-size:16px; margin-bottom:12px;';
            titleEl.textContent = title;
            
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:14px; color:#94a3b8; margin-bottom:24px; line-height:1.5;';
            msg.textContent = message;
            
            const footer = document.createElement('div');
            footer.style.cssText = 'display:flex; justify-content:flex-end; gap:12px;';
            
            const btnCancel = document.createElement('button');
            btnCancel.className = 'btn';
            btnCancel.style.cssText = 'background:#334155; color:#fff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;';
            btnCancel.textContent = 'Cancel';
            btnCancel.onclick = () => { overlay.remove(); resolve(false); };
            
            const btnConfirm = document.createElement('button');
            btnConfirm.className = 'btn';
            btnConfirm.style.cssText = 'background:#ef4444; color:#fff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;';
            btnConfirm.textContent = 'Confirm';
            btnConfirm.onclick = () => { overlay.remove(); resolve(true); };
            
            footer.append(btnCancel, btnConfirm);
            modal.append(titleEl, msg, footer);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    },
    
    async logout() {
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } catch(e) {}
        window.location.href = '/admin/login.html';
    }
};

window.App = App;

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
