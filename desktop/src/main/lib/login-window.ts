import { BrowserWindow, session, webContents } from 'electron'
import { toggleInterception } from './intercept'
import { mainWindow } from './main-window'

/**
 * Inicio de sesión de Google en una ventana aparte.
 *
 * Google bloquea el acceso desde un Chromium embebido, pero no desde Firefox.
 * La ventana se presenta como Firefox desde su primera petición hasta la
 * última, así que Google nunca ve cambiar la identidad a mitad de la cadena de
 * redirecciones (que es lo que hacía colgar el inicio de sesión).
 */
const SIGN_IN_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0'
    : process.platform === 'linux'
      ? 'Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0'

const DEFAULT_SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Des%26next%3Dhttps%253A%252F%252Fwww.youtube.com%252F&hl=es'

let loginWindow: BrowserWindow | null = null
let reloadTabsOnClose = true

export function closeLoginWindow({ reloadTabs = true } = {}): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    reloadTabsOnClose = reloadTabs
    loginWindow.close()
  }
}

let headersInstalled = false

function installSignInHeaders(): void {
  if (headersInstalled) return
  headersInstalled = true
  const ses = session.fromPartition('persist:webview')
  // Solo las peticiones de la propia ventana de login: las pestañas de YouTube
  // conservan su user agent normal.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!loginWindow || loginWindow.isDestroyed() || details.webContentsId !== loginWindow.webContents.id) {
      callback({})
      return
    }
    const headers = { ...details.requestHeaders }
    for (const name of Object.keys(headers)) {
      const lower = name.toLowerCase()
      if (lower === 'user-agent' || lower.startsWith('sec-ch-ua')) {
        delete headers[name]
      }
    }
    headers['User-Agent'] = SIGN_IN_USER_AGENT
    callback({ requestHeaders: headers })
  })
}

function isSignedInLanding(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    const isYouTube = hostname === 'www.youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube.com'
    return isYouTube && !pathname.startsWith('/signin')
  } catch {
    return false
  }
}

function reloadYouTubeTabs(): void {
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview' && !contents.isDestroyed()) {
      contents.reload()
    }
  }
}

export async function openLoginWindow(url = DEFAULT_SIGN_IN_URL): Promise<void> {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus()
    return
  }
  toggleInterception(false)
  installSignInHeaders()
  const win = new BrowserWindow({
    width: 520,
    height: 720,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    autoHideMenuBar: true,
    title: 'Iniciar sesión — VideoTotal',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      partition: 'persist:webview',
    },
  })
  loginWindow = win
  win.webContents.setUserAgent(SIGN_IN_USER_AGENT)
  win.on('page-title-updated', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let done = false
  const finish = (): void => {
    if (done) return
    done = true
    if (!win.isDestroyed()) win.close()
  }
  // Google ha terminado cuando la ventana vuelve a una página de YouTube.
  win.webContents.on('did-navigate', (_event, navigatedUrl) => {
    if (isSignedInLanding(navigatedUrl)) {
      win.webContents.once('did-finish-load', finish)
      setTimeout(finish, 5000)
    }
  })
  win.on('closed', () => {
    loginWindow = null
    toggleInterception(true)
    if (reloadTabsOnClose) reloadYouTubeTabs()
    reloadTabsOnClose = true
  })

  // Las redirecciones de Google abortan la primera carga (ERR_ABORTED): es normal.
  await win.loadURL(url, { userAgent: SIGN_IN_USER_AGENT }).catch(() => {})
}
