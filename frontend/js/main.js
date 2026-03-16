const API_URL = 'http://localhost:3000/api';

// Function to convert price
function convertToINR(price) {
    return Math.round(parseFloat(price)); // Just round to integer
}

// Format INR price
function formatINR(price) {
    return '₹' + price.toLocaleString('en-IN');
}

// Update cart count
async function updateCartCount() {
    const token = localStorage.getItem('token');
    const cartCount = document.getElementById('cartCount');
    if (!cartCount) return;

    if (!token) {
        cartCount.textContent = '0';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cart`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const items = await response.json();
            const total = items.reduce((sum, item) => sum + item.quantity, 0);
            cartCount.textContent = total;
        }
    } catch (error) {
        console.error('Cart error:', error);
    }
}

// Update auth links
function updateAuthLinks() {
    const token = localStorage.getItem('token');
    const authLinks = document.getElementById('authLinks');
    if (!authLinks) return;

    if (token) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        authLinks.innerHTML = `
            <a href="/" style="color: var(--text); font-weight: 500; text-decoration: none; margin-right: 1rem; display: flex; align-items: center; gap: 0.25rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                Home
            </a>
            <a href="/dashboard.html" style="color: var(--text); font-weight: 500; text-decoration: none;">Dashboard</a>
            <button onclick="logout()" class="btn btn-outline" style="margin-left: 1rem; border-color: rgba(244, 63, 94, 0.5); color: #fb7185;">Logout</button>
        `;
    } else {
        authLinks.innerHTML = `
            <a href="/" style="color: var(--text); font-weight: 500; text-decoration: none; margin-right: 1rem; display: flex; align-items: center; gap: 0.25rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                Home
            </a>
            <a href="/login.html" class="btn btn-outline">Login</a>
            <a href="/register.html" class="btn btn-primary">Register</a>
        `;
    }
}

// Logout function
window.logout = function () {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateAuthLinks();
    updateCartCount();
    window.location.href = '/';
};

// Load categories
async function loadCategories() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        const categories = await response.json();

        const container = document.getElementById('categoryFilters');
        if (!container) return;

        // Clear all existing buttons (including "All Products")
        container.innerHTML = '';

        // Add "All Products" button
        const allButton = document.createElement('button');
        allButton.className = 'category-pill';
        allButton.textContent = 'All Products';
        allButton.setAttribute('data-category', 'all');

        // Check if current category is 'all' or no category
        const urlParams = new URLSearchParams(window.location.search);
        const currentCategory = urlParams.get('category');
        if (!currentCategory || currentCategory === 'all') {
            allButton.classList.add('active');
        }

        allButton.onclick = function () {
            window.location.href = '/';
        };
        container.appendChild(allButton);

        // Add category buttons
        categories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'category-pill';
            button.textContent = `${category.category} (${category.product_count})`;
            button.setAttribute('data-category', category.category);

            // Check if this category is active
            if (currentCategory === category.category) {
                button.classList.add('active');
            }

            button.onclick = function () {
                window.location.href = `/?category=${category.category}`;
            };
            container.appendChild(button);
        });

    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Pagination State
let currentOffset = 0;
const PAGE_SIZE = 12;
let totalProductsCount = 0;

// Load products
async function loadProducts(append = false) {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    // Show loading if not appending
    if (!append) {
        productsGrid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading products...</p></div>';
        currentOffset = 0;
    }

    try {
        // Get parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        const category = urlParams.get('category');
        const search = urlParams.get('search');

        let url = `${API_URL}/products?limit=${PAGE_SIZE}&offset=${currentOffset}`;

        if (category && category !== 'all' && category !== 'null') {
            url += `&category=${encodeURIComponent(category)}`;
        }

        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
            // Update search input value
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = search;
            }
        }

        console.log('Fetching from:', url);
        const response = await fetch(url);
        const data = await response.json();

        console.log('Products received:', data.products.length, 'Total:', data.pagination.total);
        totalProductsCount = data.pagination.total;

        // Clear initial loading if not appending
        if (!append) {
            productsGrid.innerHTML = '';
        } else {
            // Remove previous loading messages if any were appended
            const loaders = productsGrid.querySelectorAll('.loading-spinner');
            loaders.forEach(l => l.remove());
        }

        // Show search info if searching (only on first page)
        if (search && !append) {
            const searchInfo = document.createElement('div');
            searchInfo.style.cssText = `
                grid-column: 1/-1;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem;
                background: #f9f9f9;
                border-radius: 8px;
                margin-bottom: 1rem;
            `;
            searchInfo.innerHTML = `
                <span>Found ${data.pagination.total} products for "${search}"</span>
                <span onclick="clearSearch()" style="color: #000; cursor: pointer; text-decoration: underline;">Clear search</span>
            `;
            productsGrid.appendChild(searchInfo);
        }

        // Show category info if filtering (only on first page)
        if (category && category !== 'all' && category !== 'null' && !search && !append) {
            const categoryInfo = document.createElement('div');
            categoryInfo.style.cssText = `
                grid-column: 1/-1;
                padding: 1rem;
                background: #f9f9f9;
                border-radius: 8px;
                margin-bottom: 1rem;
            `;
            categoryInfo.innerHTML = `
                <span>Showing products in <strong>${category}</strong> (${data.pagination.total} items)</span>
            `;
            productsGrid.appendChild(categoryInfo);
        }

        if ((!data.products || data.products.length === 0) && !append) {
            productsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">No products found</div>';
            updatePaginationUI(false);
            return;
        }

        // Add each product to the grid
        data.products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';

            const inrPrice = convertToINR(product.price);
            const formattedPrice = formatINR(inrPrice);
            const imageUrl = product.image || 'https://via.placeholder.com/300x200?text=No+Image';
            const likedKey = `liked_${product.id}`;
            const isLiked = localStorage.getItem(likedKey) ? 'liked' : '';

            card.innerHTML = `
                <div class="product-image-container">
                    <button class="card-action-btn btn-like ${isLiked}" onclick="event.preventDefault(); toggleLike(this, ${product.id})" aria-label="Like product">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>
                    <img src="${imageUrl}" alt="${product.name}" class="product-image" 
                         onerror="this.src='https://via.placeholder.com/300x200?text=Product'">
                    <button class="card-action-btn btn-add-cart" onclick="event.preventDefault(); window.addToCartFromGrid(${product.id})" aria-label="Add to cart">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            <line x1="12" y1="10" x2="16" y2="10"></line>
                            <line x1="14" y1="8" x2="14" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div class="product-info">
                    <div style="color: #6B7280; font-size: 0.85rem; margin-bottom: 0.5rem;">
                        ${product.category || 'Uncategorized'}
                    </div>
                    <h3 class="product-title">${product.name}</h3>
                    <p class="product-price">₹${parseFloat(product.price).toFixed(2)}</p>
                    <p class="product-description">
                        ${product.description ? product.description.substring(0, 80) + '...' : 'No description available'}
                    </p>
                    <a href="/product.html?id=${product.id}" class="btn btn-primary" style="width: 100%; text-align: center; display: inline-block; box-sizing: border-box; text-decoration: none;">
                        View Details
                    </a>
                </div>
            `;
            productsGrid.appendChild(card);
        });

        // Update pagination UI
        const hasMore = (currentOffset + data.products.length) < data.pagination.total;
        updatePaginationUI(hasMore, currentOffset + data.products.length, data.pagination.total);

    } catch (error) {
        console.error('Error loading products:', error);
        if (!append) {
            productsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                    <h3 style="color: #dc3545;">Error loading products</h3>
                    <p style="color: #666;">${error.message}</p>
                    <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">Retry</button>
                </div>
            `;
        }
    }
}

