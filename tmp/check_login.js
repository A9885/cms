const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const cookies = res.headers['set-cookie'];
    if (!cookies) {
      console.log('No cookie, response:', data);
      return;
    }
    const cookie = cookies[0].split(';')[0];
    
    // now fetch dashboard
    const dashOpts = {
      hostname: 'localhost',
      port: 3000,
      path: '/brandportal/api/dashboard',
      method: 'GET',
      headers: {
        'Cookie': cookie
      }
    };
    const req2 = http.request(dashOpts, (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => console.log('Dashboard response:', res2.statusCode, data2));
    });
    req2.end();
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({ username: 'anjan', password: 'password123' })); // assume correct pass or test user pass
req.end();
