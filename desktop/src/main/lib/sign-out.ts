import { session, webContents } from 'electron'
import { closeLoginWindow } from './login-window'

/**
 * Borra todo rastro de Google/YouTube de la app.
 *
 * Google recuerda al "navegador" por sus propias cookies, que sobreviven a un
 * simple cerrar sesión de YouTube. Cuando una segunda cuenta entra en un
 * navegador que Google ya conoce, aplica su comprobación más estricta, y esa
 * comprobación es la que detecta el navegador embebido ("No puedes acceder").
 * El primer inicio de sesión en una app limpia sí funciona, así que cerrar
 * sesión borra todas las huellas y el siguiente vuelve a ser el primero.
 */
const GOOGLE_DOMAINS = ['google.com', 'youtube.com', 'googlevideo.com', 'ytimg.com', 'ggpht.com', 'gstatic.com']

function isGoogleDomain(domain = ''): boolean {
  const host = domain.replace(/^\./, '')
  return GOOGLE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) || /(^|\.)google\.[a-z.]+$/.test(host)
}

let signingOut: Promise<void> | null = null

export function signOutAll(): Promise<void> {
  signingOut ??= doSignOut().finally(() => {
    signingOut = null
  })
  return signingOut
}

async function doSignOut(): Promise<void> {
  closeLoginWindow({ reloadTabs: false })

  // Aquí solo viven las pestañas de YouTube y la ventana de login.
  const webviewSession = session.fromPartition('persist:webview')
  await webviewSession.clearData().catch((e) => console.error('clearData failed:', e))
  await webviewSession.clearCache().catch(() => {})
  await webviewSession.clearAuthCache().catch(() => {})
  webviewSession.flushStorageData()

  // La sesión por defecto también guarda el código de acceso y los ajustes, así
  // que de ahí solo se van las cookies de Google (builds viejas dejaron algunas).
  const defaultSession = session.defaultSession
  const cookies = await defaultSession.cookies.get({}).catch(() => [])
  await Promise.all(
    cookies
      .filter((cookie) => isGoogleDomain(cookie.domain))
      .map((cookie) => {
        const host = (cookie.domain || '').replace(/^\./, '')
        const url = `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`
        return defaultSession.cookies.remove(url, cookie.name).catch(() => {})
      }),
  )
  defaultSession.flushStorageData()

  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() !== 'webview' || contents.isDestroyed()) continue
    let target = 'https://www.youtube.com/'
    try {
      if (new URL(contents.getURL()).hostname === 'music.youtube.com') {
        target = 'https://music.youtube.com/'
      }
    } catch {
      /* url no parseable: se queda el destino por defecto */
    }
    contents.loadURL(target).catch(() => {})
  }
}
