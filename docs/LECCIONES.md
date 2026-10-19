# Lecciones aprendidas con VideoTotal

Todo lo que costó horas sacar, para no repetirlo en la próxima app.

---

## 1. La trampa del botón «Actualizar yt-dlp» (lo peor de todo)

**Síntoma:** las descargas dejan de funcionar de un día para otro con
`[youtube] ...: Please sign in` o `The page needs to be reloaded`.

**Causa real (comprobada):** el botón de actualizar bajó una versión de yt-dlp
**peor** que la que la librería ya traía de fábrica. Se rompió justo después de
pulsarlo.

**Solución:** borrar los datos de la app (`adb shell pm clear <paquete>` o
desinstalar y reinstalar). La librería `youtubedl-android` vuelve a poner su
binario de fábrica y las descargas funcionan.

**Reglas para la próxima app:**
- Si el descargador va bien, **NO tocar el botón de actualizar**. Ni incluirlo,
  o esconderlo en avanzado.
- Si deja de ir, **primero** restaurar el de fábrica (borrar datos), y solo
  después pensar en actualizar.
- El error de YouTube que sí es de verdad (`Requiere un token que yt-dlp aún no
  puede generar` = PO token) sale **por vídeo suelto**, no con todo roto. Si
  fallan TODOS, no es YouTube: es la versión del binario.

---

## 2. Librerías del descargador en Android

- `youtubedl-android 0.17.3` → **funciona**.
- `youtubedl-android 0.18.1` → **rota**: mete `--js-runtimes`, una opción que su
  propio yt-dlp empaquetado no reconoce → `error: no such option: --js-runtimes`.
  No subir sin probar.
- El PC usa `yt-dlp.exe` aparte (versión independiente). **Un PC que descarga no
  demuestra que el móvil pueda**: son dos binarios distintos.

### Cómo probar cambios del descargador SIN recompilar

En el PC existe un `yt-dlp.exe` que funciona. Con él se prueba cualquier opción
nueva en segundos:

```powershell
$yt = "$env:APPDATA\<App>\yt-dlp.exe"
$url = 'https://www.youtube.com/watch?v=XXXXXXXXXXX'
& $yt -f "bestaudio/best" --no-playlist -o "$env:TEMP\a.%(ext)s" $url
& $yt -f "bestaudio/best" --no-playlist --extractor-args "youtube:player_client=tv,ios,android,mweb,web_safari" -o "$env:TEMP\b.%(ext)s" $url
```

Si el PC descarga con la opción nueva, la opción no es el problema.

### Clientes de reserva (intento de esquivar bloqueos)

```kotlin
request.addOption("--extractor-args", "youtube:player_client=tv,ios,android,mweb,web_safari")
```

Probado y **no rompe nada**, pero **no arregla** el bloqueo por PO token.

---

## 3. El candado de licencia (pantalla de PIN)

Trampas encontradas, todas reales:

- **`require()` de imágenes NO funciona en el escritorio (Vite).** Provoca un
  renderer en blanco, sin error visible. En Android (Metro) sí funciona. Usar
  siempre `import icono from '../assets/images/icon.png'`. **Esta fue la causa
  de la ventana blanca del PC.**
- **Leer el campo correcto de la API.** `activate()` devuelve un `ApiUser` con
  `planExpiresAt`, **no** `expiresAt`. Leer `expiresAt` hace que la licencia se
  trate como perpetua sin serlo.
- **Guardar el plan DIRECTAMENTE tras activar**, sin esperar a la sesión ni a la
  consulta: si no, el código se gasta en el servidor y la pantalla sigue
  pidiendo licencia.
- **Licencia perpetua = `duration_days` NULL → `expiresAt` null.**
  `isLicenseActive()` debe devolver `true` cuando no hay fecha. Si no, los
  códigos perpetuos se gastan y no dejan entrar.
- **Un código = un dispositivo.** Al resto se entra con **correo y contraseña**
  (la pantalla debe ofrecerlo siempre, o el segundo teléfono se queda fuera).
- **Reinstalar la app cierra la sesión.** Para pruebas, esperar la pantalla de
  licencia cada vez; para el cliente no, porque instala una sola vez.

---

## 4. El escritorio (Electron + portable)

- La **portable está bien**; el fallo no era de ella.
- La ventana **en blanco** = renderer caído por un error de JS (en este caso,
  el `require`). Para diagnosticar: mirar el bundle `out/renderer/assets/index-*.js`
  y confirmar que los textos de la pantalla están dentro.
- El instalador **NSIS fallaba** (`ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`, antivirus).
  La **portable** funciona.
- **No se puede lanzar Electron desde un shell limitado**: los procesos internos
  no arrancan y parece que "no hace nada". **Quien la abre es el usuario.**
  Verificar con captura de pantalla del usuario, no adivinando.
- El escritorio es **instancia única** (`app.requestSingleInstanceLock()`):
  si ya hay una abierta, la nueva se cierra en silencio con código 0.

---

## 5. Compilación gratis (GitHub Actions)

