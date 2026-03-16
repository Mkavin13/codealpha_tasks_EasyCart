// API_URL is declared in main.js

// Currency conversion functions
function convertToINR(price) {
    return Math.round(parseFloat(price));
}

function formatINR(price) {
    return '₹' + price.toLocaleString('en-IN');
}

// Cache for cart items to prevent unnecessary re-renders
let cartCache = {
    items: null,
    lastUpdate: 0
};

// Load cart items
async function loadCart(forceRefresh = false) {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const cartContainer = document.getElementById('cartItems');
    if (!cartContainer) return;

    // Check cache (5 second cache)
    const now = Date.now();
    if (!forceRefresh && cartCache.items && (now - cartCache.lastUpdate) < 5000) {
        displayCart(cartCache.items);
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const cartItems = await response.json();
            cartCache = {
                items: cartItems,
                lastUpdate: now
            };
            displayCart(cartItems);
        } else {
            throw new Error('Failed to load cart');
        }
    } catch (error) {
        console.error('Error loading cart:', error);
        showError('Failed to load cart');
    }
}

// Display cart items - with image preloading
function displayCart(cartItems) {
    const cartContainer = document.getElementById('cartItems');
    const totalElement = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (!cartContainer || !totalElement) return;

    if (cartItems.length === 0) {
        cartContainer.innerHTML = '<p style="text-align: center; padding: 2rem;">Your cart is empty</p>';
        totalElement.textContent = 'Total: ₹0';
        if (checkoutBtn) checkoutBtn.style.display = 'none';
        return;
    }

    let totalINR = 0;
    let html = '';

    cartItems.forEach(item => {
        const priceINR = convertToINR(item.price);
        const itemTotalINR = priceINR * item.quantity;
        totalINR += itemTotalINR;

        // Use a stable image URL with cache-busting only for the main product page, not for cart
        const imageUrl = item.image || 'https://via.placeholder.com/100?text=Product';

        html += `
            <div class="cart-item" data-product-id="${item.product_id}" data-item-id="${item.id}">
                <div class="cart-item-image-container" style="width: 100px; height: 100px; flex-shrink: 0;">
                    <img src="${imageUrl}" 
                         alt="${item.name}" 
                         class="cart-item-image" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;"
                         onerror="this.onerror=null; this.src='https://via.placeholder.com/100?text=Product';"
                         loading="lazy">
                </div>
                <div class="cart-item-details">
                    <h3 class="cart-item-title">${item.name}</h3>
                    <p class="cart-item-price">${formatINR(priceINR)} each</p>
                    <p class="cart-item-description" style="color: #6B7280; font-size: 0.9rem;">
                        ${item.description ? item.description.substring(0, 60) + '...' : ''}
                    </p>
                </div>
                <div class="cart-item-quantity">
                    <button onclick="updateQuantity(${item.product_id}, ${item.quantity - 1})" 
                            class="quantity-btn" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                    <span style="margin: 0 1rem; font-weight: bold; min-width: 30px; display: inline-block; text-align: center;">${item.quantity}</span>
                    <button onclick="updateQuantity(${item.product_id}, ${item.quantity + 1})" 
                            class="quantity-btn">+</button>
                </div>
                <div style="font-weight: bold; min-width: 100px; text-align: right;">
                    ${formatINR(itemTotalINR)}
                </div>
                <button onclick="removeFromCart(${item.product_id})" 
                        class="btn btn-outline" style="padding: 0.5rem 1rem; margin-left: 1rem;">Remove</button>
            </div>
        `;
    });

    // Update DOM in one operation
    cartContainer.innerHTML = html;
    totalElement.textContent = `Total: ${formatINR(totalINR)}`;
    if (checkoutBtn) checkoutBtn.style.display = 'inline-block';

    // Preload images after rendering
    setTimeout(() => {
        document.querySelectorAll('.cart-item-image').forEach(img => {
            if (img.complete) return;
            img.loading = 'eager';
        });
    }, 100);
}

