const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'easycart',
        port: process.env.DB_PORT || 3306,
    });

    console.log('Inserting additional 10 products...');

    const newProducts = [
        [
            'Digital Camera',
            '24.2MP mirrorless digital camera with 4K video recording, fast autofocus, and Wi-Fi connectivity.',
            899.00,
            'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500&auto=format',
            'Electronics',
            15
        ],
        [
            'Dumbbell Set',
            'Adjustable dumbbell set up to 50 lbs each with non-slip grips. Perfect for home gym workouts.',
            199.00,
            'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=500&auto=format',
            'Sports',
            25
        ],
        [
            'Action Camera',
            'Waterproof action camera with 4K at 60fps, hypersmooth stabilization, and front/rear displays.',
            349.00,
            'https://images.unsplash.com/photo-1564466809058-bf4114d55352?w=500&auto=format',
            'Electronics',
            40
        ],
        [
            'Air Purifier',
            'HEPA air purifier for home, captures 99.97% of airborne particles like dust, pollen, and pet dander.',
            129.00,
            'https://images.unsplash.com/photo-1585773199858-a5b6cecae653?w=500&auto=format',
            'Home',
            30
        ],
        [
            'Camping Tent',
            '4-person waterproof dome camping tent. Easy setup with fiberglass poles and rainfly included.',
            89.99,
            'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=500&auto=format',
            'Sports',
            20
        ],
        [
            'Electric Toothbrush',
            'Rechargeable electric toothbrush with 3 brushing modes, pressure sensor, and travel case.',
            69.00,
            'https://images.unsplash.com/photo-1558500204-6338b29f0ce6?w=500&auto=format',
            'Home',
            80
        ],
        [
            'Winter Jacket',
            'Insulated hooded winter jacket. Water-resistant and windproof, perfect for extreme cold weather.',
            149.00,
            'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&auto=format',
            'Fashion',
            45
        ],
        [
            'Board Game',
            'Award-winning strategy board game for 2-4 players. Easy to learn but highly replayable.',
            45.00,
            'https://images.unsplash.com/photo-1610890716171-ec57bdc07c74?w=500&auto=format',
            'Entertainment',
            90
        ],
        [
            'Protein Powder',
            'Whey protein isolate powder, vanilla flavor. 25g protein per serving, 0g sugar.',
            49.99,
            'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=500&auto=format',
            'Sports',
            120
        ]
    ];

    const insertQuery = `
        INSERT INTO products (name, description, price, image, category, stock) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    const insertImageQuery = `
        INSERT INTO product_images (product_id, image_url, image_order)
        VALUES (?, ?, ?)
    `;

    for (const product of newProducts) {
        // check if exists first to be safe
        const [existing] = await pool.query('SELECT id FROM products WHERE name = ? LIMIT 1', [product[0]]);
        if (existing.length > 0) {
            console.log(`Skipping ${product[0]} as it already exists.`);
            continue;
        }

        const [result] = await pool.query(insertQuery, product);
        const productId = result.insertId;
        const mainImage = product[3];

        const images = [
            mainImage, // main angle
            mainImage.replace('auto=format', 'auto=format&fit=crop&crop=bottom'), // angle 2
            mainImage.replace('auto=format', 'auto=format&fit=crop&crop=top')  // angle 3
        ];

        for (let i = 0; i < images.length; i++) {
            await pool.query(insertImageQuery, [productId, images[i], i]);
        }
    }

    console.log(`✅ Additional 10 products inserted/verified.`);
    await pool.end();
}

run().catch(console.error);
