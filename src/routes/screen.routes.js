const express = require('express');
const router = express.Router();
const db = require('../db'); // Using the shared pool from src/db.js
const statsService = require('../services/stats.service');

/**
 * 1. POST /api/screens/add
 * Create a new screen record.
 */
router.post('/add', async (req, res) => {
  try {
    const { screen_id, location, city, partner_id, orientation, resolution, device_id } = req.body;
    
    // Validation
    if (!screen_id || !location || !city || !orientation || !resolution) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await db.query(
      `INSERT INTO screens (screen_id, location, city, partner_id, orientation, resolution, device_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Online')`,
      [screen_id, location, city, partner_id || null, orientation, resolution, device_id || null]
    );

    res.json({ success: true, screen_id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'screen_id already exists' });
    }
    console.error('[POST /screens/add] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /api/screens/:id
 * Fetch single screen by screen_id with usage stats.
 */
router.get('/:id', async (req, res) => {
  const screen_id = req.params.id;
  try {
    // Fetch screen info
    const [screens] = await db.query('SELECT * FROM screens WHERE screen_id = ?', [screen_id]);
    if (screens.length === 0) {
      return res.status(404).json({ error: 'Screen not found' });
    }

    const screen = screens[0];

    // Fetch active campaigns count
    const [campaigns] = await db.query(
      "SELECT COUNT(*) as count FROM campaigns WHERE screen_id = ? AND status = 'Active'",
      [screen_id]
    );

    // Fetch total plays today (Aggregated from statsService)
    let total_plays_today = 0;
    try {
        const stats = await statsService.getRecentStats();
        // Filter stats for this screen (mapped by name or id if available)
        // Note: xibo_display_id would be better if linked, but using screen_id or screen.name for now
        total_plays_today = stats.data
            .filter(s => String(s.displayId) === String(screen.xibo_display_id) || s.displayName === screen.screen_id)
            .reduce((sum, s) => sum + (s.count || 0), 0);
    } catch (e) {
        console.warn('[GET /screens/:id] Could not fetch real-time plays:', e.message);
    }

    // Available slots (20 minus used slots in campaigns or slots table)
    const [slotsUsed] = await db.query(
        "SELECT COUNT(*) as count FROM campaigns WHERE screen_id = ? AND status = 'Active'",
        [screen_id]
    );
    const available_slots = Math.max(0, 20 - (slotsUsed[0].count || 0));

    res.json({
      ...screen,
      total_plays_today,
      active_campaigns: campaigns[0].count,
      available_slots
    });
  } catch (err) {
    console.error(`[GET /screens/${screen_id}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. PUT /api/screens/:id
 * Update screen fields.
 */
router.put('/:id', async (req, res) => {
  const screen_id = req.params.id;
  const { location, city, partner_id, orientation, resolution, status } = req.body;
  
  try {
    const [result] = await db.query(
      `UPDATE screens 
       SET location = COALESCE(?, location), 
           city = COALESCE(?, city), 
           partner_id = COALESCE(?, partner_id), 
           orientation = COALESCE(?, orientation), 
           resolution = COALESCE(?, resolution), 
           status = COALESCE(?, status)
       WHERE screen_id = ?`,
      [location, city, partner_id, orientation, resolution, status, screen_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Screen not found' });
    }

    res.json({ success: true, message: 'Screen updated successfully' });
  } catch (err) {
    console.error(`[PUT /screens/${screen_id}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET /api/screens
 * List all screens with optional query filters.
 */
router.get('/', async (req, res) => {
  try {
    const { city, status, partner_id, search } = req.query;
    
    let query = 'SELECT * FROM screens WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND city = ?';
      params.push(city);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (partner_id) {
      query += ' AND partner_id = ?';
      params.push(partner_id);
    }
    if (search) {
      query += ' AND (screen_id LIKE ? OR location LIKE ? OR city LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /screens] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
