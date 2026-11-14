/**
 * Katmanlar:
 *   Modal     detay penceresi kabuğu (UX_SPEC §2 "Detay penceresi"): ortada, en çok 850 px, köşe 8, `--surface-1`;
 *             katman kendi içinde kayar (arkadaki sayfa kaymaz), ✕ · Esc · dışarı tıklama kapatır, odak tuzağı,
 *             250 ms açılış/kapanış. İçerik (görsel, düğmeler, bölümler) detay ekibinindir.
 *   Sheet     mobil alt sayfa (sezon seçici, "⋮" menüsü, cihaz seçici): alttan kayar, tutamaç, ✕.
 *   ToastHost + toast()   kısa bildirim ("Listene eklendi"); uygulamada bir kez kurulur (kabuk kurar).
 *   Tooltip   simge düğmelerinin üstünde beyaz baloncuk ("Listeme Ekle").
 */
import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { RoundButton } from './Button'
import { cx } from './cx'
import { useBodyScrollLock, useEscape, useFocusTrap, usePresence } from './hooks'
import { Icon } from './Icon'
import './overlay.css'

/** Dışarı tıklama: basma ve bırakma aynı öğedeyse (sürükleyerek metin seçerken kapanmasın). */
function useOutsideClick(onOutside: () => void) {
  const downOnLayer = useRef(false)
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      downOnLayer.current = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (downOnLayer.current && e.target === e.currentTarget) onOutside()
      downOnLayer.current = false
    },
  }
}

/* ───────────── Modal ───────────── */

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Ekran okuyucu adı (ya da `labelledBy` ile başlık öğesinin kimliği) */
  label?: string
  labelledBy?: string
  /** En çok genişlik px; varsayılan 850 */
  maxWidth?: number
  /** ✕ düğmesini gizle (içerik kendi kapatma düğmesini çiziyorsa) */
  hideClose?: boolean
  /** Açılışta odaklanacak öğe (varsayılan pencerenin kendisi) */
  initialFocus?: RefObject<HTMLElement | null>
  /** Kayan katmanın ref'i (içerik kaydırma konumunu okumak / sıfırlamak için) */
  scrollRef?: RefObject<HTMLDivElement | null>
  /** Kapanış animasyonu bitince */
  onExited?: () => void
  className?: string
}

export function Modal({
  open,
  onClose,
  children,
  label,
  labelledBy,
  maxWidth = 850,
  hideClose,
  initialFocus,
  scrollRef,
  onExited,
  className,
}: ModalProps): ReactElement | null {
  const state = usePresence(open, 250)
  const visible = state !== 'closed'
  const dialogRef = useRef<HTMLDivElement>(null)
  const outside = useOutsideClick(onClose)
  useBodyScrollLock(visible)
  useEscape(open, onClose)
  useFocusTrap(dialogRef, open && visible, initialFocus)

  const wasVisible = useRef(false)
  useEffect(() => {
    if (wasVisible.current && !visible) onExited?.()
    wasVisible.current = visible
  }, [visible]) // yalnız görünürlük değişince

  if (!visible) return null
  return createPortal(
    <div className={cx('ui-modal-layer', `is-${state}`)} ref={scrollRef} {...outside}>
      <div className="ui-modal-scrim" aria-hidden="true" />
      <div
        ref={dialogRef}
        className={cx('ui-modal', className)}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={{ maxWidth }}
      >
        {!hideClose && (
          <RoundButton icon="close" label="Kapat" variant="solid" className="ui-modal__close" onClick={onClose} />
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── Alt sayfa (mobil) ───────────── */

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Başlık (görünür); yoksa `label` ekran okuyucu adı olur */
  title?: string
  label?: string
  children: ReactNode
  /** Altta sabit düğme şeridi (ör. <Button variant="play" block>Kaydet</Button>); içerik kayarken yerinde kalır */
  actions?: ReactNode
  className?: string
}

export function Sheet({ open, onClose, title, label, children, actions, className }: SheetProps): ReactElement | null {
  const state = usePresence(open, 250)
  const visible = state !== 'closed'
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const outside = useOutsideClick(onClose)
  useBodyScrollLock(visible)
  useEscape(open, onClose)
  useFocusTrap(panelRef, open && visible)

  if (!visible) return null
  return createPortal(
    <div className={cx('ui-sheet-layer', `is-${state}`)} {...outside}>
      <div
        ref={panelRef}
        className={cx('ui-sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
      >
        <span className="ui-sheet__grip" aria-hidden="true" />
        <div className="ui-sheet__head">
          {title && (
            <h2 className="ui-sheet__title" id={titleId}>
              {title}
            </h2>
          )}
          <RoundButton
            icon="close"
            label="Kapat"
            variant="solid"
            size="sm"
            className="ui-sheet__close"
            onClick={onClose}
          />
        </div>
        <div className="ui-sheet__body">{children}</div>
        {actions && <div className="ui-sheet__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── Kısa bildirim ───────────── */

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastOptions {
  kind?: ToastKind
  /** Tek eylem ("Geri al") */
  action?: { label: string; onClick: () => void }
  /** ms; varsayılan 4000 (eylemli 6000) */
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: number
  message: string
}

let toasts: ToastItem[] = []
let toastSeq = 0
const toastListeners = new Set<() => void>()
const emitToasts = () => {
  for (const l of toastListeners) l()
}

/** Kısa bildirim gösterir; kimliğini döndürür. Aynı metin zaten görünüyorsa yinelenmez. */
export function toast(message: string, opts: ToastOptions = {}): number {
  const existing = toasts.find((t) => t.message === message)
  if (existing) return existing.id
  const id = ++toastSeq
  toasts = [...toasts.slice(-2), { id, message, ...opts }]
  emitToasts()
  window.setTimeout(() => dismissToast(id), opts.durationMs ?? (opts.action ? 6000 : 4000))
  return id
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emitToasts()
}

/** Uygulamada bir kez kurulur (kabuk kurar); bildirimler ekranın altında, mobilde sekmelerin üstünde. */
export function ToastHost(): ReactElement {
  const list = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb)
      return () => toastListeners.delete(cb)
    },
    () => toasts,
    () => toasts,
  )
  return createPortal(
    <div className="ui-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('ui-toast', `ui-toast--${t.kind ?? 'info'}`)}>
          {t.kind === 'success' && <Icon name="check" size={20} className="ui-toast__icon" />}
          <span className="ui-toast__text">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="ui-toast__action"
              onClick={() => {
                t.action?.onClick()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* ───────────── İpucu baloncuğu ───────────── */

/**
 * Simge düğmesinin üstünde beyaz baloncuk (üzerine gelince / odakta). Düğmenin kendi `aria-label`'ı okunur;
 * baloncuk görseldir.
 */
export function Tooltip({
  label,
  children,
  placement = 'top',
  className,
}: {
  label: string
  children: ReactNode
  placement?: 'top' | 'bottom'
  className?: string
}): ReactElement {
  return (
    <span className={cx('ui-tooltip', `ui-tooltip--${placement}`, className)}>
      {children}
      <span className="ui-tooltip__bubble" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
