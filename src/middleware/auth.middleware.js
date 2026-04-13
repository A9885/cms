const { getAuth } = require('../auth.js');

/**
 * Middleware to verify Better Auth session from cookies.
 * 
 * Extracts the token, verifies it against the Better Auth session table, 
 * and attaches the decoded payload to req.user.
 * 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
const authMiddleware = async (req, res, next) => {
    try {
        const { auth } = await getAuth();
        const { fromNodeHeaders } = await import('better-auth/node');
        
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });
        
        console.log(`[Auth Middleware] Path: ${req.path}, Session Found: ${!!session}`);
        
        if (!session || !session.user) {
            return res.status(401).json({ error: 'Unauthorized. Please login.' });
        }

        // session.user contains our schema inferred fields like role, brand_id, partner_id
        req.user = session.user;
        next();
    } catch (err) {
        console.error('[Auth Middleware] Verification failed:', err);
        return res.status(401).json({ error: 'Invalid or expired session' });
    }
};

module.exports = { authMiddleware };
