const fs = require('fs');
const path = require('path');

const badStrings = ['â”€', 'ANÃ', 'Ã§', 'Ã¡', 'Ã£', 'Ã³', 'Ã©', 'Ã­'];

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        const p = path.join(dir, file);
        if (fs.statSync(p).isDirectory()) {
            if (!p.includes('node_modules') && !p.includes('.git')) walk(p);
        } else if (['.js', '.html', '.md', '.json', '.sql', '.css'].includes(path.extname(p))) {
            const content = fs.readFileSync(p, 'utf8');
            let corrupted = false;
            for (let bad of badStrings) {
                if (content.includes(bad)) {
                    corrupted = true;
                    break;
                }
            }
            if (corrupted) {
                console.log('Corrupted:', p);
            }
        }
    });
}
walk('.');
