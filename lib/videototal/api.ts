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
import { hydrateStorage, readStore, writeStore } from './storage'

// La base la aporta un fichero u otro según el empaquetador: Vite en web y
// escritorio (VITE_*), Metro en Android e iOS (EXPO_PUBLIC_*). Ver ./api-base.ts
// y ./api-base.native.ts.
const RAW_BASE = API_BASE_FROM_ENV
export const API_BASE = (RAW_BASE || 'http://127.0.0.1:8788').replace(/\/+$/, '')

const TOKEN_KEY = 'videototal.session.token'
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
  // Igual que supabase-js: el primer aviso llega de forma asíncrona.
  void Promise.resolve().then(() => {
    if (listeners.has(callback)) callback('INITIAL_SESSION', currentSession)
  })
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
  currentSession = toSession(token, user)
  emit(event)
  return currentSession
}

function clearSession(event: AuthEvent = 'SIGNED_OUT'): void {
  writeStore(TOKEN_KEY, '')
  currentSession = null
  emit(event)
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
    const res = await request<AuthResponse>('/license/activate', {
      method: 'POST',
      body: { code, deviceId: deviceId(), name: deviceName() },
      token: '',
    })
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
   * Restaura la sesión guardada al arrancar. Si el token ya no vale, el
   * servidor responde 401 y se limpia solo.
   */
  async restore(): Promise<void> {
    if (!readStore(TOKEN_KEY)) {
      if (currentSession) clearSession('SIGNED_OUT')
      return
    }
    try {
      const user = await authApi.me()
      acceptSession(readStore(TOKEN_KEY), user, 'SIGNED_IN')
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 0)) {
        // 401: token revocado. Sin red (0): se conserva y se reintentará.
        if (e.status === 401) clearSession('SIGNED_OUT')
      }
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
  void hydrateStorage().then(() => authApi.restore())
}
