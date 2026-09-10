const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
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

async function migratePasswords() {
    try {
        const result = await pool.query('SELECT id, pass FROM usuarios');
        console.log(`Encontrados ${result[0].length} usuarios para processar.`);

        for (const user of result[0]) {
            if (!user.pass.startsWith('?a$') && !user.pass.startsWith('?b$')) {
                const salt = await bcrypt.genSalt(10);
                const hashed = await bcrypt.hash(user.pass, salt);
                await pool.query('UPDATE usuarios SET pass = ? WHERE id = ?', [hashed, user.id]);
                console.log(`Senha atualizada para usuario ID ${user.id}`);
            } else {
                console.log(`Usuario ID ${user.id} já possui hash.`);
            }
        }
        console.log('Migração concluída com sucesso!');
        process.exit(0);
    } catch (err) {
        console.error('Erro na migração:', err);
        process.exit(1);
    }
}

migratePasswords();
