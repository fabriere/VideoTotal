/**
 * Estado y textos del botón "Buscar actualización" de la pantalla de licencia.
 *
 * Existe por un caso concreto: un cliente atascado en la pantalla del código no
 * puede entrar a Ajustes, así que tampoco puede usar el actualizador de dentro.
 * Si su versión es la que falla, la única salida era mandarle el APK a mano.
 * Con esto puede traerse la versión nueva él mismo.
 *
 * La lógica vive aquí, separada del componente, para poder probarla: devuelve
 * claves de traducción en vez de texto, así no depende de i18next.
 */

import type { AvailableUpdate } from './updates'

export type GateUpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest'; version: string }
  | { kind: 'available'; version: string; sizeMB: string }
  | { kind: 'downloading'; version: string; sizeMB: string; percent: number }
  | { kind: 'error'; detail?: string }

export type GateUpdateTone = 'ok' | 'info' | 'warn'

export interface GateUpdateLabel {
  key: string
  params: Record<string, string | number>
  tone: GateUpdateTone
}

/** Tamaño en MB con un decimal, como se lee en una tienda. */
export function sizeInMB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0'
  return (bytes / (1024 * 1024)).toFixed(1)
}

/** Estado inicial al encontrar una versión nueva. */
export function availableState(update: AvailableUpdate): GateUpdateState {
  return {
    kind: 'available',
    version: update.version,
    sizeMB: sizeInMB(update.sizeBytes),
  }
}

/** Progreso acotado a 0–100: la descarga a veces informa de más. */
export function progressPercent(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0
  return Math.max(0, Math.min(100, Math.round(fraction * 100)))
}

/** Qué se le enseña al cliente, junto al botón. */
export function gateUpdateLabel(state: GateUpdateState): GateUpdateLabel | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'checking':
      return { key: 'gate.updateChecking', params: {}, tone: 'info' }
    case 'latest':
      return { key: 'gate.updateLatest', params: { version: state.version }, tone: 'ok' }
    case 'available':
      return {
        key: 'gate.updateAvailable',
        params: { version: state.version, size: state.sizeMB },
        tone: 'info',
      }
    case 'downloading':
      return {
        key: 'gate.updateDownloading',
        params: { version: state.version, pct: state.percent },
        tone: 'info',
      }
    case 'error':
      return { key: 'gate.updateError', params: {}, tone: 'warn' }
  }
}
