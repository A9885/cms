require('dotenv').config();
const xibo = require('../src/services/xibo.service');
const { dbAll } = require('../src/db/database');

async function diagnose() {
    console.log('═══════════════════════════════════════════');
    console.log('  PROOF OF PLAY DEEP DIAGNOSIS');
    console.log('═══════════════════════════════════════════\n');

    // 1. Check display status
    console.log('📺 [1] DISPLAY STATUS');
    const displays = await xibo.getDisplays();
    displays.forEach(d => {
        console.log(`  Display: ${d.display} (ID: ${d.displayId})`);
        console.log(`    loggedIn: ${d.loggedIn}, licensed: ${d.licensed}`);
        console.log(`    lastAccessed: ${d.lastAccessed}`);
        console.log(`    auditingUntil: ${d.auditingUntil || 'NOT SET'}`);
        console.log(`    enableStatReporting: ${d.enableAuditLog ?? d.enableStatReporting ?? 'unknown'}`);
        console.log('    Full display keys:', Object.keys(d).filter(k => k.toLowerCase().includes('audit') || k.toLowerCase().includes('stat') || k.toLowerCase().includes('log')).join(', '));
    });

    // 2. Check what the raw stats API returns for ALL types
    const now = new Date().toISOString().split('.')[0].replace('T', ' ');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString().split('.')[0].replace('T', ' ');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('.')[0].replace('T', ' ');

    console.log('\n📊 [2] RAW STATS (last 30 days)');
    for (const type of ['media', 'widget', 'layout', 'event']) {
        try {
            const res = await xibo.getStats(type, { fromDt: thirtyDaysAgo, toDt: now, length: 5 });
            const data = res.data || res || [];
            console.log(`  Type=${type}: ${data.length} records`);
            if (data.length > 0) console.log(`    Sample: display=${data[0].display}, media=${data[0].media}, start=${data[0].start}`);
        } catch (e) {
            console.log(`  Type=${type}: ERROR - ${e.response?.data?.message || e.message}`);
        }
    }

    // 3. Check library for our media - what is enableStat?
    console.log('\n📁 [3] LIBRARY MEDIA (first 10)');
    try {
        const library = await xibo.getLibrary({ length: 10 });
        library.forEach(m => {
            console.log(`  Media ${m.mediaId}: "${m.name}" | enableStat=${m.enableStat} | type=${m.mediaType}`);
        });
    } catch (e) {
        console.log('  ERROR:', e.message);
    }

    // 4. DB: what slots/brands are configured?
    console.log('\n🗄️  [4] DATABASE SLOTS & BRANDS');
    try {
        const slots = await dbAll('SELECT s.*, b.name as brand_name FROM slots s LEFT JOIN brands b ON b.id = s.brand_id');
        slots.forEach(s => console.log(`  Slot ${s.slot_number} | Display ${s.displayId} | Brand: ${s.brand_name || 'UNASSIGNED'} (id=${s.brand_id})`));
        
        const mediaBrands = await dbAll('SELECT mb.*, b.name as brand_name FROM media_brands mb LEFT JOIN brands b ON b.id = mb.brand_id LIMIT 10');
        console.log('\n  Media-Brand mappings:');
        mediaBrands.forEach(m => console.log(`    MediaId=${m.mediaId} | Brand=${m.brand_name || 'UNLINKED'}`));
    } catch (e) {
        console.log('  DB ERROR:', e.message);
    }

    // 5. Check if stats endpoint requires special params
    console.log('\n🔧 [5] STATS API - NO FILTER (last 7 days)');
    try {
        const raw = await xibo.getStats('media', { fromDt: sevenDaysAgo, toDt: now, length: 3 });
        const data = raw.data || raw || [];
        console.log(`  Raw media stats count: ${Array.isArray(data) ? data.length : JSON.stringify(data).substring(0, 200)}`);
        if (Array.isArray(data) && data.length > 0) {
            console.log('  First record keys:', Object.keys(data[0]).join(', '));
            console.log('  First record:', JSON.stringify(data[0], null, 2));
        }
    } catch (e) {
        console.log('  ERROR response:', JSON.stringify(e.response?.data || e.message));
    }

    // 6. Check display "loggedin" field spelling
    console.log('\n🔍 [6] DISPLAY OBJECT FULL KEYS (first display)');
    if (displays.length > 0) {
        const d = displays[0];
        const statRelated = {};
        Object.entries(d).forEach(([k, v]) => {
            if (k.toLowerCase().includes('log') || k.toLowerCase().includes('stat') || 
                k.toLowerCase().includes('audit') || k.toLowerCase().includes('login') ||
                k.toLowerCase().includes('active')) {
                statRelated[k] = v;
            }
        });
        console.log('  Stat/audit related fields:', JSON.stringify(statRelated, null, 2));
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('  DIAGNOSIS COMPLETE');
    console.log('═══════════════════════════════════════════');
    process.exit(0);
}

diagnose().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
