const assert = require('assert');
const { hasCapability, PERMISSIONS } = require('../../src/utils/permissions');

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

console.log('--- Permissions logic tests ---');
let passed = 0;
let total = 0;

function test(name, fn) {
    total++;
    if (runTest(name, fn)) passed++;
}

test('SuperAdmin should have all permissions', () => {
    assert.strictEqual(hasCapability('SuperAdmin', 'any:permission'), true);
});

test('Admin should have user:view', () => {
    assert.strictEqual(hasCapability('Admin', 'user:view'), true);
});

test('Admin should NOT have *', () => {
    assert.strictEqual(hasCapability('Admin', '*'), false);
});

test('Brand should have own_creative:manage', () => {
    assert.strictEqual(hasCapability('Brand', 'own_creative:manage'), true);
});

test('Partner should have own_screens:manage', () => {
    assert.strictEqual(hasCapability('Partner', 'own_screens:manage'), true);
});

test('Unknown role should have no permissions', () => {
    assert.strictEqual(hasCapability('Guest', 'any:permission'), false);
});

console.log(`\nResult: ${passed}/${total} tests passing.`);
if (passed !== total) process.exit(1);
