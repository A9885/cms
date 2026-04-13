const axios = require('axios');
const baseUrl = 'https://cms.signtral.info';
const params = new URLSearchParams();
params.append('grant_type', 'client_credentials');
params.append('client_id', '5f12f18fdfd75cd1136fef51a0b7192ff17ce57a');
params.append('client_secret', '89d52a95afd01d54d781f59739a56e424275d43472827c981f495370e732f4d2c5142b466f3045c284779e7efbb73711a6cb1c9d8f40e24d9f62cc17fa5d1d2cf7e42fb7d1643eae153829824c55757a57146624f4fcbbc3407ee8282196c13a6a055bc11248261d0d135357afdb897b25bdd7f812b422ab88f583ba0883cf');

const paths = [
    '/api/authorize/access_token',
    '/api/index.php/authorize/access_token',
    '/web/api/authorize/access_token',
    '/api/index.php/api/authorize/access_token',
    '/index.php/api/authorize/access_token',
    '/api/authorize/token',
    '/authorize/access_token'
];

async function probe() {
    for (let p of paths) {
        console.log('Probing:', baseUrl + p);
        try {
            const r = await axios.post(baseUrl + p, params);
            console.log('SUCCESS JSON:', Object.keys(r.data));
            return;
        } catch (e) {
            console.log('FAILED:', e.response?.status, typeof e.response?.data === 'string' ? e.response?.data.substring(0, 50).replace(/\n/g,'') : e.response?.data?.error || e.message);
        }
    }
}
probe();
