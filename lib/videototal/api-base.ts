/**
 * Base de la API para web y escritorio.
 *
 * Aquí el empaquetador es Vite (electron-vite), que sustituye
 * `import.meta.env.VITE_*` en tiempo de compilación a partir de los ficheros
 * .env (ver desktop/.env).
 *
 * En móvil manda `api-base.native.ts`, porque Metro no entiende esta
 * convención y usa `process.env.EXPO_PUBLIC_*`.
 */
export const API_BASE_FROM_ENV = (import.meta as any).env?.VITE_VIDEOTOTAL_API as string | undefined
