const assert = require('assert');
const { hasPermission } = require('../../src/middleware/access.middleware');

function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        return true;
    } catch (e) {
        console.error(`❌ ${name}: ${e.message}`);
        return false;
    }
}

console.log('--- Access Middleware tests ---');
let passed = 0;
let total = 0;

function test(name, fn) {
    total++;
    if (runTest(name, fn)) passed++;
}

test('Should allow access if user has capability', () => {
    const middleware = hasPermission('user:view');
    const req = { user: { role: 'Admin' } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.strictEqual(nextCalled, true);
});

test('Should block access if user lacks capability', () => {
    const middleware = hasPermission('user:view');
    const req = { user: { role: 'Brand' } };
    let statusSet = 0;
    const res = {
        status: (s) => { statusSet = s; return res; },
        json: () => {}
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 403);
});

test('Should return 401 if user is not authenticated', () => {
    const middleware = hasPermission('user:view');
    const req = {};
    let statusSet = 0;
    const res = {
        status: (s) => { statusSet = s; return res; },
        json: () => {}
    };
    middleware(req, res, () => {});
    assert.strictEqual(statusSet, 401);
});

test('Should allow SuperAdmin for any capability', () => {
    const middleware = hasPermission('audit:view');
    const req = { user: { role: 'SuperAdmin' } };
    let nextCalled = false;
    middleware(req, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
});

console.log(`\nResult: ${passed}/${total} tests passing.`);
if (passed !== total) process.exit(1);
