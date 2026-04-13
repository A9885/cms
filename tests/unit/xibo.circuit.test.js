const assert = require('assert');
const axios = require('axios');
const { XiboService } = require('../../src/services/xibo.service');

// Mock axios.get
let mockAxiosResult = null;
let mockAxiosError = null;
axios.get = async () => {
    if (mockAxiosError) throw mockAxiosError;
    return mockAxiosResult;
};

async function test() {
    console.log('--- Xibo Circuit Breaker tests ---');
    
    const xibo = new XiboService();
    xibo.threshold = 3;
    xibo.resetTimeout = 100;
    xibo.baseUrl = 'http://localhost';
    xibo.getAccessToken = async () => 'test-token';

    // 1. Success returns raw data
    mockAxiosResult = { data: [{ displayId: 1 }] };
    mockAxiosError = null;
    const r1 = await xibo.getDisplays();
    assert.strictEqual(Array.isArray(r1), true, 'Should return array on success');
    assert.strictEqual(r1[0].displayId, 1);
    console.log('✅ Success returns raw data');

    // 2. Failure threshold
    mockAxiosError = new Error('Outage');
    
    await xibo.getDisplays(); // 1
    await xibo.getDisplays(); // 2
    assert.strictEqual(xibo.circuitOpen, false);
    
    const rSync = await xibo.getDisplays(); // 3 -> Open
    assert.strictEqual(xibo.circuitOpen, true);
    assert.strictEqual(rSync.syncing, true);
    console.log('✅ Circuit opens after threshold');

    // 3. Recovery
    await new Promise(r => setTimeout(r, 150));
    assert.strictEqual(xibo.circuitOpen, false);
    
    mockAxiosError = null;
    mockAxiosResult = { data: [] };
    const rRecovered = await xibo.getDisplays();
    assert.strictEqual(Array.isArray(rRecovered), true);
    console.log('✅ Circuit recovers after timeout');

    console.log('\nResult: 3/3 async tests passing.');
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
