import { useEffect, useState } from 'react'
import { Alert, Pressable, TextInput, View } from 'react-native'
import { NouText } from '../NouText'
import { Image } from 'expo-image'
import { useValue } from '@legendapp/state/react'
import { useQueryClient } from '@tanstack/react-query'
import { auth$ } from '@/states/auth'
import { isIos, isWeb, nIf } from '@/lib/utils'
import { PRIVACY_URL } from '@/lib/help'
import { activateLicense, claimAccount, deleteAccount, signIn, signOut, signUp } from '@/lib/supabase/auth'
import { prepareIosPurchase, redeemLicense } from '@/lib/query'
import { syncSupabase } from '@/lib/supabase/sync'
import { deliverIosTransaction, IOS_SYNC_PRODUCT_ID } from '@/lib/ios-billing'
import { useMe } from '@/lib/hooks/useMe'
import NouBilling from '@/modules/nou-billing'
import { NouLink } from '../link/NouLink'
import { NouMenu } from '../menu/NouMenu'
import { capitalize } from 'es-toolkit'
import { t } from 'i18next'
import { MaterialButton } from '../button/IconButtons'
import { NouButton } from '../button/NouButton'
import { useTwColor } from '@/lib/theme'

const surfaceCls =
  'overflow-hidden rounded-[24px] bg-white dark:bg-zinc-900'
const sectionLabelCls = 'mb-2 px-1 text-[11px] uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500'
const inputCls =
  'mb-3 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-sm text-zinc-900 dark:text-zinc-100'
const PLACEHOLDER_COLOR = '#71717a'
const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
// La política de privacidad es la de TU servicio, no la del proyecto original:
// la app manda datos a tu servidor y eso hay que decirlo con tus palabras.
const PRIVACY_POLICY_URL = PRIVACY_URL

type BusyAction = 'buy' | 'restore' | 'manage'

const SettingsBadge: React.FC<{ label: string }> = ({ label }) => {
  return (
    <View className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-950 px-3 py-1">
      <NouText className="text-xs text-zinc-700 dark:text-zinc-300">{label}</NouText>
    </View>
  )
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Registro y acceso dentro de la propia app.
 *
 * Antes esto era un enlace que abría `noutube.inks.page/auth/app` en el
 * navegador. Ahora se habla directamente con our servidor.
 */
const SyncAuthForm: React.FC = () => {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'in' | 'up' | null>(null)
  const [error, setError] = useState<string>()

  const submit = async (mode: 'in' | 'up') => {
    setError(undefined)
    setBusy(mode)
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password)
      } else {
        await signUp(email.trim(), password)
      }
      // El plan lo manda el servidor: hay que releerlo tras entrar.
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const canSubmit = email.trim().length > 0 && password.length >= 8 && busy === null

  return (
    <View className={surfaceCls}>
      <View className="px-5 py-5">
        <NouText className="text-lg font-semibold">{t('sync.label')}</NouText>
        <NouText className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {t('sync.signInHint')}
        </NouText>

        <View className="mt-5">
          <NouText className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t('sync.email')}
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
            editable={busy === null}
          />

          <NouText className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t('sync.password')}
          </NouText>
          <TextInput
            className={inputCls}
            value={password}
            onChangeText={setPassword}
            placeholder={t('sync.passwordHint')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={busy === null}
            onSubmitEditing={() => void submit('in')}
          />

          {nIf(error, <NouText className="mb-3 text-sm text-red-500">{error}</NouText>)}

          <View className="gap-3">
            <NouButton loading={busy === 'in'} disabled={!canSubmit} onPress={() => void submit('in')}>
              {t('sync.signIn')}
            </NouButton>
            <NouButton variant="outline" loading={busy === 'up'} disabled={!canSubmit} onPress={() => void submit('up')}>
              {t('sync.signUp')}
            </NouButton>
          </View>

          <NouText className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-500">
            {t('sync.signUpHint')}
          </NouText>
        </View>
      </View>
    </View>
  )
}

