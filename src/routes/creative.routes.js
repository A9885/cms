const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xiboService = require('../services/xibo.service');
const { dbRun, dbAll, dbGet } = require('../db/database');
const { logActivity, ACTION, MODULE } = require('../services/activity-logger.service');

// Configure Multer for temporary storage
const upload = multer({ dest: '/tmp/uploads/' });

/**
 * 1. POST /api/creative/upload
 * Handles file upload to local server, then streams to Xibo library.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { brand_id } = req.body;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  // 1. Get Brand ID (from body or session)
  const targetBrandId = brand_id || req.user?.brand_id;
  if (!targetBrandId && req.user?.role !== 'SuperAdmin') {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Brand ID is required.' });
  }

  try {
    // 2. Upload to Xibo Library
    const xiboResult = await xiboService.uploadMedia(file.path, file.originalname);
    const mediaId = xiboResult.mediaId;

    // 3. Link to Brand in MySQL with 'Pending' status (if brand provided)
    if (targetBrandId) {
      await dbRun(
        'REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, ?)',
        [mediaId, targetBrandId, req.user?.role === 'SuperAdmin' || req.user?.role === 'Admin' ? 'Approved' : 'Pending']
      );
    }

    // 4. Enable Stats Collection (Proof of Play)
    await xiboService.setStatCollection('media', mediaId, true);

    // Cleanup local temp file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    logActivity({
      action: ACTION.UPLOAD,
      module: MODULE.CREATIVE,
      description: `Creative uploaded: "${file.originalname}" (mediaId: ${mediaId})`,
      req,
      userId: req.user?.id
    });

    res.json({
      success: true,
      mediaId,
      name: file.originalname,
      brand_id: targetBrandId
    });
  } catch (err) {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    console.error('[Creative Upload Error]', err.message);
    logActivity({
      action: ACTION.ERROR,
      module: MODULE.CREATIVE,
      description: `Creative upload failed: ${err.message}`,
      req,
      userId: req.user?.id
    });
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /api/creative/list
 * Returns all creatives associated with the requester's brand.
 */
router.get('/list', async (req, res) => {
  try {
    const brandId = req.query.brand_id || req.user?.brand_id;
    if (!brandId && req.user?.role !== 'SuperAdmin') {
      return res.status(400).json({ error: 'Brand ID is required.' });
    }

    const [library, mappings, campaignsData, playsData] = await Promise.all([
      xiboService.getLibrary({ length: 1000 }),
      dbAll('SELECT mediaId, status FROM media_brands WHERE brand_id = ?', [brandId]),
      dbAll(`
        SELECT sl.mediaId as creative_id, sl.slot_number, sl.displayId, sl.status as slot_status,
               s.name as screen_name 
        FROM slots sl 
        LEFT JOIN screens s ON sl.displayId = s.xibo_display_id 
        WHERE sl.brand_id = ? AND sl.mediaId IS NOT NULL
      `, [brandId]),
      dbAll(`
        SELECT mediaId, SUM(count) as total
        FROM daily_media_stats
        WHERE mediaId IN (SELECT mediaId FROM media_brands WHERE brand_id = ?)
        GROUP BY mediaId
      `, [brandId])
    ]);

    const mappingMap = new Map(mappings.map(m => [String(m.mediaId), m.status]));
    const playsMap = new Map(playsData.map(p => [String(p.mediaId), parseInt(p.total || 0, 10)]));

    const campaignMap = {};
    campaignsData.forEach(c => {
      if (!campaignMap[String(c.creative_id)]) campaignMap[String(c.creative_id)] = [];
      campaignMap[String(c.creative_id)].push(`${c.screen_name || 'Display'} - Slot ${c.slot_number}`);
    });

    const filtered = library
      .filter(media => mappingMap.has(String(media.mediaId)))
      .map(media => ({
        mediaId: media.mediaId,
        name: media.name,
        type: media.mediaType,
        mediaType: media.mediaType,
        size: media.fileSize,
        duration: media.duration,
        status: mappingMap.get(String(media.mediaId)) || 'Pending',
        assignedSlots: campaignMap[String(media.mediaId)] || [],
        totalPlays: playsMap.get(String(media.mediaId)) || 0,
        thumbnailUrl: `/xibo/proxy/thumbnail/${media.mediaId}`,
        previewUrl: `/xibo/library/download/${media.mediaId}`
      }));

    res.json(filtered);
  } catch (err) {
    console.error('[Creative List Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
