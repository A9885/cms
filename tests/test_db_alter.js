const { dbRun, dbGet, p } = require('./src/db/database');
(async () => {
    try {
        console.log("Adding column...");
        await p.query("ALTER TABLE users ADD COLUMN emailVerified BOOLEAN NOT NULL").catch(e => console.log(e.message));
        console.log("Setting default...");
        await p.query("ALTER TABLE users ALTER COLUMN emailVerified SET DEFAULT 0").catch(e => console.log(e.message));
        console.log("Done");
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
})();
