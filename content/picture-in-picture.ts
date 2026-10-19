import { isYTMusic, nouStorage } from './utils'

const styleId = '_nou_pip'
const ancestorClass = '_nou_pip_ancestor'
let transition = 0
let outerDimensions: Map<string, PropertyDescriptor | undefined> | undefined

// YouTube uses outer window area to detect background playback on Android.
// Keep that measurement stable during native PiP; innerWidth/innerHeight still
// describe the real viewport and size the video to the floating window.
export function preparePictureInPicture() {
  if (window.NouTubePip) return
  outerDimensions = new Map()
  for (const key of ['outerWidth', 'outerHeight'] as const) {
    outerDimensions.set(key, Object.getOwnPropertyDescriptor(window, key))
    const value = Math.max(window[key], key === 'outerWidth' ? screen.width : screen.height)
    Object.defineProperty(window, key, { configurable: true, get: () => value })
  }
  window.NouTubePip = true
}

export async function setPictureInPicture(active: boolean) {
  const currentTransition = ++transition
  if (!active) {
    const wasPlaying = !document.querySelector('video')?.paused
    window.NouTubePip = false
    document.getElementById(styleId)?.remove()
    document.querySelectorAll('.' + ancestorClass).forEach((element) => element.classList.remove(ancestorClass))
    // Android reports PiP exit before the expansion animation has finished.
    // Restore the outer measurements after the full-size viewport settles.
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (currentTransition !== transition) return
    for (const [key, descriptor] of outerDimensions || []) {
      if (descriptor) Object.defineProperty(window, key, descriptor)
      else Reflect.deleteProperty(window, key)
    }
    outerDimensions = undefined
    window.dispatchEvent(new Event('resize'))
    if (wasPlaying) window.NouTube.play()
    return
  }

  preparePictureInPicture()
  if (document.fullscreenElement) await document.exitFullscreen()
  if (!window.NouTubePip) return
  document.getElementById(styleId)?.remove()
  const video = document.querySelector('video')
  for (let parent = video?.parentElement; parent; parent = parent.parentElement) {
    parent.classList.add(ancestorClass)
  }
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    body *:not(._nou_pip_ancestor):not(video) { display: none !important; }
    ._nou_pip_ancestor {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      overflow: visible !important;
    }
    html, body { background: black !important; }
    video {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      object-fit: contain !important;
      transform: none !important;
      z-index: 2147483647 !important;
    }
  `
  document.head.appendChild(style)
  window.dispatchEvent(new Event('resize'))
  window.NouTube.play()
}

const bridgeToken = () => window.NouTubeToken || ''
const SETTINGS_KEY = 'nou:settings'
let reported = ''
let reportedPosition = -1

/**
 * URLs directas del stream que se esta reproduciendo.
 *
 * La ventana flotante las necesita porque el WebView de Android no dibuja su
 * superficie de video dentro del PiP: el video lo pone un reproductor nativo
 * (NouPipPlayer). Se leen de la respuesta del propio reproductor de YouTube, que
 * ya viene descifrada y autorizada por la sesion del usuario, asi que no hay que
 * extraer nada ni esperar.
 *
 * Se prefiere el formato progresivo (video y audio en un solo archivo, hasta
 * 720p) y, si no hay, se entregan video y audio adaptativos por separado para
 * que el lado nativo los mezcle.
 */
function playerStreams(): { videoUrl: string; audioUrl?: string } | null {
  try {
    const player = document.querySelector('#movie_player') as
      | (Element & { getPlayerResponse?: () => unknown })
      | null
    const response = (player?.getPlayerResponse?.() ?? (window as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse) as
      | { streamingData?: { formats?: unknown[]; adaptiveFormats?: unknown[] } }
      | undefined
    const data = response?.streamingData
    if (!data) return null

    type Format = { url?: string; mimeType?: string; height?: number; bitrate?: number; audioQuality?: string }
    const progressive = ((data.formats || []) as Format[])
      .filter((f) => !!f.url && String(f.mimeType).startsWith('video/mp4') && !!f.audioQuality)
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    if (progressive?.url) return { videoUrl: progressive.url }

    const adaptive = ((data.adaptiveFormats || []) as Format[]).filter((f) => !!f.url)
    const video = adaptive
      .filter((f) => String(f.mimeType).startsWith('video/mp4'))
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    const audio = adaptive
      .filter((f) => String(f.mimeType).startsWith('audio/'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
    if (!video?.url || !audio?.url) return null
    return { videoUrl: video.url, audioUrl: audio.url }
  } catch {
    return null
  }
}

// Picture-in-Picture is an opt-in setting; reporting no video is what keeps the
// native side disarmed (see NouPictureInPicture.setVideo), so the switch lives
// here.
function isPictureInPictureEnabled(): boolean {
  try {
    const settings = JSON.parse(nouStorage.getItem(SETTINGS_KEY) || '{}')
    return settings.pictureInPicture === true
  } catch {
    return false
  }
}

// YouTube Music is left out: its songs are audio with artwork drawn in the page,
// so the pinned window has no video frame to show -- only the player chrome
// that survives the shrinking stylesheet above. Leaving it disarmed lets the
// home gesture background the app the way it already does, with playback
// carried by the media notification (NouService).
//
// The native side enters Picture-in-Picture from onUserLeaveHint, which cannot
// wait for an answer from the page (the activity has paused by the time one
// arrives), so hand it the video it would show ahead of time instead. A zero
// size means there is nothing to show and PiP stays disarmed.
function reportPictureInPictureVideo() {
  const video = document.querySelector('video')
  const onVideoPage = !!document.fullscreenElement || document.location.pathname == '/watch'
  const showable =
    isPictureInPictureEnabled() &&
    !isYTMusic &&
    onVideoPage &&
    video &&
    !video.paused &&
    !video.ended &&
    video.videoWidth > 0
  const size = showable ? [video.videoWidth, video.videoHeight] : [0, 0]
  const streams = showable ? playerStreams() : null
  const position = Math.round((video?.currentTime || 0) * 1000)
  // La clave incluye la URL del stream: al pasar al siguiente video cambia sin
  // que cambie el tamano, y el lado nativo tiene que enterarse.
  const key = `${size.join('x')}|${streams?.videoUrl ? streams.videoUrl.slice(0, 96) : ''}`
  if (key == reported) {
    return
  }
  reported = key
  reportedPosition = position
  window.NouTubeI?.setPictureInPictureVideo?.(bridgeToken(), size[0], size[1])
  window.NouTubeI?.setPictureInPictureStream?.(
    bridgeToken(),
    streams?.videoUrl || '',
    streams?.audioUrl || '',
    position,
    size[0],
    size[1],
  )
}

// El nativo entra al PiP sin poder preguntar nada, asi que la posicion tiene que
// estar ya reportada. `timeupdate` dispara cuatro veces por segundo: se manda
// solo cada 5 s para no cruzar el puente sin necesidad.
function reportPictureInPicturePosition() {
  const video = document.querySelector('video')
  if (!video || video.paused || video.ended || !video.videoWidth) {
    return
  }
  const position = Math.round(video.currentTime * 1000)
  if (Math.abs(position - reportedPosition) < 5000) {
    return
  }
  reportedPosition = position
  window.NouTubeI?.setPictureInPictureStream?.(
    bridgeToken(),
    '', // sin URL: el lado nativo conserva la que ya tenia
    '',
    position,
    video.videoWidth,
    video.videoHeight,
  )
}

/**
 * Vuelve al WebView desde la ventana flotante, en la posicion que alcanzo el
 * reproductor nativo.
 */
export async function resumeFromPictureInPicture(positionMs: number) {
  const video = document.querySelector('video')
  if (!video) {
    return
  }
  if (Number.isFinite(positionMs) && positionMs > 0) {
    video.currentTime = positionMs / 1000
  }
  try {
    await video.play()
  } catch {
    /* el navegador puede exigir un gesto; YouTube reanuda solo al volver */
  }
}

export function watchPictureInPictureVideo() {
  if (!window.isAndroid || !window.NouTubeI?.setPictureInPictureVideo) {
    return
  }

  // Media events do not bubble, and YouTube swaps the video element around, so
  // listen for them on the way down instead of binding to one element.
  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied', 'loadedmetadata', 'resize']) {
    document.addEventListener(type, reportPictureInPictureVideo, true)
  }
  document.addEventListener('timeupdate', reportPictureInPicturePosition, true)
  for (const type of ['yt-navigate-finish', 'fullscreenchange', 'popstate', 'noutube:settings']) {
    window.addEventListener(type, reportPictureInPictureVideo)
  }
  reportPictureInPictureVideo()
}
