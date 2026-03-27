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
            document.querySelector('.user-info .name').innerText = authData.user.username;
        } catch (e) {
            window.location.href = '/admin/login.html';
            return;
        }
        
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

        // Handle initial route
        window.addEventListener('hashchange', this.handleRoute.bind(this));

        // Navigation Setup
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            if (item.getAttribute('href') === '/') return; // external link
            
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = item.dataset.view;
                this.navigate(viewName);
            });
        });

        // Handle initial load based on hash or default to dashboard
        this.handleRoute();
    },

    handleRoute() {
        let hash = window.location.hash.substring(1);
        if (!hash || !this.views[hash]) {
            hash = 'dashboard';
        }
        this.navigate(hash);
    },

    registerView(name, viewObj) {
        this.views[name] = viewObj;
    },

    async navigate(viewName) {
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

        // Update URL hash without jumping
        history.replaceState(undefined, undefined, `#${viewName}`);

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
    }
};

window.App = App;

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
