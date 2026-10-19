import { app } from 'electron'
import { join } from 'path'
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { gunzipSync } from 'zlib'

/**
 * FFmpeg para las descargas de PC.
 *
 * yt-dlp lo necesita para unir el video y el audio que YouTube sirve por
 * separado (todo lo que sea más de 360p) y para hacer MP3. Windows no trae
 * FFmpeg, así que se descarga un binario estático la primera vez, igual que se
 * hace con yt-dlp, y se guarda junto a él en la carpeta de datos de la app.
 */
const FFMPEG_RELEASE = 'b6.1.1'
const FFMPEG_URLS: Record<string, string> = {
  win32: `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-win32-x64.gz`,
}

export function getFfmpegPath(): string {
  return join(app.getPath('userData'), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}

let pending: Promise<string | null> | null = null

/**
 * Ruta para pasar como `--ffmpeg-location`, o null donde se usa el FFmpeg del
 * sistema (Linux, macOS) o no se pudo descargar; en ese caso yt-dlp avisa él
 * mismo de que falta FFmpeg.
 */
export function ensureFfmpeg(): Promise<string | null> {
  const url = FFMPEG_URLS[process.arch === 'x64' ? process.platform : '']
  if (!url) return Promise.resolve(null)
  const binaryPath = getFfmpegPath()
  if (existsSync(binaryPath)) return Promise.resolve(binaryPath)
  pending ??= (async () => {
    try {
      console.log(`Downloading FFmpeg from ${url}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to download FFmpeg: ${res.status} ${res.statusText}`)
      const data = gunzipSync(Buffer.from(await res.arrayBuffer()))
      // Se escribe aparte y se renombra, para que una descarga cortada no deje
      // un ffmpeg.exe roto que después existsSync daría por bueno.
      const temp = `${binaryPath}.download`
      writeFileSync(temp, data)
      renameSync(temp, binaryPath)
      console.log(`FFmpeg downloaded to ${binaryPath}`)
      return binaryPath
    } catch (e) {
      console.error('FFmpeg download failed', e)
      try {
        unlinkSync(`${binaryPath}.download`)
      } catch {
        /* el temporal puede no existir */
      }
      return null
    } finally {
      pending = null
    }
  })()
  return pending
}

/**
 * YouTube ya exige un runtime de JavaScript para desbloquear sus formatos
 * ("No supported JavaScript runtime could be found ... some formats may be
 * missing"). Electron ya trae uno: su propio ejecutable corre como Node plano
 * con ELECTRON_RUN_AS_NODE, así que se le indica a yt-dlp ese runtime en vez de
 * pedirle al usuario que instale Deno.
 */
export function ytDlpRuntimeArgs(): string[] {
  return ['--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github']
}

export function ytDlpEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}
