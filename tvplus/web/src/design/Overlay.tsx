/**
 * Katmanlar: Sheet (mobilde alt sayfa, web'de ortalanmış pencere) ve Toast (kısa bildirim).
 * Sheet: odak tuzağı, Esc ile kapanır, örtüye dokununca kapanır, kapanınca odak açan öğeye döner, arka plan kaydırılmaz.
 */
import { useEffect, useId, useRef, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { cx } from './cx'
import { Icon } from './Icon'
import './overlay.css'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Başlık (aria-labelledby). */
  title: string
  children: ReactNode
  /** Alt kısımdaki eylemler (ör. tek birincil buton). */
  actions?: ReactNode
  className?: string
}

let openSheets = 0

export function Sheet({ open, onClose, title, children, actions, className }: SheetProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()
    openSheets++
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null)
      if (!nodes.length) {
        e.preventDefault()
        return
      }
      const firstEl = nodes[0]!
      const lastEl = nodes[nodes.length - 1]!
      if (e.shiftKey && (document.activeElement === firstEl || !panel.contains(document.activeElement))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      openSheets--
      if (!openSheets) document.body.style.overflow = ''
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="cn-sheet-root">
      <div className="cn-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className={cx('cn-sheet', className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className="cn-sheet__grip" aria-hidden="true" />
        <div className="cn-sheet__head">
          <h2 className="cn-sheet__title" id={titleId}>
            {title}
          </h2>
          <IconButton icon="close" label="Kapat" onClick={onClose} />
        </div>
        <div className="cn-sheet__body">{children}</div>
        {actions && <div className="cn-sheet__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── Toast ───────────── */

export type ToastKind = 'info' | 'ok'
export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

let toasts: ToastItem[] = []
let toastSeq = 0
const toastListeners = new Set<() => void>()
const emitToasts = () => toastListeners.forEach((l) => l())

/** Kısa bildirim gösterir (4 sn). Hata da `info` ile söylenir: kırmızı yalnız canlı işaretidir. */
export function toast(message: string, opts: { kind?: ToastKind; durationMs?: number } = {}): number {
  const id = ++toastSeq
  toasts = [...toasts.slice(-2), { id, message, kind: opts.kind ?? 'info' }]
  emitToasts()
  setTimeout(() => dismissToast(id), opts.durationMs ?? 4000)
  return id
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length !== toasts.length) {
    toasts = next
    emitToasts()
  }
}

/** Uygulamada bir kez yerleştirilir (kabuk yapar). Alt gezinmenin üstünde durur. */
export function ToastHost(): ReactElement {
  const items = useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn)
      return () => toastListeners.delete(fn)
    },
    () => toasts,
    () => toasts,
  )
  return (
    <div className="cn-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="cn-toast">
          {t.kind === 'ok' && <Icon name="check" size={20} className="cn-toast__ok" />}
          <span className="cn-toast__msg">{t.message}</span>
          <button type="button" className="cn-toast__close" aria-label="Bildirimi kapat" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
