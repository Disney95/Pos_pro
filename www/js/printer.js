// ======================================================================
// IMPRESIÓN TÉRMICA BLUETOOTH (ESC/POS) — v1.3.0
// ======================================================================
// Este módulo habla con una impresora térmica de recibos por Bluetooth
// Low Energy (BLE) usando el set de comandos ESC/POS estándar, enviando
// el ticket como texto plano.
//
// REQUIERE (ver README.md para la guía completa de instalación):
//   npm install @capacitor-community/bluetooth-le
//   npx cap sync android
//   Permisos en AndroidManifest.xml: BLUETOOTH_SCAN, BLUETOOTH_CONNECT,
//   y (en Android <12) ACCESS_FINE_LOCATION.
//
// Este archivo NO importa el paquete npm directamente (el proyecto no usa
// bundler): llama al plugin nativo ya registrado a través del puente de
// Capacitor (Capacitor.Plugins.BluetoothLe), que queda disponible en
// cuanto el plugin se agrega al proyecto nativo con `npx cap sync`.
//
// Si la app corre en el navegador (sin Capacitor nativo) o el plugin no
// está instalado, todas las funciones degradan de forma segura y
// printReceipt() usa la impresión estándar (window.print) como respaldo.
// ======================================================================

// --- Ajusta estos UUID según el modelo exacto de tu impresora ---------
// La mayoría de las impresoras térmicas BLE económicas (chipset serie
// "BT-58/BT-80") usan este service/characteristic. Revisa la hoja de
// datos de tu impresora si no imprime nada.
const PRINTER_SERVICE_UUID = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const PRINTER_WRITE_CHARACTERISTIC_UUID = '49535343-8841-43f4-a8d4-ecbe34729bb3';

// Ancho del papel en caracteres (32 ≈ 58mm, 48 ≈ 80mm)
const PRINTER_CHAR_WIDTH = 32;

// Tamaño de cada fragmento enviado por BLE (algunos módulos BLE truncan
// escrituras grandes; se envían en trozos pequeños con una breve pausa)
const BLE_CHUNK_SIZE = 180;
const BLE_CHUNK_DELAY_MS = 30;

let savedPrinter = JSON.parse(localStorage.getItem('printerConfig')) || null; // {deviceId, name}
let printerConnected = false;
let discoveredDevices = {}; // deviceId -> {deviceId, name}

function isNativeBluetoothAvailable() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothLe);
}

// ============ ESTADO / UI DEL PANEL DE AJUSTES ============
function updatePrinterStatusUI() {
    const dot = document.getElementById('printerStatusDot');
    const text = document.getElementById('printerStatusText');
    const testBtn = document.getElementById('testPrintBtn');
    const forgetBtn = document.getElementById('forgetPrinterBtn');
    if (!dot || !text) return;

    if (savedPrinter && printerConnected) {
        dot.classList.add('connected');
        text.innerText = `Conectada: ${savedPrinter.name || savedPrinter.deviceId}`;
        if (testBtn) testBtn.disabled = false;
        if (forgetBtn) forgetBtn.disabled = false;
    } else if (savedPrinter) {
        dot.classList.remove('connected');
        text.innerText = `Guardada (sin conectar): ${savedPrinter.name || savedPrinter.deviceId}`;
        if (testBtn) testBtn.disabled = false;
        if (forgetBtn) forgetBtn.disabled = false;
    } else {
        dot.classList.remove('connected');
        text.innerText = 'Sin impresora configurada';
        if (testBtn) testBtn.disabled = true;
        if (forgetBtn) forgetBtn.disabled = true;
    }
}

// ============ PANTALLA DE EMPAREJAR IMPRESORA ============
function openPrinterPairModal() {
    document.getElementById('printerPairModal').classList.add('active');
    renderPrinterDeviceList();
}
function closePrinterPairModal() {
    document.getElementById('printerPairModal').classList.remove('active');
    if (isNativeBluetoothAvailable()) {
        window.Capacitor.Plugins.BluetoothLe.stopLEScan().catch(() => {});
    }
}

