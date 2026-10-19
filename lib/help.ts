/**
 * Enlaces de ayuda.
 *
 * Apunta a TU página de ayuda. Mientras esté vacío, los enlaces no se muestran.
 *
 * Antes apuntaban a `oss.nonbili.jp`, la web del proyecto original: no es tuya y
 * además le enseña a tus usuarios de dónde viene la app. Rellena esto cuando
 * tengas tu propia página y los tres enlaces (el aviso de Google, el de las
 * cookies y el de Ajustes) aparecerán solos.
 */
export const SUPPORT_URL = 'https://api-production-0cd81.up.railway.app/ayuda'

/** Ancla dentro de tu página para los problemas al iniciar sesión. */
export const SIGN_IN_FAQ_URL = SUPPORT_URL ? `${SUPPORT_URL}#sign-in-problems` : ''

/** Página de preguntas frecuentes, para el menú de Ajustes. */
export const FAQ_URL = SUPPORT_URL

/**
 * Tu repositorio con el código fuente.
 *
 * No es un adorno: la licencia AGPL-3.0 exige ofrecer el código a quien reciba
 * la aplicación, así que este enlace es una obligación, no una opción.
 */
export const SOURCE_URL = 'https://github.com/fabriere/VideoTotal'

/** Tu política de privacidad. */
export const PRIVACY_URL = 'https://api-production-0cd81.up.railway.app/privacidad'

/** Enlace de donaciones propio. Si está vacío, la sección no se muestra. */
export const DONATE_URL: string = ''

/**
 * Tu WhatsApp, para que quien no tenga código pueda pedirte uno.
 *
 * El enlace va en formato internacional y sin símbolos, que es como lo necesita
 * wa.me; el número se enseña tal y como se escribe aquí.
 */
export const WHATSAPP_NUMBER = '096 796 0787'
export const WHATSAPP_URL = 'https://wa.me/593967960787'
