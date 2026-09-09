# Sistema de Licencias — Guía de configuración y administración

Este documento explica cómo dejar funcionando la protección contra reenvío del APK
(licencia + vinculación de dispositivo) que se agregó en `www/js/license.js`.

## Cómo funciona (resumen)

1. Al abrir la app por primera vez, se pide **correo + clave de licencia** (necesita
   internet solo esa primera vez).
2. La app identifica el dispositivo (usando `@capacitor/device`) y lo vincula a esa
   licencia en Firestore. Guarda un token local con una vigencia de **30 días**.
3. En cada apertura posterior, la app valida el token localmente — **sin necesitar
   internet**. Si el dispositivo no coincide (por ejemplo, copiaron los datos de la
   app a otro teléfono), se bloquea.
4. Cuando hay internet disponible, la app revisa en silencio si la licencia sigue
   activa. Si el administrador la revocó o venció, se borra el token local y la app
   se bloquea.

## 1. Configura tu proyecto de Firebase

1. Completa `www/js/firebase-config.js` con las credenciales reales de tu proyecto
   de Firebase (reemplaza `TU_API_KEY`, `TU_PROJECT_ID`, etc.). Esta es la **misma**
   configuración que usa el respaldo en la nube de Ajustes, así que solo hay que
   llenarla una vez.
2. En Firebase Console → **Authentication** → Sign-in method, activa el proveedor
   **Anónimo** (Anonymous). La app lo usa para poder leer/escribir en Firestore de
   forma segura sin pedirle una cuenta de Google al cliente final.
3. En Firebase Console → **Firestore Database**, crea la base de datos si no existe.
4. Ve a la pestaña **Reglas** y pega el contenido del archivo [`firestore.rules`](firestore.rules)
   de este repositorio. Publica los cambios.

## 2. Crear una licencia nueva (cuando vendes la app a un cliente)

En Firebase Console → Firestore Database → colección `licenses` → **Agregar documento**:

- **ID del documento:** la clave de licencia en sí, en MAYÚSCULAS (ej. `POS-8F3K-QX92`).
  Es lo que el cliente escribirá en la app, así que puede ser lo que tú quieras
  (recomendado: algo fácil de copiar/dictar por teléfono).
- Campos del documento:
  | Campo | Tipo | Valor |
  |---|---|---|
  | `email` | string | el correo del cliente (debe coincidir exacto con lo que escriba en la app) |
  | `status` | string | `active` |
  | `boundDeviceId` | null | déjalo vacío/null — se llena solo cuando el cliente activa |

Los campos `activatedAt`, `expiresAt`, `boundDeviceModel` y `lastCheckAt` los llena
la app automáticamente en la primera activación — no hace falta crearlos a mano.

## 3. Revocar una licencia (ej. cliente dejó de pagar, o piratería detectada)

En el documento de esa licencia, cambia el campo `status` a `revoked`. La próxima
vez que ese dispositivo tenga internet (o si lo requieres de inmediato, en el
siguiente intento de apertura ya sin conexión seguirá funcionando hasta que se
conecte una vez), la app detectará el cambio y se bloqueará sola.

## 4. Liberar un dispositivo (cliente legítimo cambió de teléfono)

En el documento de esa licencia, borra el valor del campo `boundDeviceId` (déjalo
en blanco/null). La próxima vez que el cliente escriba su correo + clave de
licencia en el nuevo teléfono, la app la vinculará a ese nuevo dispositivo.

## 5. Extender la vigencia (renovación)

Edita el campo `expiresAt` del documento y ponle una fecha más adelante (en la
consola de Firebase puedes elegir un campo tipo "timestamp" y seleccionar la fecha
con el selector de calendario).

## Notas importantes / limitaciones de este enfoque

- **Identificador de dispositivo:** se usa el ID que genera `@capacitor/device`
  (persistente mientras no se desinstale la app o se borren sus datos), no el
  `ANDROID_ID` nativo real — Android moderno restringe el acceso a identificadores
  de hardware reales desde apps normales. Esto es suficiente para detectar el
  reenvío del APK a otro teléfono, pero no es a prueba de un usuario técnicamente
  avanzado con acceso root que edite los datos de la app directamente.
- **Verificación periódica:** al ser una app web empaquetada (Capacitor), no existe
  un "worker" nativo en segundo plano que revise la licencia con la app cerrada.
  La revisión ocurre cada vez que se abre la app, cuando vuelve la conexión a
  internet, y además cada 6 horas mientras la app permanece abierta en primer plano.
- Si más adelante quieres protección a nivel de chip (Android Keystore, resistente
  incluso a root) o un worker verdaderamente nativo en segundo plano, eso requiere
  escribir un plugin nativo en Kotlin para Capacitor — es un paso posterior, no
  incluido en esta versión.
- **Lectura de licencias:** cualquier dispositivo autenticado (de forma anónima)
  puede *leer* cualquier documento de la colección `licenses` si adivina la clave
  exacta (no puede modificarlo, solo verlo). Por eso conviene generar claves largas
  y no consecutivas (ej. `POS-8F3K-QX92` en vez de `CLIENTE-001`), para que no sean
  adivinables.
