require('dotenv').config();
const xiboService = require('../src/services/xibo.service');

async function debugCircuit() {
    console.log('--- Xibo Circuit Breaker Debug ---');
    console.log('Initial State:', {
        failureCount: xiboService.failureCount,
        circuitOpen: xiboService.circuitOpen,
        baseUrl: xiboService.baseUrl,
        apiPrefix: xiboService._apiPrefix
    });

    try {
        console.log('\nTesting getDisplays()...');
        const displays = await xiboService.getDisplays();
        console.log('Result:', Array.isArray(displays) ? `Found ${displays.length} displays` : JSON.stringify(displays));
    } catch (err) {
        console.error('getDisplays() threw error:', err.message);
    }

    console.log('\nFinal State:', {
        failureCount: xiboService.failureCount,
        circuitOpen: xiboService.circuitOpen
    });

    if (xiboService.circuitOpen) {
        console.log('\n💡 Circuit is OPEN. Forcing reset for testing...');
        xiboService.circuitOpen = false;
        xiboService.failureCount = 0;
        
        console.log('Retrying getDisplays()...');
        try {
            const displays = await xiboService.getDisplays();
            console.log('Result:', Array.isArray(displays) ? `Found ${displays.length} displays` : JSON.stringify(displays));
        } catch (err) {
            console.error('Retry failed:', err.message);
        }
    }
}

debugCircuit();
