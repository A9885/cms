const express = require('express');
const router = express.Router();
router.use(express.json());
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { dbGet, dbRun } = require('../db/database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth.middleware');
const { getAuth } = require('../auth.js');
const { logActivity, ACTION, MODULE } = require('../services/activity-logger.service');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { auth } = await getAuth();
        const { fromNodeHeaders } = await import('better-auth/node');
        
        const isEmail = username.includes('@');
        let result;

        if (isEmail) {
            // Find the user by actual username if they entered an email as username, 
            // OR find by email if it matches user.email.
            // Better Auth signInEmail uses the 'email' field.
            // However, our users table has dummy emails like user1@signtral.com.
            // If the user entered their username (which happens to be an email), 
            // Better Auth's signInEmail might fail if it doesn't match the 'email' column.
            
            // To be safe, we first try signInEmail. If that fails, we try signInUsername 
            // (though Better Auth plugin might reject it).
            result = await auth.api.signInEmail({
                body: { email: username, password },
                headers: fromNodeHeaders(req.headers)
            }).catch(() => null);

            if (!result) {
                // Try as username even if it has an @
                result = await auth.api.signInUsername({
                    body: { username, password },
                    headers: fromNodeHeaders(req.headers)
                }).catch(() => null);
            }
        } else {
            result = await auth.api.signInUsername({
                body: { username, password },
                headers: fromNodeHeaders(req.headers)
            }).catch(() => null);
        }

        if (!result || !result.user) {
            logActivity({
                action: 'LOGIN',
                module: MODULE.AUTH,
                description: `Failed login attempt for "${username}"`,
                req,
                userId: null
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.user;
        const userId = user && user.id ? parseInt(user.id, 10) : null;

        // Log successful login
        logActivity({
            action: ACTION.LOGIN,
            module: MODULE.AUTH,
            description: `User "${user.username || user.email || 'unknown'}" (role: ${user.role || 'unknown'}) logged in`,
            req,
            userId: isNaN(userId) ? null : userId
        });
        
        // Determine redirect portal
        let portalUrl = '/admin/';
        if (user.role === 'Brand') {
            portalUrl = '/brandportal/index.html';
        } else if (user.role === 'Partner') {
            portalUrl = '/partnerportal/index.html';
        }

        res.json({ 
            success: true, 
            user: { username: user.username, role: user.role }, 
            portalUrl,
            forcePasswordReset: !!user.force_password_reset
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const { auth } = await getAuth();
        const { fromNodeHeaders } = await import('better-auth/node');
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
        if (session && session.user) {
            const user = session.user;
            const userId = user && user.id ? parseInt(user.id, 10) : null;
            logActivity({
                action: ACTION.LOGOUT,
                module: MODULE.AUTH,
                description: `User "${user.username || user.email || 'unknown'}" logged out`,
                req,
                userId: isNaN(userId) ? null : userId
            });
        }
        await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
    } catch (e) {}
    res.json({ success: true });
});

// GET logout — for browser-based href links
router.get('/logout', async (req, res) => {
    try {
        const { auth } = await getAuth();
        const { fromNodeHeaders } = await import('better-auth/node');
        await auth.api.signOut({
            headers: fromNodeHeaders(req.headers)
        });
    } catch (e) {}
    res.redirect('/admin/login.html');
});


router.get('/me', async (req, res) => {
    try {
        const { auth } = await getAuth();
        const { fromNodeHeaders } = await import('better-auth/node');
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });

        if (!session) return res.status(401).json({ error: 'Not logged in' });
        
        res.json({ 
            user: {
                ...session.user,
                forcePasswordReset: !!session.user.force_password_reset
            }
        });
    } catch (err) {
        res.status(401).json({ error: 'Expired session' });
    }
});

/**
 * PUT /auth/profile
 * Updates the user's profile information (name, email, timezone).
 */
router.put('/profile', authMiddleware, async (req, res) => {
    const { name, email, timezone } = req.body;
    const userId = req.user.id;

    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required.' });
    }

    try {
        // Check if email is already taken by another user
        const existing = await dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
        if (existing) {
            return res.status(400).json({ error: 'Email is already in use.' });
        }

        await dbRun(
            'UPDATE users SET name = ?, email = ?, timezone = ? WHERE id = ?',
            [name, email, timezone || 'Asia/Kolkata', userId]
        );

        // Better Auth uses email as accountId for credentials provider in this project's setup
        await dbRun(
            "UPDATE account SET accountId = ? WHERE userId = ? AND providerId = 'credential'",
            [email, userId]
        );

        logActivity({
            action: ACTION.UPDATE,
            module: MODULE.AUTH,
            description: `User "${req.user.username}" updated their profile (Email: ${email})`,
            req,
            userId
        });

        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

/**
 * POST /auth/change-password
 * Allows users to update their password. Also clears the force_password_reset flag.
 */
router.post('/change-password', authMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const userId = req.user.id;

    try {
        // 1. Verify current password if it's not a forced reset
        const user = await dbGet('SELECT password_hash, force_password_reset FROM users WHERE id = ?', [userId]);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // If not in forced reset mode, we require the current password
        if (!user.force_password_reset) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password is required.' });
            }
            
            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Incorrect current password.' });
            }
        }

        // 2. Hash and update new password
        const { hashPassword } = await import('@better-auth/utils/password');
        const hash = await hashPassword(newPassword);
        
        const userEmail = req.user.email;

        // Update the users table
        await dbRun('UPDATE users SET password_hash = ?, force_password_reset = 0 WHERE id = ?', [hash, userId]);

        // Update the Better Auth account table (the authoritative source for login)
        await dbRun(
            `UPDATE account SET password = ? WHERE userId = ? AND providerId = 'credential'`,
            [hash, userId]
        );

        logActivity({
            action: ACTION.UPDATE,
            module: MODULE.AUTH,
            description: `User "${req.user.username || userEmail}" changed their password`,
            req,
            userId
        });
        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Failed to update password. Please try again.' });
    }
});

module.exports = router;
