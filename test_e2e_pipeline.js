const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

async function runTest() {
    try {
        console.log("1. Creating dummy image...");
        const imgPath = path.join(__dirname, 'dummy_promo.png');
        // A minimal valid PNG pixel
        const transparentBtn = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", 'base64');
        fs.writeFileSync(imgPath, transparentBtn);
        
        console.log("2. Sending POST to http://localhost:3000/xibo/slots/add (simulating Admin Panel)...");
        const form = new FormData();
        form.append('displayId', '1');
        form.append('displayGroupId', '1');
        form.append('slotId', '2'); // Using slot 2 to avoid conflicting with existing tests optionally
        form.append('duration', '8');
        form.append('replace', 'true');
        form.append('file', fs.createReadStream(imgPath), { filename: 'dummy_promo.png' });
        
        const uploadRes = await axios.post('http://localhost:3000/xibo/slots/add', form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity
        });
        
        console.log("Upload Success! Widget ID:", uploadRes.data.widgetId);
        
        console.log("3. Triggering Force Sync & Proof of Play initialization...");
        const syncRes = await axios.post(`http://localhost:3000/xibo/slots/stats/force-sync/1`);
        console.log("Force Sync Response:", syncRes.data.success ? "Success" : "Failed");
        
        console.log("4. Fetching recent Proof of Play stats...");
        const statsRes = await axios.get(`http://localhost:3000/xibo/stats/recent`);
        console.log("Recent Stats Count:", statsRes.data.total);
        if (statsRes.data.data && statsRes.data.data.length > 0) {
            console.log("Sample Stat:", statsRes.data.data[0]);
        } else {
            console.log("Note: Stats are empty locally because the physical screen hasn't actually downloaded and played the new schedule yet.");
        }
        
    } catch (e) {
        console.error("Test failed:", e.response ? JSON.stringify(e.response.data) : e.message);
    }
}
runTest();
