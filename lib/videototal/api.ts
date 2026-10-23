/**
 * Cliente de la API propia de VideoTotal.
 *
 * Sustituye a `@supabase/supabase-js`. La app habla con NUESTRO servidor, que
 * es donde vive el control de acceso: si la cuenta no tiene licencia, es el
 * servidor quien rechaza la sincronización con 402, no un candado en el cliente.
 *
 * Compatible con el runtime web (Electron) y, degradando, con nativo: si no hay
 * almacenamiento persistente disponible, la sesión vive sólo en memoria.
 */

import { API_BASE_FROM_ENV } from './api-base'
import { hydrateStorage, isStorageHydrated, readStore, writeStore } from './storage'

// La base la aporta un fichero u otro según el empaquetador: Vite en web y
// escritorio (VITE_*), Metro en Android e iOS (EXPO_PUBLIC_*). Ver ./api-base.ts
// y ./api-base.native.ts.
const RAW_BASE = API_BASE_FROM_ENV
export const API_BASE = (RAW_BASE || 'http://127.0.0.1:8788').replace(/\/+$/, '')

const TOKEN_KEY = 'videototal.session.token'
// Copia de la sesión (token + plan + caducidad) para poder restaurarla en frío
// sin red: la licencia debe comprobarse sin conexión, no depender de un /me.
const SESSION_KEY = 'videototal.session.data'
const DEVICE_KEY = 'videototal.device.id'

// ---------------------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------------------
// Vive en ./storage (web, síncrono con localStorage) y ./storage.native
// (Android/iOS, con espejo en memoria hidratado desde AsyncStorage). Metro
// elige el fichero .native automáticamente en móvil.

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }

  /** El servidor exige una licencia activa para este recurso. */
  get planRequired(): boolean {
    return this.code === 'plan_required'
  }

  get deviceLimit(): boolean {
    return this.code === 'device_limit'
  }
}

// ---------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------
let onUnauthorized: (() => void) | null = null

/** Permite que la capa de auth reaccione a un token caducado o revocado. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = options.token ?? readStore(TOKEN_KEY)
  if (token) headers.authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['content-type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method: options.method || (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (e) {
    // Sin red: no es un error de credenciales, y la app debe seguir usable.
    throw new ApiError('network_error', 'No se pudo contactar con el servidor.', 0)
  }

  const text = await res.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!res.ok) {
    const code = payload?.error?.code || `http_${res.status}`
    const message = payload?.error?.message || `HTTP ${res.status}`
    if (res.status === 401) onUnauthorized?.()
    throw new ApiError(code, message, res.status)
  }
  return payload as T
}

// ---------------------------------------------------------------------------
// Dispositivo: identificador estable por instalación + nombre legible
// ---------------------------------------------------------------------------
export function deviceId(): string {
  let id = readStore(DEVICE_KEY)
  if (!id) {
    const random =
      globalThis.crypto?.randomUUID?.() ||
      `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    id = random
    writeStore(DEVICE_KEY, id)
  }
  return id
}

export function deviceName(): string {
  try {
    const ua = globalThis.navigator?.userAgent || ''
    const platform = /Windows/i.test(ua)
      ? 'Windows'
      : /Macintosh|Mac OS X/i.test(ua)
        ? 'macOS'
        : /Linux/i.test(ua)
          ? 'Linux'
          : /Android/i.test(ua)
            ? 'Android'
            : /iPhone|iPad/i.test(ua)
              ? 'iOS'
              : 'Dispositivo'
    return `${platform} · VideoTotal`
  } catch {
    return 'VideoTotal'
  }
}

// ---------------------------------------------------------------------------
// Sesiones y estado de autenticación
// ---------------------------------------------------------------------------
export interface ApiUser {
  id: string
  email: string
  plan: string
  planExpiresAt: string | null
  deviceLimit: number
  devices: Array<{ deviceId: string; name: string | null; lastSeenAt: string }>
  syncEnabled: boolean
}

export interface ApiSession {
  access_token: string
  user: {
    id: string
    email: string
    user_metadata: Record<string, unknown>
  }
}

export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED'

type Listener = (event: AuthEvent, session: ApiSession | null) => void

let currentSession: ApiSession | null = null
const listeners = new Set<Listener>()

function toSession(token: string, user: ApiUser): ApiSession {
  return {
    access_token: token,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: { plan: user.plan, planExpiresAt: user.planExpiresAt },
    },
  }
}

function emit(event: AuthEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event, currentSession)
    } catch {
      /* un listener roto no debe tumbar a los demás */
    }
  }
}

