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

- El conteo de 3 días se basa en la fecha de instalación guardada localmente en el
  dispositivo, con detección de manipulación del reloj (si el cliente atrasa la hora
  del teléfono para alargar la prueba, la app lo detecta y bloquea igual). Esto no es
  infalible al 100% sin acceso a hora del sistema operativo a nivel nativo, pero
  cubre el caso normal de uso.
- Si el cliente borra los datos de la app (o la desinstala y reinstala), el contador
  de prueba se reinicia. Esto es una limitación conocida de un sistema puramente
  basado en JavaScript/almacenamiento local; para cerrarla del todo se necesitaría un
  pequeño plugin nativo de Android que lea `firstInstallTime` del sistema (que no se
  reinicia al borrar datos, solo al desinstalar). Se puede agregar más adelante si
  hace falta más robustez.
- Cada código de activación está atado a un único `deviceId`, así que no sirve para
  activar la app en otro teléfono distinto al que lo generaste.
- El código de activación no tiene fecha de vencimiento por defecto (activa la app
  para siempre en ese dispositivo). Si quieres licencias con vencimiento (ej. renovación
  anual), se puede agregar un campo de expiración al payload — dime si te interesa.
