const fs = require('fs');
let content = fs.readFileSync('admin_live.js', 'utf8');

// The file might contain literal "â”€".
// If so, converting from binary to utf8 might not work directly if it was saved as utf8 AFTER being corrupted.
// Let's check a sample:
const sample = content.substring(content.indexOf('ANÃ'), content.indexOf('ANÃ') + 20);
console.log('Sample:', sample);
console.log('Buffer:', Buffer.from(sample, 'utf8'));

// Try latin1 trick:
try {
    const fixed = Buffer.from(sample, 'latin1').toString('utf8');
    console.log('Fixed latin1:', fixed);
} catch(e) { console.log(e); }
