const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  try {
    const pool = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 5000
    });
    const [rows] = await pool.query("SELECT `key`, value FROM settings WHERE `key` LIKE '%lme%'");
    console.log('=== Configurações LME no Banco ===');
    if (rows.length === 0) console.log('NENHUMA CONFIG LME encontrada no banco!');
    rows.forEach(r => console.log(r.key + ' = ' + r.value));

    const [dest] = await pool.query("SELECT * FROM lme_destinatarios WHERE tipo='lme'");
    console.log('\n=== Destinatários LME ===');
    if (dest.length === 0) console.log('NENHUM DESTINATÁRIO cadastrado!');
    dest.forEach(d => console.log(d.id + ' | ' + d.nome + ' | ' + d.email));

    await pool.end();
  } catch(e) { console.log('DB ERROR:', e.message); }
})();
