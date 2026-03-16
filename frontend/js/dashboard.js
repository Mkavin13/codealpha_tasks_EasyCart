// Check authentication on load
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Initialize dashboard tabs
    initTabs();

    // Load initial data
    loadUserProfile();
    loadUserOrders();

    // Setup password form
    setupPasswordForm();
});

// Tab Switching Logic
function switchTab(tabId) {
    // Update nav items
    document.querySelectorAll('.nav-item-premium').forEach(item => {
        item.classList.remove('active');
    });
    const navItem = document.getElementById(`nav-${tabId}`);
    if (navItem) navItem.classList.add('active');

    // Update content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    const section = document.getElementById(tabId);
    if (section) section.classList.add('active');
}

// Ensure initTabs grabs the hash if provided
function initTabs() {
    const hash = window.location.hash.replace('#', '');
    if (hash && ['profile', 'orders', 'security'].includes(hash)) {
        switchTab(hash);
    }
}

// Fetch Profile Data
async function loadUserProfile() {
    try {
        const response = await fetch(`${API_URL}/user`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                logout();
                return;
            }
            throw new Error('Failed to load profile');
        }

        const user = await response.json();

        // Populate Welcome and Profile Details
        const firstName = user.name.split(' ')[0];
        document.getElementById('welcomeUser').innerHTML = `Welcome back, ${firstName}! <span class="wave">👋</span>`;
        document.getElementById('userInitial').textContent = firstName.charAt(0).toUpperCase();
        document.getElementById('profileNameDisplay').textContent = user.name;
        document.getElementById('profileEmailDisplay').textContent = user.email;

        // Format date
        const options = { year: 'numeric', month: 'long' };
        const memberSince = new Date(user.created_at).toLocaleDateString(undefined, options);
        document.getElementById('memberSinceDisplay').textContent = `Member since ${memberSince}`;

        const profileHtml = `
            <div class="info-group">
                <span class="info-label">Full Name</span>
                <span class="info-value" style="color: var(--primary);">${user.name}</span>
            </div>
            <div class="info-group">
                <span class="info-label">Email Address</span>
                <span class="info-value">${user.email}</span>
            </div>
            <div class="info-group">
                <span class="info-label">Account Created</span>
                <span class="info-value">${new Date(user.created_at).toLocaleDateString()}</span>
            </div>
        `;

        document.getElementById('profileData').innerHTML = profileHtml;

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('profileData').innerHTML = '<div style="color: var(--accent);">Failed to load profile details. Please try again later.</div>';
    }
}

// Fetch Orders Data
async function loadUserOrders() {
    try {
        const response = await fetch(`${API_URL}/orders`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load orders');
        }

        const orders = await response.json();
        window.userOrders = orders; // Save to global variable for PDF generation

        // Populate Stats
        const totalAmount = orders.reduce((sum, order) => sum + parseFloat(order.total_amount), 0);
        const completedCount = orders.filter(o => o.status === 'DELIVERED' || o.status === 'COMPLETED').length;
        const loyaltyPoints = Math.floor(totalAmount * 0.05);

        document.getElementById('statTotalOrders').textContent = orders.length;
        document.getElementById('statTotalSpent').textContent = `₹${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        document.getElementById('statCompletedOrders').textContent = completedCount || orders.length;
        document.getElementById('statLoyaltyPoints').textContent = loyaltyPoints;
        document.getElementById('orderCountBadge').textContent = orders.length;

        // Populate Recent Orders Table
        const recentOrdersTable = document.getElementById('recentOrdersTable');
        if (orders.length === 0) {
            recentOrdersTable.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No orders found.</td></tr>';
        } else {
            const recent = orders.slice(0, 5);
            recentOrdersTable.innerHTML = recent.map(order => `
                <tr>
                    <td class="order-id-cell">#ORD-${order.id}</td>
                    <td>${new Date(order.created_at).toLocaleDateString()}</td>
                    <td>${order.items.length} item${order.items.length > 1 ? 's' : ''}</td>
                    <td style="font-weight: 600;">₹${parseFloat(order.total_amount).toFixed(2)}</td>
                    <td><span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span></td>
                    <td><button class="btn-view-details" onclick="switchTab('orders')">View Details</button></td>
                </tr>
            `).join('');
        }

        const ordersList = document.getElementById('ordersList');

        if (orders.length === 0) {
            ordersList.innerHTML = `
                <div class="order-empty">
                    <h3 style="color: var(--text); margin-bottom: 0.5rem;">No orders yet</h3>
                    <p>When you purchase products, they will appear here.</p>
                    <a href="/" class="btn btn-outline" style="display: inline-block; margin-top: 1.5rem; text-decoration: none;">Start Shopping</a>
                </div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            const date = new Date(order.created_at).toLocaleDateString();
            const items = order.items.map(item => `
                <div class="order-item-list">
                    <img src="${item.image}" alt="${item.name}">
                    <div>
                        <div style="font-weight: 500; color: var(--text);">${item.name}</div>
                        <div style="color: var(--subtext); font-size: 0.9rem;">Qty: ${item.quantity} × ₹${parseFloat(item.price).toFixed(2)}</div>
                    </div>
                </div>
            `).join('');

            html += `
                <div class="order-card">
                    <div class="order-header">
                        <div>
                            <div style="color: var(--subtext); font-size: 0.9rem;">Order #${order.id}</div>
                            <div style="color: var(--text); font-weight: 500;">Placed on ${date}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="order-status status-${order.status.toLowerCase()}">${order.status}</div>
                            <div style="color: var(--primary); font-weight: bold; margin-top: 0.5rem;">Total: ₹${parseFloat(order.total_amount).toFixed(2)}</div>
                            <button onclick="downloadReceipt(${order.id})" class="btn btn-outline" style="margin-top: 0.5rem; padding: 0.25rem 0.75rem; font-size: 0.85rem;">Download Receipt</button>
                        </div>
                    </div>
                    <div class="order-items">
                        ${items}
                    </div>
                </div>
            `;
        });

        ordersList.innerHTML = html;

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('ordersList').innerHTML = '<div style="color: var(--accent);">Failed to load order history.</div>';
    }
}

