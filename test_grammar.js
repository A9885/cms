require('dotenv').config();
const { dbRun, db } = require('./src/db/database');

async function testGrammar() {
    console.log("Testing IGNORE grammar translation...");
    try {
        const res = await dbRun('INSERT OR IGNORE INTO slots (displayId, slot_number, brand_id, status) VALUES (1, 1, NULL, "Available")');
        console.log("SUCCESS! Translation executed properly:", res);
    } catch(e) {
        console.error("FAIL:", e.message);
    }
    process.exit(0);
}
testGrammar();
