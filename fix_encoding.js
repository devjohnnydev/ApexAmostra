const fs = require('fs');
let text = fs.readFileSync('admin.js', 'utf8');
const map = {
    '├í': 'á', '├ú': 'ã', '├ó': 'â', '├º': 'ç', '├®': 'é', '├¬': 'ê',
    '├¡': 'í', '├│': 'ó', '├Á': 'õ', '├┤': 'ô', '├║': 'ú',
    '├ü': 'Á', '├â': 'Ã', '├é': 'Â', '├ç': 'Ç', '├ë': 'É', '├è': 'Ê',
    '├ì': 'Í', '├ô': 'Ó', '├ò': 'Õ', '├ö': 'Ô', '├Ü': 'Ú',
    'ÔöÇ': '─', 'ÔÇö': '—', 'ÔÇ£': '“', 'ÔÇØ': '”', 'ÔÇÖ': '’',
    '├à': 'Å', '├á': 'à', '├ä': 'Ä', '├£': 'Ü'
};
for (const [bad, good] of Object.entries(map)) {
    text = text.split(bad).join(good);
}
fs.writeFileSync('admin.js', text, 'utf8');
console.log('Fixed admin.js');
