const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('multer'); // dummy name for logic
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

    // 3. Link to Brand in MySQL with 'Pending' status
    await dbRun(
      'REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, ?)',
      [mediaId, targetBrandId, 'Pending']
    );

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

    const [library, mappings, campaignsData] = await Promise.all([
      xiboService.getLibrary({ length: 1000 }), // Increased to 1000 to ensure we find everything
      dbAll('SELECT mediaId, status FROM media_brands WHERE brand_id = ?', [brandId]),
      dbAll(`
        SELECT c.creative_id, c.slot_number, s.name as screen_name 
        FROM campaigns c 
        LEFT JOIN screens s ON c.screen_id = s.screen_id 
        WHERE c.brand_id = ? AND c.status = 'Active'
      `, [brandId])
    ]);

    const mappingMap = new Map(mappings.map(m => [String(m.mediaId), m.status]));
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
        thumbnailUrl: `/xibo/library/download/${media.mediaId}?thumbnail=1`,
        previewUrl: `/xibo/library/download/${media.mediaId}`
      }));

    res.json(filtered);
  } catch (err) {
    console.error('[Creative List Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
