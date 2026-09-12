# POS Pro — App de Punto de Venta

App web (HTML/CSS/JS) empaquetada con Capacitor para generar un APK de Android, compilada automáticamente en la nube con GitHub Actions.

## Usuarios por defecto (cámbialos en Ajustes → Usuarios y Contraseñas)
- Administrador: admin123
- Cajero: cajero123

## Cómo obtener el APK
1. Ve a la pestaña Actions de este repositorio.
2. Espera a que el workflow "Compilar APK Android" termine (ícono verde).
3. Entra al resultado y descarga el archivo **pos-pro-apk-firmado** en la sección Artifacts (es un .zip con el `app-release.apk` adentro, firmado siempre con la misma llave).
4. Instala ese APK en tu celular Android (activa "instalar de fuentes desconocidas" si te lo pide).

> ⚠️ Usa siempre **pos-pro-apk-firmado** para instalar o actualizar en el celular de un cliente. El artefacto `pos-pro-apk-debug` es solo para pruebas rápidas tuyas: se firma con una llave distinta en cada compilación, así que si se lo instalas a un cliente que ya tiene la app activada, Android le pedirá desinstalar primero y **perderá la licencia activada, las contraseñas y el conteo de la prueba gratuita**.
