# Sistema de Prueba (3 días) + Activación por Código — Guía de uso

Este documento explica el sistema de protección de `www/js/license.js`, diseñado para
funcionar **100% offline** (sin Firebase, sin servidor), pensado para clientes con
conectividad limitada o intermitente.

## Cómo funciona (resumen)

1. Al instalar la app, el cliente puede usarla libremente durante **3 días** (modo
   demo), sin pedir nada. Se muestra un pequeño aviso arriba con los días restantes.
2. Al cumplirse el plazo, la app se **bloquea por completo**: aparece una pantalla que
   muestra el **código de dispositivo** (único por teléfono) y un campo para pegar un
   **código de activación**.
3. El cliente te envía (por WhatsApp, por ejemplo) ese código de dispositivo.
4. Tú generas el código de activación correspondiente **en tu computadora**, con el
   script `generate-license.js` y tu clave privada (nunca viaja dentro de la app).
5. Se lo envías al cliente, lo pega en la app, y queda **activada permanentemente**
   en ese dispositivo — no se le vuelve a pedir nada.

Todo esto ocurre sin depender de internet en ningún paso dentro de la app: la
verificación del código se hace localmente con criptografía (RSA-SHA256 / Web Crypto).

## 1. Archivos importantes

- `www/js/license.js` — lógica embebida en la app (trial + verificación). Contiene
  solo la **clave pública**, que sirve únicamente para *verificar* códigos, no para
  generarlos.
- `generate-license.js` (fuera de este proyecto, en tu PC) — script para generar
  códigos de activación. Requiere `private_key.pem`.
- `private_key.pem` — tu clave privada. **Nunca la incluyas en la app ni la subas a
  ningún repositorio.** Guárdala en un lugar seguro y haz respaldo: si la pierdes, no
  podrás generar más activaciones válidas para las apps ya distribuidas con la clave
  pública actual (tocaría generar un nuevo par de claves y publicar una nueva versión
  del APK con la nueva clave pública embebida).

## 2. Cuando un cliente paga (generar su código de activación)

1. El cliente te envía el **código de dispositivo** que le muestra la pantalla de
   bloqueo (puede copiarlo con el botón "Copiar" y pegarlo en el mensaje).
2. En tu computadora, donde tengas `generate-license.js` y `private_key.pem`:
   ```bash
   node generate-license.js "<codigo-de-dispositivo-del-cliente>" "Nombre del cliente (opcional)"
   ```
3. El script imprime un **código de activación** (una sola línea larga). Envíaselo
   al cliente tal cual, para que lo pegue en el campo "Código de activación" de la app.
4. Al pulsar "Activar", la app verifica la firma localmente y, si es válida y
   corresponde a ese mismo dispositivo, desbloquea la app de forma permanente.

## 3. Notas importantes / limitaciones

- El conteo de 3 días usa como ancla principal `firstInstallTime` del sistema Android,
  leído mediante un pequeño plugin nativo (`InstallTimePlugin`) que el workflow de
  GitHub Actions agrega automáticamente en cada compilación (ver
  `.github/workflows/build-apk.yml`, paso "Agregar plugin nativo InstallTime"). Esta
  fecha la gestiona el propio sistema operativo y **no se reinicia si el cliente borra
  los datos/caché de la app** — solo cambia si la desinstala y la vuelve a instalar.
  Si por algún motivo el plugin no estuviera disponible (por ejemplo, un APK viejo
  compilado antes de este cambio), la app cae automáticamente a un respaldo basado en
  `localStorage`, con detección de manipulación del reloj.
- Cada código de activación está atado a un único `deviceId`, así que no sirve para
  activar la app en otro teléfono distinto al que lo generaste.
- El código de activación no tiene fecha de vencimiento por defecto (activa la app
  para siempre en ese dispositivo). Si quieres licencias con vencimiento (ej. renovación
  anual), se puede agregar un campo de expiración al payload — dime si te interesa.

## 4. Funciones limitadas durante el modo demo

Mientras la app no esté activada (esté en los 3 días de prueba), quedan bloqueadas:

- **Historial de Pagos** (ícono de reloj en la vista de Caja).
- **Gastos / Retiros del Turno** (botón "+ Agregar").
- **Historial de Cuadres** (tabla en la vista de Caja, solo visible para administradores).

Cada una muestra un pequeño candado 🔒 sobre el botón correspondiente, y al intentar
usarla aparece un aviso indicando que está disponible solo en la versión completa. Esta
restricción se activa/desactiva automáticamente según `isDemoLocked()` en
`www/js/license.js`, y desaparece en cuanto la app queda activada con un código válido.

Para agregar más funciones a esta lista en el futuro, el patrón es: al inicio de la
función que abre esa pantalla/modal, verificar `window.isDemoLocked()` y, si es `true`,
llamar a `showDemoLockedMessage('Nombre de la función')` y hacer `return` sin continuar.
