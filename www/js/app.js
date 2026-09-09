// ============ CONFIGURACIÓN DE FIREBASE ============
        const firebaseConfig = {
            apiKey: "TU_API_KEY",
            authDomain: "TU_PROJECT_ID.firebaseapp.com",
            projectId: "TU_PROJECT_ID",
            storageBucket: "TU_PROJECT_ID.appspot.com",
            messagingSenderId: "TU_SENDER_ID",
            appId: "TU_APP_ID"
        };
        let firebaseReady = false;
        if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY") {
            try {
                firebase.initializeApp(firebaseConfig);
                firebaseReady = true;
            } catch (e) { console.warn("Firebase no se pudo inicializar:", e.message); }
        }
        const auth = firebaseReady ? firebase.auth() : null;
        const db = firebaseReady ? firebase.firestore() : null;

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
        // ============ ACORDEÓN DE AJUSTES ============
        // Cada encabezado de sección se muestra solo (colapsado); al tocarlo
        // se despliegan sus opciones. Toca de nuevo para volver a ocultarlas.
        function toggleSettingsSection(headerEl) {
            const panel = headerEl.closest('.card-panel');
            if (!panel) return;
            const wasOpen = panel.classList.contains('open');
            panel.parentElement.querySelectorAll('.card-panel.open').forEach(p => {
                if (p !== panel) p.classList.remove('open');
            });
            panel.classList.toggle('open', !wasOpen);
        }

        function switchTab(viewId, btn) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            btn.classList.add('active');
            renderAll();
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
        function openCameraScanner() {
            document.getElementById('scannerModal').classList.add('active');
            if (typeof Html5Qrcode === 'undefined') {
                document.getElementById('barcodeScannerBox').innerHTML = '<p style="text-align:center; color:var(--text-muted);">La librería de cámara no está disponible sin conexión a internet.</p>';
                return;
            }
            html5QrScanner = new Html5Qrcode("barcodeScannerBox");
            html5QrScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 220 },
                (decodedText) => { handleBarcodeInput(decodedText); closeCameraScanner(); },
                () => {}
            ).catch(() => {
                document.getElementById('barcodeScannerBox').innerHTML = '<p style="text-align:center; color:var(--text-muted);">No se pudo acceder a la cámara.</p>';
            });
        }
        function closeCameraScanner() {
            document.getElementById('scannerModal').classList.remove('active');
            if (html5QrScanner) {
                html5QrScanner.stop().catch(() => {});
                html5QrScanner = null;
            }
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
                            <div class="product-price">${formatMoney(p.price)}</div>
                        </div>
                        <div class="product-stock-tag ${tagClass}">Disp: ${availableStock}</div>
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
            document.getElementById('cashReceivedInput').value = '';
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
            const method = document.getElementById('paymentMethod').value;
            document.getElementById('changeBox').style.display = method === 'Efectivo' ? 'block' : 'none';

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
            updateChange();
        }

        function updateChange() {
            const totals = computeCartTotals();
            const received = parseFloat(document.getElementById('cashReceivedInput').value) || 0;
            const change = received - totals.total;
            const el = document.getElementById('changeAmount');
            el.innerText = `Cambio: ${formatMoney(Math.max(0, change))}`;
            el.className = 'change-amount ' + (change < 0 ? 'negative' : 'positive');
        }

        // ============ PROCESAR VENTA ============
        async function processSale() {
            if (cart.length === 0) return alert("Agregue productos antes de cobrar");
            const totals = computeCartTotals();
            if (totals.total <= 0) return alert("El total de la venta debe ser mayor a $0.00");

            const method = document.getElementById('paymentMethod').value;
            let cashReceived = null, change = null;
            if (method === 'Efectivo') {
                cashReceived = parseFloat(document.getElementById('cashReceivedInput').value) || 0;
                if (cashReceived < totals.total) return alert("El efectivo recibido es menor al total a pagar");
                change = cashReceived - totals.total;
            }

            const client = document.getElementById('clientName').value.trim() || 'Cliente General';

            cart.forEach(item => {
                const prod = products.find(p => p.id === item.id);
                if (prod) prod.stock -= item.qty; // Descuento definitivo del stock
            });

            const saleRecord = {
                id: Date.now(),
                client, method,
                subtotal: totals.subtotal,
                discount: totals.totalDiscount,
                total: totals.total,
                cashReceived, change,
                items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
                date: new Date().toLocaleString(),
                synced: false
            };
            salesLog.push(saleRecord);

            if (!navigator.onLine) {
                pendingSync.push(saleRecord);
                localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
            }

            saveData();
            await printReceipt(saleRecord);

            cart = [];
            document.getElementById('clientName').value = '';
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
            document.getElementById('rec-change-line').innerText = saleRecord.method === 'Efectivo'
                ? `Recibido: ${formatMoney(saleRecord.cashReceived)} · Cambio: ${formatMoney(saleRecord.change)}` : '';

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
                            <div class="form-group"><label>Código de Barras</label><input type="text" id="prod-barcode" placeholder="Opcional"></div>
                            <div class="form-group"><label>Color del Recuadro</label><input type="color" id="prod-color" value="#e3f2fd"></div>
                        </div>
                        <button class="btn btn-primary" type="submit">Guardar Producto</button>
                    </form>
                </div>
                <div class="card-panel">
                    <h3>Lista de Inventario</h3>
                    <table>
                        <thead><tr><th>Color</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Código</th><th>Acciones</th></tr></thead>
                        <tbody id="inventoryTable"></tbody>
                    </table>
                </div>
            `;
            renderInventoryTable();
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
            document.getElementById('prod-color').value = p.color;
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
                        <div class="summary-item"><div class="label">Ventas Totales</div><div class="value">${formatMoney(totalSales)}</div></div>
                        <div class="summary-item"><div class="label">Ventas en Efectivo</div><div class="value">${formatMoney(cashSales)}</div></div>
                        <div class="summary-item"><div class="label">Ventas por Transferencia</div><div class="value">${formatMoney(transferSales)}</div></div>
                        <div class="summary-item"><div class="label">Gastos/Retiros</div><div class="value">-${formatMoney(totalExpenses)}</div></div>
                        <div class="summary-item"><div class="label">Efectivo Esperado</div><div class="value">${formatMoney(expected)}</div></div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="openCloseShiftModal()">Cerrar Turno / Realizar Cuadre</button>
                `;
                          }renderExpenseTable();

            document.getElementById('shiftHistoryPanel').style.display = isAdmin ? '' : 'none';
            if (isAdmin) {
                const table = document.getElementById('historyTable');
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

        function openOpenShiftModal() {
            document.getElementById('openingCashInput').value = '';
            document.getElementById('employeeNameInput').value = '';
            document.getElementById('turnNumberInput').value = shiftHistory.length + 1;
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
                <div class="summary-item"><div class="label">Ventas por Transferencia</div><div class="value">${formatMoney(transferSales)}</div></div>
                <div class="summary-item"><div class="label">Efectivo Esperado</div><div class="value">${formatMoney(expected)}</div></div>
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

        function deleteShiftRecord(index) {
            showConfirm("¿Deseas eliminar este registro de cuadre?", () => {
                shiftHistory.splice(index, 1);
                saveData();
                renderAll();
            });
        }

        // ============ REPORTES ============
        function renderReportsView() {
            const box = document.getElementById('topSellingChart');
            const tally = {};
            [...salesLog, ...shiftHistory.flatMap(s => s.details || [])].forEach(sale => {
                sale.items.forEach(i => {
                    if (!tally[i.name]) tally[i.name] = { qty: 0, revenue: 0 };
                    tally[i.name].qty += i.qty;
                    tally[i.name].revenue += i.price * i.qty;
                });
            });
            const arr = Object.entries(tally).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10);
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
        })();
