// ============ SISTEMA DE LICENCIAS + VINCULACIÓN DE DISPOSITIVO ============
// Requiere: js/firebase-config.js cargado ANTES que este archivo (usa firebaseReady/auth/db).
// Requiere: colección "licenses" en Firestore + firestore.rules (ver archivo en la raíz del repo).
// Ver LICENCIAS.md para instrucciones completas de configuración y administración.

const LICENSE_VALIDITY_DAYS = 30;
const LICENSE_STORAGE_KEY = 'licenseToken';
const LICENSE_COLLECTION = 'licenses';
const LICENSE_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Reintento silencioso cada 6h mientras la app esté abierta

// ---- Almacenamiento local del token de activación ----
function getStoredLicenseToken() {
    try { return JSON.parse(localStorage.getItem(LICENSE_STORAGE_KEY)); }
    catch (e) { return null; }
}
function saveLicenseToken(token) {
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(token));
}
function clearLicenseToken() {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
}

// ---- Identificador de dispositivo (vía @capacitor/device; con respaldo para pruebas en navegador) ----
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
async function getDeviceModel() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Device) {
            const info = await window.Capacitor.Plugins.Device.getInfo();
            return `${info.manufacturer || ''} ${info.model || ''}`.trim() || 'Desconocido';
        }
    } catch (e) {}
    return 'Navegador/Desconocido';
}

// ---- UI del overlay de licencia ----
function showLicenseForm(message, isError) {
    document.getElementById('licenseOverlay').classList.add('active');
    document.getElementById('licenseFormBox').style.display = 'block';
    document.getElementById('licenseBlockedBox').style.display = 'none';
    const msg = document.getElementById('licenseMsg');
    msg.innerText = message || '';
    msg.style.color = isError ? 'var(--danger-color)' : 'var(--text-muted)';
}
function showLicenseBlocked(message) {
    document.getElementById('licenseOverlay').classList.add('active');
    document.getElementById('licenseFormBox').style.display = 'none';
    document.getElementById('licenseBlockedBox').style.display = 'block';
    document.getElementById('licenseBlockedMsg').innerText = message;
}
function hideLicenseOverlay() {
    document.getElementById('licenseOverlay').classList.remove('active');
}

async function ensureLicenseAuth() {
    if (!firebaseReady || !auth) throw new Error('Firebase no está configurado en esta app todavía.');
    if (!auth.currentUser) await auth.signInAnonymously();
}

// ---- Activación (primer uso, requiere internet) ----
async function activateLicense() {
    const email = (document.getElementById('licenseEmail').value || '').trim().toLowerCase();
    const key = (document.getElementById('licenseKeyInput').value || '').trim().toUpperCase();
    if (!email || !key) return showLicenseForm('Ingresa tu correo y tu clave de licencia.', true);
    if (!navigator.onLine) return showLicenseForm('Necesitas conexión a internet para activar la licencia la primera vez.', true);

    const btn = document.getElementById('licenseActivateBtn');
    btn.disabled = true;
    btn.innerText = 'Verificando...';
    try {
        await ensureLicenseAuth();
        const ref = db.collection(LICENSE_COLLECTION).doc(key);
        const snap = await ref.get();
        if (!snap.exists) { showLicenseForm('Clave de licencia inválida.', true); return; }

        const data = snap.data();
        if ((data.email || '').toLowerCase() !== email) { showLicenseForm('El correo no coincide con esta licencia.', true); return; }
        if (data.status === 'revoked') { showLicenseForm('Esta licencia fue revocada.', true); return; }

        const deviceId = await getDeviceId();
        if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
            showLicenseForm('Esta licencia ya está activada en otro dispositivo. Contacta al administrador para liberarla.', true);
            return;
        }

        const deviceModel = await getDeviceModel();
        const now = Date.now();
        const newExpiresAt = now + LICENSE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

        const updates = {
            boundDeviceId: deviceId,
            boundDeviceModel: deviceModel,
            lastCheckAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (!data.boundDeviceId) {
            // Primera activación de esta licencia: fija fecha de activación y vencimiento
            updates.activatedAt = firebase.firestore.FieldValue.serverTimestamp();
            updates.expiresAt = firebase.firestore.Timestamp.fromMillis(newExpiresAt);
        }
        await ref.update(updates);

        saveLicenseToken({
            licenseKey: key,
            email,
            boundDeviceId: deviceId,
            expiresAt: data.expiresAt ? data.expiresAt.toDate().getTime() : newExpiresAt,
            activatedAt: now
        });

        hideLicenseOverlay();
        startLicenseRecheckLoop();
    } catch (e) {
        showLicenseForm('No se pudo verificar la licencia: ' + e.message, true);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Activar';
    }
}

// ---- Revalidación con el servidor (silenciosa cuando hay internet) ----
async function revalidateLicenseOnline(token) {
    try {
        await ensureLicenseAuth();
        const ref = db.collection(LICENSE_COLLECTION).doc(token.licenseKey);
        const snap = await ref.get();
        if (!snap.exists) { clearLicenseToken(); showLicenseBlocked('Esta licencia ya no existe. Contacta al administrador.'); return false; }

        const data = snap.data();
        if (data.status === 'revoked') { clearLicenseToken(); showLicenseBlocked('Esta licencia fue revocada.'); return false; }

        const deviceId = await getDeviceId();
        if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
            clearLicenseToken();
            showLicenseBlocked('Esta licencia está vinculada a otro dispositivo.');
            return false;
        }

        const expiresAtMs = data.expiresAt ? data.expiresAt.toDate().getTime() : token.expiresAt;
        if (Date.now() > expiresAtMs) {
            clearLicenseToken();
            showLicenseBlocked('Tu licencia expiró. Contacta al administrador para renovarla.');
            return false;
        }

        token.expiresAt = expiresAtMs;
        saveLicenseToken(token);
        ref.update({ lastCheckAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        return true;
    } catch (e) {
        // Falla de red pasajera: no bloquea al usuario por esto, ya se validó localmente antes
        return true;
    }
}

function startLicenseRecheckLoop() {
    if (window.__licenseRecheckStarted) return;
    window.__licenseRecheckStarted = true;
    setInterval(async () => {
        if (!navigator.onLine) return;
        const token = getStoredLicenseToken();
        if (token) await revalidateLicenseOnline(token);
    }, LICENSE_RECHECK_INTERVAL_MS);
    window.addEventListener('online', async () => {
        const token = getStoredLicenseToken();
        if (token) await revalidateLicenseOnline(token);
    });
}

// ---- Validación al iniciar la app (funciona sin internet) ----
async function checkLicenseOnStartup() {
    const token = getStoredLicenseToken();
    if (!token) { showLicenseForm(''); return; }

    const deviceId = await getDeviceId();
    if (token.boundDeviceId !== deviceId) {
        clearLicenseToken();
        showLicenseForm('Los datos de esta licencia no coinciden con este dispositivo.', true);
        return;
    }

    if (Date.now() > token.expiresAt) {
        if (navigator.onLine) {
            const ok = await revalidateLicenseOnline(token);
            if (ok) { hideLicenseOverlay(); startLicenseRecheckLoop(); }
        } else {
            showLicenseBlocked('Tu licencia expiró. Conéctate a internet para renovarla.');
        }
        return;
    }

    hideLicenseOverlay();
    startLicenseRecheckLoop();
    if (navigator.onLine) revalidateLicenseOnline(token); // chequeo silencioso, no bloquea el arranque
}

checkLicenseOnStartup();
