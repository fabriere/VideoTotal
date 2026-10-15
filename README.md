# VideoTotal

Aplicación de vídeo para **Android** y **escritorio**, creada a partir de
[NouTube](https://github.com/nonbili/NouTube), del que es un **fork**.

> **VideoTotal es un fork de NouTube.** El código original es de Nonbili Inc. y se
> distribuye bajo la licencia **AGPL-3.0** (ver [LICENSE](./LICENSE)). Este
> repositorio publica el código completo de la versión modificada, tal y como esa
> misma licencia exige. El README original se conserva en
> [README-NouTube.md](./README-NouTube.md).

## Qué es

Un reproductor de YouTube para Android y escritorio, sin anuncios y con funciones
que la aplicación oficial no tiene: descargas, reproducción con la pantalla
apagada, cola de reproducción, listas y sincronización entre dispositivos.

## Qué añade este fork

Sobre el proyecto original, VideoTotal incorpora:

- **Activación por PIN**: el acceso a la sincronización se activa con un código,
  sin necesidad de crear una cuenta con correo y contraseña. Después, si se
  quiere usar la misma cuenta en otro dispositivo, se le pueden añadir
  credenciales.
- **Servicio de sincronización propio**: API y base de datos propias, con
  licencias, límite de dispositivos y caducidad de planes.
- **Listas de reproducción** hechas con los vídeos descargados, que se reproducen
  seguidas y se sincronizan entre dispositivos.
- **Reproductor propio** para los ficheros descargados, sin salir de la
  aplicación.
- **Pantalla de descargas** con el estado de cada una y aviso cuando el fichero
  ya no está en el teléfono.
- **Sincronización al volver a la aplicación**, para no tener que esperar ni
  cerrarla.
- Identidad propia: nombre, icono y textos.

## Estructura

| Carpeta | Qué contiene |
| --- | --- |
| `app/`, `components/`, `lib/`, `states/` | La aplicación (Expo / React Native) |
| `desktop/` | La versión de escritorio (Electron) |
| `extension/` | La extensión de navegador |
| `modules/nou-tube-view/` | Módulo nativo del visor web |
| `assets/` | Iconos e imágenes |

El servidor de sincronización vive en un repositorio aparte.

## Compilar

Requisitos: [Bun](https://bun.sh) y, para Android, el SDK de Android o una cuenta
de [EAS](https://expo.dev).

```sh
bun install

# Aplicación de escritorio
cd desktop && bun run build

# Android (APK, con EAS)
bunx eas build --profile preview --platform android
```

Para compilar firmando con tu propia clave, coloca el almacén en `keystores/` y
crea un `credentials.json` en la raíz; ambos están excluidos del repositorio. El
formato está descrito en la
[documentación de Expo](https://docs.expo.dev/app-signing/local-credentials/).

## Licencia y atribución

- **Licencia**: [AGPL-3.0](./LICENSE), la misma del proyecto original.
- **Origen**: [NouTube](https://github.com/nonbili/NouTube), de Nonbili Inc.
- **Autor de este fork**: Fabriere.

Al usar, modificar o redistribuir este código debes mantener estos avisos y
publicar el código fuente de tus versiones, tal y como exige la AGPL-3.0.
