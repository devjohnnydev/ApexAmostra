const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function run() {
    try {
        const res = await pool.query('SELECT * FROM usuarios');
        console.log("Usuários no DB:", res[0]);
    } catch(e) {
        console.log("Erro:", e);
    } finally {
        pool.end();
    }
}
run();
