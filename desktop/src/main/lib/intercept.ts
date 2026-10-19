import { app, net, session, type WebContents } from 'electron'
import {
  RE_INTERCEPT,
  transformBrowseResponse,
  transformGetWatchResponse,
  transformPlayerResponse,
  transformReelResponse,
  transformSearchResponse,
} from 'noutube/lib/intercept'
import { createDefaultBlocklistSnapshot, normalizeBlocklist, type BlocklistSnapshot } from 'noutube/lib/blocklist'

let currentBlocklist = createDefaultBlocklistSnapshot()
// Ad blocking is opt-out and separate from the interception itself, which the
// blocklist and the title rewriting need either way (see states/settings.ts).
let transformOptions = { blockAds: true }

export function setInterceptionBlocklist(blocklist?: BlocklistSnapshot) {
  currentBlocklist = normalizeBlocklist(blocklist)
}

export function setInterceptionBlockAds(enabled: boolean) {
  transformOptions = { blockAds: enabled !== false }
}

function findJsonBounds(text: string, startIndex: number) {
  let braceCount = 0
  let inString = false
  let stringChar = ''
  let escaped = false
  const jsonStart = text.indexOf('{', startIndex)
  if (jsonStart === -1) return null

  for (let i = jsonStart; i < text.length; i++) {
    const char = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (inString) {
      if (char === stringChar) {
        inString = false
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = true
      stringChar = char
      continue
    }
    if (char === '{') {
      braceCount++
    } else if (char === '}') {
      braceCount--
      if (braceCount === 0) {
        return { start: jsonStart, end: i + 1 }
      }
    }
  }
  return null
}

// JSON.stringify happily emits `<`, which would end the inline <script> early.
// YouTube itself escapes these, so mirror that.
function escapeForScriptTag(json: string) {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function transformEmbeddedJson(html: string, key: string, transform: (json: string) => string) {
  let index = html.indexOf(`var ${key} =`)
  if (index === -1) {
    index = html.indexOf(`${key} =`)
    if (index === -1) {
      return html
    }
  }

  const bounds = findJsonBounds(html, index)
  if (!bounds) {
    return html
  }

  try {
    const transformed = escapeForScriptTag(transform(html.slice(bounds.start, bounds.end)))
    return html.slice(0, bounds.start) + transformed + html.slice(bounds.end)
  } catch (e) {
    console.error(`Failed to transform ${key} inside HTML:`, e)
    return html
  }
}

function transformHtml(html: string) {
  // ytInitialData carries the server-rendered feed (home, subscriptions, watch
  // sidebar), which is where feed ads and blocklisted items come from on first
  // paint; continuations go through /youtubei/v1/browse below.
  const withoutAds = transformEmbeddedJson(html, 'ytInitialData', (json) =>
    transformBrowseResponse(json, currentBlocklist, transformOptions),
  )
  return transformEmbeddedJson(withoutAds, 'ytInitialPlayerResponse', (json) =>
    transformPlayerResponse(json, undefined, transformOptions),
  )
}

function isYouTubeHost(url: string) {
  try {
    const { hostname } = new URL(url)
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com')
  } catch {
    return false
  }
}

function getTransformTarget(url: string) {
  const { hostname, pathname } = new URL(url)
  const isYT = hostname === 'youtube.com' || hostname.endsWith('.youtube.com')
  if (!isYT) {
    return null
  }

  const match = pathname.match(RE_INTERCEPT)
  if (pathname.startsWith('/watch') || match) {
    return { pathname, match }
  }

  return null
}

// Any YouTube page navigation, so the server-rendered ytInitialData of the home
// feed gets filtered too, not just /watch.
function isDocumentRequest(req: Request) {
  if (req.method !== 'GET') {
    return false
  }
  return (req.headers.get('accept') || '').includes('text/html')
}

export function interceptHttpRequest() {
  const ses = session.fromPartition('persist:webview')

  ses.setCertificateVerifyProc((request, callback) => {
    if (
      request.hostname.endsWith('.youtube.com') ||
      request.hostname.endsWith('.googlevideo.com') ||
      request.hostname.endsWith('.ytimg.com') ||
      request.hostname.endsWith('.ggpht.com') ||
      request.hostname === 'youtube.com'
    ) {
      callback(0)
    } else {
      callback(-3)
    }
  })

  if (ses.protocol.isProtocolHandled('https')) {
    return
  }

  ses.protocol.handle('https', async (req) => {
    // Keep signed media/CDN requests out of YouTube session rewriting.
    if (!isYouTubeHost(req.url)) {
      // Se deja net.fetch (sesión por defecto) a propósito: la petición ya no
      // puede ser la de Google, porque las navegaciones a accounts.google.com
      // se cancelan en watchWebviewNavigations() y el login va en su ventana
      // aparte, con la intercepción apagada. Cambiarlo a ses.fetch no arregla
      // el inicio de sesión y sí altera el resto del tráfico.
      return net.fetch(req, {
        bypassCustomProtocolHandlers: true,
      })
    }

    const target = getTransformTarget(req.url)
    const isDocument = isDocumentRequest(req)
    if (!target && !isDocument) {
      return ses.fetch(req, {
        bypassCustomProtocolHandlers: true,
      })
    }

    let res: Response
    try {
      res = await ses.fetch(req, {
        bypassCustomProtocolHandlers: true,
      })
    } catch (e) {
      console.error(`Interception fetch failed for ${req.url}:`, e)
      return Response.error()
    }

    const isHtml = (res.headers.get('content-type') || '').includes('text/html')
    if (res.status > 200 || (!isHtml && !target?.match)) {
      return res
    }

    const match = target?.match
    const text = await res.text()
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')
    headers.delete('transfer-encoding')
    const responseInit = {
      status: res.status,
      headers,
    }
    try {
      if (isHtml) {
        return new Response(transformHtml(text), responseInit)
      }

      if (match) {
        switch (match[1]) {
          case 'browse':
          case 'next':
            return new Response(transformBrowseResponse(text, currentBlocklist, transformOptions), responseInit)
          case 'search':
            return new Response(transformSearchResponse(text, currentBlocklist, transformOptions), responseInit)
          case 'get_watch':
            return new Response(transformGetWatchResponse(text, transformOptions), responseInit)
          case 'reel':
            return new Response(transformReelResponse(text, currentBlocklist, transformOptions), responseInit)
          default:
            return new Response(transformPlayerResponse(text, undefined, transformOptions), responseInit)
        }
      }
    } catch (e) {
      console.error(e)
    }
    return new Response(text, responseInit)
  })
}

export function toggleInterception(enabled: boolean) {
  if (enabled) {
    interceptHttpRequest()
  } else {
    const ses = session.fromPartition('persist:webview')
    if (ses.protocol.isProtocolHandled('https')) {
      ses.protocol.unhandle('https')
    }
  }
}

/**
 * El inicio de sesión de Google nunca ocurre dentro de las pestañas.
 *
 * - El handler de https anterior lo rompe (las cookies de Google acaban en el
 *   tarro equivocado: "401 ... formato incorrecto").
 * - Google rechaza un Chromium embebido ("No puedes acceder").
 * - Cambiar el user agent de la pestaña a mitad de la cadena de redirecciones
 *   hace que Chromium recargue y el inicio de sesión se queda colgado.
 *
 * Por eso cualquier navegación de una pestaña a accounts.google.com se cancela
 * y el login se abre en su propia ventana (login-window.ts), que es Firefox
 * durante toda su vida y corre con la intercepción apagada.
 */
function isSignInUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'accounts.google.com'
  } catch {
    return false
  }
}

