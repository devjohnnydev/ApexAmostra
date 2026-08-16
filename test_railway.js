const https = require('https');

function request(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function test() {
    try {
        const res = await request({
            hostname: 'apexamostra-production.up.railway.app',
            path: '/api/solucoes',
            method: 'GET'
        });
        console.log('Status:', res.status);
        console.log('Body:', res.body.substring(0, 200));
    } catch (err) {
        console.error('Test error:', err);
    }
}
test();
