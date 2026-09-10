const fs = require('fs');

function migrateFile(filePath) {
    let code = fs.readFileSync(filePath, 'utf8');

    // 1. replace pg with mysql2
    code = code.replace(/const\s+\{\s*Pool\s*\}\s*=\s*require\('pg'\);/g, "const mysql = require('mysql2/promise');");
    
    // 2. change pool creation
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

    // 3. PostgreSQL placeholders ?, ? to ?
    code = code.replace(/\$([0-9]+)/g, '?');
    
    // 4. Update the result mapping.
    // In pg, result is { rows: [...], rowCount, ... }
    // In mysql2, result is [rows, fields]
    
    // Replace `const [rows] = await pool.query(` -> `const [rows] = await pool.query(`
    code = code.replace(/const\s+\{\s*rows\s*\}\s*=\s*await\s+pool\.query\(/g, "const [rows] = await pool.query(");
    
    // Replace `result[0]` with `result[0]` globally? Let's check for `.rows` usage
    // It's usually `result[0]` or `res[0]` or `rows.rows`
    // Let's replace `.rows` with `[0]` if it's preceded by result or res
    code = code.replace(/result\.rows/g, "result[0]");
    code = code.replace(/opRes\.rows/g, "opRes[0]");
    code = code.replace(/etapasRes\.rows/g, "etapasRes[0]");
    code = code.replace(/itensRes\.rows/g, "itensRes[0]");
    code = code.replace(/res\.rows/g, "res[0]");
    code = code.replace(/result1\.rows/g, "result1[0]");
    code = code.replace(/result2\.rows/g, "result2[0]");
    code = code.replace(/r\.rows/g, "r[0]");

    // is not supported in MySQL. We need to replace `` with nothing.
    code = code.replace(/\s*RETURNING\s+\*/g, "");
    code = code.replace(/\s*RETURNING\s+id/g, "");

    // For inserts/updates where they expected to get the inserted row, they used `result[0][0]`
    // In MySQL, `result[0].insertId` gives the ID for inserts.
    // So if they do `const [rows] = await pool.query("INSERT...")`, rows will be the ResultSetHeader, and `rows.insertId` is the ID.
    // Then they usually do `res.json(rows[0])`. But `rows[0]` is undefined for INSERT in MySQL.
    
    fs.writeFileSync(filePath, code);
}

migrateFile('server.js');
console.log('server.js migrated');
