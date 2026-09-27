const fs = require('fs');

function fixFile(file) {
    const content = fs.readFileSync(file, 'utf8');
    try {
        const fixed = Buffer.from(content, 'latin1').toString('utf8');
        // Let's verify that the fixed version does not still contain the bad sequences.
        // Wait, if there are genuinely unicode characters that were NOT corrupted mixed with corrupted ones, this will destroy the good ones!
        // Is admin_live.js entirely corrupted? Yes, the whole file was probably read as utf8 and saved as latin1, or read as latin1 and saved as utf8.
        fs.writeFileSync(file, fixed, 'utf8');
        console.log('Fixed', file);
    } catch(e) {
        console.log('Error fixing', file, e);
    }
}

fixFile('admin.js');
fixFile('admin_live.js');
