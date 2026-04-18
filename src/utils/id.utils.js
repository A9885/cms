const crypto = require('crypto');

/**
 * Generates a unique string ID for database entities.
 * (Consistent with Better Auth's string-based identity requirements)
 * @param {string} prefix Optional prefix for the ID (e.g. 'user_', 'acc_')
 * @returns {string} 24-character random alphanumeric ID
 */
function generateId(prefix = '') {
    return prefix + crypto.randomBytes(12).toString('hex');
}

module.exports = { generateId };