- Funciona y es gratis (EAS agotaba la cuota: 15 builds/mes).
- Pasos que costaron:
  - `bun link` **antes** de `bun install` (dependencia `link:noutube`), si no:
    `error: Package "noutube" is not linked`.
  - Java 17 (temurin) + Android SDK licenses.
  - Firma con `apksigner` usando los secretos del keystore, en base64.
- **El nombre del APK debe salir de la versión del `package.json`**, no fijo en
  el YAML. Un nombre fijo hizo que una 0.7.9 saliera etiquetada como 0.7.8.

---

## 6. Verificar de verdad, no de palabra

- El teléfono por **adb** permite: leer la versión instalada, `uiautomator dump`
  (texto en pantalla), `screencap` (colores por franjas), `logcat`.
- **Comprobar el certificado**: `keytool -printcert -jarfile <apk>` y comparar la
  huella SHA-256 con la del keystore.
- **Comprobar el hash** del APK descargado del CI.
- **Las capturas del usuario hay que mirarlas dos veces**: confundí cuál era
  nuestra app y cuál la clonada, y saqué la conclusión contraria. Preguntar
  siempre "¿cuál es cuál?" antes de concluir.

---

## 7. Sincronización: qué viaja y qué no

| Sincroniza | NO sincroniza |
|---|---|
| Marcadores | Los archivos descargados |
| Carpetas | |
| Listas de reproducción (URL + título) | |
| Ajustes | |

Los archivos son grandes y cada dispositivo descarga los suyos. Si el usuario
quiere "lo mismo" en dos sitios, la respuesta son las **listas**, no los
archivos.

---

## 8. Códigos de licencia (operación)

- Todo se normaliza: mayúsculas y sin guiones. `FABRI-DUENO-2026` = `FABRIDUENO2026`.
- Para **reponer** un código gastado, no hay que crear otro: borrar su canje y
  poner `uses = 0` en la base de datos.
- Errores típicos de la API: `code_not_found`, `code_exhausted`, `device_limit`.
- Las pruebas de 7 días, los de 30 y 365 días y los perpetuos (`duration_days`
  NULL) se distinguen solo por esa columna.

---

## 9. PowerShell (errores propios)

- `$pid` es **variable reservada** de PowerShell: usar `$appPid`.
- Comillas anidadas en `Select-String`/regex: simplificar el patrón.
- `cmd /c start` para lanzar GUI; `Start-Process` puede quedarse bloqueado.
- Para `screencap` binario: `cmd /c "adb exec-out screencap -p > file"`, no por
  tubería.
- Python con PIL para leer colores: franjas del 12,5 % y buscar rojo (`r>180,
  g<60, b<60`) para saber si el botón rojo está en pantalla.

---

## 10. Resumen de una línea

**El descargador: no tocar el botón de actualizar; si falla, borrar datos.**
**El escritorio: nunca `require` de imágenes, y quien lo abre es el usuario.**
**La licencia: leer `planExpiresAt`, y perpetua = sin fecha = activa.**
**Y no concluir nada sin una prueba en el dispositivo real.**

---

## 11. Ventana flotante (PiP): estaba desactivada, y el WebView sí sirve

Historia completa, porque costó dos vueltas:

- **0.7.14-0.7.15 (18/10)**: se probó el PiP y la ventana abría **en blanco**; se
  quitó la función y se dejó el código nativo dormido (`NouPictureInPicture.kt`
  seguía en el repo, pero el plugin que lo activa no se aplicaba).
- **0.7.18 (19/10)**: el problema real era que `withPictureInPicture` **nunca se
  llamaba** en la cadena de `plugins/withAndroidPlugin.ts`, así que el manifiesto
  no declaraba `supportsPictureInPicture` y al salir de la app solo seguía el
  audio. Se reactivó junto con los `configChanges`
  (`screenSize|smallestScreenSize|screenLayout|orientation`, sin los que el
  sistema recrea la actividad al entrar y salir).
- **Probado en HONOR Magic6 Lite (Android 15, WebView al día)**: la ventana
  flotante **muestra video** con el WebView encogido por CSS. El fallo del
  "cuadro blanco" no se reproduce aquí, porque el motor WebView actual sí compone
  la superficie de video dentro del PiP.

**Se descartó el reproductor nativo** (ExoPlayer/media3) que se llegó a
implementar: la página no puede entregar URLs reproducibles porque YouTube las
devuelve como `signatureCipher` (cifradas) en `getPlayerResponse()`, y los
`blob:` del `<video>` no sirven fuera del WebView. Y no hace falta: la captura
del PiP mostró el video correctamente. Queda el camino anterior (la página se
encoge al video), que es el que funciona.

**Para que el usuario lo encuentre**: el interruptor está en
*Preferencias de YouTube → REPRODUCCIÓN → Pantalla en pantalla* (no en
*Preferencias*, que es la pantalla de VideoTotal y solo tiene GENERAL y PROXY).
Viene **apagado** por defecto (`settings.pictureInPicture`).

Pista de diagnostico: si la ventana abre pero esta en blanco, mirar
pictureInPictureParams en el log del sistema; si es null, la actividad no tiene
configurado el PiP. Con el PiP activo, `dumpsys activity activities` muestra
`mode=pinned` y `mLastReportedPictureInPictureMode=true`.