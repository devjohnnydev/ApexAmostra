const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'c:/Users/Professor/Desktop/ApexAmostra/apextech/.env' });

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
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fornecedores'");
        console.log("Columns:", res[0]);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        pool.end();
    }
}
run();
