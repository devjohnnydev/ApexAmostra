const fs = require('fs');

const mojibakeMap = {
    'Ã¡': 'á', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã§': 'ç', 'Ã©': 'é', 'Ãª': 'ê', 'Ã­': 'í',
    'Ã³': 'ó', 'Ãµ': 'õ', 'Ãº': 'ú',
    'Ã\x81': 'Á', // 'Ã' + control char 0x81
    'Ã\x82': 'Â',
    'Ã\x83': 'Ã',
    'Ã\x87': 'Ç',
    'Ã\x89': 'É',
    'Ã\x8A': 'Ê',
    'Ã\x8D': 'Í',
    'Ã\x93': 'Ó',
    'Ã\x95': 'Õ',
    'Ã\x9A': 'Ú',
    'â”€': '─',
    'â€œ': '“',
    'â€\x9D': '”',
    'â€™': '’'
};

// Wait, the terminal output above showed 'ANÃ', which is 'AN' + 'Ã' + ' '. 
// Why would 'Á' become 'Ã ' (Ã + space)?
// Because 0xC3 0x81. 0xC3 is 'Ã'. 0x81 is an unprintable control character in Windows-1252, which often gets swallowed or turned into a space or ? or rendered invisibly!
// If it's an invisible character, a simple string replace might work if we read the literal bytes.

function fixMojibake(file) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Instead of replacing specific strings which might be invisible,
    // let's use a regex to match ALL 2-byte sequences starting with 0xC2 or 0xC3, 
    // BUT only if they are literally in the text as two characters (i.e., the first char is 0xC3 (Ã)).
    // Wait, in JS, `content` is a utf8 string.
    // If the file was saved as utf8 containing "Ã" (U+00C3) followed by some char X, we can find it.
    
    // Let's print out what exactly follows "ANÃ" in admin.js
    const idx = content.indexOf('ANÃ');
    if (idx !== -1) {
        console.log('Hex of ANÃ...:', content.charCodeAt(idx+2).toString(16), content.charCodeAt(idx+3).toString(16), content.charCodeAt(idx+4).toString(16));
    }
}
fixMojibake('admin_live.js');
