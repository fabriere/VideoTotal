/**
 * Prueba de integración del ADAPTADOR del cliente contra la API real.
 *
 *   bun scripts/videototal-adapter-test.ts
 *
 * Ejercita el mismo camino que usa la app: `supabase.from(...)` y
 * `supabase.auth.*` sobre `lib/supabase/client.ts`, que ahora habla con nuestra
 * API. Sirve para comprobar que la lógica de sincronización de NouTube sigue
 * funcionando sin cambios sobre el backend propio.
 */

import { supabase } from '@/lib/supabase/client'
import { authApi } from '@/lib/videototal/api'

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  \x1b[32mOK  \x1b[0m ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`)
  }
}

const email = `adaptador+${Date.now()}@videototal.test`
const password = 'contrasena-larga-123'
const code = process.env.VIDEOTOTAL_TEST_CODE || ''

console.log('\n=== adaptador del cliente contra la API real ===\n')

// --- sin sesión -----------------------------------------------------------
{
  const s = await supabase.auth.getSession()
  check('sin sesión, getSession devuelve null', s.data.session === null)
}

// --- avisos de estado de autenticación -----------------------------------
const events: string[] = []
supabase.auth.onAuthStateChange((event: string) => {
  events.push(event)
})
await new Promise((r) => setTimeout(r, 50))
check('onAuthStateChange emite INITIAL_SESSION', events.includes('INITIAL_SESSION'), events)

// --- registro -------------------------------------------------------------
{
  const up = await supabase.auth.signUp({ email, password })
  check('signUp devuelve usuario', Boolean((up.data as any)?.user?.id), up)
  check('signUp no devuelve error', up.error === null, up.error)
}
{
  const s = await supabase.auth.getSession()
  check('getSession ya trae token', typeof s.data.session?.access_token === 'string')
  check('el evento SIGNED_IN se emitió', events.includes('SIGNED_IN'), events)
  check('el token tiene forma de sesión de supabase-js', Boolean(s.data.session?.user?.email))
}

// --- la puerta está en el servidor ---------------------------------------
{
  const r = await supabase.from('nou_bookmarks').select('id').order('created_at', { ascending: false }).range(0, 999)
  check('sin licencia, leer devuelve plan_required', r.error?.code === 'plan_required', r.error)
}

// --- canje de licencia ---------------------------------------------------
{
  if (!code) {
    check('hay código de licencia en VIDEOTOTAL_TEST_CODE', false, 'variable no definida')
  } else {
    const me = await authApi.redeem(code)
    check('el canje activa el plan', me.plan !== 'free', me.plan)
  }
}

// --- colecciones (el camino que usa BaseSyncer) --------------------------
const now = new Date().toISOString()
{
  const w = await supabase.from('nou_bookmarks').upsert([
    { id: 'a1', url: 'https://a.test', title: 'Uno', json: { deleted: false }, created_at: now, updated_at: now },
  ])
  check('upsert de colección sin error', w.error === null, w.error)
}
{
  const r: any = await supabase
    .from('nou_bookmarks')
    .select('id,url,title,json,created_at,updated_at')
    .order('created_at', { ascending: false })
    .range(0, 999)
  check('lectura de colección sin error', r.error === null, r.error)
  check('devuelve la fila insertada', r.data?.length === 1, r.data?.length)
  check('el json vuelve como objeto', r.data?.[0]?.json?.deleted === false, r.data?.[0]?.json)
}
{
  const w = await supabase.from('nou_bookmarks').upsert([
    { id: 'a1', url: 'https://a.test', title: 'Uno cambiado', json: { deleted: false }, created_at: now, updated_at: new Date().toISOString() },
  ])
  check('segundo upsert del mismo id sin error', w.error === null, w.error)
  const r: any = await supabase.from('nou_bookmarks').select('id,title').order('created_at', { ascending: false }).range(0, 999)
  check('actualiza en vez de duplicar', r.data?.length === 1, r.data?.length)
  check('el título quedó actualizado', r.data?.[0]?.title === 'Uno cambiado', r.data?.[0]?.title)
}

// --- documentos (el camino que usa DocumentSyncer) -----------------------
{
  const d0: any = await supabase.from('nou_settings').select('json,updated_at').single()
  check('documento ausente devuelve PGRST116', d0.error?.code === 'PGRST116', d0.error)
}
{
  const w: any = await supabase
    .from('nou_settings')
    .upsert({ user_id: 'x', json: { theme: 'dark' } })
    .select('json,updated_at')
    .single()
  check('guardar documento no da error', w.error === null, w.error)
  check('el documento trae updated_at del servidor', typeof w.data?.updated_at === 'string', w.data)

  const r: any = await supabase.from('nou_settings').select('json,updated_at').single()
  check('se lee igual que se escribió', r.data?.json?.theme === 'dark', r.data?.json)
}

// --- errores controlados -------------------------------------------------
{
  const u: any = await supabase.from('tabla_que_no_existe').select('*')
  check('tabla desconocida da error controlado, no excepción', u.error?.code === 'unknown_table', u.error)
}

// --- cerrar sesión -------------------------------------------------------
{
  await supabase.auth.signOut()
  const s = await supabase.auth.getSession()
  check('tras signOut no hay sesión', s.data.session === null)
  check('el evento SIGNED_OUT se emitió', events.includes('SIGNED_OUT'), events)
  const r: any = await supabase.from('nou_bookmarks').select('id').order('created_at', { ascending: false }).range(0, 999)
  check('sin sesión, leer devuelve unauthorized', r.error?.code === 'unauthorized', r.error)
}

console.log(`\n=== RESULTADO: ${passed} correctas, ${failed} fallidas ===`)
if (failed) {
  console.log('fallos: ' + failures.join(' | '))
  process.exit(1)
}
