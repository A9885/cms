const axios = require('axios');

async function testBrandAPI() {
    const baseUrl = 'http://localhost:3000/admin/api/brands';
    const testEmail = `testbrand_${Date.now()}@example.com`;

    console.log('--- Testing Create Brand ---');
    try {
        const createRes = await axios.post(baseUrl, {
            company_name: 'Test Automation Brand',
            email: testEmail,
            industry: 'Technology'
        });
        console.log('Create Success:', createRes.data);
        const brandId = createRes.data.brand_id;

        console.log('\n--- Testing Email Conflict (409) ---');
        try {
            await axios.post(baseUrl, {
                company_name: 'Duplicate Brand',
                email: testEmail
            });
        } catch (err) {
            console.log('Conflict (Expected 409):', err.response.status, err.response.data);
        }

        console.log('\n--- Testing Status: Approve ---');
        const approveRes = await axios.patch(`${baseUrl}/${brandId}/approve`);
        console.log('Approve Success:', approveRes.data);

        console.log('\n--- Testing Status: Disable ---');
        const disableRes = await axios.patch(`${baseUrl}/${brandId}/disable`);
        console.log('Disable Success:', disableRes.data);

        console.log('\n--- Testing Detailed Profile ---');
        const profileRes = await axios.get(`${baseUrl}/${brandId}`);
        console.log('Profile Data (Metrics):', {
            id: profileRes.data.id,
            status: profileRes.data.status,
            total_campaigns: profileRes.data.total_campaigns,
            total_spend: profileRes.data.total_spend
        });

        console.log('\n--- Testing Filtered List (Search) ---');
        const searchRes = await axios.get(`${baseUrl}?search=Automation`);
        console.log('Search Result Count:', searchRes.data.length);

    } catch (err) {
        console.error('Test Failed:', err.response ? err.response.data : err.message);
    }
}

testBrandAPI();
