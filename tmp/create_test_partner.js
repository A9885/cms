const bcrypt = require('bcryptjs');
const { dbRun } = require('../src/db/database');

async function createPartner() {
    const username = 'testpartner';
    const password = 'password123';
    const hash = bcrypt.hashSync(password, 10);
    const role = 'Partner';
    const partner_id = 3; // Ahmedabad Partner

    try {
        await dbRun('INSERT INTO users (username, password_hash, role, partner_id) VALUES (?, ?, ?, ?)', [username, hash, role, partner_id]);
        console.log(`Test partner user created: ${username} / ${password}`);
    } catch (err) {
        console.error('Error creating partner user:', err.message);
    }
}

createPartner();
