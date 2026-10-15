/**
 * Adaptador compatible con la superficie de `supabase-js` que usa la app,
 * pero hablando con NUESTRA API en lugar de con Supabase.
 *
 * Existe para no tocar `lib/supabase/sync/*.ts`: la lógica de sincronización de
 * NouTube (incluida su resolución de conflictos "last write wins") se queda tal
 * cual. Sólo cambia a quién le pregunta.
 *
 * Métodos que la app realmente usa (comprobado leyendo el código):
 *   from(t).select(cols).order(col,{ascending}).range(a,b)   -> lista
 *   from(t).upsert(rows)                                    -> escritura por lotes
 *   from(t).select('json,updated_at').single()              -> documento
 *   from(t).upsert({user_id,json}).select('json,updated_at').single()
 *   auth.onAuthStateChange / getSession / signOut / signUp / signInWithPassword
 */

import {
  ApiError,
  authApi,
  ensureSessionRestored,
  getSession,
  onAuthStateChange,
  request,
} from '@/lib/videototal/api'

interface ResourceMapping {
  resource: string
  document: boolean
}

const RESOURCES: Record<string, ResourceMapping> = {
  nou_bookmarks: { resource: 'bookmarks', document: false },
  nou_folders: { resource: 'folders', document: false },
  // Listas de reproducción: mismas tablas y misma forma que las carpetas.
  nou_playlists: { resource: 'playlists', document: false },
  nou_settings: { resource: 'settings', document: true },
  nou_user_styles: { resource: 'user-styles', document: true },
}

interface PostgrestLikeError {
  code: string
  message: string
}

interface QueryResult<T> {
  data: T
  error: PostgrestLikeError | null
}

/**
 * Constructor de consultas con la misma forma que el de PostgREST: se encadena
 * y se espera con await (implementa `then`, así que es "thenable").
 */
class QueryBuilder<T = any> implements PromiseLike<QueryResult<T>> {
  private columns = '*'
  private ascending = false
  private start = 0
  private end = 999
  private mode: 'select' | 'upsert' = 'select'
  private payload: any = null

  constructor(private readonly table: string) {}

  select(columns?: string): this {
    if (columns) this.columns = columns
    // Tras un upsert, `.select()` sólo pide que se devuelva la fila.
    if (this.mode !== 'upsert') this.mode = 'select'
    else this.mode = 'upsert'
    return this
  }

  order(_column: string, options?: { ascending?: boolean }): this {
    this.ascending = options?.ascending === true
    return this
  }

  range(from: number, to: number): this {
    this.start = from
    this.end = to
    return this
  }

  single(): this {
    // La API ya devuelve un objeto único en los documentos; sólo hay que
    // recordar que se espera esa forma.
    return this
  }

  upsert(payload: any): this {
    this.mode = 'upsert'
    this.payload = payload
    return this
  }

  then<R1 = QueryResult<T>, R2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult<T>> {
    const mapping = RESOURCES[this.table]
    if (!mapping) {
      return {
        data: null as unknown as T,
        error: { code: 'unknown_table', message: `Tabla no soportada por el adaptador: ${this.table}` },
      }
    }

    try {
      if (this.mode === 'upsert') {
        if (mapping.document) {
          const res = await request<{ data: any }>(`/sync/${mapping.resource}/document`, {
            method: 'PUT',
            body: { json: this.payload?.json ?? {} },
          })
          return { data: res.data as T, error: null }
        }
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
        await request(`/sync/${mapping.resource}`, { method: 'POST', body: { rows } })
        return { data: [] as unknown as T, error: null }
      }

      if (mapping.document) {
        const res = await request<{ data: any }>(`/sync/${mapping.resource}/document`)
        return { data: res.data as T, error: null }
      }

      const query = `?ascending=${this.ascending ? 'true' : 'false'}&start=${this.start}&end=${this.end}`
      const res = await request<{ data: any[] }>(`/sync/${mapping.resource}${query}`)
      return { data: res.data as unknown as T, error: null }
    } catch (e) {
      if (e instanceof ApiError) {
        // 404 en un documento significa "no hay fila remota", que el cliente
        // distingue por el código PGRST116. Cualquier otro error se propaga.
        const code = e.status === 404 && mapping.document ? 'PGRST116' : e.code
        return { data: null as unknown as T, error: { code, message: e.message } }
      }
      return {
        data: null as unknown as T,
        error: { code: 'unexpected_error', message: e instanceof Error ? e.message : String(e) },
      }
    }
  }
}

export const supabase = {
  from<T = any>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table)
  },

  auth: {
    onAuthStateChange(callback: (event: string, session: any) => void) {
      // El primer suscriptor arranca la restauración de la sesión guardada.
      ensureSessionRestored()
      return onAuthStateChange(callback as any)
    },

    async getSession() {
      return { data: { session: getSession() }, error: null }
    },

    async getUser() {
      const session = getSession()
      return { data: { user: session?.user ?? null }, error: null }
    },

    async signOut(_options?: { scope?: string }) {
      await authApi.signOut()
      return { error: null }
    },

    async signUp({ email, password }: { email: string; password: string }) {
      try {
        const user = await authApi.signUp(email, password)
        return { data: { user: { id: user.id, email: user.email }, session: getSession() }, error: null }
      } catch (e) {
        return { data: { user: null, session: null }, error: e as Error }
      }
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const user = await authApi.signIn(email, password)
        return { data: { user: { id: user.id, email: user.email }, session: getSession() }, error: null }
      } catch (e) {
        return { data: { user: null, session: null }, error: e as Error }
      }
    },

    /**
     * El acceso ya no pasa por la web de Nonbili, así que no hay OTP que
     * verificar. Se mantiene para no romper importaciones existentes.
     */
    async verifyOtp(_params: unknown) {
      return { data: { user: null, session: null }, error: null }
    },
  },
}
