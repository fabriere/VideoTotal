import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { isWeb } from '@/lib/utils'
import { getIndexedDBPlugin } from './indexeddb'

export type DownloadPhase = 'downloading' | 'done' | 'error'

export interface DownloadState {
  url: string
  title: string
  phase: DownloadPhase
  progress: number
  progressLine: string
  errorMsg: string
  savedPath: string
  /**
   * Cuándo empezó o terminó la descarga. Sirve para ordenar la lista y para
   * distinguir una descarga en curso de una que quedó a medias (ver
   * isDownloadInterrupted). Se escribe al cambiar de fase, no en cada tick de
   * progreso, para no machacar el disco.
   */
  updatedAt?: number
}

export const downloads$ = observable<Record<string, DownloadState>>({})

/**
 * Instante en que arrancó la sesión. Al abrir la app no hay nada descargando,
 * así que cualquier entrada marcada como "downloading" con marca de tiempo
 * anterior a este momento es una descarga que quedó interrumpida al cerrar.
 *
 * Se resuelve al leer, en vez de reescribir el estado al cargar, porque la
 * persistencia en web (IndexedDB) es asíncrona y no hay un momento fiable
 * después de hidratar.
 */
export const SESSION_STARTED_AT = Date.now()

export const isDownloadInterrupted = (d: DownloadState) =>
  d.phase === 'downloading' && (d.updatedAt || 0) < SESSION_STARTED_AT

/** Entradas de la más reciente a la más antigua. */
export const sortedDownloads = (all: Record<string, DownloadState>): DownloadState[] =>
  Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

// El historial de descargas es el único estado de contenido que no se guardaba:
// se perdía al cerrar la app, así que las descargas desaparecían de la vista
// aunque los ficheros siguieran en el teléfono. Mismo patrón que history$,
// bookmarks$ o queue$.
if (isWeb) {
  syncObservable(downloads$, {
    persist: {
      plugin: getIndexedDBPlugin(),
      name: 'store',
      indexedDB: {
        itemID: 'downloads',
      },
    },
  })
} else {
  syncObservable(downloads$, {
    persist: {
      name: 'downloads',
      plugin: ObservablePersistMMKV,
    },
  })
}
