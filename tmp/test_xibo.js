require('dotenv').config();
const xiboService = require('../src/services/xibo.service');

async function testConnection() {
  console.log('Testing Xibo API Connection...');
  console.log('Base URL:', process.env.XIBO_BASE_URL);

  try {
    const token = await xiboService.getAccessToken();
    console.log('✅ Auth Successful! Token obtained.');

    console.log('\n--- Displays ---');
    const displays = await xiboService.getDisplays();
    console.table(displays.map(d => ({ 
      id: d.displayId, 
      name: d.display, 
      groupId: d.displayGroupId,
      online: d.loggedIn === 1
    })));

    console.log('\n--- Playlists ---');
    const playlists = await xiboService.getPlaylists({ length: 50 });
    console.table(playlists.map(p => ({ 
      id: p.playlistId, 
      name: p.name || p.playlist 
    })));

    console.log('\n--- Library (Media) ---');
    const library = await xiboService.getLibrary({ length: 50 });
    console.table(library.map(m => ({ 
      id: m.mediaId, 
      name: m.name, 
      type: m.mediaType 
    })));

  } catch (err) {
    console.error('❌ Connection Failed:', err.message);
    if (err.response) {
      console.error('Response Data:', err.response.data);
    }
  }
}

testConnection();
