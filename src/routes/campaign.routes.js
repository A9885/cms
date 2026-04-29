const express = require('express');
const router = express.Router();
const db = require('../db');
const xiboService = require('../services/xibo.service');
const statsService = require('../services/stats.service');

/**
 * 1. POST /api/campaigns/create
 * Creates a campaign in MySQL and syncs it to Xibo.
 */
router.post('/create', async (req, res) => {
  try {
    const { campaign_name, brand_id, screen_id, slot_number, start_date, end_date, creative_id } = req.body;
    
    // Validation
    if (!campaign_name || !brand_id || !screen_id || !slot_number || !start_date || !end_date || !creative_id) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (slot_number < 1 || slot_number > 20) {
      return res.status(400).json({ error: 'slot_number must be 1-20' });
    }

    // --- Modern Moderation Guardrail ---
    const [mediaRows] = await db.query(
      'SELECT status FROM media_brands WHERE mediaId = ? AND brand_id = ?',
      [creative_id, brand_id]
    );

    if (mediaRows.length === 0 || mediaRows[0].status !== 'Approved') {
      const currentStatus = mediaRows.length > 0 ? mediaRows[0].status : 'Unlinked';
      return res.status(403).json({ 
        error: `Content moderation required. Current status: ${currentStatus}`,
        suggestion: 'Please wait for administrator approval before scheduling.' 
      });
    }
    // -----------------------------------

    // 1. Insert into MySQL
    const [result] = await db.query(
      `INSERT INTO campaigns (campaign_name, brand_id, screen_id, slot_number, start_date, end_date, creative_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
      [campaign_name, brand_id, screen_id, slot_number, start_date, end_date, creative_id]
    );
    const campaign_id = result.insertId;

    // 2. Sync to Xibo
    let xiboWarning = null;
    try {
      // Find xibo_display_id from screen_id
      const [screens] = await db.query('SELECT xibo_display_id FROM screens WHERE screen_id = ?', [screen_id]);
      let displayId = screens[0]?.xibo_display_id;

      if (!displayId) {
        // Fallback: search displays in Xibo by name
        const xiboDisplays = await xiboService.getDisplays({ name: screen_id });
        displayId = xiboDisplays.find(d => d.display === screen_id)?.displayId;
      }

      if (!displayId) {
        throw new Error(`Could not find Xibo Display ID for screen: ${screen_id}`);
      }

      // Get or Create Slot Playlist
      const playlistId = await xiboService.getSlotPlaylistId(displayId, slot_number);
      
      // Assign Media to Playlist (default 10s or 13s limit)
      const widget = await xiboService.assignMediaToPlaylist(playlistId, creative_id, 10);
      
      // Update MySQL with Xibo IDs for future tracking (Pause/Stop)
      if (widget && widget.widgetId) {
        await db.query(
          'UPDATE campaigns SET xibo_widget_id = ?, xibo_playlist_id = ? WHERE id = ?',
          [widget.widgetId, playlistId, campaign_id]
        );
      }
    } catch (xiboErr) {
      xiboWarning = `Could not sync to Xibo: ${xiboErr.message}`;
      console.warn(`[Campaign Create] Xibo Sync Error:`, xiboErr.message);
    }

    res.json({ 
      success: true, 
      campaign_id, 
      ...(xiboWarning && { xibo_warning: xiboWarning }) 
    });
  } catch (err) {
    console.error('[POST /campaigns/create] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /api/campaigns/:id
 * Fetches campaign details joined with brand name and real-time stats.
 */
router.get('/:id', async (req, res) => {
  const campaign_id = req.params.id;
  try {
    const [campaigns] = await db.query(
      `SELECT c.*, b.name as brand_name 
       FROM campaigns c 
       LEFT JOIN brands b ON c.brand_id = b.id 
       WHERE c.id = ?`,
      [campaign_id]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaigns[0];

    // Fetch Stats from Xibo / statsService
    let stats = { total_plays: 0, screens_running: 1, estimated_impressions: 0 };
    try {
      // statsService.getMediaStats is cached and efficient
      const mediaStats = await statsService.getMediaStats(campaign.creative_id);
      stats.total_plays = mediaStats.playCount || 0;
      stats.estimated_impressions = stats.total_plays * 45; // Simulated impression multiplier
    } catch (e) {
      console.warn(`[GET /campaigns/${campaign_id}] Stats error (non-fatal):`, e.message);
    }

    res.json({
      ...campaign,
      ...stats
    });
  } catch (err) {
    console.error(`[GET /campaigns/${campaign_id}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. PATCH /api/campaigns/:id/status
 * Updates status and removes widget from Xibo if Paused/Stopped.
 */
router.patch('/:id/status', async (req, res) => {
  const campaign_id = req.params.id;
  const { status } = req.body;

  if (!['Active', 'Paused', 'Stopped', 'Ended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // 1. Get current tracking info
    const [campaigns] = await db.query(
      'SELECT xibo_widget_id, xibo_playlist_id FROM campaigns WHERE id = ?',
      [campaign_id]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { xibo_widget_id } = campaigns[0];

    // 2. If Paused/Stopped, remove from Xibo
    if (['Paused', 'Stopped'].includes(status) && xibo_widget_id) {
      await xiboService.removeWidgetFromPlaylist(xibo_widget_id);
      // Clear tracking so we don't try again (or we could keep it if we want to Resume later)
      // For now, let's keep it null if removed
      await db.query('UPDATE campaigns SET xibo_widget_id = NULL WHERE id = ?', [campaign_id]);
    }

    // 3. Update MySQL status
    await db.query('UPDATE campaigns SET status = ? WHERE id = ?', [status, campaign_id]);

    res.json({ success: true, message: `Campaign status updated to ${status}` });
  } catch (err) {
    console.error(`[PATCH /campaigns/${campaign_id}/status] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
