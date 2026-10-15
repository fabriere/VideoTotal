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

/** Vuelca lo persistido en el espejo en memoria. Idempotente. */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) return
  if (!hydration) {
    hydration = (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys()
        const ours = keys.filter((key) => key.startsWith(PREFIX))
        if (ours.length) {
          const pairs = await AsyncStorage.multiGet(ours)
          for (const [key, value] of pairs) {
            if (value != null) memory.set(key.slice(PREFIX.length), value)
          }
        }
      } catch {
        /* si falla, arrancamos sin sesión: se pedirá volver a entrar */
      }
      hydrated = true
    })()
  }
  return hydration
}
