// ============ ESTADO DE LA APLICACIÓN ============
        let products = JSON.parse(localStorage.getItem('products')) || [
            { id: 1, name: "Café", price: 2.50, stock: 20, color: "#ffe0b2", category: "Bebidas", barcode: "7501000000011" },
            { id: 2, name: "Agua 500ml", price: 1.00, stock: 50, color: "#bbdefb", category: "Bebidas", barcode: "7501000000028" },
            { id: 3, name: "Refresco", price: 1.75, stock: 15, color: "#f8bbd0", category: "Bebidas", barcode: "7501000000035" },
            { id: 4, name: "Galletas", price: 1.20, stock: 2, color: "#d7ccc8", category: "Comida", barcode: "7501000000042" }
        ];
        let cart = [];
        let salesLog = JSON.parse(localStorage.getItem('salesLog')) || [];
        let shiftHistory = JSON.parse(localStorage.getItem('shiftHistory')) || [];
        let expenses = JSON.parse(localStorage.getItem('expenses')) || [];
        let currentShift = JSON.parse(localStorage.getItem('currentShift')) || null; // {openingCash, openDate}
        let pendingSync = JSON.parse(localStorage.getItem('pendingSync')) || [];
        let categories = JSON.parse(localStorage.getItem('categories')) || ['Bebidas', 'Comida', 'Limpieza', 'Otros'];
        let activeCategory = 'Todos';
        let lowStockThreshold = parseInt(localStorage.getItem('lowStockThreshold')) || 3;
        let receiptSettings = JSON.parse(localStorage.getItem('receiptSettings')) || {
            slogan: "¡Gracias por su compra!",
            footer: "¡Vuelva pronto!",
            logo: ""
        };
        let authConfig = JSON.parse(localStorage.getItem('authConfig')) || {
            adminPassword: "admin123",
            cajeroPassword: "cajero123"
        };
        let currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || null; // {role}
        let selectedLoginRole = null;
        let html5QrScanner = null;
        let currencySettings = JSON.parse(localStorage.getItem('currencySettings')) || { code: 'USD' };
        let systemThemeListenerAdded = false;
        let turnNumberMode = localStorage.getItem('turnNumberMode') || 'manual';
        let paymentsLog = JSON.parse(localStorage.getItem('paymentsLog')) || [];
        const APP_VERSION = '1.5.0'; // Debe coincidir con "version" en package.json

        // Paleta propia de 12 tonos suaves (ni chillones ni apagados) para las tarjetas de producto
        const PRODUCT_COLOR_PALETTE = [
            '#E8B4B8', '#E8C9A0', '#E8DFA0', '#C9DFA0',
            '#A0D8B0', '#A0D8D0', '#A0C8E8', '#A8B0E8',
            '#C4A0E8', '#E0A0D8', '#D4B8A0', '#BFC4CC'
        ];

        // Contador independiente para "Productos Más Vendidos" (no afecta ventas/caja reales)
        let statsTally = JSON.parse(localStorage.getItem('statsTally'));
        if (!statsTally) {
            statsTally = {};
            [...salesLog, ...shiftHistory.flatMap(s => s.details || [])].forEach(sale => {
                sale.items.forEach(i => {
                    if (!statsTally[i.name]) statsTally[i.name] = { qty: 0, revenue: 0 };
                    statsTally[i.name].qty += i.qty;
                    statsTally[i.name].revenue += i.price * i.qty;
                });
            });
            localStorage.setItem('statsTally', JSON.stringify(statsTally));
        }

        // ============ MONEDA ============
        // ============ TOAST DE CONFIRMACIÓN ============
        function showToast(message, type = 'success', duration = 2500) {
            const container = document.getElementById('toastContainer');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
            toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 250);
            }, duration);
        }

        // Aviso de función bloqueada en modo demo (usa isDemoLocked() de license.js)
        function showDemoLockedMessage(featureName) {
            const text = `${featureName}: disponible solo en la versión completa`;
            if (typeof showToast === 'function') {
                showToast(text, 'info', 3000);
            } else {
                alert(text);
            }
        }

        function formatMoney(amount) {
            const n = Number(amount || 0).toFixed(2);
            if (currencySettings.code === 'EUR') return `${n}€`;
            if (currencySettings.code === 'CUP') return `${n} CUP`;
            return `$${n}`;
        }
        function saveCurrency(code) {
            currencySettings.code = code;
            localStorage.setItem('currencySettings', JSON.stringify(currencySettings));
            renderAll();
            updateReceiptPreview();
        }

        // ============ LOGIN / ROLES ============
        function selectRole(role) {
            selectedLoginRole = role;
            document.getElementById('roleBtnAdmin').classList.toggle('selected', role === 'admin');
            document.getElementById('roleBtnCajero').classList.toggle('selected', role === 'cajero');
        }

        function doLogin() {
            if (!selectedLoginRole) return alert("Selecciona un rol primero");
            const pass = document.getElementById('loginPassword').value;
            const expected = selectedLoginRole === 'admin' ? authConfig.adminPassword : authConfig.cajeroPassword;
            if (pass !== expected) return alert("Contraseña incorrecta");
            currentUser = { role: selectedLoginRole };
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            document.getElementById('loginOverlay').classList.remove('active');
            document.getElementById('loginPassword').value = '';
            applyRoleRestrictions();
            renderAll();
        }

        function logout() {
            showConfirm("¿Deseas cerrar sesión?", () => {
                currentUser = null;
                sessionStorage.removeItem('currentUser');
                document.getElementById('loginOverlay').classList.add('active');
            });
        }

        function applyRoleRestrictions() {
            const isAdmin = currentUser && currentUser.role === 'admin';
            document.getElementById('userChip').innerText = isAdmin ? '👤 Administrador' : '👤 Cajero';
            document.querySelectorAll('#mainNav button').forEach(btn => {
                const view = btn.dataset.view;
                if (!isAdmin && (view === 'inventory-view' || view === 'settings-view' || view === 'reports-view')) {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = '';
                }
            });
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = isAdmin ? '' : 'none';
            });
        }

        // ============ NAVEGACIÓN ============
        // ============ PÁGINAS DE AJUSTES ============
        // Cada sección de Ajustes es ahora una página propia: se abre a pantalla
        // completa al tocar su fila en la lista, con un botón "‹ Ajustes" para volver.
        function openSettingsPage(key) {
            const list = document.getElementById('settingsMainList');
            if (list) list.style.display = 'none';
            document.querySelectorAll('.settings-subpage').forEach(p => p.style.display = 'none');
            const page = document.getElementById('settingsPage-' + key);
            if (page) page.style.display = 'flex';
        }
        function closeSettingsPage() {
            document.querySelectorAll('.settings-subpage').forEach(p => p.style.display = 'none');
            const list = document.getElementById('settingsMainList');
            if (list) list.style.display = 'block';
        }
        function isSettingsSubpageOpen() {
            return !!document.querySelector('.settings-subpage[style*="flex"]');
        }

        function switchTab(viewId, btn) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            btn.classList.add('active');
            if (viewId === 'settings-view') closeSettingsPage();
            if (btn.scrollIntoView) {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
            renderAll();
        }

        // ============ DESLIZAR (SWIPE) PARA CAMBIAR ENTRE VENTA / INVENTARIO / CAJA / REPORTES / AJUSTES ============
        function isAnyModalOpen() {
            return !!document.querySelector('.checkout-modal.active, .generic-modal.active, .login-overlay.active, .scanner-modal.active');
        }
        function setupSwipeNavigation() {
            let touchStartX = 0, touchStartY = 0, swipeStartValid = false;
            document.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) { swipeStartValid = false; return; }
                // No interferir con el desplazamiento horizontal propio de las categorías
                if (e.target.closest('.category-tabs') || e.target.closest('nav') || isAnyModalOpen()) {
                    swipeStartValid = false;
                    return;
                }
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                swipeStartValid = true;
            }, { passive: true });

            document.addEventListener('touchend', (e) => {
                if (!swipeStartValid) return;
                swipeStartValid = false;
                const touch = e.changedTouches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                const minSwipeDistance = 70;
                // Solo se considera swipe horizontal si el movimiento horizontal
                // es claramente mayor que el vertical (para no chocar con el scroll normal).
                if (Math.abs(dx) < minSwipeDistance || Math.abs(dx) < Math.abs(dy) * 1.5) return;

                const tabs = Array.from(document.querySelectorAll('.nav-tab-btn'));
                const currentIndex = tabs.findIndex(t => t.classList.contains('active'));
                if (currentIndex === -1) return;
                let nextIndex = currentIndex + (dx < 0 ? 1 : -1);
                if (nextIndex < 0 || nextIndex >= tabs.length) return;
                const nextBtn = tabs[nextIndex];
                switchTab(nextBtn.dataset.view, nextBtn);
            }, { passive: true });
        }

        // ============ SONIDO DE CONFIRMACIÓN ============
        function playBeep(freq = 880, duration = 90) {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.value = 0.08;
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                setTimeout(() => { osc.stop(); ctx.close(); }, duration);
            } catch (e) { /* audio no disponible */ }
        }

        // ============ MODAL DE CONFIRMACIÓN GENÉRICO ============
        function showConfirm(message, onConfirm) {
            document.getElementById('confirmMessage').innerText = message;
            const modal = document.getElementById('confirmModal');
            modal.classList.add('active');
            const btn = document.getElementById('confirmActionBtn');
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => { onConfirm(); closeConfirm(); });
        }
        function closeConfirm() { document.getElementById('confirmModal').classList.remove('active'); }

        // ============ CATEGORÍAS Y BÚSQUEDA ============
        function renderCategoryTabs() {
            const box = document.getElementById('categoryTabs');
            const allCats = ['Todos', ...categories];
            box.innerHTML = allCats.map(c =>
                `<button class="category-chip ${activeCategory === c ? 'active' : ''}" onclick="setCategory('${c.replace(/'/g, "\\'")}')">${c}</button>`
            ).join('');
        }
        function setCategory(c) { activeCategory = c; renderPOS(); }

        // ============ CÓDIGO DE BARRAS ============
        function handleBarcodeInput(code) {
            if (!code) return;
            const prod = products.find(p => p.barcode === code.trim());
            if (!prod) { playBeep(220, 200); return alert("Código no encontrado: " + code); }
            addToCart(prod.id);
        }
        let scannerCallback = null; // función a la que se le entrega el código leído (POS o Inventario)
        function openCameraScanner(onScanned) {
            scannerCallback = onScanned || ((code) => handleBarcodeInput(code));
            document.getElementById('scannerModal').classList.add('active');
            if (typeof Html5Qrcode === 'undefined') {
                document.getElementById('barcodeScannerBox').innerHTML = '<p style="text-align:center; color:var(--text-muted);">La librería de cámara no está disponible sin conexión a internet.</p>';
                return;
            }
            html5QrScanner = new Html5Qrcode("barcodeScannerBox");
            html5QrScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 220 },
                (decodedText) => {
                    const cb = scannerCallback;
                    closeCameraScanner();
                    if (cb) cb(decodedText);
                },
                () => {}
            ).then(() => {
                // Enciende la linterna automáticamente para facilitar el escaneo en poca luz
                html5QrScanner.applyVideoConstraints({ advanced: [{ torch: true }] }).catch(() => {});
            }).catch((err) => {
                const msg = (err && err.name === 'NotAllowedError')
                    ? 'Permiso de cámara denegado. Ve a Ajustes del sistema &gt; Apps &gt; POS Professional &gt; Permisos, y activa la Cámara.'
                    : (err && err.name === 'NotFoundError')
                        ? 'No se encontró ninguna cámara en este dispositivo.'
                        : 'No se pudo acceder a la cámara.';
                document.getElementById('barcodeScannerBox').innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:0 10px;">${msg}</p>`;
            });
        }
        function closeCameraScanner() {
            document.getElementById('scannerModal').classList.remove('active');
            if (html5QrScanner) {
                html5QrScanner.applyVideoConstraints({ advanced: [{ torch: false }] }).catch(() => {});
                html5QrScanner.stop().catch(() => {});
                html5QrScanner = null;
            }
            scannerCallback = null;
        }

        // ============ DIBUJAR CATÁLOGO PRINCIPAL ============
        function renderPOS() {
            renderCategoryTabs();
            const grid = document.getElementById('productGrid');
            const search = (document.getElementById('productSearch').value || '').toLowerCase();
            let list = products.filter(p => {
                const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
                const matchSearch = p.name.toLowerCase().includes(search);
                return matchCat && matchSearch;
            });

            grid.innerHTML = list.map(p => {
                const itemInCart = cart.find(c => c.id === p.id);
                const currentCartQty = itemInCart ? itemInCart.qty : 0;
                const availableStock = p.stock - currentCartQty;
                let cardClass = '';
                let tagClass = '';
                if (availableStock <= 0) { cardClass = 'stock-out'; tagClass = 'tag-out'; }
                else if (availableStock < lowStockThreshold) { cardClass = 'stock-low'; tagClass = 'tag-low'; }

                return `
                    <div class="product-card ${cardClass}" style="background-color: ${p.color};" onclick="addToCart(${p.id})">
                        <div>
                            <div class="product-category-label">${p.category || ''}</div>
                            <div class="product-title">${p.name}</div>
                        </div>
                        <div class="product-bottom-row">
                            <div class="product-price">${formatMoney(p.price)}</div>
                            <div class="product-stock-tag ${tagClass}">Disp: ${availableStock}</div>
                        </div>
                    </div>
                `;
            }).join('');

            updateCartButton();
        }

        // ============ SELECCIÓN Y DESCUENTO DE PRODUCTO ============
        function addToCart(id) {
            const prod = products.find(p => p.id === id);
            const itemInCart = cart.find(c => c.id === id);
            const currentQty = itemInCart ? itemInCart.qty : 0;

            if (!prod || prod.stock - currentQty <= 0) {
                playBeep(220, 200);
                return alert("Producto agotado en el inventario");
            }

            if (itemInCart) {
                itemInCart.qty++;
            } else {
                cart.push({ ...prod, qty: 1, discountType: 'none', discountValue: 0 });
            }
            playBeep();
            renderPOS();
        }

        // ============ CARRITO FLOTANTE ============
        function updateCartButton() {
            const btn = document.getElementById('floatingCartBtn');
            const badge = document.getElementById('cartBadge');
            const totalUnits = cart.reduce((acc, i) => acc + i.qty, 0);

            if (totalUnits > 0) {
                btn.style.display = 'flex';
                badge.innerText = totalUnits;
            } else {
                btn.style.display = 'none';
            }
        }

        // ============ PANTALLA DE PAGO ============
        function openCheckout() {
            if (!currentShift) { return alert("Debes abrir el turno (fondo de caja) antes de vender. Ve a la pestaña Caja."); }
            document.getElementById('globalDiscountType').value = 'none';
            document.getElementById('globalDiscountValue').value = '';
            renderCheckoutCart();
            document.getElementById('checkoutModal').classList.add('active');
        }
        function requestCloseCheckout() {
            if (cart.length === 0) { closeCheckout(); return; }
            showConfirm("¿Deseas salir? El carrito se conservará.", closeCheckout);
        }
        function closeCheckout() { document.getElementById('checkoutModal').classList.remove('active'); }

        function changeCartQty(id, delta) {
            const item = cart.find(c => c.id === id);
            const prod = products.find(p => p.id === id);

            if (item) {
                if (delta > 0 && item.qty >= prod.stock) {
                    return alert("Límite de inventario alcanzado");
                }
                item.qty += delta;
                if (item.qty <= 0) {
                    cart = cart.filter(c => c.id !== id);
                }
            }
            renderCheckoutCart();
            renderPOS();
        }

        function removeCartItem(id) {
            showConfirm("¿Quitar este producto del carrito?", () => {
                cart = cart.filter(c => c.id !== id);
                renderCheckoutCart();
                renderPOS();
            });
        }

        function setItemDiscountType(id, type) {
            const item = cart.find(c => c.id === id);
            if (item) { item.discountType = type; renderCheckoutCart(); }
        }
        function setItemDiscountValue(id, value) {
            const item = cart.find(c => c.id === id);if (item) { item.discountValue = parseFloat(value) || 0; renderCheckoutCart(); }
        }

        function computeItemTotal(item) {
            let base = item.price * item.qty;
            let disc = 0;
            if (item.discountType === 'percent') disc = base * (item.discountValue / 100);
            else if (item.discountType === 'fixed') disc = item.discountValue;
            disc = Math.min(disc, base);
            return { base, disc, net: base - disc };
        }

        function computeCartTotals() {
            let subtotal = 0, itemDiscounts = 0;
            cart.forEach(i => {
                const r = computeItemTotal(i);
                subtotal += r.base;
                itemDiscounts += r.disc;
            });
            let afterItemDiscounts = subtotal - itemDiscounts;
            const gType = document.getElementById('globalDiscountType').value;
            const gValue = parseFloat(document.getElementById('globalDiscountValue').value) || 0;
            let globalDiscount = 0;
            if (gType === 'percent') globalDiscount = afterItemDiscounts * (gValue / 100);
            else if (gType === 'fixed') globalDiscount = gValue;
            globalDiscount = Math.min(globalDiscount, afterItemDiscounts);
            const total = Math.max(0, afterItemDiscounts - globalDiscount);
            const totalDiscount = itemDiscounts + globalDiscount;
            return { subtotal, totalDiscount, total };
        }

        function renderCheckoutCart() {
            const list = document.getElementById('cartItemsList');

            if (cart.length === 0) {
                list.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No hay productos en el carrito</p>';
            } else {
                list.innerHTML = cart.map(i => {
                    const r = computeItemTotal(i);
                    return `
                        <div class="cart-item-row">
                            <div class="cart-item-top">
                                <div>
                                    <b style="font-size: 1rem;">${i.name}</b>
                                    <div style="font-size: 0.85rem; color: var(--text-muted);">Precio: ${formatMoney(i.price)} · Total: ${formatMoney(r.net)}</div>
                                </div>
                                <div class="qty-controls">
                                    <button class="btn-qty" onclick="changeCartQty(${i.id}, -1)">-</button>
                                    <b style="font-size: 1rem;">${i.qty}</b>
                                    <button class="btn-qty" onclick="changeCartQty(${i.id}, 1)">+</button>
                                    <button class="btn btn-danger btn-sm" onclick="removeCartItem(${i.id})">✕</button>
                                </div>
                            </div>
                            <div class="item-discount-row">
                                <span>Descuento:</span>
                                <select onchange="setItemDiscountType(${i.id}, this.value)">
                                    <option value="none" ${i.discountType === 'none' ? 'selected' : ''}>Ninguno</option>
                                    <option value="percent" ${i.discountType === 'percent' ? 'selected' : ''}>%</option>
                                    <option value="fixed" ${i.discountType === 'fixed' ? 'selected' : ''}>$</option>
                                </select>
                                <input type="number" min="0" value="${i.discountValue || ''}" placeholder="0" onchange="setItemDiscountValue(${i.id}, this.value)">
                            </div>
                        </div>
                    `;
                }).join('');
            }

            const totals = computeCartTotals();
            document.getElementById('cartSubtotal').innerText = formatMoney(totals.subtotal);
            document.getElementById('cartDiscountAmount').innerText = `-${formatMoney(totals.totalDiscount)}`;
            document.getElementById('cartTotalLarge').innerText = formatMoney(totals.total);
        }

        // ============ PROCESAR VENTA ============
        async function processSale() {
            if (cart.length === 0) return alert("Agregue productos antes de cobrar");
            const totals = computeCartTotals();
            if (totals.total <= 0) return alert("El total de la venta debe ser mayor a $0.00");

            const method = document.getElementById('paymentMethod').value;
            const client = 'Cliente General';

            cart.forEach(item => {
                const prod = products.find(p => p.id === item.id);
                if (prod) prod.stock -= item.qty; // Descuento definitivo del stock
            });

            const now = new Date();
            const saleRecord = {
                id: Date.now(),
                client, method,
                subtotal: totals.subtotal,
                discount: totals.totalDiscount,
                total: totals.total,
                cashReceived: null, change: null,
                items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
                date: now.toLocaleString(),
                synced: false
            };
            salesLog.push(saleRecord);
            registerStatsTally(saleRecord);
            registerPaymentLogEntry(saleRecord, now);

            if (!navigator.onLine) {
                pendingSync.push(saleRecord);
                localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
            }

            saveData();
            await printReceipt(saleRecord);

            cart = [];
            closeCheckout();
            renderAll();
            updateOfflineBanner();
        }

        async function printReceipt(saleRecord) {
            // Intenta imprimir por Bluetooth (ESC/POS, texto plano) primero.
            // Si hay una impresora térmica configurada y conectada, se usa esa
            // y se omite la impresión estándar del navegador.
            if (typeof printTicketOverBluetooth === 'function') {
                try {
                    const printedByBluetooth = await printTicketOverBluetooth(saleRecord, receiptSettings, formatMoney);
                    if (printedByBluetooth) {
                        showToast('Ticket enviado a la impresora', 'success');
                        return;
                    }
                } catch (e) {
                    // Si falla, continúa con la impresión de respaldo de abajo
                }
            }

            document.getElementById('rec-slogan').innerText = receiptSettings.slogan;
            document.getElementById('rec-footer').innerText = receiptSettings.footer;
            document.getElementById('rec-date').innerText = saleRecord.date;
            document.getElementById('rec-client').innerText = saleRecord.client;
            document.getElementById('rec-method').innerText = saleRecord.method;
            document.getElementById('rec-subtotal').innerText = formatMoney(saleRecord.subtotal);
            document.getElementById('rec-discount').innerText = `-${formatMoney(saleRecord.discount)}`;
            document.getElementById('rec-total').innerText = formatMoney(saleRecord.total);
            document.getElementById('rec-change-line').innerText = '';

            const logoImg = document.getElementById('rec-logo');
            if (receiptSettings.logo) { logoImg.src = receiptSettings.logo; logoImg.style.display = 'block'; }
            else { logoImg.style.display = 'none'; }

            document.getElementById('rec-items').innerHTML = saleRecord.items.map(i =>
                `<div style="display:flex; justify-content:space-between;"><span>${i.name} x${i.qty}</span><span>${formatMoney(i.price * i.qty)}</span></div>`
            ).join('');

            showToast('Abriendo impresión estándar de respaldo', 'info');
            window.print();
        }

        // ============ VISTA PREVIA DEL COMPROBANTE ============
        function updateReceiptPreview() {
            const box = document.getElementById('receiptPreviewBox');
            if (!box) return;
            const slogan = document.getElementById('cfg-slogan').value;
            const footer = document.getElementById('cfg-footer').value;
            const logo = document.getElementById('cfg-logo').value;
            box.innerHTML = `
                <div style="text-align:center; margin-bottom:8px;">
                    ${logo ? `<img src="${logo}" style="max-width:50px; max-height:50px; display:block; margin:0 auto 4px auto;">` : ''}
                    <b>POS Store</b>
                    <div>${slogan}</div>
                </div>
                <div style="border-bottom:1px dashed #999; margin:6px 0;"></div>
                <div>Fecha: ${new Date().toLocaleString()}</div>
                <div>Cliente: Cliente General</div>
                <div>Pago: Efectivo</div>
                <div style="border-bottom:1px dashed #999; margin:6px 0;"></div>
                <div style="display:flex; justify-content:space-between;"><span>Producto x1</span><span>${formatMoney(2.5)}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Producto x2</span><span>${formatMoney(5)}</span></div>
                <div style="border-bottom:1px dashed #999; margin:6px 0;"></div>
                <div style="text-align:right;">Subtotal: ${formatMoney(7.5)}</div>
                <div style="text-align:right;">Descuento: -${formatMoney(0)}</div>
                <div style="text-align:right;"><b>TOTAL: ${formatMoney(7.5)}</b></div>
                <div style="border-bottom:1px dashed #999; margin:6px 0;"></div>
                <div style="text-align:center;">${footer}</div>
            `;
        }

        // ============ INVENTARIO (SOLO ADMIN) ============
        function renderInventoryView() {
            const box = document.getElementById('inventoryAdminArea');
            if (!currentUser || currentUser.role !== 'admin') {
                box.innerHTML = '<div class="locked-msg">🔒 Solo el Administrador puede ver el inventario.</div>';
                return;
            }
            box.innerHTML = `
                <div class="card-panel">
                    <h3>Agregar / Modificar Producto</h3>
                    <form id="prod-form" onsubmit="saveProduct(event)">
                        <input type="hidden" id="prod-id">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">
                            <div class="form-group"><label>Nombre</label><input type="text" id="prod-name" required></div>
                            <div class="form-group"><label>Precio</label><input type="number" step="0.01" id="prod-price" required></div>
                            <div class="form-group"><label>Stock Total</label><input type="number" id="prod-stock" required></div>
                            <div class="form-group"><label>Categoría</label>
                                <select id="prod-category">${categories.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
                            </div>
                            <div class="form-group">
                                <label>Código de Barras</label>
                                <div style="display:flex; gap:8px;">
                                    <input type="text" id="prod-barcode" placeholder="Opcional" style="flex:1;">
                                    <button type="button" class="btn-icon-scan" title="Escanear con cámara" onclick="openCameraScanner((code) => { document.getElementById('prod-barcode').value = code; })"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Color del Recuadro</label>
                                <input type="hidden" id="prod-color" value="${PRODUCT_COLOR_PALETTE[0]}">
                                <div class="color-swatch-grid" id="colorSwatchGrid"></div>
                                <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="randomizeProductColor()">🎲 Color aleatorio</button>
                            </div>
                        </div>
                        <button class="btn btn-primary" type="submit">Guardar Producto</button>
                    </form>
                </div>
                <div class="card-panel">
                    <h3>Lista de Inventario</h3>
                    <div class="table-scroll-wrap">
                        <table>
                            <thead><tr><th>Color</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Código</th><th>Acciones</th></tr></thead>
                            <tbody id="inventoryTable"></tbody>
                        </table>
                    </div>
                </div>
            `;
            renderColorSwatches(PRODUCT_COLOR_PALETTE[0]);
            renderInventoryTable();
        }

        // ============ SELECTOR DE COLOR PERSONALIZADO (REEMPLAZA EL NATIVO) ============
        function renderColorSwatches(selected) {
            const grid = document.getElementById('colorSwatchGrid');
            if (!grid) return;
            const sel = (selected || '').toLowerCase();
            grid.innerHTML = PRODUCT_COLOR_PALETTE.map(c =>
                `<button type="button" class="color-swatch ${c.toLowerCase() === sel ? 'selected' : ''}" style="background:${c};" onclick="selectProductColor('${c}')" title="${c}"></button>`
            ).join('');
        }
        function selectProductColor(color) {
            document.getElementById('prod-color').value = color;
            renderColorSwatches(color);
        }
        function randomizeProductColor() {
            const c = PRODUCT_COLOR_PALETTE[Math.floor(Math.random() * PRODUCT_COLOR_PALETTE.length)];
            selectProductColor(c);
        }

        function saveProduct(e) {
            e.preventDefault();
            const id = document.getElementById('prod-id').value;
            const name = document.getElementById('prod-name').value;
            const price = parseFloat(document.getElementById('prod-price').value);
            const stock = parseInt(document.getElementById('prod-stock').value);
            const color = document.getElementById('prod-color').value;
            const category = document.getElementById('prod-category').value;
            const barcode = document.getElementById('prod-barcode').value.trim();

            if (id) {
                const prod = products.find(p => p.id == id);
                Object.assign(prod, { name, price, stock, color, category, barcode });
            } else {
                products.push({ id: Date.now(), name, price, stock, color, category, barcode });
            }
            document.getElementById('prod-form').reset();
            document.getElementById('prod-id').value = '';
            selectProductColor(PRODUCT_COLOR_PALETTE[0]);
            saveData();
            renderAll();
        }

        function renderInventoryTable() {
            const table = document.getElementById('inventoryTable');
            if (!table) return;
            table.innerHTML = products.map(p => `
                <tr>
                    <td style="background:${p.color}; width:30px;"></td>
                    <td>${p.name}</td>
                    <td>${p.category || ''}</td>
                    <td>${formatMoney(p.price)}</td>
                    <td>${p.stock}</td>
                    <td>${p.barcode || '-'}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="editProduct(${p.id})">Editar</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Eliminar</button>
                    </td>
                </tr>
            `).join('');
        }

        function editProduct(id) {
            const p = products.find(prod => prod.id === id);
            document.getElementById('prod-id').value = p.id;
            document.getElementById('prod-name').value = p.name;
            document.getElementById('prod-price').value = p.price;
            document.getElementById('prod-stock').value = p.stock;
            selectProductColor(p.color);
            document.getElementById('prod-category').value = p.category || categories[0];
            document.getElementById('prod-barcode').value = p.barcode || '';
        }

        function deleteProduct(id) {
            showConfirm("¿Eliminar este producto del inventario?", () => {
                products = products.filter(p => p.id !== id);
                saveData();
                renderAll();
            });
        }

        // ============ CAJA: FONDO INICIAL, GASTOS, CUADRE ============
        function renderCashView() {
            const isAdmin = currentUser && currentUser.role === 'admin';
            const panel = document.getElementById('shiftControlPanel');

            if (!currentShift) {
                panel.innerHTML = `
                    <h3>Turno Cerrado</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin:8px 0;">Debes abrir un turno con un fondo de caja inicial antes de registrar ventas.</p>
                    <button class="btn btn-success btn-block" onclick="openOpenShiftModal()">Abrir Turno</button>
                `;
            } else {
                const cashSales = salesLog.filter(s => s.method === 'Efectivo').reduce((a, s) => a + s.total, 0);
                const transferSales = salesLog.filter(s => s.method === 'Transferencia').reduce((a, s) => a + s.total, 0);
                const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
                const totalSales = salesLog.reduce((a, s) => a + s.total, 0);
                const expected = currentShift.openingCash + cashSales - totalExpenses;
                panel.innerHTML = `
                    <h3>Turno ${currentShift.turnNumber || '-'} — ${currentShift.employeeName || 'Sin nombre'}</h3>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">Abierto: ${new Date(currentShift.openDate).toLocaleString()}</p>
                    <div class="summary-grid">
                        <div class="summary-item"><div class="label">Fondo Inicial</div><div class="value">${formatMoney(currentShift.openingCash)}</div></div>
                        <div class="summary-item"><div class="label">Gastos/Retiros</div><div class="value">-${formatMoney(totalExpenses)}</div></div>
                        <div class="summary-item"><div class="label">Ventas en Efectivo</div><div class="value">${formatMoney(cashSales)}</div></div>
                        <div class="summary-item"><div class="label">Ventas por Transferencia</div><div class="value">${formatMoney(transferSales)}</div></div>
                        <div class="summary-item"><div class="label">Ventas Totales</div><div class="value">${formatMoney(totalSales)}</div></div>
                        <div class="summary-item"><div class="label">Efectivo Esperado</div><div class="value">${formatMoney(expected)}</div></div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="openCloseShiftModal()">Cerrar Turno / Realizar Cuadre</button>
                `;
                          }renderExpenseTable();

            // ---- Indicadores de bloqueo en modo demo (botones ya existentes en el HTML) ----
            const demoLocked = !!(window.isDemoLocked && window.isDemoLocked());
            const paymentsBtn = document.getElementById('paymentsHistoryBtn');
            if (paymentsBtn) paymentsBtn.classList.toggle('demo-locked', demoLocked);
            const addExpenseBtn = document.getElementById('addExpenseBtn');
            if (addExpenseBtn) addExpenseBtn.classList.toggle('demo-locked', demoLocked);

            document.getElementById('shiftHistoryPanel').style.display = isAdmin ? '' : 'none';
            if (isAdmin) {
                const table = document.getElementById('historyTable');
                if (demoLocked) {
                    table.innerHTML = `
                        <tr><td colspan="7" style="text-align:center; padding:20px 0; color:var(--text-muted);">
                            🔒 Historial de Cuadres disponible solo en la versión completa
                        </td></tr>`;
                } else {
                    table.innerHTML = shiftHistory.map((s, idx) => `
                        <tr>
                            <td>${s.turnNumber || '-'}</td>
                            <td>${s.employeeName || '-'}</td>
                            <td>${s.date}</td>
                            <td>${formatMoney(s.totalSales)}</td>
                            <td>${formatMoney(s.transferSales || 0)}</td>
                            <td class="${s.difference < 0 ? 'diff-negative' : 'diff-positive'}">${s.difference >= 0 ? '+' : ''}${formatMoney(s.difference)}</td>
                            <td><button class="btn btn-danger btn-sm" onclick="deleteShiftRecord(${idx})">Eliminar</button></td>
                        </tr>
                    `).join('');
                }
            }
        }

        // ============ NUMERACIÓN DE TURNO CONFIGURABLE ============
        function saveTurnNumberMode(mode) {
            turnNumberMode = mode;
            localStorage.setItem('turnNumberMode', mode);
        }
        function computeSuggestedTurnNumber() {
            const cycleLen = turnNumberMode === 'cycle2' ? 2 : turnNumberMode === 'cycle3' ? 3 : turnNumberMode === 'cycle4' ? 4 : 0;
            if (!cycleLen) return shiftHistory.length + 1; // Manual: sugerencia consecutiva de siempre
            if (shiftHistory.length === 0) return 1;
            const lastNum = parseInt(shiftHistory[shiftHistory.length - 1].turnNumber) || 0;
            const next = lastNum + 1;
            return next > cycleLen ? 1 : next;
        }

        function openOpenShiftModal() {
            document.getElementById('openingCashInput').value = '';
            document.getElementById('employeeNameInput').value = '';
            document.getElementById('turnNumberInput').value = computeSuggestedTurnNumber();
            document.getElementById('openShiftModal').classList.add('active');
        }
        function confirmOpenShift() {
            const val = parseFloat(document.getElementById('openingCashInput').value);
            const employeeName = document.getElementById('employeeNameInput').value.trim();
            const turnNumber = parseInt(document.getElementById('turnNumberInput').value) || (shiftHistory.length + 1);
            if (isNaN(val) || val < 0) return alert("Ingresa un monto válido");
            if (!employeeName) return alert("Ingresa el nombre del dependiente");
            currentShift = { openingCash: val, openDate: new Date().toISOString(), employeeName, turnNumber };
            salesLog = [];
            expenses = [];
            saveData();
            document.getElementById('openShiftModal').classList.remove('active');
            renderAll();
        }

        function openExpenseModal() {
            if (window.isDemoLocked && window.isDemoLocked()) {
                showDemoLockedMessage('Gastos / Retiros del Turno');
                return;
            }
            if (!currentShift) return alert("Debes abrir el turno primero");
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseReason').value = '';
            document.getElementById('expenseModal').classList.add('active');
        }
        function closeExpenseModal() {
            document.getElementById('expenseModal').classList.remove('active');
        }
        function addExpense() {
            const amount = parseFloat(document.getElementById('expenseAmount').value);
            const reason = document.getElementById('expenseReason').value.trim();
            if (isNaN(amount) || amount <= 0) return alert("Ingresa un monto válido");
            if (!reason) return alert("Ingresa un motivo");
            expenses.push({ id: Date.now(), amount, reason, date: new Date().toLocaleString() });
            saveData();
            document.getElementById('expenseModal').classList.remove('active');
            renderAll();
        }
        function renderExpenseTable() {
            const table = document.getElementById('expenseTable');
            table.innerHTML = expenses.map(e => `
                <tr>
                    <td>${e.reason}</td>
                    <td>-$${e.amount.toFixed(2)}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">✕</button></td>
                </tr>
            `).join('');
        }
        function deleteExpense(id) {
            showConfirm("¿Eliminar este gasto/retiro?", () => {
                expenses = expenses.filter(e => e.id !== id);
                saveData();
                renderAll();
            });
        }

        function openCloseShiftModal() {
            const cashSales = salesLog.filter(s => s.method === 'Efectivo').reduce((a, s) => a + s.total, 0);
            const transferSales = salesLog.filter(s => s.method === 'Transferencia').reduce((a, s) => a + s.total, 0);
            const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
            const totalSales = salesLog.reduce((a, s) => a + s.total, 0);
            const expected = currentShift.openingCash + cashSales - totalExpenses;
            document.getElementById('closeShiftSummary').innerHTML = `
                <div class="summary-item"><div class="label">Turno</div><div class="value">${currentShift.turnNumber} — ${currentShift.employeeName}</div></div>
                <div class="summary-item"><div class="label">Fondo Inicial</div><div class="value">${formatMoney(currentShift.openingCash)}</div></div>
                <div class="summary-item"><div class="label">Ventas Totales</div><div class="value">${formatMoney(totalSales)}</div></div>
                <div class="summary-item"><div class="label">Ventas en Efectivo</div><div class="value">${formatMoney(cashSales)}</div></div>
                <div class="summary-item"><div class="label">Ventas por Transferencia</div><div class="value">${formatMoney(transferSales)}</div></div>
                <div class="summary-item"><div class="label">Efectivo Caja</div><div class="value">${formatMoney(expected)}</div></div>
            `;
            document.getElementById('countedCashInput').value = '';
            document.getElementById('shiftDifference').innerText = '$0.00';
            document.getElementById('closeShiftModal').dataset.expected = expected;
            document.getElementById('closeShiftModal').classList.add('active');
        }
        function updateShiftDifference() {
            const expected = parseFloat(document.getElementById('closeShiftModal').dataset.expected) || 0;
            const counted = parseFloat(document.getElementById('countedCashInput').value) || 0;
            const diff = counted - expected;
            const el = document.getElementById('shiftDifference');
            el.innerText = `${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}`;
            el.style.color = diff < 0 ? 'var(--danger-color)' : 'var(--success-color)';
        }
        function finalizeCloseShift() {
            const expected = parseFloat(document.getElementById('closeShiftModal').dataset.expected) || 0;
            const counted = parseFloat(document.getElementById('countedCashInput').value);
            if (isNaN(counted)) return alert("Ingresa el efectivo contado");
            const totalSales = salesLog.reduce((a, s) => a + s.total, 0);
            const transferSales = salesLog.filter(s => s.method === 'Transferencia').reduce((a, s) => a + s.total, 0);
            shiftHistory.push({
                id: Date.now(),
                date: new Date().toLocaleString(),
                turnNumber: currentShift.turnNumber,
                employeeName: currentShift.employeeName,
                totalSales,
                transferSales,
                expected,
                counted,
                difference: counted - expected,
                details: [...salesLog],
                expenseDetails: [...expenses]
            });
            currentShift = null;
            salesLog = [];
            expenses = [];
            saveData();
            document.getElementById('closeShiftModal').classList.remove('active');
            renderAll();
            alert("Cuadre de caja registrado con éxito");
        }

        // ============ HISTORIAL DE PAGOS (BITÁCORA INDEPENDIENTE) ============
        // Registra cada pago de cada turno. Es una bitácora aparte: eliminar un
        // registro aquí no afecta las cifras reales de caja/ventas ni salesLog/shiftHistory.
        function registerPaymentLogEntry(saleRecord, dateObj) {
            paymentsLog.push({
                id: saleRecord.id,
                turnNumber: currentShift ? currentShift.turnNumber : '-',
                employeeName: currentShift ? currentShift.employeeName : '-',
                date: dateObj.toLocaleDateString(),
                time: dateObj.toLocaleTimeString(),
                client: saleRecord.client,
                total: saleRecord.total
            });
            localStorage.setItem('paymentsLog', JSON.stringify(paymentsLog));
        }
        function openPaymentsHistoryModal() {
            if (window.isDemoLocked && window.isDemoLocked()) {
                showDemoLockedMessage('Historial de Pagos');
                return;
            }
            renderPaymentsHistoryList();
            document.getElementById('paymentsHistoryModal').classList.add('active');
        }
        function closePaymentsHistoryModal() {
            document.getElementById('paymentsHistoryModal').classList.remove('active');
        }
        function renderPaymentsHistoryList() {
            const box = document.getElementById('paymentsHistoryList');
            if (!box) return;
            if (paymentsLog.length === 0) {
                box.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px 0;">Aún no hay pagos registrados.</p>';
                return;
            }
            box.innerHTML = [...paymentsLog].reverse().map(p => `
                <div class="payment-log-row">
                    <div>
                        <div><b>Turno ${p.turnNumber}</b> — ${p.employeeName}</div>
                        <div style="font-size:0.78rem; color:var(--text-muted);">${p.date} · ${p.time} · ${p.client}</div>
                        <div style="font-weight:700; margin-top:2px;">${formatMoney(p.total)}</div>
                    </div>
                    <div class="payment-log-actions">
                        <button class="btn btn-outline btn-sm" onclick="copyPaymentLogEntry(${p.id})">Copiar</button>
                        <button class="btn btn-danger btn-sm" onclick="deletePaymentLogEntry(${p.id})">Eliminar</button>
                    </div>
                </div>
            `).join('');
        }
        function copyPaymentLogEntry(id) {
            const p = paymentsLog.find(x => x.id === id);
            if (!p) return;
            const text = `Turno: ${p.turnNumber}\nDependiente: ${p.employeeName}\nFecha: ${p.date}\nHora: ${p.time}\nCliente: ${p.client}\nTotal: ${formatMoney(p.total)}`;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showToast('Copiado al portapapeles', 'success')).catch(() => alert(text));
            } else {
                alert(text);
            }
        }
        function deletePaymentLogEntry(id) {
            showConfirm("¿Eliminar este registro del historial de pagos? Esto no afecta las cifras reales de caja/ventas.", () => {
                paymentsLog = paymentsLog.filter(p => p.id !== id);
                localStorage.setItem('paymentsLog', JSON.stringify(paymentsLog));
                renderPaymentsHistoryList();
            });
        }

        function deleteShiftRecord(index) {
            showConfirm("¿Deseas eliminar este registro de cuadre?", () => {
                shiftHistory.splice(index, 1);
                saveData();
                renderAll();
            });
        }

        // ============ REPORTES ============
        // "Productos Más Vendidos" usa un contador independiente (statsTally),
        // separado del historial real de ventas/caja, para poder restablecerse
        // sin afectar ninguna cifra real.
        function registerStatsTally(saleRecord) {
            saleRecord.items.forEach(i => {
                if (!statsTally[i.name]) statsTally[i.name] = { qty: 0, revenue: 0 };
                statsTally[i.name].qty += i.qty;
                statsTally[i.name].revenue += i.price * i.qty;
            });
            localStorage.setItem('statsTally', JSON.stringify(statsTally));
        }
        function resetTopSellingStats() {
            showConfirm("¿Restablecer el ranking de Productos Más Vendidos? Esto no afecta tus ventas reales ni las cifras de caja.", () => {
                statsTally = {};
                localStorage.setItem('statsTally', JSON.stringify(statsTally));
                renderReportsView();
                showToast('Estadísticas restablecidas', 'success');
            });
        }
        function renderReportsView() {
            const box = document.getElementById('topSellingChart');
            const arr = Object.entries(statsTally).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10);
            if (arr.length === 0) {
                box.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Aún no hay ventas registradas.</p>';
                return;
            }
            const maxQty = Math.max(...arr.map(a => a.qty));
            box.innerHTML = arr.map(a => `
                <div class="bar-row">
                    <div class="bar-label"><span>${a.name}</span><span>${a.qty} uds · ${formatMoney(a.revenue)}</span></div>
                    <div class="bar-track"><div class="bar-fill" style="width:${(a.qty / maxQty * 100).toFixed(0)}%;"></div></div>
                </div>
            `).join('');
        }

        function exportCSV(type) {
            let rows = [];
            let filename = 'export.csv';
            if (type === 'sales') {
                rows.push(['Fecha', 'Cliente', 'Método', 'Subtotal', 'Descuento', 'Total']);
                salesLog.forEach(s => rows.push([s.date, s.client, s.method, s.subtotal.toFixed(2), s.discount.toFixed(2), s.total.toFixed(2)]));
                filename = 'ventas.csv';
            } else if (type === 'inventory') {
                rows.push(['Nombre', 'Categoría', 'Precio', 'Stock', 'Código de Barras']);
                products.forEach(p => rows.push([p.name, p.category || '', p.price.toFixed(2), p.stock, p.barcode || '']));
                filename = 'inventario.csv';
            } else if (type === 'expenses') {
                rows.push(['Fecha', 'Motivo', 'Monto']);
                expenses.forEach(e => rows.push([e.date, e.reason, e.amount.toFixed(2)]));
                filename = 'gastos.csv';
            }
            const csvContent = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
        }

        // ============ AJUSTES ============
        function saveReceiptSettings() {
            receiptSettings.slogan = document.getElementById('cfg-slogan').value;
            receiptSettings.footer = document.getElementById('cfg-footer').value;
            receiptSettings.logo = document.getElementById('cfg-logo').value;
            localStorage.setItem('receiptSettings', JSON.stringify(receiptSettings));
            alert("Ajustes del comprobante guardados");
        }

        function applyEffectiveTheme(theme) {
            let effective = theme;
            if (theme === 'system') {
                effective = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            document.body.classList.toggle('dark-theme', effective === 'dark');
            // Barra de estado de Android: blanca con íconos oscuros en tema claro,
            // negra con íconos claros en tema oscuro (solo dentro de la app instalada).
            try {
                const StatusBar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
                if (StatusBar) {
                    if (effective === 'dark') {
                        StatusBar.setBackgroundColor({ color: '#000000' });
                        StatusBar.setStyle({ style: 'LIGHT' }); // íconos claros sobre fondo oscuro
                    } else {
                        StatusBar.setBackgroundColor({ color: '#ffffff' });
                        StatusBar.setStyle({ style: 'DARK' }); // íconos oscuros sobre fondo blanco
                    }
                }
            } catch (e) { /* plugin no disponible (ej. corriendo en navegador) */ }
        }
        function toggleTheme(theme) {
            localStorage.setItem('themePref', theme);
            applyEffectiveTheme(theme);
            if (theme === 'system' && !systemThemeListenerAdded && window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                    if (localStorage.getItem('themePref') === 'system') applyEffectiveTheme('system');
                });
                systemThemeListenerAdded = true;
            }
        }

        function saveLowStockThreshold(val) {
            lowStockThreshold = parseInt(val) || 0;
            localStorage.setItem('lowStockThreshold', lowStockThreshold);
            renderPOS();
        }

        function saveCategories() {
            const val = document.getElementById('cfg-categories').value;
            categories = val.split(',').map(c => c.trim()).filter(Boolean);
            if (categories.length === 0) categories = ['General'];
            localStorage.setItem('categories', JSON.stringify(categories));
            renderAll();
            alert("Categorías actualizadas");
        }

        function savePasswords() {
            const admin = document.getElementById('cfg-adminpass').value;
            const cajero = document.getElementById('cfg-cajeropass').value;
            if (admin) authConfig.adminPassword = admin;
            if (cajero) authConfig.cajeroPassword = cajero;
            localStorage.setItem('authConfig', JSON.stringify(authConfig));
            document.getElementById('cfg-adminpass').value = '';
            document.getElementById('cfg-cajeropass').value = '';
            alert("Contraseñas actualizadas");
        }

        function googleLogin() {
            if (!firebaseReady) return alert("Firebase no está configurado todavía. Agrega tus credenciales reales en el código (reemplaza TU_API_KEY, etc.), o usa el respaldo por Google Drive de más abajo.");
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).then(res => {
                document.getElementById('auth-status').innerText = `Conectado como ${res.user.displayName}`;
            }).catch(err => alert("Error: " + err.message));
        }

        function syncCloud() {
            if (!firebaseReady) return alert("Firebase no está configurado todavía. Agrega tus credenciales reales en el código (reemplaza TU_API_KEY, etc.), o usa el respaldo por Google Drive de más abajo.");
            const user = auth.currentUser;
            if (!user) return alert("Inicie sesión con Google primero");
            db.collection("users").doc(user.uid).set({
                products, shiftHistory, receiptSettings, lastSync: new Date()
            }).then(() => {
                pendingSync = [];
                localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
                updateOfflineBanner();
                alert("Copia de seguridad completada en la nube");
            }).catch(err => alert("Error: " + err.message));
        }

        function trySyncPending() {
            if (!navigator.onLine || pendingSync.length === 0 || !firebaseReady || !auth.currentUser) return;
            syncCloud();
        }

        // ============ COPIA DE SEGURIDAD (ARCHIVO LOCAL / DRIVE MANUAL) ============
        function buildBackupData() {
            return {
                products, shiftHistory, salesLog, expenses, receiptSettings,
                categories, currencySettings, authConfig, lowStockThreshold,
                exportedAt: new Date().toISOString()
            };
        }
        function downloadFullBackup() {
            const backupData = buildBackupData();
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            const fecha = new Date().toISOString().slice(0, 10);
            link.href = URL.createObjectURL(blob);
            link.download = `pos-pro-respaldo-${fecha}.json`;
            link.click();
        }
        function restoreFromFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            showConfirm("Esto reemplazará los datos actuales con los del archivo seleccionado. ¿Continuar?", () => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        products = data.products || products;
                        shiftHistory = data.shiftHistory || shiftHistory;
                        salesLog = data.salesLog || salesLog;
                        expenses = data.expenses || expenses;
                        receiptSettings = data.receiptSettings || receiptSettings;
                        categories = data.categories || categories;
                        currencySettings = data.currencySettings || currencySettings;
                        authConfig = data.authConfig || authConfig;
                        lowStockThreshold = data.lowStockThreshold || lowStockThreshold;
                        localStorage.setItem('categories', JSON.stringify(categories));
                        localStorage.setItem('currencySettings', JSON.stringify(currencySettings));
                        localStorage.setItem('authConfig', JSON.stringify(authConfig));
                        localStorage.setItem('lowStockThreshold', lowStockThreshold);
                        saveData();
                        renderAll();
                        updateReceiptPreview();
                        alert("Datos restaurados correctamente");
                    } catch (err) {
                        alert("El archivo no es un respaldo válido: " + err.message);
                    }
                };
                reader.readAsText(file);
            });
            event.target.value = '';
        }

        function updateOfflineBanner() {
            const banner = document.getElementById('offline-banner');
            if (!navigator.onLine) {
                banner.classList.add('show');
                banner.innerText = '⚠ Sin conexión — las ventas se guardan localmente y se sincronizarán automáticamente';
            } else if (pendingSync.length > 0) {
                banner.classList.add('show');
                banner.innerText = `🔄 Conectado — ${pendingSync.length} venta(s) pendiente(s) por sincronizar`;
            } else {
                banner.classList.remove('show');
            }
        }
        window.addEventListener('online', () => { updateOfflineBanner(); trySyncPending(); });
        window.addEventListener('offline', updateOfflineBanner);

        // ============ PERSISTENCIA LOCAL ============
        function saveData() {
            localStorage.setItem('products', JSON.stringify(products));
            localStorage.setItem('salesLog', JSON.stringify(salesLog));
            localStorage.setItem('shiftHistory', JSON.stringify(shiftHistory));
            localStorage.setItem('expenses', JSON.stringify(expenses));
            localStorage.setItem('currentShift', JSON.stringify(currentShift));
        }

        // ============ RENDER GENERAL ============
        function renderAll() {
            renderPOS();
            renderInventoryView();
            renderCashView();
            renderReportsView();
            updateOfflineBanner();
        }

        // ============ INICIO ============
        (function init() {
            const savedTheme = localStorage.getItem('themePref') || 'light';
            document.getElementById('cfg-theme').value = savedTheme;
            toggleTheme(savedTheme);
            document.getElementById('cfg-currency').value = currencySettings.code;
            document.getElementById('cfg-lowstock').value = lowStockThreshold;
            document.getElementById('cfg-turnmode').value = turnNumberMode;
            document.getElementById('appVersionLabel').innerText = 'v' + APP_VERSION;
            document.getElementById('cfg-categories').value = categories.join(', ');
            document.getElementById('cfg-slogan').value = receiptSettings.slogan;
            document.getElementById('cfg-footer').value = receiptSettings.footer;
            document.getElementById('cfg-logo').value = receiptSettings.logo;
            updateReceiptPreview();

            if (currentUser) {
                document.getElementById('loginOverlay').classList.remove('active');
                applyRoleRestrictions();
            }
            renderAll();
            setupAndroidBackButton();
            setupSwipeNavigation();
        })();

        // ============ BOTÓN/GESTO "ATRÁS" DE ANDROID (INTELIGENTE) ============
        // Si hay una ventana/modal abierto, "Atrás" la cierra primero.
        // Para salir de la app hay que presionarlo 2 veces seguidas.
        // Requiere el plugin @capacitor/app (ya incluido en package.json).
        let backPressedOnce = false;
        function isNativeAppPluginAvailable() {
            return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
                && window.Capacitor.Plugins && window.Capacitor.Plugins.App);
        }
        function closeTopMostModal() {
            if (isSettingsSubpageOpen()) { closeSettingsPage(); return true; }
            const modalCloseMap = [
                ['confirmModal', closeConfirm],
                ['scannerModal', closeCameraScanner],
                ['printerPairModal', closePrinterPairModal],
                ['paymentsHistoryModal', closePaymentsHistoryModal],
                ['expenseModal', closeExpenseModal],
                ['openShiftModal', () => document.getElementById('openShiftModal').classList.remove('active')],
                ['closeShiftModal', () => document.getElementById('closeShiftModal').classList.remove('active')],
                ['checkoutModal', requestCloseCheckout]
            ];
            for (const [id, closer] of modalCloseMap) {
                const el = document.getElementById(id);
                if (el && el.classList.contains('active')) { closer(); return true; }
            }
            return false;
        }
        function setupAndroidBackButton() {
            if (!isNativeAppPluginAvailable()) return;
            window.Capacitor.Plugins.App.addListener('backButton', () => {
                if (closeTopMostModal()) return;
                if (backPressedOnce) {
                    window.Capacitor.Plugins.App.exitApp();
                    return;
                }
                backPressedOnce = true;
                showToast('Toca de nuevo para salir', 'info', 2000);
                setTimeout(() => { backPressedOnce = false; }, 2000);
            });
        }
