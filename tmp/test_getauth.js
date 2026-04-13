const { getAuth } = require('../src/auth.js');
async function run() {
  const { auth, handler } = await getAuth();
  console.log('auth created', !!auth, !!handler);
}
run();
