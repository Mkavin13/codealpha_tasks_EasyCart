const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 3306
    });

    console.log('Dropping easycart database...');
    await connection.query('DROP DATABASE IF EXISTS easycart');
    console.log('Database dropped.');
    await connection.end();
}

run().catch(console.error);
