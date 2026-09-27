const fs = require('fs');

// admin_live.js
let c1 = fs.readFileSync('admin_live.js', 'utf8');
c1 = c1.split('ðŸ””').join('🔔');
c1 = c1.split('ðŸ\x8F†').join('🏆');
c1 = c1.split('ðŸ•’').join('🕒');
fs.writeFileSync('admin_live.js', c1);

// admin.js
let c2 = fs.readFileSync('admin.js', 'utf8');
c2 = c2.split('ðŸ“‹').join('📋');
fs.writeFileSync('admin.js', c2);

console.log('Fixed remaining mojibake!');
