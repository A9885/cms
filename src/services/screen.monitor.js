const screenService = require('./screen.service');

/**
 * ScreenMonitor
 * ─────────────────────────────────────────────────────────────────
 * Periodic heartbeat service that synchronizes Xibo display status
 * (online/offline) with the local MySQL database.
 *
 * Runs every 2 minutes. Catch-all error handling ensures that 
 * network or API failures do not crash the main server process.
 */
class ScreenMonitor {
    constructor() {
        this.interval = null;
        this.intervalMs = 2 * 60 * 1000; // 2 minutes
        this.isProcessing = false;
        this.lastPulse = null;
        this.lastCleanupTime = null;
        this.lastFreedSlots = 0;
    }

    /**
     * Start the heartbeat monitor.
     */
    start() {
        if (this.interval) return;

        console.log(`[ScreenMonitor] 💓 Heartbeat service started (Interval: ${this.intervalMs / 1000}s)`);
        
        // Initial pulse after 10s to let server stabilize
        setTimeout(() => this.pulse(), 10000);

        this.interval = setInterval(() => {
            this.pulse();
        }, this.intervalMs);
    }

    /**
     * Stop the heartbeat monitor.
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * Single synchronization pulse.
     */
    async pulse() {
        if (this.isProcessing) {
            console.warn('[ScreenMonitor] ⚠️ Previous pulse still processing. Skipping...');
            return;
        }

        this.isProcessing = true;
        try {
            console.log(`[${new Date().toISOString()}] [ScreenMonitor] 🔄 Heartbeat pulse: Syncing screen states...`);
            
            // 1. Sync screen status from Xibo
            await screenService.syncDisplays();

            // 2. Cleanup expired slot assignments
            const freedCount = await screenService.cleanupExpiredSlots();
            this.lastCleanupTime = new Date();
            this.lastFreedSlots = freedCount || 0;
            
            this.lastPulse = new Date();
            console.log(`[ScreenMonitor] ✅ Heartbeat success. Next pulse in 2 minutes.`);
        } catch (err) {
            // CRITICAL: Catch all errors to prevent main process crash
            console.error('[ScreenMonitor] ❌ Heartbeat FAILED:', err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get health metrics for the monitor.
     */
    getStatus() {
        return {
            active: !!this.interval,
            lastPulse: this.lastPulse,
            lastCleanup: this.lastCleanupTime,
            freedSlots: this.lastFreedSlots,
            isProcessing: this.isProcessing
        };
    }
}

module.exports = new ScreenMonitor();
