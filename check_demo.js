const { dbGet, dbAll } = require('./src/db/database');

async function check() {
    try {
        const email = 'demo_partner@signtral.com';
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        console.log('User Record:', user);
        
        if (user) {
            const account = await dbGet('SELECT * FROM account WHERE userId = ?', [user.id]);
            console.log('Account Record:', account);
            
            const partner = await dbGet('SELECT * FROM partners WHERE id = ?', [user.partner_id]);
            console.log('Partner Record:', partner);
            
            const screens = await dbAll('SELECT * FROM screens WHERE partner_id = ?', [user.partner_id]);
            console.log('Assigned Screens:', screens.length);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

check();
