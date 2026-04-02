const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { dbGet, dbRun } = require('../db/database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth.middleware');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const isMatch = bcrypt.compareSync(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({
            id: user.id,
            username: user.username,
            role: user.role,
            brand_id: user.brand_id || null,
            partner_id: user.partner_id || null
        }, JWT_SECRET, { expiresIn: '12h' });

        // Determine redirect portal and cookie name
        let portalUrl = '/admin/';
        let cookieName = 'admin_token';
        
        if (user.role === 'Brand') {
            portalUrl = '/brandportal/index.html';
            cookieName = 'brand_token';
        } else if (user.role === 'Partner') {
            portalUrl = '/partnerportal/index.html';
            cookieName = 'partner_token';
        }
        
        // Set cookie
        res.cookie(cookieName, token, { httpOnly: true, secure: false, maxAge: 12 * 60 * 60 * 1000 });
        // Also clear any legacy 'token' to avoid confusion
        if (cookieName !== 'token') res.clearCookie('token');

        res.json({ 
            success: true, 
            user: { username: user.username, role: user.role }, 
            portalUrl,
            forcePasswordReset: !!user.force_password_reset
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.clearCookie('brand_token');
    res.clearCookie('partner_token');
    res.clearCookie('token');
    res.json({ success: true });
});

// GET logout — for browser-based href links
router.get('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.clearCookie('brand_token');
    res.clearCookie('partner_token');
    res.clearCookie('token');
    res.redirect('/admin/login.html');
});


router.get('/me', (req, res) => {
    // Prioritize role-specific tokens over the generic admin token
    // This prevents a stale admin_token from shadowing a brand/partner session
    const token = req.cookies?.brand_token || 
                  req.cookies?.partner_token || 
                  req.cookies?.admin_token || 
                  req.cookies?.token;

    if (!token) return res.status(401).json({ error: 'Not logged in' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Fetch fresh state from DB for force_password_reset
        dbGet('SELECT force_password_reset FROM users WHERE id = ?', [decoded.id]).then(user => {
            res.json({ 
                user: {
                    ...decoded,
                    forcePasswordReset: !!user?.force_password_reset
                }
            });
        });
    } catch {
        res.status(401).json({ error: 'Expired token' });
    }
});

/**
 * POST /api/auth/change-password
 * Allows users to update their password. Also clears the force_password_reset flag.
 */
router.post('/change-password', authMiddleware, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    try {
        const hash = bcrypt.hashSync(newPassword, 10);
        await dbRun(
            'UPDATE users SET password_hash = ?, force_password_reset = 0 WHERE id = ?',
            [hash, req.user.id]
        );
        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Failed to update password.' });
    }
});

module.exports = router;
