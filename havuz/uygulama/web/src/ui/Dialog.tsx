/**
 * Pencereler: yerel `<dialog>` öğesi (odak tuzağı, Esc ile kapanma ve arka planın etkisizleşmesi tarayıcıdan gelir).
 *
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Liste ekle" footer={<Button …/>}>…</Dialog>
 *   <ConfirmDialog open={open} onClose={…} title="Görevi sil?" message="…" confirmLabel="Sil" tone="danger"
 *                  onConfirm={async () => { … }} />
 *
 * ConfirmDialog onay işlemi sürerken düğmeyi kilitler; işlem hata verirse iletiyi pencerede gösterir.
 * Genişletme: yeni boyut → SIZES'a satır ekleyin.
 */
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n/index.ts'
import { errorMessage } from '../lib/errors.ts'
import { Button, IconButton } from './Button.tsx'
import { cx } from './cx.ts'

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const

export interface DialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly description?: string
  readonly children?: ReactNode
  /** Alt düğmeler (sağa yaslı). */
  readonly footer?: ReactNode
  readonly size?: keyof typeof SIZES
  /** `false`: Esc, arka plan ve kapat düğmesi pencereyi kapatmaz (kullanıcı bir seçim yapmalı). */
  readonly dismissible?: boolean
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault() // Esc: kapatmayı React durumu yönetsin
        if (dismissible) onClose()
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose() // arka plana tıklama
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl',
        'backdrop:bg-black/45 backdrop:backdrop-blur-[2px]',
        SIZES[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start gap-3 px-5 pt-5 pb-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
              <h2 id={titleId} className="text-xl font-bold tracking-tight text-balance">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && <IconButton icon={X} label={t('common.close')} onClick={onClose} className="-mr-2" />}
          </header>
          {children && <div className="overflow-y-auto px-5 py-3">{children}</div>}
          {footer && (
            <footer className="flex flex-wrap-reverse justify-end gap-2 border-t border-line px-5 py-4">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}

export interface ConfirmDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly message?: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly tone?: 'default' | 'danger'
  /** Onaylanınca çalışır; bitince pencere kapanır. Hata fırlatırsa ileti pencerede gösterilir. */
  readonly onConfirm: () => Promise<void> | void
  /** İletiyle düğmeler arasına ek içerik (ör. "verileri de sil" kutusu, şifre alanı). */
  readonly children?: ReactNode
  /** Onay düğmesi kapalı olsun mu (ör. şifre yazılmadıysa). */
  readonly confirmDisabled?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      setBusy(false)
      onClose()
    } catch (reason) {
      setBusy(false)
      setError(errorMessage(reason))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            disabled={confirmDisabled}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {message && <p className="text-pretty">{message}</p>}
        {children}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
