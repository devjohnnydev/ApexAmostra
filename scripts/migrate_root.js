const fs = require('fs');

for (const file of ['check_db.js', 'check_schema.js']) {
    if (!fs.existsSync(file)) continue;
    let code = fs.readFileSync(file, 'utf8');
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
    code = code.replace(/res\.rows/g, "res[0]");
    fs.writeFileSync(file, code);
}
