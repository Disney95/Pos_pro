// ============ SISTEMA DE PRUEBA (3 DÍAS) + ACTIVACIÓN POR CÓDIGO OFFLINE ============
// No depende de Firebase ni de ningún servidor: funciona sin conexión a internet.
// Ideal para clientes con conectividad limitada o intermitente.
//
// Flujo:
//   1) Al instalar, la app arranca en modo DEMO durante TRIAL_DAYS días, con algunas
//      funciones limitadas (ver isDemoLocked(), usado desde app.js).
//   2) Al cumplirse el plazo, se bloquea POR COMPLETO y se muestra el código de dispositivo
//      (para que el cliente lo envíe al proveedor) y un campo para pegar el código de activación.
//   3) El código de activación se genera offline (fuera de la app, con generate-license.js y
//      la clave privada) y se valida aquí localmente con la clave pública embebida (RSA-SHA256).
//   4) Una vez activado, queda activado permanentemente en este dispositivo (no vuelve a pedirse).
//
// El conteo de los 3 días usa como ancla firstInstallTime del sistema Android (vía el plugin
// nativo InstallTime, agregado por el workflow de compilación), que NO se reinicia si el
// cliente borra los datos de la app — solo si desinstala y reinstala. Si el plugin no está
// disponible (ej. probando en navegador, o un APK viejo sin el plugin), cae a un respaldo
// basado en localStorage (menos robusto, pero funcional).
//
// IMPORTANTE: la clave PRIVADA nunca debe estar en este archivo ni en la app. Solo la pública.
//
// ---- BUILD "ACTUALIZACIÓN LIMPIA" (sin trial ni código de activación) ----
// Este build tiene SKIP_LICENSE_CHECK = true: la app se auto-activa al abrir, sin mostrar
// nunca la pantalla de bloqueo ni pedir código. Está pensado para actualizar a clientes que
// YA tienen la app instalada de antes (sin protección) y ya la usan con normalidad — no
// tiene sentido interrumpirlos con un trial o pedirles que activen algo que ya estaban
// usando gratis. Toda la infraestructura de seguridad (plugin nativo, verificación de
// firma, etc.) sigue en el código, simplemente inactiva: si en algún momento quieres exigir
// activación también a estos clientes, basta con cambiar SKIP_LICENSE_CHECK a false y
// recompilar. La versión que SÍ pide activación (para vender a clientes nuevos) es un build
// aparte, con SKIP_LICENSE_CHECK = false.
const SKIP_LICENSE_CHECK = true;

const TRIAL_DAYS = 3;
const TRIAL_INSTALL_KEY = 'trialInstallAt';
const TRIAL_LAST_SEEN_KEY = 'trialLastSeenAt';
const LICENSE_ACTIVATED_KEY = 'licenseActivatedV2';

// Clave pública (formato SPKI, base64) generada junto con generate-license.js.
// Esta SÍ va embebida en la app: solo sirve para VERIFICAR códigos, no para generarlos.
const LICENSE_PUBLIC_KEY_B64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArse1XXfVQLs982btTHK4w8JYNTfkyT7efJAzK5GFUpaBqOzPd1uXUggezWzcq2+ykLzztLnMhrH74cc7xWBb4KZBB/OQjbiiLvOW9B6TF1nCvrjKWpv9rFKsVXnoekOnGqp49VQcJft4tUUoTxVl0vST8SCMh3KdbR1/lLyY5nz5wpaiN1wIuTjc6528uKXWdY8lsusv9jGlTbGQCaU3jj8JxLKl/VuF6+zP201uauDxbPA02vrudwq58AE9jB+SPtTIEsRj6PwuQhpLnsrba8NOCMhyk3ziNKDA+AGqKHYkIYBLhYyZRlLu5qsQ8SXjbhH0C9RPbCJ+VnV9AGQCHwIDAQAB";

// ---- Utilidades base64url <-> bytes ----
function base64UrlToBytes(b64url) {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// ---- Identificador de dispositivo (vía @capacitor/device; respaldo si no está disponible) ----
async function getDeviceId() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Device) {
            const info = await window.Capacitor.Plugins.Device.getId();
            if (info && info.identifier) return info.identifier;
        }
    } catch (e) { /* sigue al respaldo */ }
    let fallback = localStorage.getItem('deviceIdFallback');
    if (!fallback) {
        fallback = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('deviceIdFallback', fallback);
    }
    return fallback;
}

