const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let pool;

async function initializeDatabase() {
    // Create connection pool WITHOUT selecting database initially
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        // Don't specify database here initially
    });

    try {
        // Create database if it doesn't exist
        await pool.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'easycart'} 
                         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        console.log(`✅ Database '${process.env.DB_NAME || 'easycart'}' created/verified`);

        // Now create a NEW pool that includes the database
        const dbPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'easycart',  // NOW we specify the database
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });

        // Replace the old pool with the new one that has database selected
        pool = dbPool;

        console.log('✅ MySQL database connected successfully');

        // Create tables
        await createTables();

        // Insert sample products if needed
        await insertSampleProducts();

        console.log('✅ Database initialization completed');
        return pool;
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    }
}

async function createTables() {
    console.log('Creating database tables...');

    // Users table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Users table created');

    // Products table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10,2) NOT NULL,
            image TEXT,
            category VARCHAR(100),
            stock INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_category (category),
            INDEX idx_price (price),
            INDEX idx_stock (stock),
            FULLTEXT INDEX idx_search (name, description)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Products table created');

    // Orders table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
            shipping_address TEXT NOT NULL,
            payment_method VARCHAR(50) DEFAULT 'card',
            payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            INDEX idx_status (status),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Orders table created');

    // Order items table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INT PRIMARY KEY AUTO_INCREMENT,
            order_id INT NOT NULL,
            product_id INT NOT NULL,
            quantity INT NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            INDEX idx_order_id (order_id),
            INDEX idx_product_id (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Order items table created');

    // Cart table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cart (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            product_id INT NOT NULL,
            quantity INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_product (user_id, product_id),
            INDEX idx_user_id (user_id),
            INDEX idx_product_id (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Cart table created');

    // Password Resets table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            token VARCHAR(255) NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_token (token),
            INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Password resets table created');

    // Product Images table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS product_images (
            id INT PRIMARY KEY AUTO_INCREMENT,
            product_id INT NOT NULL,
            image_url TEXT NOT NULL,
            image_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            INDEX idx_product_id (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Product images table created');
}

async function insertSampleProducts() {
    // Check if products table is empty
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM products');

    if (rows[0].count === 0) {
        console.log('Inserting sample products...');

        const sampleProducts = [
            [
                'Wireless Headphones',
                'Premium noise-cancelling wireless headphones with 30-hour battery life. Features Bluetooth 5.0, comfortable over-ear design, and built-in microphone for calls.',
                999.00,
                'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format',
                'Electronics',
                50
            ],
            [
                'Smart Watch',
                'Fitness tracker with heart rate monitor, GPS, sleep tracking, and 7-day battery life. Water-resistant up to 50 meters.',
                1499.00,
                'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format',
                'Electronics',
                30
            ],
            [
                'Leather Backpack',
                'Handcrafted genuine leather backpack for everyday use. Features padded laptop compartment, multiple pockets, and adjustable straps.',
                899.00,
                'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&auto=format',
                'Fashion',
                25
            ],
            [
                'Coffee Maker',
                'Programmable coffee maker with thermal carafe. Brews 12 cups, has auto-shutoff, and keeps coffee hot for hours.',
                149.99,
                'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=500&auto=format',
                'Home',
                15
            ],
            [
                'Yoga Mat',
                'Eco-friendly non-slip yoga mat with carrying strap. Made from natural rubber, 6mm thickness for extra comfort.',
                399.00,
                'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=500&auto=format',
                'Sports',
                100
            ],
            [
                'Desk Lamp',
                'LED desk lamp with wireless charging pad. Adjustable brightness, color temperature, and built-in USB port.',
                499.00,
                'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500&auto=format',
                'Home',
                40
            ],
            [
                'Running Shoes',
                'Lightweight running shoes with responsive cushioning. Breathable mesh upper, durable rubber outsole.',
                1299.00,
                'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format',
                'Sports',
                60
            ],
            [
                'Backpack',
                'Water-resistant laptop backpack with USB charging port. Multiple compartments, fits 17" laptop.',
                599.00,
                'https://images.unsplash.com/photo-1622560480605-d6c1c279e662?w=500&auto=format',
                'Fashion',
                75
            ],
            [
                'Wireless Mouse',
                'Ergonomic wireless mouse with adjustable DPI settings, silent clicks, and 24-month battery life. Compatible with Windows and Mac.',
                299.00,
                'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500&auto=format',
                'Electronics',
                120
            ],
            [
                'Gaming Keyboard',
                'Mechanical gaming keyboard with customizable RGB backlighting, anti-ghosting keys, and detachable wrist rest.',
                999.00,
                'https://images.unsplash.com/photo-1595225476474-87563907a212?w=500&auto=format',
                'Electronics',
                45
            ],
            [
                'Water Bottle',
                'Insulated stainless steel water bottle. Keeps drinks cold for 24 hours or hot for 12 hours. BPA-free with leak-proof lid.',
                199.00,
                'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&auto=format',
                'Home',
                200
            ],
            [
                'Acoustic Guitar',
                'Beginner-friendly acoustic guitar with spruce top and mahogany back. Includes gig bag, tuner, strings, and picks.',
                149.99,
                'https://images.unsplash.com/photo-1550227298-1b255ce8c8e1?w=500&auto=format',
                'Music',
                15
            ],
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
            ],
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

        for (const product of sampleProducts) {
            const [result] = await pool.query(insertQuery, product);
            const productId = result.insertId;
            const mainImage = product[3];

            // Insert 3 sample images for each product
            // Using the main image with different crop/zoom parameters as placeholders for different angles
            const images = [
                mainImage, // main angle
                mainImage.replace('auto=format', 'auto=format&fit=crop&crop=bottom'), // angle 2
                mainImage.replace('auto=format', 'auto=format&fit=crop&crop=top')  // angle 3
            ];

            for (let i = 0; i < images.length; i++) {
                await pool.query(insertImageQuery, [productId, images[i], i]);
            }
        }

        console.log(`✅ ${sampleProducts.length} sample products and their images inserted successfully`);
    }
}

// Helper function to get database connection
function getDb() {
    if (!pool) {
        throw new Error('Database not initialized. Call initializeDatabase first.');
    }
    return pool;
}

// Helper function to close database connection
async function closeDatabase() {
    if (pool) {
        await pool.end();
        console.log('Database connection closed');
    }
}

module.exports = { initializeDatabase, getDb, closeDatabase };