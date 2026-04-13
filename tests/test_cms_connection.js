require('dotenv').config();
const xiboService = require('./src/services/xibo.service');

async function testConnection() {
  console.log('Testing connection to:', process.env.XIBO_BASE_URL);
  try {
    const token = await xiboService.getAccessToken();
    console.log('Successfully obtained access token');
    
    const displays = await xiboService.getDisplays();
    console.log(`Found ${displays.length} displays:`);
    displays.forEach(d => {
      console.log(`- ID: ${d.displayId}, Name: ${d.display}, Status: ${d.loggedIn ? 'Online' : 'Offline'}`);
    });

    const library = await xiboService.getLibrary({ length: 5 });
    console.log(`Found ${library.length} items in library.`);

    console.log('\nConnection test PASSED');
  } catch (err) {
    console.error('\nConnection test FAILED');
    console.error(err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
    process.exit(1);
  }
}

testConnection();