// ---- Fecha real de instalación según el sistema Android (plugin nativo InstallTime) ----
// A diferencia de localStorage, esto NO se reinicia si el cliente borra los datos/caché de
// la app: solo cambia si desinstala y vuelve a instalar. Si el plugin no está disponible
// (ej. APK compilado antes de agregar este plugin, o pruebas en navegador), devuelve null
// y se usa el respaldo local (menos robusto, pero funcional).
async function getSystemInstallTime() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.InstallTime) {
            const info = await window.Capacitor.Plugins.InstallTime.getInstallTime();
            if (info && info.firstInstallTime) return info.firstInstallTime;
        }
    } catch (e) { /* plugin no disponible: seguimos con el respaldo local */ }
    return null;
}

// ---- Verificación offline del código de activación (RSA-SHA256 con Web Crypto) ----
let cachedPublicKey = null;
async function importLicensePublicKey() {
    if (cachedPublicKey) return cachedPublicKey;
    const der = base64ToBytes(LICENSE_PUBLIC_KEY_B64);
    cachedPublicKey = await crypto.subtle.importKey(
        'spki',
        der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
    );
    return cachedPublicKey;
}

// El código tiene el formato: <payload_base64url>.<firma_base64url>
// payload = JSON { d: deviceId, n: nombreCliente (opcional), iat: fechaEmision (opcional) }
async function verifyActivationCode(rawCode, expectedDeviceId) {
    const code = (rawCode || '').trim();
    const parts = code.split('.');
    if (parts.length !== 2) return { ok: false, reason: 'Formato de código inválido.' };
    const [payloadB64, sigB64] = parts;

    let payload;
    try {
        const payloadBytes = base64UrlToBytes(payloadB64);
        payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch (e) {
        return { ok: false, reason: 'El código está corrupto o incompleto.' };
    }

    if (!payload || payload.d !== expectedDeviceId) {
        return { ok: false, reason: 'Este código no corresponde a este dispositivo.' };
    }

    try {
        const key = await importLicensePublicKey();
        const signatureBytes = base64UrlToBytes(sigB64);
        const dataBytes = new TextEncoder().encode(payloadB64);
        const valid = await crypto.subtle.verify(
            { name: 'RSASSA-PKCS1-v1_5' },
            key,
            signatureBytes.buffer,
            dataBytes.buffer
        );
        if (!valid) return { ok: false, reason: 'Código de activación inválido.' };
        return { ok: true, payload };
    } catch (e) {
        return { ok: false, reason: 'No se pudo verificar el código en este dispositivo.' };
    }
}

// ---- Estado de activación (persistente una vez validado) ----
function getStoredActivation() {
    try { return JSON.parse(localStorage.getItem(LICENSE_ACTIVATED_KEY)); }
    catch (e) { return null; }
}
function saveActivation(deviceId, payload) {
    localStorage.setItem(LICENSE_ACTIVATED_KEY, JSON.stringify({
        deviceId, activatedAt: Date.now(), clientName: payload.n || null
    }));
}

// ---- ¿Está la app en modo demo (sin activar)? ----
// Chequeo simple y síncrono (sin verificar deviceId) para uso en la UI: solo decide si se
// muestran indicadores de "bloqueado" y si se permite abrir ciertas funciones limitadas.
// El bloqueo real de seguridad (con verificación de firma y deviceId) lo hace
// checkLicenseOnStartup() más arriba; esto es únicamente para la experiencia del usuario.
function isDemoLocked() {
    try {
        return !localStorage.getItem(LICENSE_ACTIVATED_KEY);
    } catch (e) {
        return true;
    }
}
window.isDemoLocked = isDemoLocked;

// ---- Seguimiento del período de prueba (con detección de manipulación del reloj) ----
// Usa firstInstallTime del sistema (plugin InstallTime) como ancla principal cuando está
// disponible: no se reinicia al borrar datos de la app, solo al desinstalar/reinstalar.
// Si el plugin no está disponible todavía, cae al respaldo local (localStorage).
async function getTrialStatus() {
    const now = Date.now();
    const systemInstallTime = await getSystemInstallTime();

    let installAt = systemInstallTime || parseInt(localStorage.getItem(TRIAL_INSTALL_KEY), 10);
    let lastSeen = parseInt(localStorage.getItem(TRIAL_LAST_SEEN_KEY), 10);

    if (!installAt) {
        // Primera vez que se abre la app y tampoco hay plugin nativo disponible.
        installAt = now;
    }
    if (!localStorage.getItem(TRIAL_INSTALL_KEY)) {
        localStorage.setItem(TRIAL_INSTALL_KEY, String(installAt));
    }
    if (!lastSeen) lastSeen = now;

    // Si la hora actual retrocede respecto a la última vista, el reloj fue manipulado hacia atrás.
    const tampered = now < lastSeen;
    if (!tampered) {
        localStorage.setItem(TRIAL_LAST_SEEN_KEY, String(now));
    }

    const daysElapsed = Math.floor((now - installAt) / (24 * 60 * 60 * 1000));
    const expired = tampered || daysElapsed >= TRIAL_DAYS;
    const daysRemaining = Math.max(0, TRIAL_DAYS - daysElapsed);
    return { expired, daysRemaining, tampered };
}

// ---- UI del overlay ----
function showTrialBanner(daysRemaining) {
    let banner = document.getElementById('trialBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'trialBanner';
        banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;padding:6px 10px;' +
            'background:#333;color:#fff;font-size:0.72rem;text-align:center;z-index:400;opacity:0.9;';
        document.body.appendChild(banner);
    }
    const text = daysRemaining <= 1
        ? 'Versión de prueba: último día'
        : `Versión de prueba: ${daysRemaining} días restantes`;
    banner.innerText = text;
}

async function showActivationOverlay() {
    document.getElementById('licenseOverlay').classList.add('active');
    document.getElementById('licenseFormBox').style.display = 'block';
    document.getElementById('licenseBlockedBox').style.display = 'none';

    const deviceId = await getDeviceId();
    const deviceIdEl = document.getElementById('licenseDeviceId');
    if (deviceIdEl) deviceIdEl.innerText = deviceId;

    const msg = document.getElementById('licenseMsg');
    if (msg) { msg.innerText = ''; }
}

function showLicenseError(text) {
    const msg = document.getElementById('licenseMsg');
    if (msg) { msg.innerText = text; msg.style.color = 'var(--danger-color)'; }
}

function copyDeviceId() {
    const deviceIdEl = document.getElementById('licenseDeviceId');
    if (!deviceIdEl) return;
    const text = deviceIdEl.innerText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showLicenseError('Código de dispositivo copiado.'));
    }
}

