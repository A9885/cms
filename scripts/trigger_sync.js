require('dotenv').config();
const screenService = require('./src/services/screen.service');
const { dbAll } = require('./src/db/database');

async function triggerSync() {
  console.log('Starting Screen Synchronization...');
  try {
    await screenService.syncDisplays();
    console.log('Synchronization completed.');
    
    const screens = await dbAll('SELECT id, name, xibo_display_id, status FROM screens');
    console.log('\nUpdated Screen Records:');
    screens.forEach(s => {
      console.log(`- ID: ${s.id}, Name: ${s.name}, Xibo ID: ${s.xibo_display_id || 'NULL'}, Status: ${s.status}`);
    });
  } catch (err) {
    console.error('Synchronization FAILED:', err.message);
    process.exit(1);
  }
}

triggerSync();
