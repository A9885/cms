const axios = require('axios');
require('dotenv').config();

const baseUrl = 'https://cms.signtral.info'.replace(/\/$/, '');
const clientId = process.env.XIBO_CLIENT_ID;
const clientSecret = process.env.XIBO_CLIENT_SECRET;

async function testPath(prefix) {
    const url = `${baseUrl}${prefix}/authorize/access_token`;
    console.log(`Testing path: ${url}`);
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    try {
        const resp = await axios.post(url, params, { 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000 
        });
        console.log(`✅ SUCCESS [${prefix}]: Status ${resp.status}`);
        return true;
    } catch (err) {
        console.log(`❌ FAILED [${prefix}]: Status ${err.response?.status || 'No Response'}`);
        if (err.response?.status === 404) {
            console.log(`   (404 Not Found)`);
        } else if (err.response?.data) {
            console.log(`   Data: ${JSON.stringify(err.response.data).substring(0, 100)}...`);
        } else {
            console.log(`   Error: ${err.message}`);
        }
        return false;
    }
}

async function run() {
    console.log('--- Xibo API Path Discovery ---');
    await testPath('/api');
    await testPath('/api/index.php');
    await testPath('/index.php/api');
    console.log('-------------------------------');
}

run();
