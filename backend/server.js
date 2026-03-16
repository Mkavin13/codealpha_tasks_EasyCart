const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const crypto = require('crypto'); // Built-in, no install needed
const { initializeDatabase, getDb, closeDatabase } = require('./database');

dotenv.config();

// Rest of your code...
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8000', 'http://127.0.0.1:8000'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('../frontend'));

let db;

// Initialize database
initializeDatabase().then(pool => {
    db = pool;
    console.log(`✅ MySQL database connected and initialized`);
    console.log(`🚀 Server ready to accept connections`);
}).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ error: 'Token expired' });
            }
            return res.status(403).json({ error: 'Invalid token' });
        }

        try {
            if (db) {
                const [existingUsers] = await db.query('SELECT id FROM users WHERE id = ?', [user.id || user.userId]);
                if (existingUsers.length === 0) {
                    return res.status(401).json({ error: 'User no longer exists. Please log in again.' });
                }
            }
        } catch (dbError) {
            console.error('Auth verification DB error:', dbError);
        }

        req.user = user;
        next();
    });
};

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected'
    });
});

// ==================== AUTH ROUTES ====================

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const [result] = await db.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        const token = jwt.sign(
            { id: result.insertId, email, name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: { id: result.insertId, name, email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Get current user
app.get('/api/user', authenticateToken, async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, name, email, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user password (from dashboard)
app.put('/api/user/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Get user to verify current password
        const [users] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validPassword = await bcrypt.compare(currentPassword, users[0].password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Incorrect current password' });
        }

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Server error while changing password' });
    }
});

// ==================== PRODUCT ROUTES ====================

// Get all products with optional filtering
app.get('/api/products', async (req, res) => {
    try {
        const { category, minPrice, maxPrice, search, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (minPrice) {
            query += ' AND price >= ?';
            params.push(minPrice);
        }

        if (maxPrice) {
            query += ' AND price <= ?';
            params.push(maxPrice);
        }

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [products] = await db.query(query, params);

        // Get total count
        const [countResult] = await db.query('SELECT COUNT(*) as total FROM products');

        res.json({
            products,
            pagination: {
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: countResult[0].total > (parseInt(offset) + parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
    try {
        const [products] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(products[0]);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get product categories
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await db.query(
            'SELECT DISTINCT category, COUNT(*) as product_count FROM products GROUP BY category'
        );
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== CART ROUTES ====================

// Get user's cart
app.get('/api/cart', authenticateToken, async (req, res) => {
    try {
        const [cartItems] = await db.query(`
            SELECT c.*, p.name, p.price, p.image, p.description, p.stock 
            FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
        `, [req.user.id]);
        res.json(cartItems);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add to cart
app.post('/api/cart', authenticateToken, async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { productId, quantity = 1 } = req.body;

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        if (quantity < 1) {
            return res.status(400).json({ error: 'Quantity must be at least 1' });
        }

        await connection.beginTransaction();

        // Check if product exists and has stock
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];
        if (product.stock < quantity) {
            await connection.rollback();
            return res.status(400).json({ error: `Only ${product.stock} items available in stock` });
        }

        // Check if item already in cart
        const [existingItems] = await connection.query(
            'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
            [req.user.id, productId]
        );

        if (existingItems.length > 0) {
            const newQuantity = existingItems[0].quantity + quantity;
            if (newQuantity > product.stock) {
                await connection.rollback();
                return res.status(400).json({ error: `Cannot add more than ${product.stock} items` });
            }

            await connection.query(
                'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
                [newQuantity, req.user.id, productId]
            );
        } else {
            await connection.query(
                'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
                [req.user.id, productId, quantity]
            );
        }

        await connection.commit();

        // Get updated cart count
        const [cartCount] = await connection.query(
            'SELECT SUM(quantity) as count FROM cart WHERE user_id = ?',
            [req.user.id]
        );

        res.status(201).json({
            message: 'Added to cart successfully',
            cartCount: cartCount[0].count || 0
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error adding to cart:', error);
        res.status(500).json({ error: 'Server error' });
    } finally {
        connection.release();
    }
});

// Update cart item quantity
app.put('/api/cart/:productId', authenticateToken, async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { quantity } = req.body;
        const productId = req.params.productId;

        if (!quantity || quantity < 1) {
            return res.status(400).json({ error: 'Valid quantity is required' });
        }

        await connection.beginTransaction();

        // Check stock
        const [products] = await connection.query('SELECT stock FROM products WHERE id = ?', [productId]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Product not found' });
        }

        if (products[0].stock < quantity) {
            await connection.rollback();
            return res.status(400).json({ error: `Only ${products[0].stock} items available` });
        }

        await connection.query(
            'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
            [quantity, req.user.id, productId]
        );

        await connection.commit();
        res.json({ message: 'Cart updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating cart:', error);
        res.status(500).json({ error: 'Server error' });
    } finally {
        connection.release();
    }
});

// Remove from cart
app.delete('/api/cart/:productId', authenticateToken, async (req, res) => {
    try {
        await db.query(
            'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
            [req.user.id, req.params.productId]
        );
        res.json({ message: 'Item removed from cart' });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Clear entire cart
app.delete('/api/cart', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM cart WHERE user_id = ?', [req.user.id]);
        res.json({ message: 'Cart cleared successfully' });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get cart count
app.get('/api/cart/count', authenticateToken, async (req, res) => {
    try {
        const [result] = await db.query(
            'SELECT SUM(quantity) as count FROM cart WHERE user_id = ?',
            [req.user.id]
        );
        res.json({ count: result[0].count || 0 });
    } catch (error) {
        console.error('Error getting cart count:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== ORDER ROUTES ====================

// Create order
app.post('/api/orders', authenticateToken, async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { shippingAddress, paymentMethod = 'card' } = req.body;

        if (!shippingAddress) {
            return res.status(400).json({ error: 'Shipping address is required' });
        }

        await connection.beginTransaction();

        // Get cart items with product details
        const [cartItems] = await connection.query(`
            SELECT c.*, p.price, p.stock, p.name 
            FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
        `, [req.user.id]);

        if (cartItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Calculate total and check stock
        let total = 0;
        for (const item of cartItems) {
            if (item.quantity > item.stock) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Insufficient stock for ${item.name}. Only ${item.stock} available.`
                });
            }
            total += item.price * item.quantity;
        }

        // Create order
        const [orderResult] = await connection.query(
            'INSERT INTO orders (user_id, total_amount, shipping_address, payment_method) VALUES (?, ?, ?, ?)',
            [req.user.id, total, shippingAddress, paymentMethod]
        );

        // Create order items and update stock
        for (const item of cartItems) {
            await connection.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderResult.insertId, item.product_id, item.quantity, item.price]
            );

            await connection.query(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        // Clear cart
        await connection.query('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

        await connection.commit();

        res.status(201).json({
            orderId: orderResult.insertId,
            total: total,
            message: 'Order placed successfully'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Server error' });
    } finally {
        connection.release();
    }
});

// Create order directly (bypassing cart)
app.post('/api/orders/direct', authenticateToken, async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { productId, quantity, shippingAddress, paymentMethod = 'card' } = req.body;

        if (!productId || !quantity || !shippingAddress) {
            return res.status(400).json({ error: 'Product ID, quantity, and shipping address are required' });
        }

        await connection.beginTransaction();

        // Get product details
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);

        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];

        // Check stock
        if (product.stock < quantity) {
            await connection.rollback();
            return res.status(400).json({
                error: `Insufficient stock for ${product.name}. Only ${product.stock} available.`
            });
        }

        // Calculate total
        const total = product.price * quantity;

        // Create order
        const [orderResult] = await connection.query(
            'INSERT INTO orders (user_id, total_amount, shipping_address, payment_method) VALUES (?, ?, ?, ?)',
            [req.user.id, total, shippingAddress, paymentMethod]
        );

        // Create order item and update stock
        await connection.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
            [orderResult.insertId, product.id, quantity, product.price]
        );

        await connection.query(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            [quantity, product.id]
        );

        // Note: We DO NOT clear the cart here

        await connection.commit();

        res.status(201).json({
            orderId: orderResult.insertId,
            total: total,
            message: 'Direct order placed successfully'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating direct order:', error);
        res.status(500).json({ error: 'Server error' });
    } finally {
        connection.release();
    }
});

// Get user's orders
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT o.*, 
                   COUNT(oi.id) as item_count,
                   JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'product_id', oi.product_id,
                           'quantity', oi.quantity,
                           'price', oi.price,
                           'name', p.name,
                           'image', p.image
                       )
                   ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [req.user.id]);

        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single order
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT o.*, 
                   JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'product_id', oi.product_id,
                           'quantity', oi.quantity,
                           'price', oi.price,
                           'name', p.name,
                           'image', p.image
                       )
                   ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.id = ? AND o.user_id = ?
            GROUP BY o.id
        `, [req.params.id, req.user.id]);

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(orders[0]);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get product images
app.get('/api/products/:id/images', async (req, res) => {
    try {
        const [images] = await db.query(
            'SELECT * FROM product_images WHERE product_id = ? ORDER BY image_order ASC',
            [req.params.id]
        );
        res.json(images);
    } catch (error) {
        console.error('Error fetching product images:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
// ==================== PASSWORD RESET ROUTES ====================
// Forgot password - request reset link
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Find user by email
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            // Don't reveal that user doesn't exist (security best practice)
            return res.json({ message: 'If your email exists, you will receive a reset link' });
        }

        const user = users[0];

        // Generate reset token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

        // Delete any existing tokens for this user
        await db.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);

        // Save new token
        await db.query(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, token, expiresAt]
        );

        // In a real application, you would send an email here
        // For development, we'll just log it and return success
        console.log('=================================');
        console.log('PASSWORD RESET LINK (copy this):');
        console.log(`http://localhost:3000/login.html?token=${token}`);
        console.log('=================================');

        // For production, you'd send an email:
        // await sendEmail(user.email, 'Password Reset', `Click here: http://localhost:3000/login.html?token=${token}`);

        res.json({
            message: 'If your email exists, you will receive a reset link',
            // Include token in response for development/testing
            dev_token: process.env.NODE_ENV === 'development' ? token : undefined
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reset password - use token to set new password
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Find valid token
        const [tokens] = await db.query(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const resetToken = tokens[0];

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user's password
        await db.query(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, resetToken.user_id]
        );

        // Mark token as used
        await db.query(
            'UPDATE password_resets SET used = TRUE WHERE id = ?',
            [resetToken.id]
        );

        // Delete all other tokens for this user
        await db.query(
            'DELETE FROM password_resets WHERE user_id = ? AND id != ?',
            [resetToken.user_id, resetToken.id]
        );

        res.json({ message: 'Password reset successful' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Optional: Verify token validity
app.post('/api/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.body;

        const [tokens] = await db.query(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ valid: false, error: 'Invalid or expired token' });
        }

        res.json({ valid: true });

    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Gracefully shutting down...');
    await closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Gracefully shutting down...');
    await closeDatabase();
    process.exit(0);
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║     🛍️  Easy Cart Server Started         ║
    ╠══════════════════════════════════════════╣
    ║  Port: ${PORT}                              ║
    ║  Environment: ${process.env.NODE_ENV || 'development'}        ║
    ║  Frontend: http://localhost:${PORT}        ║
    ║  API: http://localhost:${PORT}/api        ║
    ╚══════════════════════════════════════════╝
    `);
});

// Export for testing
module.exports = { app, server };
