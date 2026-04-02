const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('CRITICAL ERROR: JWT_SECRET environment variable is not defined.');
    process.exit(1);
}

/**
 * Middleware to verify JSON Web Tokens (JWT) from cookies or Authorization header.
 * 
 * Extracts the token, verifies it against the secret key, and attaches 
 * the decoded payload to req.user.
 * 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
const authMiddleware = (req, res, next) => {
    // 1. Identify which portal we are currently accessing (using originalUrl)
    const isBrandPath = req.originalUrl.includes('brandportal');
    const isPartnerPath = req.originalUrl.includes('partnerportal');
    const isAdminPath = req.originalUrl.includes('admin');

    // 2. Select the primary cookie based on the path
    let primaryToken = null;
    if (isAdminPath) primaryToken = req.cookies?.admin_token;
    else if (isBrandPath) primaryToken = req.cookies?.brand_token;
    else if (isPartnerPath) primaryToken = req.cookies?.partner_token;

    // 3. Fallback to others if primary isn't found (allowing SuperAdmin cross-access)
    const token = primaryToken || 
                  req.cookies?.admin_token || 
                  req.cookies?.brand_token || 
                  req.cookies?.partner_token || 
                  req.cookies?.token ||
                  (req.headers.authorization?.startsWith('Bearer ') 
                      ? req.headers.authorization.split(' ')[1] 
                      : null);

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, username, role, brand_id?, partner_id? }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authMiddleware, JWT_SECRET };
