/**
 * Cuenta y sesión contra la API propia de VideoTotal.
 *
 * Antes: se abría `noutube.inks.page/auth/app` en el navegador del sistema y la
 * web devolvía un token por deep link. Ahora el registro y el acceso ocurren
 * DENTRO de la app, contra nuestro servidor, sin salir a ningún sitio.
 */

import { authApi } from '@/lib/videototal/api'
import { supabase } from './client'

export const signOut = () => supabase.auth.signOut({ scope: 'local' })

/** Crea una cuenta. Lanza ApiError con códigos como `email_taken` o `weak_password`. */
export const signUp = (email: string, password: string) => authApi.signUp(email, password)

/** Inicia sesión. Lanza ApiError `invalid_credentials` si no coincide. */
export const signIn = (email: string, password: string) => authApi.signIn(email, password)

/**
 * Activa una licencia con sólo el código.
 *
 * Es la vía normal de entrada: no pide correo ni contraseña. Si no hay sesión,
 * el servidor crea la cuenta atada a este dispositivo y le aplica el plan.
 * Lanza ApiError con códigos como `code_not_found`, `code_exhausted` o
 * `device_limit`.
 */
export const activateLicense = (code: string) => authApi.activate(code)

/**
 * Añade correo y contraseña a una cuenta activada por código. Opcional: sólo
 * hace falta para entrar desde otro dispositivo.
 */
export const claimAccount = (email: string, password: string) => authApi.claim(email, password)

/**
 * Borra la cuenta y todos sus datos en el servidor (sesiones, dispositivos,
 * marcadores, carpetas, ajustes y estilos, en cascada). Es irreversible.
 */
export const deleteAccount = () => authApi.deleteAccount()

/**
 * Se conserva por compatibilidad con el manejo de deep links (`lib/page.ts` y
 * `NouLink.native.tsx`). Ya no hay token de la web que canjear: el acceso es
 * directo contra la API.
 */
export const onReceiveAuthUrl = (_url: string) => {
  // Intencionadamente vacío.
}
