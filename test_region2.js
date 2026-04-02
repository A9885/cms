require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');

async function run() {
    const headers = await xiboService.getHeaders();
    const layoutId = 12; // already checked out layout

    // Try adding region
    const rRes = await axios.post(`${XIBO_BASE_URL}/api/region/${layoutId}`,
        'width=1920&height=1080&top=0&left=0',
        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
    ).catch(e => { console.log('Add region err:', e.response?.data); return null; });

    console.log('Region regionId:', rRes?.data?.regionId, 'regionPlaylistId:', rRes?.data?.regionPlaylist?.playlistId);
}
run().catch(console.error);
