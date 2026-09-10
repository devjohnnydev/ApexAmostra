const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'fornecedores'
        `);
        console.log('Colunas de fornecedores:', res[0]);
        
        const res2 = await pool.query('SELECT COUNT(*) FROM fornecedores');
        console.log('Total registros:', res2.rows[0].count);
        
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
check();
