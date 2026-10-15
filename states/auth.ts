// Tipo local: ya no dependemos de @supabase/supabase-js (se retiro del cliente).
type UserMetadata = {
  email?: string
  picture?: string
  [key: string]: unknown
}
import { observable } from '@legendapp/state'

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

export const auth$ = observable<Store>({
  loaded: false,
  userId: undefined,
  userEmail: undefined,
  user: undefined,
  accessToken: '',
  plan: undefined,
  planExpiresAt: undefined,
})
