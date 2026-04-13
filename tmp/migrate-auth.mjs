import { getAuth } from '../src/auth.js';

async function run() {
    console.log('Loading auth instance...');
    const { auth } = await getAuth();
    
    console.log('Fetching migrations...');
    const migration = await import('better-auth/db/migration');
    const { getMigrations } = migration;
    
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
    
    console.log('To be created:', toBeCreated);
    console.log('To be added:', toBeAdded);
    
    console.log('Running migrations...');
    await runMigrations();
    console.log('Done!');
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
