const fs = require('fs');

function replaceStr(file, str1, str2) {
    let c = fs.readFileSync(file, 'utf8');
    c = c.split(str1).join(str2);
    fs.writeFileSync(file, c);
}

replaceStr('admin.html', 'value="OUTRA"', 'value="CUSTOM"');
replaceStr('admin.html', "this.value === 'OUTRA'", "this.value === 'CUSTOM'");
replaceStr('admin_live.js', "'OUTRA'", "'CUSTOM'");
replaceStr('assets/js/modules/admin_compras.js', "'OUTRA'", "'CUSTOM'");
console.log('Fixed OUTRA to CUSTOM');
