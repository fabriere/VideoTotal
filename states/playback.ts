/**
 * Lo que se está reproduciendo ahora mismo.
 *
 * Esta parte NO se guarda en el disco a propósito: al cerrar la app no tiene
 * sentido seguir reproduciendo nada. Lo que sí se guarda son las listas
 * (ver states/playlists.ts).
 */

import { observable } from '@legendapp/state'
import { PlaylistItem } from './playlists'

export interface PlaybackState {
  /** La cola, en orden. */
  items: PlaylistItem[]
  index: number
  /** Si el reproductor está en pantalla. */
  open: boolean
  /** Al terminar la lista, volver a empezar. */
  repeat: boolean
}

export const playback$ = observable<PlaybackState>({
  items: [],
  index: 0,
  open: false,
  repeat: false,
})

export const currentItem = (state: PlaybackState): PlaylistItem | undefined => state.items[state.index]

/** Empieza a reproducir una lista desde una posición concreta. */
export const playItems = (items: PlaylistItem[], index = 0): void => {
  if (!items.length) {
    return
  }
  playback$.items.set(items)
  playback$.index.set(Math.max(0, Math.min(index, items.length - 1)))
  playback$.open.set(true)
}

/** Empieza a reproducir por un vídeo concreto dentro de la lista. */
export const playFrom = (items: PlaylistItem[], url: string): void => {
  const index = items.findIndex((i) => i.url === url)
  playItems(items, index < 0 ? 0 : index)
}

export const closePlayer = (): void => {
  playback$.open.set(false)
}

/**
 * Pasa al siguiente.
 *
 * Devuelve false cuando ya no hay más y no está puesto el repetir: ahí quien
 * llama decide qué hacer (parar, en vez de cerrar de golpe, que sería molesto).
 */
export const nextItem = (): boolean => {
  const { items, index, repeat } = playback$.get()
  if (index + 1 < items.length) {
    playback$.index.set(index + 1)
    return true
  }
  if (repeat && items.length) {
    playback$.index.set(0)
    return true
  }
  return false
}

export const prevItem = (): boolean => {
  const { items, index, repeat } = playback$.get()
  if (index > 0) {
    playback$.index.set(index - 1)
    return true
  }
  if (repeat && items.length) {
    playback$.index.set(items.length - 1)
    return true
  }
  return false
}

/** Salta a un elemento concreto de la cola (al tocar la lista). */
export const jumpTo = (index: number): void => {
  const { items } = playback$.get()
  if (index >= 0 && index < items.length) {
    playback$.index.set(index)
  }
}
