const { dbAll, dbGet, dbRun } = require('./src/db/database');

async function testBilling() {
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7).replace('-', ''); // YYYYMM
    const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    console.log(`Generating for month: ${monthStr}, due: ${dueDate}`);

    const brands = await dbAll('SELECT id, name, monthly_rate FROM brands WHERE status = "Active" AND monthly_rate > 0');
    console.log(`Found ${brands.length} active brands with rates.`);

    for (const brand of brands) {
        const invoiceNum = `INV-B${brand.id}-${monthStr}`;
        const existing = await dbGet('SELECT id FROM invoices WHERE invoice_number = ?', [invoiceNum]);
        if (existing) {
            console.log(`Skipping Brand ${brand.name}: Invoice ${invoiceNum} already exists.`);
            continue;
        }

        await dbRun(
            'INSERT INTO invoices (invoice_number, brand_id, amount, status, due_date) VALUES (?, ?, ?, "Pending", ?)',
            [invoiceNum, brand.id, brand.monthly_rate, dueDate]
        );
        console.log(`Created Invoice ${invoiceNum} for Brand ${brand.name} (Amount: ${brand.monthly_rate})`);
    }
    
    // Summary
    const stats = await dbGet('SELECT SUM(amount) as total FROM invoices WHERE status = "Pending"');
    console.log(`Total Pending Revenue: ${stats.total}`);

    process.exit(0);
}

testBilling().catch(err => {
    console.error(err);
    process.exit(1);
});
