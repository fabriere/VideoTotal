/**
 * Pantalla de licencia.
 *
 * Es lo primero que se ve al abrir la aplicación: sin un código válido no se
 * entra, igual que en la aplicación de la competencia. Se enseña cuando no hay
 * licencia ('missing') o cuando ha caducado ('expired').
 *
 * Tiene dos caminos, y los dos hacen falta:
 *   - Código: para el primer dispositivo.
 *   - Correo y contraseña: para los demás. Un código se gasta al activarlo, así
 *     que un cliente con dos teléfonos entraría en el primero y se quedaría
 *     fuera del segundo si aquí no pudiera identificarse.
 */

import { useValue } from '@legendapp/state/react'
import { useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { t } from 'i18next'
import icono from '../assets/images/icon.png'
import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { NouText } from './NouText'
import { WHATSAPP_URL } from '@/lib/help'
import { licenseState } from '@/lib/license'
import { activateLicense, signIn } from '@/lib/supabase/auth'
import { availableState, gateUpdateLabel, progressPercent, sizeInMB, type GateUpdateState, type GateUpdateTone } from '@/lib/videototal/gate-update'
import { checkForUpdate, currentVersion, downloadAndInstall } from '@/lib/videototal/updates'
import { auth$ } from '@/states/auth'

const PLACEHOLDER_COLOR = '#a1a1aa'

/** Color del aviso del actualizador, junto al botón. */
const tonoCls: Record<GateUpdateTone, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-zinc-500',
  warn: 'text-red-500',
}

const mensajeDeError = (e: unknown): string => {
  if (e instanceof Error && e.message) {
    return e.message
  }
  return String(e)
}

const inputCls =
  'h-12 rounded-xl border border-zinc-300 px-4 text-base text-zinc-900 dark:border-zinc-700 dark:text-zinc-100'