export function getSession(): ApiSession | null {
  return currentSession
}

export function onAuthStateChange(callback: Listener): { data: { subscription: { unsubscribe: () => void } } } {
  listeners.add(callback)
  // El aviso inicial lo emite `restore()` cuando termina la hidratación: así el
  // estado de carga no se marca como terminado antes de saber si hay sesión, y
  // a un cliente con licencia no le parpadea la pantalla de activación.
  return {
    data: {
      subscription: {
        unsubscribe: () => {
          listeners.delete(callback)
        },
      },
    },
  }
}

function acceptSession(token: string, user: ApiUser, event: AuthEvent): ApiSession {
  writeStore(TOKEN_KEY, token)
  persistSession(token, user)
  currentSession = toSession(token, user)
  emit(event)
  return currentSession
}

function clearSession(event: AuthEvent = 'SIGNED_OUT'): void {
  writeStore(TOKEN_KEY, '')
  writeStore(SESSION_KEY, '')
  currentSession = null
  emit(event)
}

/** Guarda lo imprescindible para restaurar la licencia sin red. */
function persistSession(token: string, user: ApiUser): void {
  writeStore(
    SESSION_KEY,
    JSON.stringify({
      token,
      userId: user.id,
      email: user.email,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
    }),
  )
}

/** Lee la sesión guardada en el arranque anterior, si existe y tiene plan. */
function readStoredSession(): ApiUser | null {
  const raw = readStore(SESSION_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as {
      userId?: string
      email?: string
      plan?: string
      planExpiresAt?: string | null
    }
    if (!data || !data.plan || !data.userId) return null
    return {
      id: data.userId,
      email: data.email ?? '',
      plan: data.plan,
      planExpiresAt: data.planExpiresAt ?? null,
      deviceLimit: 0,
      devices: [],
      syncEnabled: false,
    }
  } catch {
    return null
  }
}

/**
 * Sesión guardada (token + plan), de forma SÍNCRONA.
 *
 * En web/escritorio el almacenamiento es síncrono, así que se puede leer antes
 * del primer render y rellenar el plan sin esperar a ningún aviso asíncrono.
 * En móvil devuelve null hasta que `hydrateStorage()` termina; allí el aviso
 * asíncrono sí llega antes de pintar.
 */
export function getStoredSession(): ApiUser | null {
  return readStore(TOKEN_KEY) ? readStoredSession() : null
}

/**
 * Token guardado, de forma síncrona.
 *
 * Hace falta en el arranque: `getMeQuery` devuelve el plan 'free' si
 * `auth$.accessToken` está vacío, así que si el estado naciera sin token la
 * consulta marcaría 'free' y el cliente con licencia vería la pantalla de
 * activación en cada apertura.
 */
export function getStoredToken(): string {
  return readStore(TOKEN_KEY)
}

// Si el servidor responde 401, la sesión ya no vale: se limpia sola.
setUnauthorizedHandler(() => {
  if (currentSession) clearSession('SIGNED_OUT')
})

// ---------------------------------------------------------------------------
// Operaciones de autenticación
// ---------------------------------------------------------------------------
interface AuthResponse {
  access_token: string
  user: ApiUser
}

async function registerDevice(): Promise<void> {
  try {
    await request('/devices', {
      method: 'POST',
      body: { deviceId: deviceId(), name: deviceName() },
    })
  } catch (e) {
    // El límite de dispositivos se comunica en la interfaz; no impide entrar.
    if (e instanceof ApiError && e.deviceLimit) throw e
  }
}

