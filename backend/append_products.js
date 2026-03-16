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

    console.log('Inserting additional products...');

    const newProducts = [
        [
            'Smartphone',
            'Latest 5G smartphone with 120Hz OLED display, pro-grade camera system, and all-day battery life.',
            799.00,
            'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format',
            'Electronics',
            45
        ],
        [
            '4K Smart TV',
            '55-inch 4K UHD Smart TV with HDR10+, voice control, and built-in streaming apps.',
            499.00,
            'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500&auto=format',
            'Electronics',
            20
        ],
        [
            'Bluetooth Speaker',
            'Portable waterproof Bluetooth speaker with 360-degree sound and 12-hour playtime.',
            59.90,
            'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=500&auto=format',
            'Electronics',
            85
        ],
        [
            'Office Chair',
            'Ergonomic office chair with lumbar support, adjustable headrest, and breathable mesh back.',
            199.99,
            'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=500&auto=format',
            'Home',
            35
        ],
        [
            'Microwave Oven',
            '700W countertop microwave oven with 10 power levels, digital timer, and child safety lock.',
            89.00,
            'https://images.unsplash.com/photo-1574229344439-012ab64cde87?w=500&auto=format',
            'Home',
            25
        ],
        [
            'Sneakers',
            'Comfortable everyday sneakers with breathable knit upper, memory foam footbed, and durable rubber sole.',
            65.00,
            'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&auto=format',
            'Fashion',
            150
        ],
        [
            'Tote Bag',
            'Classic canvas tote bag for daily commutes or grocery runs. Features reinforced handles and inner zip pocket.',
            25.00,
            'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500&auto=format',
            'Fashion',
            200
        ],
        [
            'Sunglasses',
            'Polarized aviator sunglasses with UV400 protection. Includes microfiber cleaning cloth and hard protective case.',
            35.00,
            'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&auto=format',
            'Fashion',
            110
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

    console.log(`✅ Additional products inserted/verified.`);
    await pool.end();
}

run().catch(console.error);
