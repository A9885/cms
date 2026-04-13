/**
 * api.js - Simple fetch wrappers for backend communication
 */

const Api = {
    async get(endpoint) {
        try {
            const res = await fetch(`/admin/api${endpoint}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return await res.json();
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
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (err) {
            console.error(`API POST ${endpoint} error:`, err);
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
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (err) {
            console.error(`API PUT ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    async delete(endpoint) {
        try {
            const res = await fetch(`/admin/api${endpoint}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (err) {
            console.error(`API DELETE ${endpoint} error:`, err);
            return { error: err.message };
        }
    },

    // Xibo passthroughs
    async getXiboDisplays() {
        try {
            const res = await fetch(`/xibo/displays/locations`);
            return await res.json();
        } catch (err) { return {}; }
    },

    async getXiboLibrary() {
        try {
            const res = await fetch(`/xibo/library`);
            return await res.json();
        } catch (err) { return []; }
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
