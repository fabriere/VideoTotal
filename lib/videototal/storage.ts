/**
 * Almacenamiento de la sesión (web / escritorio).
 *
 * En web `localStorage` es síncrono, así que se puede leer directamente. En
 * nativo no: ver `storage.native.ts`, que mantiene un espejo en memoria y
 * hidrata desde AsyncStorage antes de restaurar la sesión.
 */

const memory = new Map<string, string>()

export function readStore(key: string): string {
  try {
    const value = globalThis.localStorage?.getItem(key)
    if (value != null) return value
  } catch {
    /* sin localStorage: tiramos de memoria */
  }
  return memory.get(key) || ''
}

export function writeStore(key: string, value: string): void {
  try {
    if (value) globalThis.localStorage?.setItem(key, value)
    else globalThis.localStorage?.removeItem(key)
  } catch {
    /* ignorado a propósito */
  }
  if (value) memory.set(key, value)
  else memory.delete(key)
}

/** En web el almacenamiento ya es síncrono: no hay nada que hidratar. */
export async function hydrateStorage(): Promise<void> {
  // Intencionadamente vacío.
}

/** En web el almacenamiento está disponible desde el primer instante. */
export function isStorageHydrated(): boolean {
  return true
}
