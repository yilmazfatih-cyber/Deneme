import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Accessible modal: focus moves inside, Escape closes, focus returns on close. */
export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button.btn-primary, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab' && node) {
        const focusables = [...node.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter(
          (el) => !el.hasAttribute('disabled'),
        )
        if (focusables.length === 0) return
        const firstEl = focusables[0]!
        const lastEl = focusables[focusables.length - 1]!
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} ref={ref}>
        <div className="modal-head">
          <h2 id={`${id}-t`}>{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

interface ConfirmProps {
  title: string
  message: ReactNode
  confirmText: string
  danger?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog(p: ConfirmProps) {
  return (
    <Dialog
      title={p.title}
      onClose={p.onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={p.onCancel} disabled={p.pending}>
            Vazgeç
          </button>
          <button
            type="button"
            className={p.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={p.onConfirm}
            disabled={p.pending}
            data-autofocus={p.children ? undefined : true}
          >
            {p.pending ? 'İşleniyor…' : p.confirmText}
          </button>
        </>
      }
    >
      <div className="confirm-message">{p.message}</div>
      {p.children}
      {p.error ? (
        <div className="alert alert-danger" role="alert">
          {p.error}
        </div>
      ) : null}
    </Dialog>
  )
}
