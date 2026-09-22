const fs = require('fs');

['admin.js', 'admin_live.js'].forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace Intl.DateTimeFormat with direct Date methods
    const oldCode = `const formatterHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
            const horaAtual = formatterHora.format(new Date());

            const formatterDia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
            const diaStr = formatterDia.format(new Date());
            const diasMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
            const diaAtual = diasMap[diaStr];`;
            
    const newCode = `const agora = new Date();
            const h = String(agora.getHours()).padStart(2, '0');
            const m = String(agora.getMinutes()).padStart(2, '0');
            const horaAtual = \`\${h}:\${m}\`;
            const diaAtual = agora.getDay();`;

    content = content.replace(oldCode, newCode);
    fs.writeFileSync(file, content);
});

let html = fs.readFileSync('admin.html', 'utf8');
html = html.replace(/admin\.js\?v=[^"]+/g, 'admin.js?v=2026_09_18_time_fix_v3');
fs.writeFileSync('admin.html', html);

console.log('Done fixing frontend cron time');
