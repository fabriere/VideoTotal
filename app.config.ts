import 'ts-node/register'

import { ExpoConfig } from 'expo/config'
import { version, versionCode, buildNumber } from './package.json'

const intentFilters = [
  {
    autoVerify: false,
    action: 'VIEW',
    data: ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube.com', 'youtu.be'].map((host) => ({
      scheme: 'https',
      host,
    })),
    category: ['BROWSABLE', 'DEFAULT'],
  },
]

/**
 * ¿Es una compilación de desarrollo?
 *
 * La versión de desarrollo pide el código a un servidor local en vez de llevarlo
 * dentro, así que los cambios se ven en el teléfono en segundos. Para poder
 * tenerla instalada A LA VEZ que la app de verdad, se le da otro identificador y
 * otro nombre: así no se pisan la una a la otra.
 */
const isDev = process.env.APP_VARIANT === 'development'
const appName = isDev ? 'VideoTotal Dev' : 'VideoTotal'
const appId = isDev ? 'com.videototal.app.dev' : 'com.videototal.app'
/**
 * El enlace propio también se cambia en desarrollo.
 *
 * Las dos apps responderían al mismo `noutube://`, y Android preguntaría cuál
 * abrir cada vez. Con enlaces distintos, cada una responde sólo a la suya.
 */
const appScheme = isDev ? 'noutube-dev' : 'noutube'

module.exports = ({ config }: { config: ExpoConfig }) => {
  return {
    name: appName,
    slug: 'videototal',
    version,
    icon: './assets/images/icon.png',
    scheme: appScheme,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      // Identificador propio. El appleTeamId original era el de Nonbili
      // (NXW8RMPV8L) y no se puede usar: hay que eliminarlo o poner el tuyo.
      bundleIdentifier: appId,
      buildNumber,
      infoPlist: {
        // The player keeps going with the screen off and on the lock screen.
        UIBackgroundModes: ['audio'],
        NSMicrophoneUsageDescription: 'Voice search on YouTube uses the microphone.',
      },
    },
    android: {
      versionCode,
      permissions: ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'POST_NOTIFICATIONS', 'WAKE_LOCK'],
      adaptiveIcon: {
        // La capa frontal es el dibujo recortado, sin el marco blanco que traia
        // el original, reducido para que el capibara quede en la zona que
        // Android garantiza que se ve.
        foregroundImage: './assets/images/adaptive-icon.png',
        // Sin icono monocromo a proposito: Android 13+ lo usa para los iconos
        // "tematicos" y necesita una silueta limpia del personaje. Sacarla de
        // este dibujo no sale bien (el pelo naranja y el rosa del borde se
        // confunden), asi que es mejor no darlo que darlo roto. El sistema
        // simplemente muestra el icono normal.
        // El rojo es el medido en el borde del propio dibujo, para que empalme
        // sin que se note la union.
        backgroundColor: '#DC070C',
      },
      predictiveBackGestureEnabled: false,
      package: appId,
      intentFilters,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      './plugins/withAndroidPlugin.ts',
      './plugins/withIosPlugin.ts',
      'expo-router',
      'expo-background-task',
      'expo-notifications',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#f9fafb',
          dark: {
            image: './assets/images/splash-icon.png',
            backgroundColor: '#27272a',
          },
        },
      ],
      'expo-asset',
      'expo-font',
      // Reproductor para los ficheros descargados. Se activan el audio en
      // segundo plano y la ventana flotante, que es lo que se espera de una app
      // de vídeo: seguir escuchando con la pantalla apagada.
      [
        'expo-video',
        {
          supportsBackgroundPlayback: true,
          supportsPictureInPicture: true,
        },
      ],
      'expo-status-bar',
      'expo-image',
      [
        'expo-localization',
        {
          supportedLocales: ['en', 'de', 'es', 'fr', 'id', 'ja', 'pl', 'pt', 'pt-BR', 'ru', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant'],
        },
      ],
      [
        'expo-sharing',
        {
          // No ios entry: the share extension needs the app group
          // group.jp.nonbili.noutube registered with the Apple team before it
          // can be signed. Until then lib/incoming-share.ios.ts stands in.
          android: {
            enabled: true,
            singleShareMimeTypes: ['text/*'],
          },
        },
      ],
      'expo-web-browser',
    ],
    // `eas init` no puede escribir aquí por ser un config dinámico (una
    // función), así que el identificador del proyecto se pone a mano.
    extra: {
      eas: {
        projectId: 'f0a56a7e-6fb1-4e12-8284-a0a78ab994e0',
      },
    },
    experiments: {
      typedRoutes: true,
    },
  }
}