function renderPrinterDeviceList() {
    const list = document.getElementById('printerDeviceList');
    const devices = Object.values(discoveredDevices);
    if (devices.length === 0) {
        list.innerHTML = '<div class="printer-empty-msg">Ningún dispositivo encontrado todavía. Toca "Buscar dispositivos".</div>';
        return;
    }
    list.innerHTML = devices.map(d => `
        <div class="printer-device-row">
            <div>
                <div class="device-name">${d.name || 'Dispositivo sin nombre'}</div>
                <div class="device-id">${d.deviceId}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="connectToPrinter('${d.deviceId}', '${(d.name || '').replace(/'/g, "\\'")}')">Conectar</button>
        </div>
    `).join('');
}

async function scanForPrinters() {
    if (!isNativeBluetoothAvailable()) {
        alert('El Bluetooth solo está disponible dentro de la app instalada en el teléfono (no en el navegador). Compila e instala la app para poder emparejar la impresora.');
        return;
    }
    const btn = document.getElementById('scanPrinterBtn');
    discoveredDevices = {};
    renderPrinterDeviceList();
    try {
        const Bt = window.Capacitor.Plugins.BluetoothLe;
        await Bt.initialize();

        if (btn) { btn.disabled = true; btn.innerText = 'Buscando… (10s)'; }

        await Bt.addListener('onScanResult', (result) => {
            const device = result && result.device;
            if (!device || !device.deviceId) return;
            discoveredDevices[device.deviceId] = { deviceId: device.deviceId, name: device.name || device.localName };
            renderPrinterDeviceList();
        });

        await Bt.requestLEScan({});
        setTimeout(async () => {
            try { await Bt.stopLEScan(); } catch (e) {}
            if (btn) { btn.disabled = false; btn.innerText = 'Buscar dispositivos'; }
        }, 10000);
    } catch (err) {
        if (btn) { btn.disabled = false; btn.innerText = 'Buscar dispositivos'; }
        alert('No se pudo iniciar la búsqueda de Bluetooth: ' + (err && err.message ? err.message : err) + '\n\nRevisa que la app tenga los permisos de Bluetooth y ubicación concedidos.');
    }
}

async function connectToPrinter(deviceId, name) {
    if (!isNativeBluetoothAvailable()) return;
    try {
        const Bt = window.Capacitor.Plugins.BluetoothLe;
        await Bt.connect({ deviceId });
        printerConnected = true;
        savedPrinter = { deviceId, name };
        localStorage.setItem('printerConfig', JSON.stringify(savedPrinter));
        updatePrinterStatusUI();
        closePrinterPairModal();
        alert(`Impresora "${name || deviceId}" conectada y guardada.`);
    } catch (err) {
        alert('No se pudo conectar con la impresora: ' + (err && err.message ? err.message : err));
    }
}

async function forgetPrinter() {
    if (!savedPrinter) return;
    if (isNativeBluetoothAvailable() && printerConnected) {
        try { await window.Capacitor.Plugins.BluetoothLe.disconnect({ deviceId: savedPrinter.deviceId }); } catch (e) {}
    }
    savedPrinter = null;
    printerConnected = false;
    localStorage.removeItem('printerConfig');
    updatePrinterStatusUI();
}

// ============ FORMATO DE TICKET EN TEXTO PLANO (ESC/POS) ============
function padLine(left, right, width) {
    left = String(left); right = String(right);
    const spaces = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(spaces) + right;
}
function centerLine(text, width) {
    text = String(text);
    if (text.length >= width) return text;
    const padTotal = width - text.length;
    const padLeft = Math.floor(padTotal / 2);
    return ' '.repeat(padLeft) + text;
}
function wrapDivider(width) { return '-'.repeat(width); }

function buildTicketText(saleRecord, receiptSettings, formatMoneyFn, width) {
    width = width || PRINTER_CHAR_WIDTH;
    const lines = [];
    lines.push(centerLine('POS Store', width));
    if (receiptSettings.slogan) lines.push(centerLine(receiptSettings.slogan, width));
    lines.push(wrapDivider(width));
    lines.push(`Fecha: ${saleRecord.date}`);
    lines.push(`Cliente: ${saleRecord.client}`);
    lines.push(`Pago: ${saleRecord.method}`);
    lines.push(wrapDivider(width));
    saleRecord.items.forEach(i => {
        lines.push(`${i.name} x${i.qty}`);
        lines.push(padLine('', formatMoneyFn(i.price * i.qty), width));
    });
    lines.push(wrapDivider(width));
    lines.push(padLine('Subtotal:', formatMoneyFn(saleRecord.subtotal), width));
    lines.push(padLine('Descuento:', '-' + formatMoneyFn(saleRecord.discount), width));
    lines.push(padLine('TOTAL:', formatMoneyFn(saleRecord.total), width));
    if (saleRecord.cashReceived != null && saleRecord.change != null) {
        lines.push(padLine('Recibido:', formatMoneyFn(saleRecord.cashReceived), width));
        lines.push(padLine('Cambio:', formatMoneyFn(saleRecord.change), width));
    }
    lines.push(wrapDivider(width));
    if (receiptSettings.footer) lines.push(centerLine(receiptSettings.footer, width));
    lines.push('');
    lines.push('');
    return lines.join('\n');
}

