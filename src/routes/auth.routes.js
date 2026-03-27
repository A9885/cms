const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { dbGet } = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth.middleware');

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

        // Determine redirect portal
        let portalUrl = '/admin/';
        if (user.role === 'Brand') portalUrl = '/brandportal/index.html';
        if (user.role === 'Partner') portalUrl = '/partnerportal/index.html';
        
        // Set cookie
        res.cookie('token', token, { httpOnly: true, secure: false, maxAge: 12 * 60 * 60 * 1000 });
        res.json({ success: true, user: { username: user.username, role: user.role }, portalUrl });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// GET logout — for browser-based href links
router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/admin/login.html');
});


router.get('/me', (req, res) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not logged in' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ user: decoded });
    } catch {
        res.status(401).json({ error: 'Expired token' });
    }
});

module.exports = router;
