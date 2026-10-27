import { expect, test } from 'bun:test'
import {
  availableState,
  gateUpdateLabel,
  progressPercent,
  sizeInMB,
} from '@/lib/videototal/gate-update'

/**
 * El botón de actualizar vive en la pantalla de licencia, que es justo donde se
 * queda atrapado un cliente con una versión rota. Se prueba la lógica que decide
 * qué se le enseña, sin depender de i18next ni de React Native.
 */

test('el tamaño se enseña en MB con un decimal', () => {
  expect(sizeInMB(78.6 * 1024 * 1024)).toBe('78.6')
  expect(sizeInMB(0)).toBe('0')
  expect(sizeInMB(Number.NaN)).toBe('0')
})

test('el progreso se acota a 0–100', () => {
  expect(progressPercent(0)).toBe(0)
  expect(progressPercent(0.5)).toBe(50)
  expect(progressPercent(1)).toBe(100)
  expect(progressPercent(1.4)).toBe(100)
  expect(progressPercent(-0.2)).toBe(0)
  expect(progressPercent(Number.NaN)).toBe(0)
})

test('mientras no se ha tocado el botón no hay mensaje', () => {
  expect(gateUpdateLabel({ kind: 'idle' })).toBeNull()
})

test('al comprobar avisa de que está buscando', () => {
  const etiqueta = gateUpdateLabel({ kind: 'checking' })
  expect(etiqueta?.key).toBe('gate.updateChecking')
  expect(etiqueta?.tone).toBe('info')
})

test('si ya está al día lo dice con la versión instalada', () => {
  const etiqueta = gateUpdateLabel({ kind: 'latest', version: '0.7.25' })
  expect(etiqueta?.key).toBe('gate.updateLatest')
  expect(etiqueta?.params.version).toBe('0.7.25')
  expect(etiqueta?.tone).toBe('ok')
})

test('con versión nueva avisa del tamaño antes de descargar', () => {
  const estado = availableState({
    version: 'v0.7.26',
    url: 'https://example.test/app.apk',
    notes: '',
    sizeBytes: 82_429_324,
  })
  const etiqueta = gateUpdateLabel(estado)
  expect(etiqueta?.key).toBe('gate.updateAvailable')
  expect(etiqueta?.params.version).toBe('v0.7.26')
  expect(etiqueta?.params.size).toBe('78.6')
})

test('durante la descarga se ve el porcentaje', () => {
  const etiqueta = gateUpdateLabel({
    kind: 'downloading',
    version: 'v0.7.26',
    sizeMB: '78.6',
    percent: 42,
  })
  expect(etiqueta?.key).toBe('gate.updateDownloading')
  expect(etiqueta?.params.pct).toBe(42)
})

test('si falla, el aviso es de alerta y va junto al botón', () => {
  const etiqueta = gateUpdateLabel({ kind: 'error' })
  expect(etiqueta?.key).toBe('gate.updateError')
  expect(etiqueta?.tone).toBe('warn')
})
