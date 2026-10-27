/**
 * Comprobaciones de la licencia.
 *
 * El plan y su fecha de caducidad viajan dentro de la sesión, así que todo esto
 * funciona SIN conexión: si el teléfono se queda sin datos, un cliente con
 * licencia sigue dentro, y una prueba caducada sigue caducada.
 *
 * Es una comprobación en el propio teléfono. Frena a quien no sabe nada de
 * programación, que es la inmensa mayoría de la gente; no pretende parar a un
 * técnico, y no hay que engañarse con eso.
 */

export type LicenseState = 'loading' | 'active' | 'missing' | 'expired'

/** ¿La licencia está activa y sin caducar? */
export function isLicenseActive(plan?: string, expiresAt?: string): boolean {
  if (!plan || plan === 'free') {
    return false
  }
  // Sin fecha de caducidad es una licencia perpetua.
  if (!expiresAt) {
    return true
  }
  const fin = new Date(expiresAt).getTime()
  if (Number.isNaN(fin)) {
    // Si la fecha viniera mal, se deja pasar: es peor dejar fuera a alguien
    // que ha pagado que dejar entrar a alguien de más.
    return true
  }
  return fin > Date.now()
}

/**
 * En qué situación está la licencia.
 *
 * 'loading' es importante: al abrir la app, la sesión tarda un instante en
 * restaurarse. Sin este estado, a un cliente con licencia le parpadearía la
 * pantalla de activación durante un segundo cada vez que abre la aplicación.
 */
export function licenseState(loaded: boolean, plan?: string, expiresAt?: string): LicenseState {
  if (!loaded) {
    return 'loading'
  }
  if (!plan || plan === 'free') {
    return 'missing'
  }
  return isLicenseActive(plan, expiresAt) ? 'active' : 'expired'
}

/**
 * ¿Lo que dice el servidor puede pisar la licencia guardada en el teléfono?
 *
 * Solo cuando la respuesta viene de NUESTRA API (`source: 'videototal'`). La
 * consulta devuelve `source: 'none'` cuando todavía no hay token o cuando la
 * sesión no vale; en esos casos NO se toca nada: la licencia guardada manda.
 *
 * Sin esta distinción, un `/me` lento o fallido borraba el plan restaurado del
 * disco y un cliente con licencia veía la pantalla de activación al reabrir la
 * app, sin forma de pasar de ahí.
 */
export function serverEntitlementIsAuthoritative(
  me?: { source?: string } | null,
): boolean {
  return me?.source === 'videototal'
}

/** Días que quedan, redondeando hacia arriba. undefined si es perpetua. */
export function daysLeft(expiresAt?: string): number | undefined {
  if (!expiresAt) {
    return undefined
  }
  const fin = new Date(expiresAt).getTime()
  if (Number.isNaN(fin)) {
    return undefined
  }
  const restante = fin - Date.now()
  if (restante <= 0) {
    return 0
  }
  return Math.ceil(restante / 86_400_000)
}