async function activateLicense() {
    const codeInput = document.getElementById('licenseKeyInput');
    const code = (codeInput && codeInput.value || '').trim();
    if (!code) { showLicenseError('Pega el código de activación que te envió el proveedor.'); return; }

    const btn = document.getElementById('licenseActivateBtn');
    btn.disabled = true;
    btn.innerText = 'Verificando...';

    try {
        const deviceId = await getDeviceId();
        const result = await verifyActivationCode(code, deviceId);
        if (!result.ok) { showLicenseError(result.reason); return; }

        saveActivation(deviceId, result.payload);
        document.getElementById('licenseOverlay').classList.remove('active');
        const banner = document.getElementById('trialBanner');
        if (banner) banner.remove();
    } catch (e) {
        showLicenseError('No se pudo verificar el código: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Activar';
    }
}

// ---- Punto de entrada: se ejecuta al cargar la app ----
async function checkLicenseOnStartup() {
    const deviceId = await getDeviceId();

    // Build de "actualización limpia": se auto-activa en silencio, sin trial ni pantalla
    // de bloqueo. Ver el comentario junto a SKIP_LICENSE_CHECK más arriba.
    if (SKIP_LICENSE_CHECK) {
        if (!getStoredActivation()) {
            saveActivation(deviceId, {});
        }
        return;
    }

    const activation = getStoredActivation();

    // Ya activada en este dispositivo: no se vuelve a pedir nada.
    if (activation && activation.deviceId === deviceId) {
        return;
    }

    const trial = await getTrialStatus();
    if (!trial.expired) {
        showTrialBanner(trial.daysRemaining);
        return;
    }

    // Trial vencido (o reloj manipulado) y no activada: bloqueo total hasta introducir código válido.
    await showActivationOverlay();
}

checkLicenseOnStartup();
