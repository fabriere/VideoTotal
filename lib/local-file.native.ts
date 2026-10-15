import { File } from 'expo-file-system'

/**
 * ¿Sigue el fichero descargado en el teléfono?
 *
 * El usuario puede borrarlo desde la galería o el explorador de archivos, y en
 * ese caso la entrada del historial apuntaría a la nada: conviene decírselo en
 * la lista en vez de fallar al tocarla.
 *
 * `File.exists` es un getter síncrono en la API nueva de expo-file-system.
 */
export function localFileExists(uri: string): boolean {
  if (!uri) {
    return false
  }
  try {
    return new File(uri).exists
  } catch {
    return false
  }
}