let pendingSignIn = false
let pendingSignOut = false

// El "Salir" de YouTube (youtube.com/logout → accounts.google.com/Logout) y el
// "Agregar cuenta" de Google (AddSession): ambos significan que viene otra
// cuenta, así que antes se borra la memoria de Google de este navegador
// (sign-out.ts).
function isSignOutUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    const path = pathname.toLowerCase()
    if (hostname === 'accounts.google.com') {
      return path.startsWith('/logout')
    }
    return (
      (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) && (path === '/logout' || path.startsWith('/logout/'))
    )
  } catch {
    return false
  }
}

function isAddAccountUrl(url: string): boolean {
  try {
    const { hostname, pathname, search } = new URL(url)
    return hostname === 'accounts.google.com' && /addsession/i.test(pathname + search)
  } catch {
    return false
  }
}

function signOutLater(then?: () => void): void {
  if (pendingSignOut) return
  pendingSignOut = true
  setTimeout(() => {
    void import('./sign-out')
      .then(({ signOutAll }) => signOutAll())
      .catch((e) => console.error('Sign-out failed:', e))
      .finally(() => {
        pendingSignOut = false
        then?.()
      })
  }, 0)
}

// Nunca detener ni arrancar navegaciones desde dentro de un evento de
// navegación: Chromium tumba la app entera si se cancela una navegación que
// todavía se está montando (la app se cerraba al pulsar "Acceder"). Solo los
// eventos cancelables llaman a preventDefault; el resto se aplaza al siguiente
// turno del bucle de eventos.
function openSignInLater(url?: string): void {
  if (pendingSignIn) return
  pendingSignIn = true
  setTimeout(() => {
    pendingSignIn = false
    void import('./login-window')
      .then(({ openLoginWindow }) => openLoginWindow(url))
      .catch((e) => console.error('Sign-in window failed:', e))
  }, 0)
}

