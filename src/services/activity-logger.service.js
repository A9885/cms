/**
 * Activity Logger Service
 *
 * Provides a centralized, fire-and-forget `logActivity()` function.
 * All logs are written to the `activity_logs` MySQL table.
 *
 * Design principles:
 *  - NEVER throws — errors are silently swallowed so a logging failure
 *    NEVER breaks the main request flow.
 *  - Async fire-and-forget via `setImmediate()` to avoid adding latency.
 *  - Accepts a `req` object for automatic IP and user extraction, or
 *    explicit overrides for use in services (no req available).
 */

const { dbRun } = require('../db/database');

/**
 * Action constants — use these for the `action` parameter.
 */
const ACTION = {
    CREATE:     'CREATE',
    UPDATE:     'UPDATE',
    DELETE:     'DELETE',
    APPROVE:    'APPROVE',
    REJECT:     'REJECT',
    LOGIN:      'LOGIN',
    LOGOUT:     'LOGOUT',
    PROVISION:  'PROVISION',
    SYNC:       'SYNC',
    ERROR:      'ERROR',
    UPLOAD:     'UPLOAD',
    ASSIGN:     'ASSIGN',
    UNASSIGN:   'UNASSIGN',
};

/**
 * Module constants — use these for the `module` parameter.
 */
const MODULE = {
    USER:       'USER',
    BRAND:      'BRAND',
    PARTNER:    'PARTNER',
    SCREEN:     'SCREEN',
    DISPLAY:    'DISPLAY',
    CAMPAIGN:   'CAMPAIGN',
    CREATIVE:   'CREATIVE',
    LAYOUT:     'LAYOUT',
    PLAYLIST:   'PLAYLIST',
    CMS:        'CMS',
    BILLING:    'BILLING',
    SYSTEM:     'SYSTEM',
    AUTH:       'AUTH',
    SLOT:       'SLOT',
    MODERATION: 'MODERATION',
};

/**
 * Extract the real client IP from a request object,
 * handling reverse-proxy headers (X-Forwarded-For, X-Real-IP).
 * @param {import('express').Request|null} req
 * @returns {string}
 */
function extractIp(req) {
    if (!req) return 'system';
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers?.['x-real-ip'] || req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Extract user ID from a request or explicit override.
 * Priority: explicit userId > req.user.id > null (anonymous/system action).
 * @param {import('express').Request|null} req
 * @param {number|string|null} [userId]
 * @returns {number|null}
 */
function extractUserId(req, userId) {
    if (userId !== undefined && userId !== null) return userId;
    return req?.user?.id ?? null;
}

/**
 * Core logging function — writes one record to `activity_logs`.
 *
 * @param {Object} opts
 * @param {string}  opts.action      - One of ACTION constants (e.g. 'CREATE')
 * @param {string}  opts.module      - One of MODULE constants (e.g. 'BRAND')
 * @param {string}  opts.description - Human-readable description of the event
 * @param {import('express').Request|null} [opts.req] - Express request (for IP + user)
 * @param {number|string|null} [opts.userId]          - Explicit user ID override
 * @param {string|null} [opts.ipAddress]              - Explicit IP override
 *
 * @returns {void} — fire and forget; does NOT return a Promise you need to await.
 */
function logActivity({ action, module, description, req = null, userId = null, ipAddress = null }) {
    // Use setImmediate so this never adds latency to the response
    setImmediate(async () => {
        try {
            const uid = extractUserId(req, userId);
            const ip  = ipAddress ?? extractIp(req);

            await dbRun(
                `INSERT INTO activity_logs (user_id, action, module, description, ip_address)
                 VALUES (?, ?, ?, ?, ?)`,
                [uid, action, module, description, ip]
            );
        } catch (err) {
            // Never propagate — logging must NEVER crash production
            console.warn('[ActivityLogger] Failed to write log (non-fatal):', err.message);
        }
    });
}

module.exports = { logActivity, ACTION, MODULE };
