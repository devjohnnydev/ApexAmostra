const fs = require('fs');
let text = fs.readFileSync('admin.js', 'utf8');
const map = {
    'á': 'á', 'ã': 'ã', 'â': 'â', 'ç': 'ç', 'é': 'é', 'ê': 'ê',
    'í': 'í', 'ó': 'ó', 'õ': 'õ', 'ô': 'ô', 'ú': 'ú',
    'Á': 'Á', 'Ã': 'Ã', 'Â': 'Â', 'Ç': 'Ç', 'É': 'É', 'Ê': 'Ê',
    'Í': 'Í', 'Ó': 'Ó', 'Õ': 'Õ', 'Ô': 'Ô', 'Ú': 'Ú',
    '─': '─', '—': '—', '“': '“', '”': '”', '’': '’',
    'Å': 'Å', 'à': 'à', 'Ä': 'Ä', 'Ü': 'Ü'
};
for (const [bad, good] of Object.entries(map)) {
    text = text.split(bad).join(good);
}
fs.writeFileSync('admin.js', text, 'utf8');
console.log('Fixed admin.js');
