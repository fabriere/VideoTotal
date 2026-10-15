/**
 * ¿Sigue el fichero descargado en el dispositivo?
 *
 * En web no hay forma fiable de comprobarlo desde aquí, así que se da por
 * bueno y se deja que falle al abrirlo. En móvil sí se puede consultar.
 */
export function localFileExists(uri: string): boolean {
  return !!uri
}