/**
 * Lo mínimo que se usa de un evento de navegación de Electron: las versiones
 * nuevas lo pasan como objeto (`event.url`, `event.isMainFrame`) y las viejas
 * como argumentos sueltos, así que se aceptan las dos formas.
 */
type NavigationEventLike = {
  url?: string
  isMainFrame?: boolean
  preventDefault?: () => void
}

function navigationDetails(
  event: NavigationEventLike | undefined,
  legacyUrl?: string,
  legacyMainFrame?: boolean,
): { url?: string; isMainFrame?: boolean } {
  const url: string | undefined = event?.url ?? legacyUrl
  const isMainFrame: boolean | undefined = event?.isMainFrame ?? legacyMainFrame
  return { url, isMainFrame }
}

function watchWebview(contents: WebContents): void {
  // Cancelable: la pestaña se queda donde estaba y se abre la ventana de login.
  const onCancellable = (
    event: NavigationEventLike,
    legacyUrl?: string,
    _inPlace?: boolean,
    legacyMainFrame?: boolean,
  ): void => {
    const { url, isMainFrame } = navigationDetails(event, legacyUrl, legacyMainFrame)
    if (!url || isMainFrame === false) return
    if (isSignOutUrl(url)) {
      event?.preventDefault?.()
      signOutLater()
      return
    }
    if (!isSignInUrl(url)) return
    event?.preventDefault?.()
    if (isAddAccountUrl(url)) {
      signOutLater(() => openSignInLater())
      return
    }
    openSignInLater(url)
  }
  contents.on('will-navigate', onCancellable)
  contents.on('will-redirect', onCancellable)

  // Lo que aun así acabe en Google dentro de una pestaña (URL escrita a mano,
  // loadURL): ya cometida la navegación, se vuelve atrás y se abre la ventana.
  contents.on('did-navigate', (_event, url) => {
    if (isSignOutUrl(url)) {
      signOutLater()
      return
    }
    if (!isSignInUrl(url)) return
    setTimeout(() => {
      if (contents.isDestroyed()) return
      if (contents.navigationHistory?.canGoBack?.()) {
        contents.navigationHistory.goBack()
      } else {
        void contents.loadURL('https://www.youtube.com/')
      }
    }, 0)
    openSignInLater(url)
  })
}

let watchingWebviews = false

/** Engancha la vigilancia a cada webview que se cree. Llamar una sola vez. */
export function watchWebviewNavigations(): void {
  if (watchingWebviews) return
  watchingWebviews = true
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      watchWebview(contents)
    }
  })
}