// Update Pagination UI
function updatePaginationUI(hasMore, currentCount, total) {
    const container = document.getElementById('paginationContainer');
    const info = document.getElementById('paginationInfo');
    if (!container || !info) return;

    if (total > 0) {
        container.style.display = 'block';
        info.textContent = `Showing ${currentCount} of ${total} products`;

        const btn = document.getElementById('loadMoreBtn');
        if (hasMore) {
            btn.style.display = 'inline-block';
            btn.innerHTML = 'Load More Products';
            btn.disabled = false;
        } else {
            btn.style.display = 'none';
        }
    } else {
        container.style.display = 'none';
    }
}

// Load more handler
async function loadMoreProducts() {
    const btn = document.getElementById('loadMoreBtn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 20px; height: 20px; margin: 0; vertical-align: middle;"></span> Loading...';

    currentOffset += PAGE_SIZE;
    await loadProducts(true);
}

// Search function
window.searchProducts = function () {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const term = searchInput.value.trim();
    if (term) {
        window.location.href = `/?search=${encodeURIComponent(term)}`;
    }
};

// Clear search
window.clearSearch = function () {
    window.location.href = '/';
};

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function () {
    console.log('Page loaded - initializing...');
    updateAuthLinks();
    updateCartCount();
    loadCategories();
    loadProducts();

    // Setup Load More button
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreProducts);
    }

    // Setup search on Enter key
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                window.searchProducts();
            }
        });
    }

    // Setup search button
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', window.searchProducts);
    }
});

// Make functions available globally
window.filterByCategory = function (category) {
    window.location.href = `/?category=${category}`;
};

// Global toggle like function
window.toggleLike = function (btn, productId) {
    btn.classList.toggle('liked');

    // Optional: Could store likes in localStorage to persist per browser session
    const likedKey = `liked_${productId}`;
    if (btn.classList.contains('liked')) {
        localStorage.setItem(likedKey, '1');
    } else {
        localStorage.removeItem(likedKey);
    }
};

// Global add to cart from grid function
window.addToCartFromGrid = async function (productId) {
    const token = localStorage.getItem('token');
    if (!token) {
        if (confirm('Please login to add items to cart')) {
            window.location.href = '/login.html';
        }
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                productId: productId,
                quantity: 1
            })
        });

        if (response.ok) {
            const data = await response.json();

            // Update cart count
            const cartCount = document.getElementById('cartCount');
            if (cartCount) {
                cartCount.textContent = data.cartCount;
            }

            // Create a small toast notification for better UX
            const toast = document.createElement('div');
            toast.textContent = 'Added to Cart ✓';
            toast.style.cssText = `
                position: fixed;
                bottom: 2rem;
                right: 2rem;
                background: #10b981;
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-weight: 500;
                z-index: 1000;
                animation: slideUp 0.3s ease forwards;
            `;

            // Add keyframes if they don't exist
            if (!document.getElementById('toast-styles')) {
                const style = document.createElement('style');
                style.id = 'toast-styles';
                style.textContent = `
                    @keyframes slideUp {
                        from { transform: translateY(100%); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    @keyframes fadeOut {
                        from { opacity: 1; }
                        to { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }, 3000);

        } else {
            const error = await response.json();
            if (response.status === 401 || response.status === 403) {
                alert(error.error || 'Session expired. Please log in again.');
                window.logout();
                return;
            }
            alert(error.error || 'Failed to add to cart');
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        alert('An error occurred. Please try again.');
    }
};