/** Canje de una licencia. El plan lo aplica el servidor, no el cliente. */
const RedeemForm: React.FC = () => {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [ok, setOk] = useState<string>()

  const submit = async () => {
    setError(undefined)
    setOk(undefined)
    setBusy(true)
    try {
      const me = await redeemLicense(code.trim())
      setOk(t('sync.redeemOk', { plan: capitalize(me.plan), interpolation: { escapeValue: false } }))
      setCode('')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="mt-5">
      <NouText className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {t('sync.redeemLabel')}
      </NouText>
      <TextInput
        className={inputCls}
        value={code}
        onChangeText={setCode}
        placeholder="VIDEOTOTAL-XXXX-XXXX"
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        onSubmitEditing={() => void submit()}
      />
      {nIf(error, <NouText className="mb-3 text-sm text-red-500">{error}</NouText>)}
      {nIf(ok, <NouText className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{ok}</NouText>)}
      <NouButton loading={busy} disabled={busy || code.trim().length === 0} onPress={() => void submit()}>
        {t('sync.redeem')}
      </NouButton>
      <NouText className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-500">{t('sync.redeemHint')}</NouText>
    </View>
  )
}

/**
 * Activación por PIN: lo único que se pide es el código.
 *
 * Es la puerta de entrada normal y quita toda la fricción: la cuenta se crea
 * sola, atada a este dispositivo, y la licencia la aplica el servidor. El correo
 * y la contraseña quedan como algo opcional (ver ClaimForm) para quien quiera
 * usar la cuenta en otro dispositivo.
 */
const ActivateForm: React.FC = () => {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [showAccount, setShowAccount] = useState(false)

  const submit = async () => {
    setError(undefined)
    setBusy(true)
    try {
      await activateLicense(code.trim())
      setCode('')
      // El plan lo manda el servidor: hay que releerlo tras activar.
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="gap-4">
      <View className={surfaceCls}>
        <View className="px-5 py-5">
          <NouText className="text-lg font-semibold">{t('sync.activateTitle')}</NouText>
          <NouText className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {t('sync.activateHint')}
          </NouText>

          <View className="mt-5">
            <NouText className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t('sync.redeemLabel')}
            </NouText>
            <TextInput
              className={inputCls}
              value={code}
              onChangeText={setCode}
              placeholder="VIDEOTOTAL-XXXX-XXXX"
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={() => void submit()}
            />
            {nIf(error, <NouText className="mb-3 text-sm text-red-500">{error}</NouText>)}
            <NouButton loading={busy} disabled={busy || code.trim().length === 0} onPress={() => void submit()}>
              {t('sync.activate')}
            </NouButton>
            <NouText className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-500">
              {t('sync.activateHint2')}
            </NouText>

            <Pressable onPress={() => setShowAccount((value) => !value)} className="mt-5">
              <NouText className="text-xs text-zinc-500 underline dark:text-zinc-500">
                {showAccount ? t('sync.hideAccount') : t('sync.haveAccount')}
              </NouText>
            </Pressable>
          </View>
        </View>
      </View>
      {nIf(showAccount, <SyncAuthForm />)}
    </View>
  )
}

/**
 * Poner correo y contraseña a una cuenta activada con un código.
 *
 * Hasta que no se hace, esa cuenta vive sólo en este dispositivo: si se pierde
 * el teléfono se pierde el acceso, y con él lo sincronizado.
 */
const ClaimForm: React.FC = () => {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)

  const submit = async () => {
    setError(undefined)
    setBusy(true)
    try {
      await claimAccount(email.trim(), password)
      setDone(true)
      setEmail('')
      setPassword('')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = email.trim().length > 0 && password.length >= 8 && busy === false

  return (
    <View className={surfaceCls}>
      <View className="px-5 py-5">
        <NouText className="text-lg font-semibold">{t('sync.claimTitle')}</NouText>
        <NouText className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t('sync.claimHint')}</NouText>

        {done ? (
          <NouText className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{t('sync.claimDone')}</NouText>
        ) : (
          <View className="mt-5">
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
            <TextInput
              className={inputCls}
              value={password}
              onChangeText={setPassword}
              placeholder={t('sync.passwordHint')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={() => void submit()}
            />
            {nIf(error, <NouText className="mb-3 text-sm text-red-500">{error}</NouText>)}
            <NouButton loading={busy} disabled={!canSubmit} onPress={() => void submit()}>
              {t('sync.claimSave')}
            </NouButton>
          </View>
        )}
      </View>
    </View>
  )
}

/**
 * Sincronizar a mano.
 *
 * La app ya sincroniza sola cada 5 minutos y al volver a ella, pero esperar sin
 * saber cuándo es incómodo: esto lo hace cuando el usuario quiere.
 */
const SyncNowSection: React.FC = () => {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [at, setAt] = useState<Date>()

  const run = async () => {
    setBusy(true)
    setStatus('idle')
    try {
      await syncSupabase()
      setStatus('ok')
      setAt(new Date())
    } catch {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  // La hora se calcula AQUÍ, con su comprobación, y no dentro del JSX.
  //
  // El segundo argumento de nIf se evalúa siempre, aunque la condición sea falsa.
  // Cuando esto era `nIf(status === 'ok' && at, ... toLocaleTimeString())`, en el
  // primer render `at` aún no existía, la expresión se evaluaba igual y la app se
  // cerraba al abrir esta pantalla.
  const hora = at ? at.toLocaleTimeString() : ''

  return (
    <View className={surfaceCls}>
      <View className="px-5 py-5">
        <NouButton variant="outline" loading={busy} onPress={() => void run()}>
          {t('sync.syncNow')}
        </NouButton>
        {nIf(
          status === 'ok' && !!hora,
          <NouText className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
            {t('sync.syncedAt', { time: hora, interpolation: { escapeValue: false } })}
          </NouText>,
        )}
        {nIf(status === 'error', <NouText className="mt-3 text-xs text-red-500">{t('sync.syncFailed')}</NouText>)}
      </View>
    </View>
  )
}

export const SettingsModalTabSync = () => {
  const tw = useTwColor()
  const queryClient = useQueryClient()
  const { user, userEmail, plan, planExpiresAt } = useValue(auth$)
  const { me } = useMe()
  const planLabel = plan ? capitalize(plan) : t('sync.freePlan')
  // Se mira el estado de sesión, NO la consulta al servidor. La sesión ya trae el
  // plan desde el primer momento; la consulta puede tardar en responder. Cuando
  // esto miraba la consulta, el botón de sincronizar no aparecía hasta que
  // llegara la respuesta, aunque el plan ya se viera como "Pro".
  const subscribed = Boolean(plan && plan !== 'free')
  const expiresAt = planExpiresAt ?? me?.expiresAt
  // Igual que con la hora: se prepara aquí y no dentro del JSX, porque el segundo
  // argumento de nIf se evalúa siempre. Con `expiresAt` sin definir, dentro del
  // JSX se construiría una fecha inválida que luego se descartaría.
  const fechaCaduca = expiresAt ? new Date(expiresAt) : undefined
  const fechaTexto = fechaCaduca && !isNaN(fechaCaduca.getTime()) ? fechaCaduca.toLocaleDateString() : ''
  const diasRestantes = fechaCaduca ? Math.max(0, Math.ceil((fechaCaduca.getTime() - Date.now()) / 86_400_000)) : 0
  const viaAppStore = me?.source === 'app_store'
  const [loadingProduct, setLoadingProduct] = useState(isIos)
  const [productPrice, setProductPrice] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null)
  const restoreConflict = actionError?.startsWith('This App Store subscription is already linked to')

  useEffect(() => {
    if (!isIos || !user) {
      return
    }

    let active = true
    NouBilling.getProducts([IOS_SYNC_PRODUCT_ID])
      .then((products) => {
        if (active) {
          setProductPrice(products[0]?.displayPrice)
        }
      })
      .catch((error) => {
        if (active) {
          setActionError(getErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setLoadingProduct(false)
        }
      })
    return () => {
      active = false
    }
  }, [user])

  const iosStatusText = me?.ios?.expiresAt
    ? t('sync.expiresAt', {
        value: new Date(me.ios.expiresAt).toLocaleString(),
        interpolation: { escapeValue: false },
      })
    : null

  const withBusyAction = async (action: BusyAction, run: () => Promise<void>) => {
    setBusyAction(action)
    setActionError(undefined)
    setNotice(undefined)
    try {
      await run()
    } catch (error) {
      const message = getErrorMessage(error)
      if (message.includes('Purchase pending approval')) {
        setNotice(t('sync.purchasePending'))
      } else if (!message.includes('Purchase cancelled')) {
        setActionError(message)
      }
    } finally {
      setBusyAction(null)
    }
  }

  const confirmAccountBinding = () =>
    new Promise<boolean>((resolve) => {
      Alert.alert(t('sync.purchaseTitle'), t('sync.purchaseConfirm', { email: userEmail || user?.email }), [
        { text: t('buttons.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('buttons.confirm'), onPress: () => resolve(true) },
      ])
    })

  const onPurchase = () =>
    withBusyAction('buy', async () => {
      if (!(await confirmAccountBinding())) {
        return
      }
      const { appAccountToken } = await prepareIosPurchase()
      const transaction = await NouBilling.purchase(IOS_SYNC_PRODUCT_ID, appAccountToken)
      await deliverIosTransaction(transaction)
    })

  const onRestore = () =>
    withBusyAction('restore', async () => {
      if (!(await confirmAccountBinding())) {
        return
      }
      await prepareIosPurchase()
      const entitlements = await NouBilling.restore()
      const entitlement = entitlements.find((entry) => entry.productId === IOS_SYNC_PRODUCT_ID)
      if (!entitlement) {
        throw new Error(t('sync.noPurchaseToRestore'))
      }
      await deliverIosTransaction(entitlement)
    })

  const onManageSubscriptions = () =>
    withBusyAction('manage', async () => {
      await NouBilling.manageSubscriptions()
    })

  // Borrar la cuenta es destructivo e irreversible: se confirma antes.
  const onDeleteAccount = () => {
    setActionError(undefined)
    Alert.alert(t('sync.deleteConfirmTitle'), t('sync.deleteConfirmBody'), [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('sync.deleteAccount'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteAccount()
              await queryClient.invalidateQueries({ queryKey: ['me'] })
            } catch (error) {
              setActionError(getErrorMessage(error))
            }
          })()
        },
      },
    ])
  }

  const accountMenuItems = [
    ...(isIos && viaAppStore && subscribed
      ? [{ label: t('sync.manageIos'), handler: () => void onManageSubscriptions() }]
      : []),
    ...(isIos ? [{ label: t('sync.restore'), handler: () => void onRestore() }] : []),
    { label: t('sync.deleteAccount'), handler: () => void onDeleteAccount() },
    { label: t('buttons.signOut'), handler: signOut },
  ]

  if (!user) {
    return (
      <View className="gap-6">
        <View>
          <NouText className={sectionLabelCls}>{t('sync.label')}</NouText>
          <ActivateForm />
        </View>
      </View>
    )
  }

  return (
    <View className="gap-6">
      <View>
        <NouText className={sectionLabelCls}>{t('sync.label')}</NouText>
        <View className={surfaceCls}>
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Image
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: tw('zinc-900') }}
              source={user.picture}
              contentFit="cover"
            />
            <View className="flex-1">
              <NouText className="font-medium">{userEmail || user.email}</NouText>
              <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('sync.currentPlan')}: {planLabel}
              </NouText>
            </View>
            <NouMenu
              trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
              items={accountMenuItems}
            />
          </View>
        </View>
      </View>

      {nIf(!userEmail, <ClaimForm />)}

      {nIf(subscribed, <SyncNowSection />)}

      <View>
        <NouText className={sectionLabelCls}>{t('sync.currentPlan')}</NouText>
        <View className={surfaceCls}>
          <View className="px-5 py-5">
            <View className="flex-row flex-wrap gap-2">
              <SettingsBadge label={planLabel} />
              {nIf(viaAppStore, <SettingsBadge label={t('sync.activeViaIos')} />)}
            </View>
            {nIf(
              !!fechaTexto,
              <NouText className="mt-3 text-xs text-zinc-600 dark:text-zinc-500">
                {t('sync.expiresOn', {
                  date: fechaTexto,
                  days: diasRestantes,
                  interpolation: { escapeValue: false },
                })}
              </NouText>,
            )}
            <NouText className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t('sync.hint')}</NouText>
            {nIf(
              iosStatusText,
              <NouText className="mt-3 text-xs text-zinc-600 dark:text-zinc-500">{iosStatusText}</NouText>,
            )}
            {nIf(notice, <NouText className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{notice}</NouText>)}
            {nIf(actionError, <NouText className="mt-3 text-sm text-red-500">{actionError}</NouText>)}
            {nIf(
              restoreConflict,
              <View className="mt-3">
                <NouButton variant="outline" onPress={signOut}>
                  {t('sync.signOutSwitch')}
                </NouButton>
              </View>,
            )}
            {isIos ? (
              // App Review does not allow pointing iOS users at the web checkout.
              <View className="mt-5 gap-3">
                {nIf(
                  !subscribed,
                  <>
                    {nIf(
                      loadingProduct,
                      <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('sync.priceLoading')}</NouText>,
                    )}
                    {nIf(
                      !loadingProduct && !productPrice,
                      <NouText className="text-sm text-zinc-600 dark:text-zinc-400">
                        {t('sync.productUnavailable')}
                      </NouText>,
                    )}
                    <NouButton
                      loading={busyAction === 'buy'}
                      disabled={loadingProduct || !productPrice || busyAction !== null}
                      onPress={() => void onPurchase()}
                    >
                      {productPrice ? `${t('sync.buy')} ${productPrice}` : t('sync.buy')}
                    </NouButton>
                  </>,
                )}
                {nIf(
                  busyAction === 'restore' || busyAction === 'manage',
                  <NouText className="text-sm text-zinc-600 dark:text-zinc-400">
                    {busyAction === 'manage' ? t('sync.manageIos') : t('sync.restore')}
                  </NouText>,
                )}
                <View className="gap-2 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-950/70 px-4 py-3">
                  <NouText className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    {t('sync.legalNotice')}
                  </NouText>
                  <View className="flex-row flex-wrap gap-3">
                    <NouLink href={TERMS_OF_USE_URL}>
                      <NouText className="text-xs text-zinc-900 dark:text-zinc-100 underline">
                        {t('sync.termsOfUse')}
                      </NouText>
                    </NouLink>
                    <NouLink href={PRIVACY_POLICY_URL}>
                      <NouText className="text-xs text-zinc-900 dark:text-zinc-100 underline">
                        {t('sync.privacyPolicy')}
                      </NouText>
                    </NouLink>
                  </View>
                </View>
              </View>
            ) : (
              // Escritorio: la licencia se activa canjeando un código, que el
              // servidor valida y aplica. No hay pasarela de pago en la app.
              <RedeemForm />
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
