/**
 * Katmanlar: TvDialog (tuzaklı, modal, kapanınca odağı geri verir; Geri kapatır) ve TvToast (kısa bildirim).
 */
import { useLayoutEffect, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { FocusScope, useFocusEngine, useKeyInterceptor } from '../focus'
import { TvIcon } from './icons'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

/* ───────────── TvDialog ───────────── */

export interface TvDialogProps {
  /** Kapsam kimliği (öğe kimliklerinin öneki olarak da kullanılabilir) */
  id: string
  title: string
  /** Başlığın altındaki kısa açıklama */
  message?: ReactNode
  /** Geri tuşu ve kapatma */
  onClose: () => void
  /** Açılışta odaklanacak öğe (yoksa ilk öğe) */
  defaultFocus?: string
  children?: ReactNode
  className?: string
}

export function TvDialog({
  id,
  title,
  message,
  onClose,
  defaultFocus,
  children,
  className,
}: TvDialogProps): ReactElement {
  const engine = useFocusEngine()
  useKeyInterceptor((key) => {
    if (key !== 'BACK') return false
    onClose()
    return true
  }, 100)
  useLayoutEffect(() => {
    engine.focusScope(id)
  }, [engine, id])
  const titleId = `${id}-baslik`
  return (
    <div className="tv-dialog-backdrop">
      <FocusScope id={id} trap modal restore defaultFocus={defaultFocus}>
        <div className={cx('tv-dialog', className)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 className="tv-dialog__title" id={titleId}>
            {title}
          </h2>
          {message && <div className="tv-dialog__message">{message}</div>}
          {children}
        </div>
      </FocusScope>
    </div>
  )
}

/* ───────────── TvToast ───────────── */

export interface TvToastItem {
  id: number
  text: string
  /** Kaynak simgesi: telefon (kumanda / yansıtma) */
  kind: 'info' | 'phone'
}

let items: TvToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

/** Kısa bildirim gösterir (varsayılan 4 sn). Kapatma işlevini döndürür. */
export function tvToast(text: string, opts: { kind?: TvToastItem['kind']; durationMs?: number } = {}): () => void {
  const item: TvToastItem = { id: ++seq, text, kind: opts.kind ?? 'info' }
  items = [...items.filter((t) => t.text !== text), item].slice(-3)
  emit()
  const close = (): void => {
    items = items.filter((t) => t !== item)
    emit()
  }
  setTimeout(close, opts.durationMs ?? 4000)
  return close
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function TvToastHost(): ReactElement {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  )
  return (
    <div className="tv-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('tv-toast', `tv-toast--${t.kind}`)}>
          {t.kind === 'phone' && <TvIcon name="phone" size={1.8} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
