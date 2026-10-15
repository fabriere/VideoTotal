/**
 * Base de la API para Android e iOS.
 *
 * Metro (el empaquetador de Expo) no entiende `import.meta.env.VITE_*`: sólo
 * sustituye en tiempo de compilación las variables `process.env.EXPO_PUBLIC_*`.
 * Se definen por perfil en eas.json → build.<perfil>.env.
 *
 * Sin esto el bundle caería al valor por defecto (127.0.0.1) y la app del
 * teléfono no alcanzaría el servidor.
 */
export const API_BASE_FROM_ENV = process.env.EXPO_PUBLIC_VIDEOTOTAL_API