export const authApi = {
  async signUp(email: string, password: string): Promise<ApiUser> {
    const res = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password },
      token: '',
    })
    const session = acceptSession(res.access_token, res.user, 'SIGNED_IN')
    try {
      await registerDevice()
    } catch {
      /* seguimos: el aviso de límite se muestra en Ajustes */
    }
    void session
    return res.user
  },

  async signIn(email: string, password: string): Promise<ApiUser> {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      token: '',
    })
    acceptSession(res.access_token, res.user, 'SIGNED_IN')
    try {
      await registerDevice()
    } catch {
      /* idem */
    }
    return res.user
  },

  /**
   * Activación por PIN: la puerta de entrada normal del producto.
   *
   * No pide correo ni contraseña. Si no hay sesión, el servidor crea la cuenta
   * atada a este dispositivo y le aplica la licencia del código; si ya la hay,
   * se la aplica a esa cuenta. Se llama sin token a propósito: el token que
   * devuelve es el de la cuenta recién creada.
   */
  async activate(code: string): Promise<ApiUser> {
    const body = { code, deviceId: deviceId(), name: deviceName() }
    const attempt = () =>
      request<AuthResponse>('/license/activate', {
        method: 'POST',
        body,
        token: '',
      })
    let res: AuthResponse
    try {
      res = await attempt()
    } catch (e) {
      // Sin red (status 0) puede que el servidor ya hubiera consumido el código
      // justo antes de cortarse la respuesta. Se reintenta una sola vez: la
      // activación es idempotente por dispositivo, así que el reintento devuelve
      // la sesión de la cuenta que ya canjeó el código en vez de "agotado".
      if (!(e instanceof ApiError) || e.status !== 0) throw e
      res = await attempt()
    }
    // El servidor ya registró el dispositivo durante la activación.
    acceptSession(res.access_token, res.user, 'SIGNED_IN')
    return res.user
  },

  /**
   * Añade correo y contraseña a una cuenta activada por PIN.
   *
   * Opcional: sólo hace falta para poder entrar desde otro dispositivo sin
   * depender del código y del dispositivo donde se activó.
   */
  async claim(email: string, password: string): Promise<ApiUser> {
    return request<ApiUser>('/auth/claim', { method: 'POST', body: { email, password } })
  },

  async signOut(): Promise<void> {
    try {
      if (readStore(TOKEN_KEY)) await request('/auth/logout', { method: 'POST' })
    } catch {
      /* da igual: la sesión local se borra igualmente */
    }
    clearSession('SIGNED_OUT')
  },

  /** Perfil y plan actuales. Es la única fuente de verdad sobre la licencia. */
  async me(): Promise<ApiUser> {
    return request<ApiUser>('/me')
  },

  /** Canjea un código de licencia. El servidor decide el plan resultante. */
  async redeem(code: string): Promise<ApiUser> {
    return request<ApiUser>('/license/redeem', { method: 'POST', body: { code } })
  },

  /** Borra la cuenta y todos sus datos en el servidor. */
  async deleteAccount(): Promise<void> {
    await request('/me', { method: 'DELETE' })
    clearSession('SIGNED_OUT')
  },

  /**
   * Restaura la sesión guardada al arrancar.
   *
   * Primero se restaura en frío desde lo guardado (token + plan + caducidad),
   * para que la licencia se compruebe sin conexión y la pantalla de activación
   * no parpadee mientras el servidor responde. Después se refresca con /me; si
   * el token ya no vale (401), se limpia solo.
   */
  async restore(): Promise<void> {
    // Si el almacenamiento no se ha podido leer todavía, no se puede concluir
    // "no hay sesión": se saldría a la pantalla de licencia con una licencia
    // guardada. Se deja el estado en carga y `ensureSessionRestored` reintenta.
    if (!isStorageHydrated()) {
      return
    }

    const token = readStore(TOKEN_KEY)
    if (!token) {
      currentSession = null
      emit('INITIAL_SESSION')
      return
    }

    // Restauración en frío: el plan guardado entra al instante.
    const saved = readStoredSession()
    if (saved) {
      currentSession = toSession(token, saved)
      emit('INITIAL_SESSION')
    }

    try {
      const user = await authApi.me()
      acceptSession(token, user, 'SIGNED_IN')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Token revocado: se limpia y se vuelve a la pantalla de licencia.
        clearSession('SIGNED_OUT')
      } else if (!saved) {
        // Hay token pero no plan guardado y el servidor no responde: sin datos
        // no se puede dejar la pantalla en "cargando" para siempre.
        currentSession = null
        emit('INITIAL_SESSION')
      }
      // Sin red (0) u otro error con plan guardado: se conserva lo guardado.
    }
  },
}

let restoreStarted = false
/** Arranca la restauración de sesión una sola vez. */
export function ensureSessionRestored(): void {
  if (restoreStarted) return
  restoreStarted = true
  // En móvil hay que volcar AsyncStorage en memoria ANTES de leer el token:
  // si no, la sesión se perdería en cada arranque.
  void (async () => {
    try {
      await hydrateStorage()
    } catch {
      // No se pudo leer el almacenamiento (memoria justa, SQLite bloqueado).
      // NO se puede decidir que no hay licencia: se reintenta en un momento y
      // mientras tanto el estado sigue en "cargando", no en la pantalla de
      // activación. Así no se le pide el código a quien ya lo activó.
      restoreStarted = false
      setTimeout(ensureSessionRestored, 800)
      return
    }
    await authApi.restore()
  })()
}
