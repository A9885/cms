require('dotenv').config();
const axios = require('axios');

/**
 * diagnose_xibo_media.js
 * Comprehensive diagnostic script to troubleshoot Xibo CMS Media Library integration issues.
 */

const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
const XIBO_CLIENT_ID = process.env.XIBO_CLIENT_ID;
const XIBO_CLIENT_SECRET = process.env.XIBO_CLIENT_SECRET;
const PLACEHOLDER_MEDIA_ID = process.env.PLACEHOLDER_MEDIA_ID || "1";

/**
 * 1. fetches a fresh OAuth2 Bearer token from POST /api/authorize/access_token
 * Note: Xibo standard is /api/authorize/access_token, though some might use proxies.
 */
async function getXiboToken() {
    console.log('--- Step 1: Fetching OAuth2 Token ---');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', XIBO_CLIENT_ID);
    params.append('client_secret', XIBO_CLIENT_SECRET);

    try {
        const resp = await axios.post(`${XIBO_BASE_URL}/api/authorize/access_token`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('✅ Token obtained successfully.');
        return resp.data.access_token;
    } catch (err) {
        console.error('❌ Failed to obtain token.');
        console.error('Error Details:', err.response?.data || err.message);
        process.exit(1);
    }
}

/**
 * 2. Calls GET /api/media and logs full error if it fails (HTTP 500)
 */
async function testMediaLibrary(token) {
    console.log('\n--- Step 2: Testing Media Library Endpoint ---');
    try {
        const resp = await axios.get(`${XIBO_BASE_URL}/api/library`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { length: 5 }
        });
        console.log('✅ Successfully reached /api/library.');
        console.log(`Found ${resp.data.length} media items.`);
        return resp.data;
    } catch (err) {
        console.error('❌ /api/library returned an error.');
        const errorData = err.response?.data;
        const statusCode = err.response?.status;
        console.error(`Status Code: ${statusCode}`);
        console.error('Full Error Response:', JSON.stringify(errorData, null, 2));

        if (statusCode === 500) {
            console.warn('\n💡 Diagnosis: HTTP 500 usually implies a server-side exception in Xibo.');
            console.warn('This often happens if the API user lacks a "Home Folder" assignment in the CMS,');
            console.warn('or if the "library" module permissions are not granted to the Application user role.');
        }
    }
}

/**
 * 3. Check if PLACEHOLDER_MEDIA_ID exists
 */
async function checkPlaceholder(token) {
    console.log(`\n--- Step 3: Checking Placeholder Media ID [${PLACEHOLDER_MEDIA_ID}] ---`);
    try {
        const resp = await axios.get(`${XIBO_BASE_URL}/api/library`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { mediaId: PLACEHOLDER_MEDIA_ID }
        });
        
        const media = Array.isArray(resp.data) ? resp.data.find(m => String(m.mediaId) === String(PLACEHOLDER_MEDIA_ID)) : null;
        
        if (media) {
            console.log(`✅ Placeholder media found: "${media.name}" (Type: ${media.mediaType})`);
        } else {
            console.warn(`⚠️ Warning: PLACEHOLDER_MEDIA_ID "${PLACEHOLDER_MEDIA_ID}" was NOT found in your library.`);
            console.warn('Please update your .env with a valid mediaId from your Xibo library to avoid fallback issues.');
        }
    } catch (err) {
        console.error(`❌ Could not verify PLACEHOLDER_MEDIA_ID: ${err.message}`);
    }
}

/**
 * 4. Final Diagnosis
 */
function provideDiagnosis() {
    console.log('\n--- Final Diagnosis ---');
    console.log('Based on common Xibo integration failures:');
    console.log('1. Scopes: Xibo typically expects a scope of "all" which must be assigned');
    console.log('   to the Application in the CMS UI (Administration -> Applications).');
    console.log('2. Permissions: The user associated with the Client ID must have the "Library"');
    console.log('   permission group assigned in their Role.');
    console.log('3. Data: If you get a 500 on all library calls, ensure the API user has a');
    console.log('   "Media Folder" assigned or that the CMS library folder is writable.');
    console.log('\nPRO TIP: Check the "Logs" section in Xibo CMS for the specific PHP exception trace.');
}

async function runDiagnosis() {
    if (!XIBO_BASE_URL || !XIBO_CLIENT_ID || !XIBO_CLIENT_SECRET) {
        console.error('❌ Error: XIBO credentials missing in .env');
        process.exit(1);
    }

    const token = await getXiboToken();
    await testMediaLibrary(token);
    await checkPlaceholder(token);
    provideDiagnosis();
}

runDiagnosis();
