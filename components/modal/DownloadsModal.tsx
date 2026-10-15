/**
 * Descargas y listas de reproducción.
 *
 * Las descargas son los ficheros que ya están en el teléfono. Una lista es una
 * selección ordenada de esas descargas para verlas seguidas: al tocar cualquiera
 * de ellas se abre el reproductor de la app, que va pasando solo a la siguiente.
 */

import { useState } from 'react'
import { FlatList, Pressable, TextInput, useColorScheme, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { Image } from 'expo-image'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { BaseModal } from '../modal/BaseModal'
import { downloads$, DownloadState, isDownloadInterrupted, sortedDownloads } from '@/states/downloads'
import {
  addToList,
  createList,
  deleteList,
  playableDownloads,
  PlaylistItem,
  playlists$,
  visibleLists,
  withLocalPaths,
} from '@/states/playlists'
import { playItems } from '@/states/playback'
import { localFileExists } from '@/lib/local-file'
import { getVideoThumbnail } from '@/lib/page'
import { mainClient } from '@/lib/main-client'
import { ui$, updateUrl } from '@/states/ui'
import { useTwColor } from '@/lib/theme'

const surfaceCls = 'overflow-hidden rounded-[24px] bg-white dark:bg-zinc-900'

function formatDate(ts?: number) {
  if (!ts) {
    return ''
  }
  try {
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

/** Lo que se puede reproducir de verdad: terminado y con fichero. */
const playablesOf = (all: Record<string, DownloadState>): PlaylistItem[] => playableDownloads(all)

const DownloadRow: React.FC<{
  item: DownloadState
  onDelete: () => void
  onAddToList: () => void
}> = ({ item, onDelete, onAddToList }) => {
  const tw = useTwColor()
  const isDark = useColorScheme() !== 'light'
  const interrupted = isDownloadInterrupted(item)
  const missing = item.phase === 'done' && !localFileExists(item.savedPath)
  const thumbnail = getVideoThumbnail(item.url)
  const playable = item.phase === 'done' && !!item.savedPath && !missing

  const open = () => {
    if (!item.savedPath || missing) {
      return
    }
    ui$.downloadsModalOpen.set(false)
    updateUrl(item.url)
  }

  const openExternally = () => {
    if (!item.savedPath || missing) {
      return
    }
    Promise.resolve(mainClient.openFile(item.savedPath)).catch((err: any) => {
      console.error('failed to open file', err)
    })
  }

  const redownload = () => {
    ui$.downloadsModalOpen.set(false)
    updateUrl(item.url)
  }

  const status = interrupted
    ? t('modals.downloadInterrupted')
    : missing
      ? t('modals.downloadFileMissing')
      : item.phase === 'error'
        ? item.errorMsg || t('modals.downloadFailed')
        : ''

  return (
    <View className="mb-3 flex-row gap-3 rounded-xl border border-zinc-200 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Pressable onPress={open} disabled={!item.savedPath || missing} className="justify-center">
        {thumbnail ? (
          <Image
            source={{ uri: thumbnail }}
            style={{ width: 96, height: 54, borderRadius: 8 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-[54px] w-[96px] items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800">
            <MaterialIcons name="play-circle-outline" size={22} color={isDark ? '#a1a1aa' : '#71717a'} />
          </View>
        )}
      </Pressable>

      <View className="flex-1 gap-1">
        <Pressable onPress={open} disabled={!item.savedPath || missing}>
          <NouText className="text-sm font-semibold text-zinc-900 dark:text-zinc-100" numberOfLines={2}>
            {item.title || item.url}
          </NouText>
        </Pressable>

        {item.phase === 'downloading' && !interrupted ? (
          <View className="h-2 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950">
            <View
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${Math.max(2, Math.min(100, item.progress || 0))}%` }}
            />
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          {status ? (
            <NouText className={missing || interrupted ? 'text-xs text-amber-600 dark:text-amber-500' : 'text-xs text-red-500'}>
              {status}
            </NouText>
          ) : (
            <NouText className="text-xs text-zinc-500">{formatDate(item.updatedAt)}</NouText>
          )}
          {missing || interrupted ? (
            <Pressable onPress={redownload} className="rounded-md px-2 py-1 active:bg-zinc-200 dark:active:bg-zinc-800">
              <NouText className="text-xs font-medium text-sky-600 dark:text-sky-400">
                {t('modals.downloadRedownload')}
              </NouText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {playable ? (
        <View className="self-center flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('modals.addToList')}
            onPress={onAddToList}
            className="rounded-md p-2 active:bg-zinc-200 dark:active:bg-zinc-800"
          >
            <MaterialIcons name="playlist-add" size={18} color={tw('zinc-500')} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('modals.openExternally')}
            onPress={openExternally}
            className="rounded-md p-2 active:bg-zinc-200 dark:active:bg-zinc-800"
          >
            <MaterialIcons name="open-in-new" size={18} color={tw('zinc-500')} />
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={onDelete} className="self-center rounded-md p-2 active:bg-zinc-200 dark:active:bg-zinc-800">
        <MaterialIcons name="delete-outline" size={18} color={tw('zinc-500')} />
      </Pressable>
    </View>
  )
}

/** Elige a qué lista añadir un vídeo, o crea una nueva. */
const AddToListSheet: React.FC<{ item: PlaylistItem; onClose: () => void }> = ({ item, onClose }) => {
  const lists = visibleLists(useValue(playlists$.lists))
  const [nombre, setNombre] = useState('')

  return (
    <View className="absolute inset-0 z-[950] items-center justify-center bg-black/50 px-6">
      <View className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-white dark:bg-zinc-900">
        <NouText className="px-5 pt-5 text-lg font-semibold">{t('modals.addToList')}</NouText>
        <NouText className="mt-1 px-5 text-sm text-zinc-500" numberOfLines={2}>
          {item.title}
        </NouText>

        <View className="mt-4 max-h-[240px]">
          {lists.length ? (
            lists.map((lista) => (
              <Pressable
                key={lista.id}
                onPress={() => {
                  addToList(lista.id, item)
                  onClose()
                }}
                className="flex-row items-center gap-3 px-5 py-3 active:bg-zinc-100 dark:active:bg-zinc-800"
              >
                <MaterialIcons name="playlist-play" size={20} color="#71717a" />
                <NouText className="flex-1">{lista.name}</NouText>
                <NouText className="text-xs text-zinc-500">{lista.json.items.length}</NouText>
              </Pressable>
            ))
          ) : (
            <NouText className="px-5 py-2 text-sm text-zinc-500">{t('modals.noLists')}</NouText>
          )}
        </View>

        <View className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <TextInput
            className="mb-3 rounded border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={nombre}
            onChangeText={setNombre}
            placeholder={t('modals.listName')}
            placeholderTextColor="#71717a"
            onSubmitEditing={() => {
              const lista = createList(nombre)
              addToList(lista.id, item)
              setNombre('')
              onClose()
            }}
          />
          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-full px-4 py-2 active:bg-zinc-200 dark:active:bg-zinc-800">
              <NouText className="text-sm">{t('buttons.cancel')}</NouText>
            </Pressable>
            <Pressable
              onPress={() => {
                const lista = createList(nombre)
                addToList(lista.id, item)
                setNombre('')
                onClose()
              }}
              className="rounded-full bg-indigo-600 px-4 py-2 active:bg-indigo-700"
            >
              <NouText className="text-sm font-semibold text-white">{t('modals.createList')}</NouText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

export const DownloadsModal = () => {
  const isOpen = useValue(ui$.downloadsModalOpen)
  const all = useValue(downloads$)
  const lists = visibleLists(useValue(playlists$.lists))
  const [nombreLista, setNombreLista] = useState('')
  const [añadiendo, setAñadiendo] = useState<PlaylistItem | null>(null)

  if (!isOpen) {
    return null
  }

  const items = sortedDownloads(all)
  const playables = playablesOf(all)

  return (
    <BaseModal onClose={() => ui$.downloadsModalOpen.set(false)} useNativeModal={false}>
      <View className="mb-4 flex-row items-center justify-between px-2">
        <NouText className="text-lg font-semibold">{t('modals.downloads')}</NouText>
        {items.length ? (
          <Pressable
            onPress={() => downloads$.set({})}
            className="rounded-md px-2 py-1 active:bg-zinc-200 dark:active:bg-zinc-800"
          >
            <NouText className="text-xs font-medium text-zinc-500">{t('buttons.clearAll')}</NouText>
          </Pressable>
        ) : null}
      </View>

      {playables.length ? (
        <Pressable
          onPress={() => playItems(playables)}
          className="mb-4 flex-row items-center justify-center gap-2 rounded-full bg-indigo-600 py-3 active:bg-indigo-700"
        >
          <MaterialIcons name="play-arrow" size={20} color="#ffffff" />
          <NouText className="font-semibold text-white">
            {t('modals.playAll')} ({playables.length})
          </NouText>
        </Pressable>
      ) : null}

      <NouText className="mb-2 px-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
        {t('modals.playlists')}
      </NouText>

      <View className={surfaceCls}>
        <View className="flex-row items-center gap-2 px-4 py-3">
          <TextInput
            className="flex-1 rounded border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={nombreLista}
            onChangeText={setNombreLista}
            placeholder={t('modals.listName')}
            placeholderTextColor="#71717a"
            onSubmitEditing={() => {
              createList(nombreLista)
              setNombreLista('')
            }}
          />
          <Pressable
            onPress={() => {
              createList(nombreLista)
              setNombreLista('')
            }}
            className="rounded-full bg-zinc-200 px-4 py-2 active:bg-zinc-300 dark:bg-zinc-800 dark:active:bg-zinc-700"
          >
            <NouText className="text-sm font-semibold">{t('modals.createList')}</NouText>
          </Pressable>
        </View>

        {lists.length ? (
          lists.map((lista) => (
            <View
              key={lista.id}
              className="flex-row items-center gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <MaterialIcons name="playlist-play" size={22} color="#71717a" />
              <View className="flex-1">
                <NouText className="font-medium">{lista.name}</NouText>
                <NouText className="mt-0.5 text-xs text-zinc-500">
                  {t('modals.listCount', { count: lista.json.items.length })}
                </NouText>
              </View>
              <Pressable
                disabled={!lista.json.items.length}
                onPress={() => playItems(withLocalPaths(lista.json.items, all))}
                className="rounded-full p-2 active:bg-zinc-200 dark:active:bg-zinc-800"
              >
                <MaterialIcons
                  name="play-circle-filled"
                  size={26}
                  color={lista.json.items.length ? '#4f46e5' : '#a1a1aa'}
                />
              </Pressable>
              <Pressable
                onPress={() => deleteList(lista.id)}
                className="rounded-full p-2 active:bg-zinc-200 dark:active:bg-zinc-800"
              >
                <MaterialIcons name="delete-outline" size={18} color="#71717a" />
              </Pressable>
            </View>
          ))
        ) : (
          <NouText className="border-t border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800">
            {t('modals.noLists')}
          </NouText>
        )}
      </View>

      <NouText className="mb-2 mt-5 px-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
        {t('modals.downloads')}
      </NouText>

      {items.length ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.url}
          renderItem={({ item }) => (
            <DownloadRow
              item={item}
              onDelete={() => downloads$[item.url].delete()}
              onAddToList={() => setAñadiendo({ url: item.url, title: item.title || item.url })}
            />
          )}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
        />
      ) : (
        <View className="items-center gap-2 px-6 py-16">
          <MaterialIcons name="download" size={40} color="#a1a1aa" />
          <NouText className="text-center text-sm text-zinc-500">{t('modals.downloadsEmpty')}</NouText>
        </View>
      )}

      {añadiendo ? <AddToListSheet item={añadiendo} onClose={() => setAñadiendo(null)} /> : null}
    </BaseModal>
  )
}
