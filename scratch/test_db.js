const mysql = require('mysql2/promise');
require('dotenv').config();
async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });
    try {
        const [rows] = await pool.query("SELECT * FROM settings WHERE `key` IN ('lme_envio_ativo', 'lme_envio_horario', 'lme_envio_dias')");
        console.log(rows);
    } catch(e) {
        console.error("No DB", e.message);
    }
    pool.end();
}
main();