// Update quantity - with local update first
async function updateQuantity(productId, newQuantity) {
    if (newQuantity < 1) return;

    const token = localStorage.getItem('token');

    // Find the cart item
    const cartItem = document.querySelector(`.cart-item[data-product-id="${productId}"]`);
    if (!cartItem) return;

    // Update quantity display immediately
    const quantitySpan = cartItem.querySelector('.cart-item-quantity span');
    const itemTotalElement = cartItem.querySelector('div[style*="font-weight: bold"]');
    const priceElement = cartItem.querySelector('.cart-item-price');

    if (quantitySpan) {
        quantitySpan.textContent = newQuantity;
    }

    // Get current price from the price element
    if (priceElement && itemTotalElement) {
        const priceText = priceElement.textContent;
        const priceINR = parseInt(priceText.replace(/[^0-9]/g, ''));
        const newTotal = priceINR * newQuantity;
        itemTotalElement.textContent = formatINR(newTotal);
    }

    // Update total
    updateCartTotal();

    try {
        const response = await fetch(`${API_URL}/cart/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ quantity: newQuantity })
        });

        if (!response.ok) {
            // Revert on error
            const data = await response.json();
            alert(data.error || 'Failed to update quantity');
            loadCart(true); // Force refresh
        } else {
            // Update cache
            cartCache.lastUpdate = 0; // Invalidate cache
            updateCartCount();
        }
    } catch (error) {
        console.error('Error updating cart:', error);
        alert('Failed to update quantity');
        loadCart(true); // Force refresh on error
    }
}

// Update cart total
function updateCartTotal() {
    const totalElement = document.getElementById('cartTotal');
    if (!totalElement) return;

    let total = 0;
    document.querySelectorAll('.cart-item').forEach(item => {
        const totalElement = item.querySelector('div[style*="font-weight: bold"]');
        if (totalElement) {
            const amount = parseInt(totalElement.textContent.replace(/[^0-9]/g, ''));
            total += amount;
        }
    });

    totalElement.textContent = `Total: ${formatINR(total)}`;
}

// Remove from cart
async function removeFromCart(productId) {
    if (!confirm('Remove this item from cart?')) return;

    const token = localStorage.getItem('token');
    const cartItem = document.querySelector(`.cart-item[data-product-id="${productId}"]`);

    if (cartItem) {
        // Fade out and remove
        cartItem.style.transition = 'opacity 0.3s ease';
        cartItem.style.opacity = '0';

        setTimeout(() => {
            cartItem.remove();
            updateCartTotal();

            // Check if cart is empty
            if (document.querySelectorAll('.cart-item').length === 0) {
                document.getElementById('cartItems').innerHTML = '<p style="text-align: center; padding: 2rem;">Your cart is empty</p>';
                document.getElementById('cartTotal').textContent = 'Total: ₹0';
                document.getElementById('checkoutBtn').style.display = 'none';
            }
        }, 300);
    }

    try {
        const response = await fetch(`${API_URL}/cart/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            cartCache.lastUpdate = 0; // Invalidate cache
            updateCartCount();
        } else {
            // Revert on error
            if (cartItem) {
                cartItem.style.opacity = '1';
            }
            const data = await response.json();
            alert(data.error || 'Failed to remove item');
            loadCart(true);
        }
    } catch (error) {
        console.error('Error removing from cart:', error);
        alert('Failed to remove item');
        if (cartItem) {
            cartItem.style.opacity = '1';
        }
        loadCart(true);
    }
}

// Clear entire cart
async function clearCart() {
    if (!confirm('Clear your entire cart?')) return;

    const token = localStorage.getItem('token');
    const cartContainer = document.getElementById('cartItems');

    if (cartContainer) {
        cartContainer.style.opacity = '0.5';
    }

    try {
        const response = await fetch(`${API_URL}/cart`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            cartCache.lastUpdate = 0; // Invalidate cache
            await loadCart(true);
            updateCartCount();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to clear cart');
            if (cartContainer) {
                cartContainer.style.opacity = '1';
            }
        }
    } catch (error) {
        console.error('Error clearing cart:', error);
        alert('Failed to clear cart');
        if (cartContainer) {
            cartContainer.style.opacity = '1';
        }
    }
}

// Proceed to checkout
function checkout() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    window.location.href = '/checkout.html';
}

// Show error message
function showError(message) {
    const cartContainer = document.getElementById('cartItems');
    if (cartContainer) {
        cartContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <p style="color: #dc3545;">${message}</p>
                <button onclick="loadCart(true)" class="btn btn-primary" style="margin-top: 1rem;">Try Again</button>
            </div>
        `;
    }
}

// Load cart when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadCart();
});

// Make functions global
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.checkout = checkout;