// Construye el buffer binario con comandos ESC/POS a partir del texto plano
function buildEscPosBuffer(ticketText) {
    const ESC = 0x1B, GS = 0x1D;
    const bytes = [];
    // Inicializar impresora
    bytes.push(ESC, 0x40);
    // Alineación izquierda por defecto
    bytes.push(ESC, 0x61, 0x00);
    // Texto (codificado en Latin-1/CP437 aproximado; ajustar según el
    // codepage que soporte tu impresora si los acentos no se ven bien)
    const textBytes = Array.from(new TextEncoder().encode(ticketText));
    bytes.push(...textBytes);
    // Alimentar papel y cortar (si la impresora tiene cuchilla)
    bytes.push(0x0A, 0x0A, 0x0A);
    bytes.push(GS, 0x56, 0x00);
    return new Uint8Array(bytes);
}

function uint8ToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Envía el buffer ESC/POS a la impresora conectada, fragmentado en trozos
async function sendBufferToPrinter(bytes) {
    if (!isNativeBluetoothAvailable() || !savedPrinter) return false;
    const Bt = window.Capacitor.Plugins.BluetoothLe;
    try {
        if (!printerConnected) {
            await Bt.connect({ deviceId: savedPrinter.deviceId });
            printerConnected = true;
            updatePrinterStatusUI();
        }
        for (let offset = 0; offset < bytes.length; offset += BLE_CHUNK_SIZE) {
            const chunk = bytes.slice(offset, offset + BLE_CHUNK_SIZE);
            await Bt.write({
                deviceId: savedPrinter.deviceId,
                service: PRINTER_SERVICE_UUID,
                characteristic: PRINTER_WRITE_CHARACTERISTIC_UUID,
                value: uint8ToBase64(chunk)
            });
            await sleep(BLE_CHUNK_DELAY_MS);
        }
        return true;
    } catch (err) {
        printerConnected = false;
        updatePrinterStatusUI();
        alert('Error al imprimir por Bluetooth: ' + (err && err.message ? err.message : err) + '\n\nSe usará la impresión de respaldo.');
        return false;
    }
}

// Punto de entrada usado por app.js al procesar una venta.
// Devuelve true si logró imprimir por Bluetooth (para omitir el respaldo).
async function printTicketOverBluetooth(saleRecord, receiptSettings, formatMoneyFn) {
    if (!savedPrinter || !isNativeBluetoothAvailable()) return false;
    const ticketText = buildTicketText(saleRecord, receiptSettings, formatMoneyFn, PRINTER_CHAR_WIDTH);
    const buffer = buildEscPosBuffer(ticketText);
    return await sendBufferToPrinter(buffer);
}

async function testPrint() {
    if (!savedPrinter) return;
    const fakeSale = {
        client: 'Cliente de Prueba', method: 'Efectivo',
        subtotal: 7.5, discount: 0, total: 7.5, cashReceived: 10, change: 2.5,
        items: [{ name: 'Producto de prueba', price: 7.5, qty: 1 }],
        date: new Date().toLocaleString()
    };
    const fakeSettings = { slogan: '¡Gracias por su compra!', footer: '¡Vuelva pronto!' };
    const ok = await printTicketOverBluetooth(fakeSale, fakeSettings, (n) => '$' + Number(n).toFixed(2));
    if (ok && typeof showToast === 'function') showToast('Ticket de prueba enviado a la impresora', 'success');
    else if (ok) alert('Ticket de prueba enviado a la impresora.');
}

document.addEventListener('DOMContentLoaded', updatePrinterStatusUI);
