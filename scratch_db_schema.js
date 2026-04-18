require('dotenv').config();
const { dbAll } = require('./src/db/database');

async function getCols() {
    try {
        console.log('ACCOUNT:');
        const acc = await dbAll('SHOW COLUMNS FROM account;');
        console.log(acc);
        console.log('USERS:');
        const usr = await dbAll('SHOW COLUMNS FROM users;');
        console.log(usr);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
getCols();