export const LicenseGate: React.FC = () => {
  const queryClient = useQueryClient()
  const { loaded, plan, planExpiresAt } = useValue(auth$)
  const [modo, setModo] = useState<'code' | 'login'>('code')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [updateState, setUpdateState] = useState<GateUpdateState>({ kind: 'idle' })
  const [updating, setUpdating] = useState(false)

  const estado = licenseState(loaded, plan, planExpiresAt)

  /**
   * Traer la versión nueva sin salir de esta pantalla.
   *
   * Un cliente atascado aquí no puede llegar a Ajustes, así que no puede usar el
   * actualizador de dentro: esta es su única salida sola.
   */
  const buscarActualizacion = async () => {
    if (updating) return
    setUpdating(true)
    setUpdateState({ kind: 'checking' })
    try {
      const encontrada = await checkForUpdate()
      if (!encontrada) {
        setUpdateState({ kind: 'latest', version: currentVersion() })
        return
      }
      setUpdateState(availableState(encontrada))
      await downloadAndInstall(encontrada, (fraccion) => {
        setUpdateState({
          kind: 'downloading',
          version: encontrada.version,
          sizeMB: sizeInMB(encontrada.sizeBytes),
          percent: progressPercent(fraccion),
        })
      })
      // El instalador de Android ya está abierto; si el cliente lo cierra sin
      // instalar, el APK sigue en la caché y este botón lo reabre sin bajar nada.
      setUpdateState(availableState(encontrada))
    } catch {
      setUpdateState({ kind: 'error' })
    } finally {
      setUpdating(false)
    }
  }

  const entrar = async () => {
    if (modo === 'code' && code.trim().length === 0) {
      return
    }
    if (modo === 'login' && (email.trim().length === 0 || password.length === 0)) {
      return
    }
    setError(undefined)
    setBusy(true)
    try {
      // El servidor devuelve el plan ya aplicado. Se guarda DIRECTAMENTE en el
      // estado, sin esperar a la sesión ni a la consulta de usuario: si no, el
      // código se gastaba en el servidor y la pantalla seguía pidiendo
      // licencia, que es exactamente el fallo que se vio en el teléfono.
      const respuesta: any =
        modo === 'code'
          ? await activateLicense(code.trim())
          : await signIn(email.trim(), password)
      const usuario = respuesta?.user ?? respuesta
      const planNuevo = usuario?.plan ?? usuario?.user_metadata?.plan
      // `activate` devuelve un ApiUser: el campo es `planExpiresAt`, no `expiresAt`.
      const caduca =
        usuario?.planExpiresAt ?? usuario?.expiresAt ?? usuario?.user_metadata?.planExpiresAt
      if (planNuevo && planNuevo !== 'free') {
        auth$.assign({ loaded: true, plan: planNuevo, planExpiresAt: caduca ?? undefined })
      }
      if (modo === 'code') {
        setCode('')
      } else {
        setEmail('')
        setPassword('')
      }
      // El plan lo manda el servidor: hay que releerlo después de entrar.
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      if (!planNuevo || planNuevo === 'free') {
        setError(t('gate.activatedNoPlan'))
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setBusy(false)
    }
  }

  // Mientras se restaura la sesión no se enseña nada: evita que la pantalla de
  // activación aparezca un instante a quien ya tiene licencia.
  if (estado === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-950">
        <ActivityIndicator />
      </View>
    )
  }

  const caducada = estado === 'expired'
  const esLogin = modo === 'login'
  const vacio = esLogin ? email.trim().length === 0 || password.length === 0 : code.trim().length === 0

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white dark:bg-zinc-950"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-start', paddingTop: 54, paddingHorizontal: 28 }}
        keyboardShouldPersistTaps="handled"
      >
      <View className="items-center">
        <Image
          source={icono}
          style={{ width: 96, height: 96, borderRadius: 22 }}
          contentFit="contain"
        />
        <NouText className="mt-5 text-2xl font-bold">VideoTotal</NouText>
      </View>

      <NouText className="mt-6 text-center text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {esLogin ? t('gate.loginIntro') : caducada ? t('gate.expired') : t('gate.intro')}
      </NouText>

      <View className="mt-7">
        {esLogin ? (
          <>
            <NouText className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t('gate.email')}
            </NouText>
            <TextInput
              className={inputCls}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!busy}
            />
            <NouText className="mb-1 mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t('gate.password')}
            </NouText>
            <TextInput
              className={inputCls}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              editable={!busy}
              onSubmitEditing={() => void entrar()}
            />
          </>
        ) : (
          <>
            <NouText className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t('gate.codeLabel')}
            </NouText>
            <TextInput
              className={inputCls}
              value={code}
              onChangeText={setCode}
              placeholder="XXXX-XXXX-XXXX"
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={() => void entrar()}
              returnKeyType="go"
            />
          </>
        )}

        {error ? <NouText className="mt-2 text-sm text-red-500">{error}</NouText> : null}

        <Pressable
          disabled={busy || vacio}
          onPress={() => void entrar()}
          className={`mt-4 h-12 items-center justify-center rounded-xl ${
            busy || vacio ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-[#dc070c]'
          }`}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <NouText className="text-base font-semibold text-white">
              {esLogin ? t('gate.enter') : t('gate.activate')}
            </NouText>
          )}
        </Pressable>
      </View>

      <Pressable onPress={() => { setError(undefined); setModo(esLogin ? 'code' : 'login') }} className="mt-5 items-center">
        <NouText className="text-sm text-zinc-500 underline dark:text-zinc-500">
          {esLogin ? t('gate.haveCode') : t('gate.haveAccount')}
        </NouText>
      </Pressable>

      <NouText className="mt-5 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-500">
        {t('gate.trial')}
      </NouText>

      <Pressable onPress={() => void Linking.openURL(WHATSAPP_URL)} className="mt-6 items-center">
        <NouText className="text-sm text-[#dc070c] underline">{t('gate.noCode')}</NouText>
      </Pressable>

      {/* Actualizador dentro de la propia pantalla de licencia: si esta versión
          es la que no deja entrar, el cliente puede traerse la nueva sin
          depender de que le manden el APK. Solo Android. */}
      {Platform.OS === 'android' ? (
        <View className="mb-8 mt-6 items-center">
          <Pressable
            disabled={updating}
            onPress={() => void buscarActualizacion()}
            className="h-10 items-center justify-center rounded-xl border border-zinc-300 px-5 dark:border-zinc-700"
          >
            {updating ? (
              <ActivityIndicator />
            ) : (
              <NouText className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                {t('gate.updateCheck')}
              </NouText>
            )}
          </Pressable>
          {(() => {
            const etiqueta = gateUpdateLabel(updateState)
            if (!etiqueta) return null
            return (
              <NouText className={`mt-2 text-center text-xs leading-5 ${tonoCls[etiqueta.tone]}`}>
                {t(etiqueta.key, etiqueta.params)}
              </NouText>
            )
          })()}
        </View>
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
