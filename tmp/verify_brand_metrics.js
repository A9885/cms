const { dbGet, dbAll, dbRun } = require('../src/db/database');

async function verifyDBLogic() {
    console.log('--- Verifying DB Metric Logic ---');
    try {
        const brandId = 1; // Existing brand
        const query = `
            SELECT b.*,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id) AS total_campaigns,
                (SELECT COUNT(DISTINCT screen_id) FROM campaigns WHERE brand_id = b.id) AS total_screens_used,
                (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE brand_id = b.id AND status = 'Paid') AS total_spend,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id AND status = 'Active') AS active_campaigns
            FROM brands b
            WHERE b.id = ?
        `;
        const brand = await dbGet(query, [brandId]);
        if (brand) {
            console.log('Metric Verification Success:', {
                name: brand.name,
                total_campaigns: brand.total_campaigns,
                total_spend: brand.total_spend
            });
        } else {
            console.log('Brand 1 not found, checking filtered list...');
        }

        console.log('\n--- Verifying Filtered List (Active) ---');
        const activeBrands = await dbAll(`
            SELECT b.*,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id) AS total_campaigns
            FROM brands b
            WHERE b.status = 'Active'
            LIMIT 5
        `);
        console.log('Active Brands Count:', activeBrands.length);

        console.log('\n--- Verifying Status Transitions (Dry Run) ---');
        // We'll just check if the column updates work
        const testEmail = `verify_${Date.now()}@test.com`;
        const ins = await dbRun('INSERT INTO brands (name, email, status) VALUES (?, ?, ?)', ['Verify Brand', testEmail, 'Pending']);
        const newId = ins.id;
        
        await dbRun('UPDATE brands SET status = "Active" WHERE id = ?', [newId]);
        const check = await dbGet('SELECT status FROM brands WHERE id = ?', [newId]);
        console.log('Status Approved:', check.status === 'Active');

        // Cleanup
        await dbRun('DELETE FROM brands WHERE id = ?', [newId]);
        console.log('Cleanup Complete.');

        process.exit(0);
    } catch (err) {
        console.error('DB Logic Verification Failed:', err);
        process.exit(1);
    }
}

verifyDBLogic();
