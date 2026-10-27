import { expect, test } from 'bun:test'
import {
  isLicenseActive,
  licenseState,
  serverEntitlementIsAuthoritative,
} from '@/lib/license'

/**
 * Regresión del fallo reportado: "el cliente pone la licencia, cierra la app y
 * al abrirla le vuelve a pedir el código y no puede pasar".
 *
 * La causa era que `MainPageContent` hacía `auth$.plan.set(me?.plan)` sin
 * condiciones. Mientras `/me` no había respondido, `me` era `undefined` y eso
 * borraba el plan que se acababa de restaurar del disco.
 *
 * La regla que se prueba aquí: la licencia guardada solo se puede pisar con una
 * respuesta REAL de la API (`source: 'videototal'`).
 */

test('una consulta sin respuesta no puede pisar la licencia guardada', () => {
  expect(serverEntitlementIsAuthoritative(undefined)).toBe(false)
  expect(serverEntitlementIsAuthoritative(null)).toBe(false)
})

test('el valor por defecto (sin sesión) no puede pisar la licencia guardada', () => {
  // Es lo que devuelve getMeQuery cuando no hay token o cuando /me da 401/402.
  expect(serverEntitlementIsAuthoritative({ source: 'none' })).toBe(false)
})

test('una respuesta real de la API sí manda, incluso si dice free', () => {
  expect(serverEntitlementIsAuthoritative({ source: 'videototal' })).toBe(true)
})

test('con la licencia guardada, el cliente entra aunque el servidor no conteste', () => {
  const licenciaAnual = {
    plan: 'pro',
    expiresAt: new Date(Date.now() + 200 * 86_400_000).toISOString(),
  }
  // Lo que hace el arranque: loaded = true con lo que hay en disco.
  expect(licenseState(true, licenciaAnual.plan, licenciaAnual.expiresAt)).toBe('active')
  expect(isLicenseActive(licenciaAnual.plan, licenciaAnual.expiresAt)).toBe(true)
})

test('sin licencia guardada sí se pide el código', () => {
  expect(licenseState(true, undefined, undefined)).toBe('missing')
  expect(licenseState(true, 'free', undefined)).toBe('missing')
})

test('una licencia caducada no deja entrar', () => {
  const ayer = new Date(Date.now() - 86_400_000).toISOString()
  expect(licenseState(true, 'pro', ayer)).toBe('expired')
})
