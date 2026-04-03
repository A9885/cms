const { dbGet, dbAll, dbRun } = require('../src/db/database');

async function verifyPartnerAdmin() {
    console.log('--- Verifying Partner Admin Logic ---');
    try {
        const testEmail = `partner_test_${Date.now()}@example.com`;
        
        // 1. Create Partner
        const ins = await dbRun(
            `INSERT INTO partners (name, email, status, revenue_share_percentage) VALUES (?, ?, ?, ?)`,
            ['Test Partner Admin', testEmail, 'Pending', 50]
        );
        const pid = ins.id;
        console.log('Partner Created ID:', pid);

        // 2. Status Transition
        await dbRun('UPDATE partners SET status = "Active" WHERE id = ?', [pid]);
        const pCheck = await dbGet('SELECT status FROM partners WHERE id = ?', [pid]);
        console.log('Status Activated:', pCheck.status === 'Active');

        // 3. Payout Simulation
        const payIns = await dbRun(
            `INSERT INTO partner_payouts (partner_id, month, amount, status) VALUES (?, ?, ?, ?)`,
            [pid, '2026-03', 5000.00, 'Pending']
        );
        const payId = payIns.id;
        console.log('Payout Request Simulated ID:', payId);

        // 4. Payout Approval
        await dbRun('UPDATE partner_payouts SET status = "Paid" WHERE id = ?', [payId]);
        const payCheck = await dbGet('SELECT status FROM partner_payouts WHERE id = ?', [payId]);
        console.log('Payout Approved:', payCheck.status === 'Paid');

        // 5. Metrics Calculation
        const metrics = await dbGet(`
            SELECT p.*,
                (SELECT COALESCE(SUM(amount), 0) FROM partner_payouts WHERE partner_id = p.id AND status = 'Paid') AS total_paid,
                (SELECT COALESCE(SUM(amount), 0) FROM partner_payouts WHERE partner_id = p.id AND status = 'Pending') AS pending_balance
            FROM partners p
            WHERE p.id = ?
        `, [pid]);
        console.log('Metrics Verified:', {
            total_paid: metrics.total_paid,
            pending_balance: metrics.pending_balance
        });

        // Cleanup
        await dbRun('DELETE FROM partner_payouts WHERE partner_id = ?', [pid]);
        await dbRun('DELETE FROM users WHERE partner_id = ?', [pid]);
        await dbRun('DELETE FROM partners WHERE id = ?', [pid]);
        console.log('Cleanup Complete.');

        process.exit(0);
    } catch (err) {
        console.error('Verification Failed:', err);
        process.exit(1);
    }
}

verifyPartnerAdmin();
