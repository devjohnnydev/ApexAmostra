const fs = require('fs');

['admin.js', 'admin_live.js'].forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace width: 1200 with windowWidth: 1200, width: 1200
    content = content.replace(/height: captureArea\.scrollHeight, width: 1200/g, "windowWidth: 1200, height: captureArea.scrollHeight, width: 1200");
    content = content.replace(/scrollY: 0, windowHeight:/g, "scrollY: 0, windowWidth: 1200, windowHeight:");
    
    fs.writeFileSync(file, content);
});
console.log('Done adding windowWidth');
