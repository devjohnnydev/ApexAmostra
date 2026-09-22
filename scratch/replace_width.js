const fs = require('fs');

['admin.js', 'admin_live.js'].forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/captureArea\.style\.width = '800px';/g, "captureArea.style.width = '1200px';");
    content = content.replace(/width: 800/g, "width: 1200");
    fs.writeFileSync(file, content);
});
console.log('Done replacing width');
