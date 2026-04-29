/**
 * api.js - Simple fetch wrappers for backend communication
 */

const Api = {
    async get(endpoint) {
        try {
            const sep = endpoint.includes('?') ? '&' : '?';
            const res = await fetch(`/admin/api${endpoint}${sep}t=${Date.now()}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { error: data.error || `HTTP ${res.status}`, ...data };
            }
            if (data.syncing) {
                if (window.App) window.App.showSyncingBanner();
                return data.data || [];
            }
            return data;
        } catch (err) {
            console.error(`API GET ${endpoint} error:`, err);
            return { error: err.message };
        }
    },
    
    async post(endpoint, body) {
        try {
            const res = await fetch(`/admin/api${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { error: data.error || `HTTP ${res.status}`, ...data };
            }
            return data;
        } catch (err) {
            console.error(`API POST ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    async upload(endpoint, formData) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { error: data.error || `HTTP ${res.status}`, ...data };
            }
            return data;
        } catch (err) {
            console.error(`API UPLOAD ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    async put(endpoint, body) {
        try {
            const res = await fetch(`/admin/api${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { error: data.error || `HTTP ${res.status}`, ...data };
            }
            return data;
        } catch (err) {
            console.error(`API PUT ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    async patch(endpoint, body) {
        try {
            const options = { method: 'PATCH' };
            if (body) {
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify(body);
            }
            const res = await fetch(`/admin/api${endpoint}`, options);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { error: data.error || `HTTP ${res.status}`, ...data };
            }
            return data;
        } catch (err) {
            console.error(`API PATCH ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    async delete(endpoint) {
        try {
            const res = await fetch(`/admin/api${endpoint}`, {
                method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { error: data.error || `HTTP ${res.status}`, ...data };
            }
            return data;
        } catch (err) {
            console.error(`API DELETE ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    // Xibo passthroughs
    async getXiboDisplays() {
        try {
            const res = await fetch(`/xibo/displays/locations?t=${Date.now()}`);
            const data = await res.json();
            if (data.syncing && window.App) {
                window.App.showSyncingBanner();
            }
            return data.data || data || {};
        } catch (err) { return {}; }
    },

    async getXiboLibrary() {
        try {
            const res = await fetch(`/xibo/library?t=${Date.now()}`);
            if (!res.ok) {
                const text = await res.text();
                console.error('Xibo Library Fetch Error:', res.status, text);
                return { error: `HTTP ${res.status}`, detail: text };
            }
            const data = await res.json();
            if (data.syncing) {
                if (window.App) window.App.showSyncingBanner();
                return data.data || [];
            }
            return data;
        } catch (err) { 
            console.error('Xibo Library JS Error:', err);
            return { error: err.message }; 
        }
    },

    async putXiboDisplayLocation(displayId, body) {
        try {
            const res = await fetch(`/xibo/displays/${displayId}/location`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch (err) {
            console.error(`API PUT Xibo Display ${displayId} error:`, err);
            return { error: err.message };
        }
    },

    async postXiboDisplay(body) {
        try {
            const res = await fetch(`/xibo/displays`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch (err) {
            console.error(`API POST Xibo Display error:`, err);
            return { error: err.message };
        }
    },
    
    async getXiboAvailableDisplays() {
        try {
            const res = await fetch(`/xibo/displays/available`);
            const data = await res.json();
            if (!res.ok) return { error: data.error || `HTTP ${res.status}`, code: data.code };
            return data;
        } catch (err) { 
            return { error: err.message }; 
        }
    }
};

window.Api = Api;
