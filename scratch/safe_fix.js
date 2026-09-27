const fs = require('fs');

const safeMap = {
    'Ã¡': 'á', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã§': 'ç', 'Ã©': 'é', 'Ãª': 'ê', 'Ã­': 'í',
    'Ã³': 'ó', 'Ãµ': 'õ', 'Ãº': 'ú',
    'Ã\x81': 'Á', 'Ã\x82': 'Â', 'Ã\x83': 'Ã', 'Ã\x87': 'Ç', 'Ã\x89': 'É', 'Ã\x8A': 'Ê',
    'Ã\x8D': 'Í', 'Ã\x93': 'Ó', 'Ã\x95': 'Õ', 'Ã\x9A': 'Ú',
    'â”€': '─',
    'â€œ': '“',
    'â€\x9D': '”',
    'â€™': '’',
    'Ã«': 'ë',
    'Ã\x8B': 'Ë',
    'Ã¼': 'ü',
    'Ã\x9C': 'Ü'
};

function safeFix(file) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    for (const [bad, good] of Object.entries(safeMap)) {
        if (content.includes(bad)) {
            content = content.split(bad).join(good);
            changed = true;
        }
    }
    
    // Also, just to be safe for any missed 2-byte sequences:
    // We can use a regex to find any Ã followed by a character in the range \x80-\xBF
    content = content.replace(/\xC3([\x80-\xBF])/g, (match, p1) => {
        // C3 is 11000011, meaning the character is 11000011 10xxxxxx
        // But wait, the JS string contains U+00C3 and U+00xx literally.
        const code = ((0xC3 & 0x1F) << 6) | (p1.charCodeAt(0) & 0x3F);
        return String.fromCharCode(code);
    });
    
    content = content.replace(/\xC2([\x80-\xBF])/g, (match, p1) => {
        const code = ((0xC2 & 0x1F) << 6) | (p1.charCodeAt(0) & 0x3F);
        return String.fromCharCode(code);
    });

    if (changed || content !== fs.readFileSync(file, 'utf8')) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Fixed safely:', file);
    }
}

safeFix('admin.js');
safeFix('admin_live.js');
