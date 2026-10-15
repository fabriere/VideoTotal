/**
 * Listas de reproducción.
 *
 * Una lista es una selección ordenada de vídeos para verlos seguidos.
 *
 * Guarda el VÍDEO (su dirección y su título) y, además, la ruta del fichero
 * descargado **si está en este dispositivo**. Esa distinción importa porque las
 * listas se sincronizan entre dispositivos: en el teléfono donde descargaste el
 * vídeo se reproduce sin gastar datos, y en los demás se abre desde YouTube en
 * vez de quedarse en nada.
 *
 * La forma imita a las carpetas (`id`, `name`, `json`, fechas) para que el
 * sincronizador pueda ser el genérico que ya existe, sin casos especiales.
 */

import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { isWeb } from '@/lib/utils'
import { getIndexedDBPlugin } from './indexeddb'
import { DownloadState, sortedDownloads } from './downloads'

export interface PlaylistItem {
  /** Identificador del vídeo: es la URL, como en el resto de la app. */
  url: string
  title: string
  /**
   * Dónde está el fichero descargado, si está en ESTE dispositivo.
   *
   * Opcional a propósito: al sincronizar, en los demás dispositivos ese fichero
   * no existe y la lista sigue siendo válida.
   */
  savedPath?: string
}

export interface Playlist {
  id: string
  name: string
  /** El contenido, igual que en las carpetas. */
  json: {
    items: PlaylistItem[]
    deleted?: boolean
  }
  created_at?: Date | string
  updated_at?: Date | string
}

interface Store {
  lists: Playlist[]
  updatedAt?: Date
}

export const playlists$ = observable<Store>({ lists: [], updatedAt: new Date() })

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** Las que se enseñan: ni las borradas ni las que aún no han llegado. */
export const visibleLists = (lists: Playlist[] | undefined): Playlist[] =>
  (lists || []).filter((l) => l && l.json && !l.json.deleted)

export const getLists = (): Playlist[] => visibleLists(playlists$.lists.get())

/** Lo que se puede reproducir de las descargas: terminado y con fichero. */
export const playableDownloads = (all: Record<string, DownloadState>): PlaylistItem[] =>
  sortedDownloads(all)
    .filter((d) => d.phase === 'done' && !!d.savedPath)
    .map((d) => ({ url: d.url, title: d.title || d.url, savedPath: d.savedPath }))

/**
 * Completa los elementos con la ruta local cuando el vídeo está descargado aquí.
 *
 * Se hace al reproducir, no al guardar: la lista sincronizada no debe llevar
 * rutas de un dispositivo concreto.
 */
export const withLocalPaths = (
  items: PlaylistItem[],
  all: Record<string, DownloadState>,
): PlaylistItem[] =>
  (items || []).map((item) => {
    const descarga = all[item.url]
    if (descarga?.phase === 'done' && descarga.savedPath) {
      return { ...item, savedPath: descarga.savedPath }
    }
    const { savedPath, ...sinRuta } = item
    return sinRuta
  })

const touch = () => playlists$.updatedAt.set(new Date())

function updateList(id: string, change: (lista: Playlist) => Playlist): void {
  playlists$.lists.set(
    (playlists$.lists.get() || []).map((l) => (l.id === id ? { ...change(l), updated_at: new Date() } : l)),
  )
  touch()
}

export const createList = (name: string, items: PlaylistItem[] = []): Playlist => {
  const lista: Playlist = {
    id: newId(),
    name: name.trim() || 'Lista',
    json: { items, deleted: false },
    created_at: new Date(),
    updated_at: new Date(),
  }
  playlists$.lists.unshift(lista)
  touch()
  return lista
}

export const renameList = (id: string, name: string): void => {
  updateList(id, (l) => ({ ...l, name: name.trim() || l.name }))
}

/**
 * Borrado suave: se marca en vez de quitarse.
 *
 * Si se quitara de la lista, el siguiente sync la traería de vuelta desde el otro
 * dispositivo, porque para el servidor seguiría existiendo.
 */
export const deleteList = (id: string): void => {
  updateList(id, (l) => ({ ...l, json: { ...l.json, deleted: true } }))
}

export const addToList = (id: string, item: PlaylistItem): void => {
  updateList(id, (l) => ({
    ...l,
    json: {
      ...l.json,
      items: [...(l.json.items || []).filter((i) => i.url !== item.url), { url: item.url, title: item.title }],
    },
  }))
}

export const removeFromList = (id: string, url: string): void => {
  updateList(id, (l) => ({
    ...l,
    json: { ...l.json, items: (l.json.items || []).filter((i) => i.url !== url) },
  }))
}

export const moveInList = (id: string, url: string, delta: number): void => {
  updateList(id, (l) => {
    const items = [...(l.json.items || [])]
    const desde = items.findIndex((i) => i.url === url)
    const hasta = desde + delta
    if (desde < 0 || hasta < 0 || hasta >= items.length) {
      return l
    }
    const [movido] = items.splice(desde, 1)
    items.splice(hasta, 0, movido)
    return { ...l, json: { ...l.json, items } }
  })
}

if (isWeb) {
  syncObservable(playlists$, {
    persist: {
      plugin: getIndexedDBPlugin(),
      name: 'store',
      indexedDB: {
        itemID: 'playlists',
      },
    },
  })
} else {
  syncObservable(playlists$, {
    persist: {
      name: 'playlists',
      plugin: ObservablePersistMMKV,
    },
  })
}
