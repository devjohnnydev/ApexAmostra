const fs = require('fs');

['admin.js', 'admin_live.js'].forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    const oldCode = `const agora = new Date();
            const h = String(agora.getHours()).padStart(2, '0');
            const m = String(agora.getMinutes()).padStart(2, '0');
            const horaAtual = \`\${h}:\${m}\`;
            const diaAtual = agora.getDay();

            if (horaAtual === horario && diasAtivos.includes(diaAtual)) {
                if (window.__lastLmeCronRun === horaAtual) return;
                window.__lastLmeCronRun = horaAtual;`;
                
    const newCode = `const agora = new Date();
            const h = String(agora.getHours()).padStart(2, '0');
            const m = String(agora.getMinutes()).padStart(2, '0');
            const horaAtual = \`\${h}:\${m}\`;
            const diaAtual = agora.getDay();

            if (diasAtivos.includes(diaAtual) && horaAtual >= horario) {
                const dataHoje = agora.toDateString();
                if (window.__lastLmeCronRun === dataHoje) return; // Já disparou hoje
                window.__lastLmeCronRun = dataHoje;`;
                
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(file, content);
});

let html = fs.readFileSync('admin.html', 'utf8');
html = html.replace(/admin\.js\?v=[^"]+/g, 'admin.js?v=2026_09_18_time_fix_v4');
fs.writeFileSync('admin.html', html);

console.log('Done fixing frontend cron robustness');
