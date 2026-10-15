/**
 * Reproductor de los ficheros descargados.
 *
 * Reproduce la lista entera y va pasando solo al siguiente vídeo, que es lo que
 * hace útil una lista de reproducción: sentarse y verlos seguidos.
 *
 * Se usa `expo-video`, que reproduce ficheros locales del teléfono y trae los
 * controles de siempre (avanzar, pantalla completa, velocidad).
 */

import { useEffect, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEvent } from 'expo'
import { VideoView, useVideoPlayer } from 'expo-video'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { NouButton } from '../button/NouButton'
import { updateUrl } from '@/states/ui'
import { closePlayer, currentItem, jumpTo, nextItem, playback$, prevItem } from '@/states/playback'

/** La ruta guardada puede venir sin el prefijo `file://`. */
const toUri = (path: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? path : `file://${path}`)

export const LocalPlayer = () => {
  const state = useValue(playback$)
  const insets = useSafeAreaInsets()
  const [showList, setShowList] = useState(false)
  const item = currentItem(state)

  const player = useVideoPlayer(item ? toUri(item.savedPath) : null, (p) => {
    p.play()
  })

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing })

  // Al cambiar de vídeo se carga el nuevo y se reproduce desde el principio.
  // El `try` está porque esta llamada cambió de forma entre versiones de la
  // librería; si fallara, el vídeo se vería igualmente, sólo que sin avanzar.
  useEffect(() => {
    if (!item) {
      return
    }
    try {
      player.replace(toUri(item.savedPath))
      player.play()
    } catch {
      /* se queda con lo que ya tenía */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.url, player])

  // Cuando un vídeo termina, se pasa al siguiente. Si ya no hay más, se para en
  // vez de cerrarse: cerrar de golpe al acabar el último sería desconcertante.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (!nextItem()) {
        player.pause()
      }
    })
    return () => sub.remove()
  }, [player])

  if (!state.open || !item) {
    return null
  }

  // Un vídeo de la lista que no está descargado EN ESTE dispositivo.
  //
  // Pasa al sincronizar listas: en el otro dispositivo el fichero no existe. En
  // vez de cerrarse o quedarse en negro, se ofrece verlo desde YouTube y se
  // mantiene la lista, para poder seguir con el siguiente.
  if (!item.savedPath) {
    return (
      <View className="absolute inset-0 z-[900] items-center justify-center gap-4 bg-black px-8" style={{ paddingTop: insets.top }}>
        <MaterialIcons name="cloud-download" size={44} color="#71717a" />
        <NouText className="text-center text-base text-white" numberOfLines={2}>
          {item.title}
        </NouText>
        <NouText className="text-center text-sm text-zinc-400">{t('player.notDownloaded')}</NouText>
        <NouButton
          onPress={() => {
            closePlayer()
            updateUrl(item.url)
          }}
        >
          {t('player.watchOnYoutube')}
        </NouButton>
        <View className="mt-2 flex-row items-center gap-8">
          <Pressable hitSlop={10} onPress={() => prevItem()}>
            <MaterialIcons name="skip-previous" size={30} color="#ffffff" />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => nextItem()}>
            <MaterialIcons name="skip-next" size={30} color="#ffffff" />
          </Pressable>
          <Pressable hitSlop={10} onPress={closePlayer}>
            <MaterialIcons name="close" size={26} color="#ffffff" />
          </Pressable>
        </View>
        <NouText className="text-xs text-zinc-500">
          {state.index + 1} / {state.items.length}
        </NouText>
      </View>
    )
  }

  const total = state.items.length
  const posicion = state.index + 1

  return (
    <View className="absolute inset-0 z-[900] bg-black" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('buttons.close')}
          hitSlop={10}
          onPress={closePlayer}
        >
          <MaterialIcons name="close" size={24} color="#ffffff" />
        </Pressable>
        <NouText className="flex-1 text-sm text-white" numberOfLines={1}>
          {item.title}
        </NouText>
        <NouText className="text-xs text-zinc-400">
          {posicion} / {total}
        </NouText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.repeat ? t('player.repeatOff') : t('player.repeatOn')}
          hitSlop={10}
          onPress={() => playback$.repeat.set(!state.repeat)}
        >
          <MaterialIcons name="repeat" size={22} color={state.repeat ? '#38bdf8' : '#71717a'} />
        </Pressable>
      </View>

      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />

      <View
        className="flex-row items-center justify-center gap-10 px-4 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.previous')}
          hitSlop={10}
          onPress={() => {
            if (prevItem()) {
              player.play()
            }
          }}
        >
          <MaterialIcons name="skip-previous" size={32} color="#ffffff" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? t('player.pause') : t('player.play')}
          hitSlop={10}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={40} color="#ffffff" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.next')}
          hitSlop={10}
          onPress={() => {
            if (nextItem()) {
              player.play()
            }
          }}
        >
          <MaterialIcons name="skip-next" size={32} color="#ffffff" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.list')}
          hitSlop={10}
          onPress={() => setShowList((v) => !v)}
        >
          <MaterialIcons name="playlist-play" size={28} color={showList ? '#38bdf8' : '#ffffff'} />
        </Pressable>
      </View>

      {showList ? (
        <View className="max-h-[45%] border-t border-zinc-800 bg-zinc-950">
          <NouText className="px-4 py-3 text-xs uppercase tracking-widest text-zinc-500">
            {t('player.list')}
          </NouText>
          <FlatList
            data={state.items}
            keyExtractor={(i) => i.url}
            initialNumToRender={12}
            renderItem={({ item: fila, index }) => {
              const activo = index === state.index
              return (
                <Pressable
                  onPress={() => {
                    jumpTo(index)
                    player.play()
                  }}
                  className={activo ? 'flex-row items-center gap-3 bg-zinc-800 px-4 py-3' : 'flex-row items-center gap-3 px-4 py-3'}
                >
                  <NouText className="w-6 text-xs text-zinc-500">{index + 1}</NouText>
                  <NouText
                    className={activo ? 'flex-1 text-sm text-sky-400' : 'flex-1 text-sm text-zinc-200'}
                    numberOfLines={1}
                  >
                    {fila.title}
                  </NouText>
                  {activo ? <MaterialIcons name="graphic-eq" size={16} color="#38bdf8" /> : null}
                </Pressable>
              )
            }}
          />
        </View>
      ) : null}
    </View>
  )
}
