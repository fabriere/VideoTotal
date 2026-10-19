// Tipo local: ya no dependemos de @supabase/supabase-js (se retiro del cliente).
type UserMetadata = {
  email?: string
  picture?: string
  [key: string]: unknown
}
import { observable } from '@legendapp/state'
import { getStoredSession, getStoredToken } from '@/lib/videototal/api'

interface Store {
  loaded: boolean
  userId: string | undefined
  userEmail: string | undefined
  user: UserMetadata | undefined
  accessToken: string
  plan: string | undefined
  /**
   * Cuándo caduca la licencia.
   *
   * Va aquí, y no sólo en la consulta al servidor, porque la sesión ya lo trae
   * desde el primer momento: si la interfaz lo mirara en la consulta, durante los
   * primeros segundos no habría ni caducidad ni botón de sincronizar.
   */
  planExpiresAt: string | undefined
}

/**
 * Estado inicial tomado de la sesión guardada, de forma SÍNCRONA.
 *
 * En el escritorio el renderer se carga desde `file://`, así que `localStorage`
 * se puede leer aquí mismo, antes de que React pinte nada.
 *
 * El token es tan importante como el plan: `getMeQuery` devuelve `plan: 'free'`
 * cuando `accessToken` está vacío (para no llamar al servidor sin sesión), así
 * que un estado que naciera sin token se marcaba como gratuito en la primera
 * consulta y el cliente con licencia volvía a ver la pantalla de activación en
 * cada apertura. Ese era el fallo: la sesión estaba bien guardada y se releía,
 * pero esta consulta la pisaba antes de que llegara la respuesta de /me.
 *
 * En móvil devuelve vacío hasta que `hydrateStorage()` termina; allí el aviso
 * asíncrono de `restore()` sí llega antes de pintar.
 */
const guardada = getStoredSession()
const tokenGuardado = guardada ? getStoredToken() : ''

export const auth$ = observable<Store>({
  loaded: Boolean(guardada),
  userId: guardada?.id,
  userEmail: guardada?.email || undefined,
  user: undefined,
  accessToken: tokenGuardado,
  plan: guardada?.plan,
  planExpiresAt: guardada?.planExpiresAt ?? undefined,
})
