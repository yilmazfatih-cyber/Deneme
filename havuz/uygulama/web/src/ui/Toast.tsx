/**
 * Bildirimler (toast): ekranın altında kısa ileti, isteğe bağlı EYLEM düğmesiyle ("Geri al", "Yenile").
 * Ekran okuyucuya `aria-live` ile duyurulur. Fare üstündeyken ya da odaktayken süre durur (acele ettirmez).
 *
 *   const toast = useToast()
 *   toast.show({ message: t('tasks.deleted'), action: { label: t('common.undo'), onAction: () => restore(id) } })
 *   toast.show({ message: errorMessage(error), tone: 'error' })
 *   toast.show({ message: '…', durationMs: null })   // kullanıcı kapatana dek kalır
 *
 * Genişletme: yeni ton → TONES'a satır ekleyin.
 */
import { X } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n/index.ts'
import { cx } from './cx.ts'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastOptions {
  readonly message: string
  readonly tone?: ToastTone
  readonly action?: { readonly label: string; readonly onAction: () => void | Promise<void> }
  /** Ekranda kalma süresi; `null` → kullanıcı kapatana dek. Varsayılan: eylemliyse 8 sn, değilse 5 sn. */
  readonly durationMs?: number | null
  /** Aynı anahtarlı eski bildirim varsa yerine geçer (ör. tek bir "çevrimdışı" bildirimi). */
  readonly key?: string
}

interface ToastItem extends ToastOptions {
  readonly id: number
}

export interface ToastApi {
  show(options: ToastOptions): number
  dismiss(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)

const TONES: Record<ToastTone, string> = {
  info: 'bg-ink text-canvas',
  success: 'bg-ink text-canvas',
  error: 'bg-danger text-white',
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), [])
  const show = useCallback((options: ToastOptions) => {
    const id = nextId++
    setItems((list) =>
      [...list.filter((item) => !options.key || item.key !== options.key), { ...options, id }].slice(-3),
    )
    return id
  }, [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext value={api}>
      {children}
      <section
        aria-label={t('toast.region')}
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+0.75rem)] z-50 flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:items-end lg:px-6"
      >
        <div aria-live="polite" className="flex w-full flex-col items-center gap-2 lg:items-end">
          {items
            .filter((item) => item.tone !== 'error')
            .map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismiss} />
            ))}
        </div>
        <div aria-live="assertive" className="flex w-full flex-col items-center gap-2 lg:items-end">
          {items
            .filter((item) => item.tone === 'error')
            .map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismiss} />
            ))}
        </div>
      </section>
    </ToastContext>
  )
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const remaining = useRef(item.durationMs === undefined ? (item.action ? 8000 : 5000) : item.durationMs)

  useEffect(() => {
    const duration = remaining.current
    if (paused || duration === null) return
    const started = Date.now()
    const timer = setTimeout(() => onDismiss(item.id), duration)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(1000, duration - (Date.now() - started))
    }
  }, [paused, item.id, onDismiss])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cx(
        'toast-in pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-4 shadow-xl',
        TONES[item.tone ?? 'info'],
      )}
    >
      <p className="flex-1 py-2 font-medium">{item.message}</p>
      {item.action && (
        <button
          type="button"
          className="min-h-12 rounded-xl px-3 font-bold underline-offset-4 hover:underline"
          onClick={() => {
            onDismiss(item.id)
            void item.action?.onAction()
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={t('common.close')}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl opacity-80 hover:opacity-100"
        onClick={() => onDismiss(item.id)}
      >
        <X aria-hidden size={20} />
      </button>
    </div>
  )
}

export function useToast(): ToastApi {
  const api = use(ToastContext)
  if (!api) throw new Error('useToast yalnız <ToastProvider> içinde kullanılabilir.')
  return api
}
