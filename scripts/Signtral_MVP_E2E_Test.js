/**
 * Signtral MVP Workflow Pipeline Test
 * Tests all 3 workflows: Subscription → Slot Assignment → Brand Dashboard
 * Run: node test_mvp_pipeline.js
 */
require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const { dbAll, dbGet, dbRun } = require('../src/db/database');

const BASE = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

// ── JWT Token Helper ──────────────────────────────────────────────────────────
function mintToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, brand_id: user.brand_id || null, partner_id: user.partner_id || null },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

// ── HTTP Helper ────────────────────────────────────────────────────────────────
function req(method, path, body = null, token = null, cookieName = 'admin_token') {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(token ? { 'Cookie': `${cookieName}=${token}` } : {})
            }
        };
        const r = http.request(options, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, data: raw }); }
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

// ── Test Runner ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];
function check(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
    results.push({ label, ok: !!condition, detail });
}

// ── Main Test Suite ──────────────────────────────────────────────────────────
async function run() {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║     SIGNTRAL MVP WORKFLOW PIPELINE TEST       ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    // ─────────────────────────────────────────────────────────────────
    // STEP 0: Server Health
    // ─────────────────────────────────────────────────────────────────
    console.log('▶ STEP 0: Server Health & DB');
    const health = await req('GET', '/health');
    check('Server is responding (HTTP 200)', health.status === 200);
    check('Health reports OK', health.data?.status === 'OK');

    // verify DB directly
    const dbCheck = await dbGet('SELECT 1 as ok');
    check('MySQL DB connected', dbCheck?.ok === 1);
    const subTable = await dbGet("SHOW TABLES LIKE 'subscriptions'");
    check('subscriptions table exists', !!subTable);
    const slotCols = await dbAll(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='xibo_crm' AND TABLE_NAME='slots' AND COLUMN_NAME IN ('subscription_id','start_date','end_date','creative_name')`);
    check('slots has all MVP columns (4)', slotCols.length === 4, `found: ${slotCols.map(c=>c.COLUMN_NAME).join(', ')}`);
    console.log();

    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Get/Create test admin & brand users
    // ─────────────────────────────────────────────────────────────────
    console.log('▶ STEP 1: Authentication & Users');
    const adminUser = await dbGet("SELECT * FROM users WHERE role IN ('SuperAdmin','Admin') LIMIT 1");
    check('Admin user exists in DB', !!adminUser, adminUser ? `username=${adminUser.username}` : 'none');
    if (!adminUser) { console.log('\n❌ Cannot continue without admin user.\n'); process.exit(1); }

    const adminToken = mintToken(adminUser);
    check('Admin JWT minted', !!adminToken);

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: Brands
    // ─────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 2: Brand Management');
    const brandsRes = await req('GET', '/admin/api/brands', null, adminToken);
    check('GET /admin/api/brands accessible', brandsRes.status === 200, `status=${brandsRes.status}`);
    check('Brands endpoint returns array', Array.isArray(brandsRes.data), `type=${typeof brandsRes.data}`);

    let testBrandId = null;
    let testBrandName = null;
    const existingBrands = Array.isArray(brandsRes.data) ? brandsRes.data : [];

    if (existingBrands.length > 0) {
        testBrandId = existingBrands[0].id;
        testBrandName = existingBrands[0].name;
        check(`Found existing brand to test with`, true, `id=${testBrandId}, name="${testBrandName}"`);
    } else {
        const createBrand = await req('POST', '/admin/api/brands', {
            name: 'Pipeline_Test_Brand',
            email: `pipeline_${Date.now()}@signtral.test`,
            industry: 'Technology'
        }, adminToken);
        check('Created test brand', createBrand.status === 201, `status=${createBrand.status}`);
        testBrandId = createBrand.data?.brand_id;
        testBrandName = 'Pipeline_Test_Brand';
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // WORKFLOW 1: BRAND SUBSCRIPTION
    // ═══════════════════════════════════════════════════════════════════
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║     WORKFLOW 1: Brand Subscription            ║');
    console.log('╚═══════════════════════════════════════════════╝');

    // W1.1 List subscriptions
    const listSubs = await req('GET', `/admin/api/subscriptions?brand_id=${testBrandId}`, null, adminToken);
    check('W1.1 GET /admin/api/subscriptions returns array', listSubs.status === 200 && Array.isArray(listSubs.data), `status=${listSubs.status}`);
    console.log(`       (${listSubs.data?.length || 0} existing subscriptions for brand)`);

    // W1.2 Create a Draft subscription
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const createSub = await req('POST', '/admin/api/subscriptions', {
        brand_id: testBrandId,
        plan_name: '[PIPELINE TEST] Premium 2 Screens',
        start_date: today,
        end_date: nextYear,
        screens_included: 2,
        slots_included: 4,
        cities: 'Mumbai, Hyderabad',
        payment_status: 'Paid',
        status: 'Draft'
    }, adminToken);
    check('W1.2 POST creates subscription (201)', createSub.status === 201, `status=${createSub.status} | ${JSON.stringify(createSub.data)}`);
    const testSubId = createSub.data?.id;
    check('W1.2 Subscription ID returned', !!testSubId, `id=${testSubId}`);

    // W1.3 Validate: slot assign BLOCKED on Draft subscription
    const screens = await req('GET', '/admin/api/screens', null, adminToken);
    const testScreen = (screens.data || []).find(s => s.xibo_display_id);
    let testDisplayId = testScreen?.xibo_display_id;

    if (testDisplayId) {
        const blockedByDraft = await req('POST', '/admin/api/slots/assign', {
            displayId: parseInt(testDisplayId, 10),
            slot_number: 1,
            brand_id: testBrandId
        }, adminToken);
        check('W1.3 Slot assign BLOCKED when no Active subscription (403)', blockedByDraft.status === 403, `status=${blockedByDraft.status} | ${blockedByDraft.data?.error}`);
    } else {
        console.log('  ⚠️  No screen with xibo_display_id — skipping slot assignment tests');
    }

    // W1.4 Activate the subscription
    if (testSubId) {
        const activate = await req('PUT', `/admin/api/subscriptions/${testSubId}`, {
            plan_name: '[PIPELINE TEST] Premium 2 Screens',
            start_date: today, end_date: nextYear,
            screens_included: 2, slots_included: 4,
            cities: 'Mumbai, Hyderabad',
            payment_status: 'Paid', status: 'Active',
            notes: 'Auto test subscription'
        }, adminToken);
        check('W1.4 PUT activates subscription (200)', activate.status === 200, `status=${activate.status}`);

        // Verify it's now Active in DB
        const subInDB = await dbGet('SELECT status FROM subscriptions WHERE id = ?', [testSubId]);
        check('W1.4 status=Active confirmed in DB', subInDB?.status === 'Active', `db_status=${subInDB?.status}`);
    }

    // W1.5 List by brand
    const subsByBrand = await req('GET', `/admin/api/subscriptions/brand/${testBrandId}`, null, adminToken);
    check('W1.5 GET /subscriptions/brand/:id returns list', subsByBrand.status === 200 && Array.isArray(subsByBrand.data));
    const activeSub = (subsByBrand.data || []).find(s => s.status === 'Active');
    check('W1.5 Active subscription visible for brand', !!activeSub, `found id=${activeSub?.id}`);
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // WORKFLOW 2: SLOT ASSIGNMENT WITH VALIDATION
    // ═══════════════════════════════════════════════════════════════════
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║     WORKFLOW 2: Slot Assignment & Validation  ║');
    console.log('╚═══════════════════════════════════════════════╝');

    if (testDisplayId && testSubId) {
        // W2.1 Assign slot 1 (should succeed — active sub, within limits)
        const assign1 = await req('POST', '/admin/api/slots/assign', {
            displayId: parseInt(testDisplayId, 10),
            slot_number: 1,
            brand_id: testBrandId,
            subscription_id: testSubId,
            creative_name: 'Test_Ad_Slot1',
            start_date: today,
            end_date: nextYear
        }, adminToken);
        check('W2.1 Slot 1 assigned successfully (200)', assign1.status === 200, `status=${assign1.status} | ${JSON.stringify(assign1.data)}`);

        // Verify in DB
        const slot1 = await dbGet('SELECT * FROM slots WHERE displayId = ? AND slot_number = 1', [testDisplayId]);
        check('W2.1 Slot 1 — brand_id set in DB', String(slot1?.brand_id) === String(testBrandId), `brand_id=${slot1?.brand_id}`);
        check('W2.1 Slot 1 — status=Active in DB', slot1?.status === 'Active', `status=${slot1?.status}`);
        check('W2.1 Slot 1 — creative_name saved', slot1?.creative_name === 'Test_Ad_Slot1', `creative_name=${slot1?.creative_name}`);
        check('W2.1 Slot 1 — start_date saved', !!slot1?.start_date, `start_date=${slot1?.start_date}`);
        check('W2.1 Slot 1 — subscription_id linked', String(slot1?.subscription_id) === String(testSubId), `sub_id=${slot1?.subscription_id}`);

        // W2.2 Double-booking protection
        const otherBrands = existingBrands.filter(b => b.id !== testBrandId);
        if (otherBrands.length > 0) {
            const otherId = otherBrands[0].id;
            // Give the other brand an active sub too
            const otherSub = await req('POST', '/admin/api/subscriptions', {
                brand_id: otherId, plan_name: '[PIPELINE TEST] Other Brand Sub',
                start_date: today, end_date: nextYear,
                screens_included: 5, slots_included: 20,
                status: 'Active', payment_status: 'Paid'
            }, adminToken);
            const otherSubId = otherSub.data?.id;

            const doubleBook = await req('POST', '/admin/api/slots/assign', {
                displayId: parseInt(testDisplayId, 10),
                slot_number: 1,
                brand_id: otherId,
                subscription_id: otherSubId
            }, adminToken);
            check('W2.2 Double-booking BLOCKED (409)', doubleBook.status === 409, `status=${doubleBook.status} | ${doubleBook.data?.error}`);

            // Cleanup other brand's test subscription
            if (otherSubId) await req('DELETE', `/admin/api/subscriptions/${otherSubId}`, null, adminToken);
        } else {
            console.log('  ⚠️  Only 1 brand — skipping double-booking test');
        }

        // W2.3 Slot scope limit (sub allows 4 slots, fill them up)
        await req('POST', '/admin/api/slots/assign', { displayId: parseInt(testDisplayId,10), slot_number: 2, brand_id: testBrandId, subscription_id: testSubId }, adminToken);
        await req('POST', '/admin/api/slots/assign', { displayId: parseInt(testDisplayId,10), slot_number: 3, brand_id: testBrandId, subscription_id: testSubId }, adminToken);
        await req('POST', '/admin/api/slots/assign', { displayId: parseInt(testDisplayId,10), slot_number: 4, brand_id: testBrandId, subscription_id: testSubId }, adminToken);

        const slotsInDB = await dbAll('SELECT slot_number FROM slots WHERE brand_id = ?', [testBrandId]);
        check('W2.3 4 slots assigned to brand in DB', slotsInDB.length >= 4, `count=${slotsInDB.length}`);

        // 5th slot should be blocked
        const overLimit = await req('POST', '/admin/api/slots/assign', {
            displayId: parseInt(testDisplayId, 10),
            slot_number: 5,
            brand_id: testBrandId,
            subscription_id: testSubId
        }, adminToken);
        check('W2.3 Slot limit ENFORCED for 5th slot (403)', overLimit.status === 403, `status=${overLimit.status} | ${overLimit.data?.error}`);

        // W2.4 Inventory visible
        const inventory = await req('GET', '/admin/api/inventory', null, adminToken);
        check('W2.4 GET /admin/api/inventory accessible', inventory.status === 200);
        const slotsForDisplay = inventory.data?.[testDisplayId] || [];
        const mySlot = slotsForDisplay.find(s => s.slot_number === 1 && String(s.brand_id) === String(testBrandId));
        check('W2.4 Assigned slot 1 visible in inventory', !!mySlot);

        // W2.5 GET slots for screen
        const slotGrid = await req('GET', `/admin/api/slots/screen/${testDisplayId}`, null, adminToken);
        check('W2.5 GET /slots/screen/:displayId returns 20 slots', Array.isArray(slotGrid.data) && slotGrid.data.length === 20, `count=${slotGrid.data?.length}`);
        const slot1Grid = (slotGrid.data || []).find(s => s.slot_number === 1);
        check('W2.5 Slot 1 shows brand assignment', String(slot1Grid?.brand_id) === String(testBrandId), `brand_id=${slot1Grid?.brand_id}`);
    } else {
        console.log('  ⚠️  No test screen available — skipping slot assignment tests');
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // WORKFLOW 3: BRAND DASHBOARD & SUBSCRIPTION VIEW
    // ═══════════════════════════════════════════════════════════════════
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║     WORKFLOW 3: Brand Portal & Dashboard      ║');
    console.log('╚═══════════════════════════════════════════════╝');

    // Get (or create) a brand user to mint a brand token
    let brandUser = await dbGet('SELECT * FROM users WHERE brand_id = ? AND role = "Brand" LIMIT 1', [testBrandId]);
    if (!brandUser) {
        // Create one
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('Brand@123', 10);
        await dbRun('INSERT INTO users (username, password_hash, role, brand_id) VALUES (?, ?, "Brand", ?)', [`brand_pipeline_test_${Date.now()}@test.com`, hash, testBrandId]);
        brandUser = await dbGet('SELECT * FROM users WHERE brand_id = ? AND role = "Brand" LIMIT 1', [testBrandId]);
    }
    check('W3.0 Brand user exists for portal', !!brandUser, brandUser ? `username=${brandUser.username}` : 'none');

    const brandToken = mintToken(brandUser);

    // W3.1 Subscription endpoint
    const subSummary = await req('GET', '/brandportal/api/subscription', null, brandToken, 'brand_token');
    check('W3.1 GET /brandportal/api/subscription (200)', subSummary.status === 200, `status=${subSummary.status}`);
    if (subSummary.status === 200 && subSummary.data) {
        check('W3.1 planName returned', !!subSummary.data.planName, `"${subSummary.data.planName}"`);
        check('W3.1 status=Active', subSummary.data.status === 'Active', `status="${subSummary.data.status}"`);
        check('W3.1 daysRemaining > 0', subSummary.data.daysRemaining > 0, `${subSummary.data.daysRemaining} days`);
        check('W3.1 screensIncluded = 2', subSummary.data.screensIncluded === 2, `got=${subSummary.data.screensIncluded}`);
        check('W3.1 slotsIncluded = 4', subSummary.data.slotsIncluded === 4, `got=${subSummary.data.slotsIncluded}`);
        check('W3.1 slotsUsed tracked', typeof subSummary.data.slotsUsed === 'number', `slotsUsed=${subSummary.data.slotsUsed}`);
        check('W3.1 screensUsed tracked', typeof subSummary.data.screensUsed === 'number', `screensUsed=${subSummary.data.screensUsed}`);
    } else {
        check('W3.1 Subscription data returned', false, JSON.stringify(subSummary.data));
    }

    // W3.2 Screens visibility
    const brandScreens = await req('GET', '/brandportal/api/screens', null, brandToken, 'brand_token');
    check('W3.2 GET /brandportal/api/screens (200)', brandScreens.status === 200, `status=${brandScreens.status}`);
    if (brandScreens.status === 200 && Array.isArray(brandScreens.data)) {
        check('W3.2 Brand sees screens', brandScreens.data.length > 0, `${brandScreens.data.length} screen(s)`);
        if (brandScreens.data.length > 0) {
            const firstScreen = brandScreens.data[0];
            check('W3.2 Screen has displayId', !!firstScreen.displayId);
            check('W3.2 Screen has slots array', Array.isArray(firstScreen.slots));
        }
    }

    // W3.3 Dashboard KPIs
    const dashboard = await req('GET', '/brandportal/api/dashboard', null, brandToken, 'brand_token');
    check('W3.3 GET /brandportal/api/dashboard (200)', dashboard.status === 200, `status=${dashboard.status}`);
    if (dashboard.status === 200) {
        check('W3.3 activeScreens is number', typeof dashboard.data.activeScreens === 'number');
        check('W3.3 recentPoP is array', Array.isArray(dashboard.data.recentPoP));
    }

    // W3.4 Proof of Play
    const pop = await req('GET', '/brandportal/api/proof-of-play', null, brandToken, 'brand_token');
    check('W3.4 GET /brandportal/api/proof-of-play (200)', pop.status === 200, `status=${pop.status}`);
    check('W3.4 PoP returns array', Array.isArray(pop.data), `type=${typeof pop.data}`);

    // W3.5 Invoices
    const invoices = await req('GET', '/brandportal/api/invoices', null, brandToken, 'brand_token');
    check('W3.5 GET /brandportal/api/invoices (200)', invoices.status === 200, `status=${invoices.status}`);
    console.log();

    // ─────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────
    console.log('▶ CLEANUP');
    if (testDisplayId) {
        for (const slotNum of [1, 2, 3, 4]) {
            await req('POST', '/admin/api/slots/assign', {
                displayId: parseInt(testDisplayId, 10),
                slot_number: slotNum,
                brand_id: null
            }, adminToken);
        }
        console.log('  ✓ Test slots unassigned');
    }
    if (testSubId) {
        await req('DELETE', `/admin/api/subscriptions/${testSubId}`, null, adminToken);
        console.log('  ✓ Test subscription deleted');
    }
    // Remove pipeline test brand user if we created one
    const pipelineUser = await dbGet(`SELECT id FROM users WHERE username LIKE 'brand_pipeline_test_%'`);
    if (pipelineUser) {
        await dbRun('DELETE FROM users WHERE id = ?', [pipelineUser.id]);
        console.log('  ✓ Test brand user cleaned up');
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ─────────────────────────────────────────────────────────────────
    const total = passed + failed;
    const pct = Math.round((passed / total) * 100);
    console.log('╔═══════════════════════════════════════════════╗');
    console.log(`║  RESULTS: ${passed}/${total} passed (${pct}%)${' '.repeat(35 - String(passed).length - String(total).length - String(pct).length)}║`);
    console.log('╚═══════════════════════════════════════════════╝\n');

    if (failed === 0) {
        console.log('  🎉 ALL WORKFLOWS PASSING — Pipeline is ready for production!\n');
    } else {
        console.log('  ⚠️  Failed checks:');
        results.filter(r => !r.ok).forEach(r => {
            console.log(`     ❌ ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
        });
        console.log();
    }
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error('\n❌ Fatal error:', e.message);
    console.error(e.stack);
    process.exit(1);
});
