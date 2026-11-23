/**
 * Bildirim (toast): ekranın altında kısa bir ileti, isteğe bağlı tek eylemle ("Geri al"). Ekran okuyucuya duyurulur.
 *
 *   const toast = useToast()
 *   toast.show({ message: t('tasks.deleted', { title }), action: { label: t('common.undo'), onAction: undo } })
 *   toast.show({ message: errorMessage(error), tone: 'error' })
 *
 * Aynı anda tek bildirim görünür; yenisi eskisinin yerini alır. Süre: eylemliyse 8 sn, değilse 5 sn; dokununca kapanır.
 * Sekme çubuğunun ve ekranın alt düğmelerinin (Screen → footer) ÜSTÜNDE durur: alt bölümler yüksekliklerini
 * `useToastInset` ile bildirir, böylece bildirim "Kaydet" gibi bir düğmeyi örtmez.
 * Genişletme: yeni bir ton → `ToastTone` ve `TONE_ICON`.
 */
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, type IconName } from './Icon.tsx'
import { AppText } from './Text.tsx'
import { RADIUS, SPACE, TOUCH, useTheme } from './theme.tsx'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastInput {
  readonly message: string
  readonly tone?: ToastTone
  readonly action?: { readonly label: string; readonly onAction: () => void }
  readonly durationMs?: number
}

interface ToastApi {
  show(input: ToastInput): void
  hide(): void
}

const TONE_ICON: Record<ToastTone, IconName> = {
  info: 'information-circle-outline',
  success: 'checkmark-circle',
  error: 'alert-circle-outline',
}

const ToastContext = createContext<ToastApi | null>(null)

/** Alt bölüm yüksekliğini bildirir (`null` → kaldır). Sağlayıcı yoksa hiçbir şey yapmaz. */
type InsetReporter = (id: string, height: number | null) => void
const InsetContext = createContext<InsetReporter>(() => {})

export function useToastInset(): InsetReporter {
  return use(InsetContext)
}

export function useToast(): ToastApi {
  const value = use(ToastContext)
  if (!value) throw new Error('useToast yalnız <ToastProvider> içinde kullanılabilir (src/app/_layout.tsx).')
  return value
}

/** Alt boşluk: sekme çubuğunun üstünde kalsın. */
const BOTTOM_OFFSET = 72

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(ToastInput & { readonly id: number }) | null>(null)
  const [insets, setInsets] = useState<Readonly<Record<string, number>>>({})
  const counter = useRef(0)
  const report = useCallback<InsetReporter>((id, height) => {
    setInsets((previous) => {
      if (height === null ? !(id in previous) : previous[id] === height) return previous
      const next = { ...previous }
      if (height === null) delete next[id]
      else next[id] = height
      return next
    })
  }, [])
  const avoid = Math.max(0, ...Object.values(insets))
  const hide = useCallback(() => setCurrent(null), [])
  const show = useCallback((input: ToastInput) => {
    counter.current += 1
    setCurrent({ ...input, id: counter.current })
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(input.message)
  }, [])
  const api = useMemo(() => ({ show, hide }), [show, hide])

  useEffect(() => {
    if (!current) return
    const timer = setTimeout(hide, current.durationMs ?? (current.action ? 8000 : 5000))
    return () => clearTimeout(timer)
  }, [current, hide])

  return (
    <ToastContext value={api}>
      <InsetContext value={report}>
        {children}
        {current ? <ToastView toast={current} onDone={hide} avoid={avoid} /> : null}
      </InsetContext>
    </ToastContext>
  )
}

function ToastView({ toast, onDone, avoid }: { toast: ToastInput; onDone: () => void; avoid: number }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const tone = toast.tone ?? 'info'
  const bottom = Math.max(insets.bottom + BOTTOM_OFFSET, avoid + SPACE.sm)
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <View
        role="status"
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: colors.toast }]}
        testID="toast"
      >
        <Icon name={TONE_ICON[tone]} color={colors.onToast} />
        <Pressable accessible={false} focusable={false} onPress={onDone} style={styles.message}>
          <AppText style={{ color: colors.onToast }}>{toast.message}</AppText>
        </Pressable>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            onPress={() => {
              toast.action?.onAction()
              onDone()
            }}
            style={styles.action}
          >
            <AppText weight="bold" style={{ color: colors.toastAction }}>
              {toast.action.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, alignItems: 'center' },
  toast: {
    width: '100%',
    maxWidth: 560,
    borderRadius: RADIUS.md,
    paddingLeft: SPACE.lg,
    paddingRight: SPACE.xs,
    paddingVertical: SPACE.xs,
    minHeight: TOUCH + SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  message: { flex: 1, paddingVertical: SPACE.sm },
  action: { minHeight: TOUCH, minWidth: TOUCH, paddingHorizontal: SPACE.md, justifyContent: 'center' },
})
