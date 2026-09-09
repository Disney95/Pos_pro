// ============ CONFIGURACIÓN DE FIREBASE (COMPARTIDA POR license.js Y app.js) ============
const firebaseConfig = {
    apiKey: "AIzaSyC-JWpP08TfsqTiNHxWiCrXau-95DlzTCI",
    authDomain: "pos-profecional.firebaseapp.com",
    projectId: "pos-profecional",
    storageBucket: "pos-profecional.firebasestorage.app",
    messagingSenderId: "856513507875",
    appId: "1:856513507875:web:08234a1a82f430191fb796",
    measurementId: "G-7S0NJQ3SD6"
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
