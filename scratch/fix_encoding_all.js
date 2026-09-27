const fs = require('fs');
const path = require('path');

const map = {
    'á': 'á', 'ã': 'ã', 'â': 'â', 'ç': 'ç', 'é': 'é', 'ê': 'ê',
    'í': 'í', 'ó': 'ó', 'õ': 'õ', 'ô': 'ô', 'ú': 'ú',
    'Á': 'Á', 'Ã': 'Ã', 'Â': 'Â', 'Ç': 'Ç', 'É': 'É', 'Ê': 'Ê',
    'Í': 'Í', 'Ó': 'Ó', 'Õ': 'Õ', 'Ô': 'Ô', 'Ú': 'Ú',
    '─': '─', '—': '—', '“': '“', '”': '”', '’': '’',
    'Å': 'Å', 'à': 'à', 'Ä': 'Ä', 'Ü': 'Ü', 'ç': 'ç',
    'Produção': 'Produção', 'Laboratório': 'Laboratório', 'Estratégico': 'Estratégico' // common manual fixes
};

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        const p = path.join(dir, file);
        if(fs.statSync(p).isDirectory()) {
            if (!p.includes('node_modules') && !p.includes('.git')) walk(p);
        } else if (['.js', '.html', '.md', '.json', '.sql', '.css'].includes(path.extname(p))) {
            let text = fs.readFileSync(p, 'utf8');
            let changed = false;
            for (const [bad, good] of Object.entries(map)) {
                if (text.includes(bad)) {
                    text = text.split(bad).join(good);
                    changed = true;
                }
            }
            if (changed) {
                fs.writeFileSync(p, text, 'utf8');
                console.log('Fixed', p);
            }
        }
    });
}
walk('.');
