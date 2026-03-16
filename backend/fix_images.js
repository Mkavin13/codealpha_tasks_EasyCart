const https = require('https');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'easycart'
    });

    const [rows] = await pool.query('SELECT id, name, image FROM products');
    let toFix = [];

    for (const row of rows) {
        if (!row.image) continue;

        const isBroken = await new Promise(r => {
            https.get(row.image, (res) => {
                if (res.statusCode === 404 || res.statusCode === 403) {
                    r(true);
                } else {
                    r(false);
                }
            }).on('error', () => {
                r(true);
            });
        });

        if (isBroken) {
            toFix.push(row);
        }
    }

    console.log(`Found ${toFix.length} broken images. Fixing...`);

    for (const item of toFix) {
        console.log(`Fixing image for ${item.name}`);
        const text = encodeURIComponent(item.name).replace(/%20/g, '+');
        const newImage = `https://placehold.co/500x500/1a1a1a/ffffff?text=${text}`;

        await pool.query('UPDATE products SET image = ? WHERE id = ?', [newImage, item.id]);

        const angles = [
            `https://placehold.co/500x500/1a1a1a/ffffff?text=${text}+-+1`,
            `https://placehold.co/500x500/1a1a1a/cccccc?text=${text}+-+2`,
            `https://placehold.co/500x500/1a1a1a/999999?text=${text}+-+3`
        ];

        for (let i = 0; i < 3; i++) {
            await pool.query('UPDATE product_images SET image_url = ? WHERE product_id = ? AND image_order = ?', [angles[i], item.id, i]);
        }
    }

    console.log(`Fixed ${toFix.length} broken images successfully!`);
    await pool.end();
}

run().catch(console.error);
