/**
 * Actualizaciones de la app Android sin que el cliente tenga que buscar el APK.
 *
 * Cómo funciona: cada versión se publica como *release* en el repositorio
 * público (el APK va adjunto). La app pregunta por la última, compara con la
 * suya y, si hay una nueva, la descarga y abre el instalador de Android.
 *
 * Lo que NO se puede: instalar sin intervención del usuario. Android exige que
 * alguien pulse "Instalar"; lo que se elimina es tener que buscar el enlace,
 * descargar a mano y volver a activar. Los datos y la licencia se conservan
 * porque es una actualización, no una instalación limpia.
 */

import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'

const OWNER = 'fabriere'
const REPO = 'VideoTotal'
const LATEST_RELEASE = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`

export interface AvailableUpdate {
  version: string
  url: string
  notes: string
  sizeBytes: number
}

/** Versión instalada, tal como la declaró el build. */
export function currentVersion(): string {
  return Constants.expoConfig?.version || '0.0.0'
}

/**
 * Compara dos versiones numéricas (`0.7.22` > `0.7.9`).
 * Devuelve > 0 si `a` es más nueva, < 0 si lo es `b`, 0 si son iguales.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Consulta si hay una versión más nueva publicada. `null` = ya está al día. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const res = await fetch(LATEST_RELEASE, { headers: { accept: 'application/vnd.github+json' } })
  if (!res.ok) {
    throw new Error(`GitHub respondió ${res.status}`)
  }
  const release = (await res.json()) as {
    tag_name?: string
    name?: string
    body?: string
    assets?: Array<{ name: string; size: number; browser_download_url: string }>
  }

  const version = String(release.tag_name || release.name || '').trim()
  if (!version) return null

  const asset = (release.assets || []).find((item) => /\.apk$/i.test(item.name))
  if (!asset) return null

  if (compareVersions(version, currentVersion()) <= 0) return null

  return {
    version,
    url: asset.browser_download_url,
    notes: release.body || '',
    sizeBytes: asset.size,
  }
}

/**
 * Descarga el APK y abre el instalador del sistema.
 *
 * El archivo va a la caché (no ocupa espacio permanente) y se comparte con el
 * instalador mediante el content:// de Expo, que ya trae el FileProvider y el
 * permiso de lectura: no hace falta configurar nada más.
 */
export async function downloadAndInstall(
  update: AvailableUpdate,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const target = `${FileSystem.cacheDirectory}videototal-${update.version}.apk`

  // Si ya se descargó en un intento anterior (por ejemplo, Android pidió permiso
  // y el usuario volvió), se reutiliza en vez de bajar 80 MB otra vez.
  const existing = await FileSystem.getInfoAsync(target)
  const completo = existing.exists && (!update.sizeBytes || existing.size === update.sizeBytes)

  if (!completo) {
    await FileSystem.deleteAsync(target, { idempotent: true })

    const download = FileSystem.createDownloadResumable(update.url, target, {}, (progress) => {
      const total = progress.totalBytesExpectedToWrite || update.sizeBytes || 0
      if (total > 0) onProgress?.(progress.totalBytesWritten / total)
    })

    const result = await download.downloadAsync()
    if (!result?.uri) {
      throw new Error('La descarga no devolvió ningún archivo')
    }
  }

  const contentUri = await FileSystem.getContentUriAsync(target)
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      // FLAG_GRANT_READ_URI_PERMISSION: el instalador es otro proceso y necesita
      // permiso explícito para leer el archivo.
      flags: 1,
      type: 'application/vnd.android.package-archive',
    })
  } catch {
    // Android 8+: instalar fuera de la tienda exige autorizar a esta app como
    // fuente. Se lleva al usuario a ese ajuste; al volver, el APK ya está en la
    // caché y el segundo intento instala sin descargar de nuevo.
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: `package:${Constants.expoConfig?.android?.package ?? ''}`,
    })
  }
}
