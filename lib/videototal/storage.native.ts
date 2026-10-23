/**
 * Almacenamiento de la sesión (Android / iOS).
 *
 * `AsyncStorage` es asíncrono, pero el cliente lee el token de forma síncrona
 * (igual que hace supabase-js). La solución es un espejo en memoria:
 *
 *   · al arrancar, `hydrateStorage()` vuelca AsyncStorage en memoria;
 *   · las lecturas van siempre a memoria (síncronas);
 *   · las escrituras actualizan memoria y persisten en segundo plano.
 *
 * Sin esto la sesión se perdería en cada arranque y el usuario tendría que
 * escribir su contraseña cada vez.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'videototal:'
const memory = new Map<string, string>()

let hydrated = false
let hydration: Promise<void> | null = null

/** Intentos antes de darse por vencido con la lectura del almacenamiento. */
const ATTEMPTS = 4

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function readStore(key: string): string {
  return memory.get(key) || ''
}

export function writeStore(key: string, value: string): void {
  if (value) {
    memory.set(key, value)
    // No se espera: un fallo al persistir no debe romper la app.
    void AsyncStorage.setItem(PREFIX + key, value).catch(() => {})
  } else {
    memory.delete(key)
    void AsyncStorage.removeItem(PREFIX + key).catch(() => {})
  }
}

/**
 * Vuelca lo persistido en el espejo en memoria. Idempotente.
 *
 * Reintenta a propósito: AsyncStorage vive en SQLite y puede fallar cuando el
 * teléfono va justo de memoria o el fichero está bloqueado. Antes ese fallo se
 * tragaba y la hidratación se daba por hecha con la memoria VACÍA, así que la
 * app concluía "no hay sesión" y pedía la licencia otra vez aunque estuviera
 * guardada. El cliente lo "arreglaba" cerrando todas las apps: al liberar
 * memoria, la lectura funcionaba.
 *
 * Si no se consigue leer, se lanza el error y NO se marca como hidratado, para
 * que quien llama pueda reintentar en vez de decidir que no hay licencia.
 */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) return
  if (!hydration) {
    hydration = (async () => {
      let lastError: unknown = null
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        try {
          const keys = await AsyncStorage.getAllKeys()
          const ours = keys.filter((key) => key.startsWith(PREFIX))
          if (ours.length) {
            const pairs = await AsyncStorage.multiGet(ours)
            for (const [key, value] of pairs) {
              if (value != null) memory.set(key.slice(PREFIX.length), value)
            }
          }
          hydrated = true
          return
        } catch (error) {
          lastError = error
          await sleep(150 * (attempt + 1))
        }
      }
      hydration = null
      throw lastError instanceof Error ? lastError : new Error('no se pudo leer el almacenamiento')
    })()
  }
  return hydration
}

/**
 * ¿Ya se volcó lo persistente en memoria?
 *
 * Sin esto no se puede concluir "no hay sesión": una lectura fallida y una
 * sesión inexistente se verían igual, y la primera no debe costarle la licencia
 * a nadie.
 */
export function isStorageHydrated(): boolean {
  return hydrated
}
