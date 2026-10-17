import { auth$ } from '@/states/auth'
import { MainPageContent } from './MainPageContent'
import { LicenseGate } from '../LicenseGate'
import { licenseState } from '@/lib/license'
import { supabase } from '@/lib/supabase/client'
import { listenIosTransactions, reconcileIosTransactions } from '@/lib/ios-billing'
import { useEffect, useState } from 'react'
import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query/client'
import { BookmarkModal } from '../modal/BookmarkModal'
import { FolderModal } from '../modal/FolderModal'
import { HistoryModal } from '../modal/HistoryModal'
import { DownloadsModal } from '../modal/DownloadsModal'
import { LocalPlayer } from '../player/LocalPlayer'
import { LibraryModal } from '../modal/LibraryModal'
import { QueueModal } from '../modal/QueueModal'
import { SettingsModal } from '../modal/SettingsModal'
import { feederLoop } from '@/lib/feeder'
import { listenFeedNotifications } from '@/lib/feed-notifications'
import { FeedModal } from '../modal/FeedModal'
import { UrlModal } from '../modal/UrlModal'
import { CookieModal } from '../modal/CookieModal'
import { UserAgentModal } from '../modal/UserAgentModal'
import { SleepTimerModal } from '../modal/SleepTimerModal'
import { PlaybackSpeedModal } from '../modal/PlaybackSpeedModal'
import { PlaybackQualityModal } from '../modal/PlaybackQualityModal'
import { ToolsModal } from '../modal/ToolsModal'
import { ShareModal } from '../modal/ShareModal'
import { useLocales } from 'expo-localization'
import { changeLanguage, t as i18nextT } from 'i18next'
import NouTubeViewModule from '@/modules/nou-tube-view'
import { isWeb, nIf } from '@/lib/utils'
import { resolveI18nLanguageFromExpoLocale } from '@/lib/i18n'
import { settings$ } from '@/states/settings'
import { TranslationCard } from '../translation/TranslationCard'
import { MoveBookmarkModal } from '../modal/MoveBookmarkModal'
import { UndoToast } from '../UndoToast'
import { Toast } from '../Toast'
import { AppState } from 'react-native'

export const MainPage: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  useEffect(() => listenFeedNotifications(() => ui$.feedModalOpen.set(true)), [])
  const feedNotificationsEnabled = useValue(settings$.feedNotificationsEnabled)
  const feedsEnabled = useValue(settings$.feedsEnabled)
  useEffect(() => {
    if (!feedsEnabled || !feedNotificationsEnabled) return
    const refresh = () => { void feederLoop() }
    refresh()
    const timer = setInterval(refresh, 2 * 3600 * 1000)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [feedsEnabled, feedNotificationsEnabled])
  const locales = useLocales()
  // Nothing may cover the video while Android has the app pinned to it.
  const pictureInPicture = useValue(ui$.pictureInPicture)
  const primaryLocale = locales[0]
  const selectedLanguage = useValue(settings$.language)
  const systemLanguage = resolveI18nLanguageFromExpoLocale(primaryLocale) || 'en'
  const [, setLanguageRevision] = useState(0)

  useEffect(() => {
    let active = true

    const apply = async () => {
      await changeLanguage(selectedLanguage || systemLanguage)
      if (!active) {
        return
      }
      if (!isWeb) {
        const strings = i18nextT('native', { returnObjects: true }) as Record<string, string>
        NouTubeViewModule.setLocaleStrings(strings)
      }
      setLanguageRevision((revision) => revision + 1)
    }
    void apply()

    return () => {
      active = false
    }
  }, [
    primaryLocale?.languageCode,
    primaryLocale?.languageScriptCode,
    primaryLocale?.regionCode,
    selectedLanguage,
    systemLanguage,
  ])

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      // console.log('onAuthStateChange', event, session)
      // El plan y su caducidad viajan dentro de la sesión, así que se rellenan
      // aquí: quedan disponibles en cuanto se restaura la sesión, sin esperar a
      // ninguna consulta.
      const meta = session?.user.user_metadata as { plan?: string; planExpiresAt?: string } | undefined
      auth$.assign({
        loaded: true,
        userId: session?.user.id,
        userEmail: session?.user.email,
        user: session?.user.user_metadata,
        accessToken: session?.access_token,
        plan: meta?.plan,
        planExpiresAt: meta?.planExpiresAt ?? undefined,
      })
      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        void reconcileIosTransactions()
      }
    })

    feederLoop()
    return listenIosTransactions()
  }, [])

  // Sin licencia no se entra: se enseña la pantalla de activación y nada más.
  // Se mira el estado que ya está guardado en el teléfono (plan y caducidad),
  // así que funciona sin conexión y no deja fuera a quien ha pagado.
  const { loaded, plan, planExpiresAt } = useValue(auth$)
  const conLicencia = licenseState(loaded, plan, planExpiresAt) === 'active'

  if (!conLicencia) {
    return (
      <QueryClientProvider client={queryClient}>
        <LicenseGate />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MainPageContent contentJs={contentJs} />
      {nIf(
        !pictureInPicture,
        <>
          <LibraryModal />
          <DownloadsModal />
          <FeedModal />
          <BookmarkModal />
          <MoveBookmarkModal />
          <FolderModal />
          <HistoryModal />
          <QueueModal />
          {nIf(!isWeb, <SettingsModal />)}
          <UrlModal />
          <CookieModal />
          <UserAgentModal />
          <SleepTimerModal />
          <PlaybackSpeedModal />
          <PlaybackQualityModal />
          <ToolsModal />
          <ShareModal />
          {nIf(!isWeb, <TranslationCard />)}
          <UndoToast />
          <Toast />
        </>,
      )}
      {/* El reproductor de los ficheros descargados va fuera del bloque de
          arriba a propósito: tiene que seguir en pantalla aunque el vídeo esté
          en ventana flotante. */}
      <LocalPlayer />
    </QueryClientProvider>
  )
}
