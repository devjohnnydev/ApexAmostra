const fs = require('fs');
const path = require('path');

function migrateFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let code = fs.readFileSync(filePath, 'utf8');

    code = code.replace(/const\s+\{\s*Pool\s*\}\s*=\s*require\('pg'\);/g, "const mysql = require('mysql2/promise');");
    
    code = code.replace(/const\s+pool\s*=\s*new\s+Pool\(\{[\s\S]*?\}\);/g, () => {
        return `const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});`;
    });

    code = code.replace(/\$([0-9]+)/g, '?');
    code = code.replace(/const\s+\{\s*rows\s*\}\s*=\s*await\s+pool\.query\(/g, "const [rows] = await pool.query(");
    
    // Replace `.rows` usage
    code = code.replace(/result\.rows/g, "result[0]");
    code = code.replace(/res\.rows/g, "res[0]");
    code = code.replace(/\s*RETURNING\s+\*/g, "");
    code = code.replace(/\s*RETURNING\s+id/g, "");
    
    fs.writeFileSync(filePath, code);
    console.log(filePath + ' migrated');
}

const dir = 'scripts';
const files = fs.readdirSync(dir);
for (const file of files) {
    if (file.endsWith('.js')) {
        migrateFile(path.join(dir, file));
    }
}
