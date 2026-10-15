/**
 * Sincronización de las listas de reproducción.
 *
 * Es una copia del de carpetas: la forma de los datos y la tabla son las mismas,
 * así que el trabajo común lo hace BaseSyncer.
 */

import { syncState, when } from '@legendapp/state'
import { Playlist, playlists$ } from '@/states/playlists'
import { ResourceSyncMeta, syncMeta$ } from '@/states/sync-meta'
import { BaseSyncer } from './base'

class PlaylistsSyncer extends BaseSyncer<Playlist> {
  NAME = 'playlists'
  TABLE_NAME = 'nou_playlists'
  COLUMNS = 'id,name,json,created_at,updated_at'
  pushWhenRemoteMissing = false

  isPersistLoaded = () =>
    when(() => syncState(playlists$).isPersistLoaded.get() && syncState(syncMeta$).isPersistLoaded.get())

  getStore() {
    const { lists, updatedAt } = playlists$.get()
    return { items: lists, updatedAt }
  }

  setStore({ items, updatedAt }: { items: Playlist[]; updatedAt: Date }) {
    playlists$.assign({ lists: items, updatedAt })
  }

  getMeta() {
    return syncMeta$.playlists.get()
  }

  setMeta(meta: Partial<ResourceSyncMeta<Playlist[]>>) {
    syncMeta$.playlists.assign(meta)
  }

  hasMeaningfulLocalValue(items: Playlist[]) {
    return items.some((item) => !item.json?.deleted)
  }
}

export const playlistsSyncer = new PlaylistsSyncer()
