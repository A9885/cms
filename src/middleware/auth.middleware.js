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
    // Check cookies or Authorization header
    const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') 
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
