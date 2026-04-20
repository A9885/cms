/**
 * Time Utility for IST (Indian Standard Time)
 * ─────────────────────────────────────────────────────────────────
 * Handles conversion from UTC/CMS time to IST (UTC + 5:30).
 * This ensures that playback statistics and display statuses are
 * correctly reported according to the Indian calendar day.
 */

/**
 * Converts a UTC Date object or ISO string to an IST Date object.
 * @param {Date|string} date 
 * @returns {Date} - A Date object shifted by +5.5 hours.
 */
function toIST(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    // Add 5 hours and 30 minutes
    return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
}

/**
 * Formats a date as YYYY-MM-DD according to the IST calendar.
 * @param {Date|string} date 
 * @returns {string} - "YYYY-MM-DD"
 */
function getISTDateString(date) {
    const ist = toIST(date);
    if (!ist) return null;
    
    const pad = (n) => n.toString().padStart(2, '0');
    const year = ist.getUTCFullYear();
    const month = pad(ist.getUTCMonth() + 1);
    const day = pad(ist.getUTCDate());
    
    return `${year}-${month}-${day}`;
}

/**
 * Formats a date as a human-readable IST string.
 * @param {Date|string} date 
 */
function formatIST(date) {
    const ist = toIST(date);
    if (!ist) return 'Unknown';
    
    const pad = (n) => n.toString().padStart(2, '0');
    const year = ist.getUTCFullYear();
    const month = pad(ist.getUTCMonth() + 1);
    const day = pad(ist.getUTCDate());
    const hours = pad(ist.getUTCHours());
    const mins = pad(ist.getUTCMinutes());
    const secs = pad(ist.getUTCSeconds());
    
    return `${day}/${month}/${year}, ${hours}:${mins}:${secs} IST`;
}

module.exports = {
    toIST,
    getISTDateString,
    formatIST
};
