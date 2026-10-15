/**
 * Consultas de cuenta y plan contra la API propia de VideoTotal.
 *
 * Sustituye al servicio `a.inks.page` de Nonbili. Sigue devolviendo el mismo
 * tipo `NoutubeEntitlement` para que los componentes que ya lo usan
 * (`SettingsModalTabSync`, `MainPageContent`, `SettingsTree`) no cambien.
 *
 * El plan que llega aquí es el del SERVIDOR. El cliente nunca lo inventa ni lo
 * cachea como verdad: si el servidor dice `free`, no hay sincronización.
 */

import { UseQueryOptions } from '@tanstack/react-query'
import { auth$ } from '@/states/auth'
import { API_BASE, ApiError, authApi } from '@/lib/videototal/api'

export interface NoutubeIosEntitlement {
  status: string
  productId?: string | null
  expiresAt?: string | null
  willRenew?: boolean | null
  linkedEmail?: string | null
}

export interface NoutubeEntitlement {
  plan: string
  source: 'none' | 'stripe' | 'app_store' | 'videototal'
  email?: string | null
  expiresAt?: string | null
  deviceLimit?: number
  syncEnabled?: boolean
  ios?: NoutubeIosEntitlement | null
}

const defaultEntitlement: NoutubeEntitlement = {
  plan: 'free',
  source: 'none',
}

export const getMeQuery = (options?: Partial<UseQueryOptions<NoutubeEntitlement>>) => ({
  queryKey: ['me'],
  queryFn: async (): Promise<NoutubeEntitlement> => {
    if (!auth$.accessToken.get()) {
      return defaultEntitlement
    }
    try {
      const me = await authApi.me()
      return {
        plan: me.plan,
        source: 'videototal',
        email: me.email,
        expiresAt: me.planExpiresAt,
        deviceLimit: me.deviceLimit,
        syncEnabled: me.syncEnabled,
      }
    } catch (e) {
      // Sin licencia o sin sesión: la app sigue funcionando, simplemente no
      // sincroniza. No es un error que deba romper la interfaz.
      if (e instanceof ApiError && (e.status === 401 || e.status === 402)) {
        return defaultEntitlement
      }
      throw e
    }
  },
  staleTime: 15 * 60 * 1000,
  ...options,
})

/** Canje de un código de licencia. Devuelve el plan ya actualizado. */
export const redeemLicense = async (code: string): Promise<NoutubeEntitlement> => {
  const me = await authApi.redeem(code)
  return {
    plan: me.plan,
    source: 'videototal',
    email: me.email,
    expiresAt: me.planExpiresAt,
    deviceLimit: me.deviceLimit,
    syncEnabled: me.syncEnabled,
  }
}

export interface WebAuthLinkResponse {
  token?: string | null
}

/**
 * La compra desde la App Store no forma parte de esta distribución de
 * escritorio. Se mantienen las funciones para no romper importaciones, pero
 * fallan de forma explícita en lugar de simular un éxito.
 */
export const fetchWebAuthLink = async (_accessToken: string): Promise<WebAuthLinkResponse> => ({
  token: null,
})

export const prepareIosPurchase = async () => {
  throw new Error('La compra desde la App Store no está disponible en esta versión.')
}

export const syncIosTransaction = async (_signedTransactionInfo: string) => {
  throw new Error('La compra desde la App Store no está disponible en esta versión.')
}

/** Utilidad para mostrar la URL configurada (diagnóstico en Ajustes). */
export const apiBaseUrl = API_BASE