// Setup Password Form
function setupPasswordForm() {
    const form = document.getElementById('passwordForm');
    const messageBox = document.getElementById('passwordMessage');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        // Validation
        if (newPassword !== confirmNewPassword) {
            showMessage(messageBox, 'New passwords do not match.', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showMessage(messageBox, 'New password must be at least 6 characters.', 'error');
            return;
        }

        // Submit
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        try {
            const response = await fetch(`${API_URL}/user/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(messageBox, 'Password updated successfully!', 'success');
                form.reset();
            } else {
                showMessage(messageBox, data.error || 'Failed to update password.', 'error');
            }

        } catch (error) {
            console.error('Error updating password:', error);
            showMessage(messageBox, 'An error occurred. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Password';
        }
    });
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message-box ${type}`;

    // Auto hide success messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }
}

// Generate and Download PDF Receipt
function downloadReceipt(orderId) {
    if (!window.userOrders) return;

    const order = window.userOrders.find(o => o.id === orderId);
    if (!order) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Receipt Header
    doc.setFontSize(22);
    doc.setTextColor(139, 92, 246); // Primary color
    doc.text('Easy Cart - Order Receipt', 14, 20);

    // Order Details
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    const date = new Date(order.created_at).toLocaleDateString();

    doc.text(`Order ID: #${order.id}`, 14, 30);
    doc.text(`Date: ${date}`, 14, 38);
    doc.text(`Status: ${order.status}`, 14, 46);

    // Shipping & Payment if available
    let startY = 56;
    if (order.shipping_address) {
        doc.text(`Shipping Address: ${order.shipping_address}`, 14, startY);
        startY += 8;
    }
    if (order.payment_method) {
        doc.text(`Payment Method: ${order.payment_method.toUpperCase()}`, 14, startY);
        startY += 8;
    }

    // Items Table
    const tableColumn = ["Item Name", "Quantity", "Price", "Subtotal"];
    const tableRows = [];

    order.items.forEach(item => {
        const itemData = [
            item.name,
            item.quantity.toString(),
            `Rs. ${parseFloat(item.price).toFixed(2)}`,
            `Rs. ${(item.quantity * item.price).toFixed(2)}`
        ];
        tableRows.push(itemData);
    });

    doc.autoTable({
        startY: startY + 4,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [139, 92, 246] }, // Primary color
        foot: [
            ['', '', 'Total:', `Rs. ${parseFloat(order.total_amount).toFixed(2)}`]
        ],
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    // Save PDF
    doc.save(`EasyCart_Receipt_Order_${order.id}.pdf`);
}
