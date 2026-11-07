import type { ReactNode } from 'react'

export function Loading({ text = 'Yükleniyor…' }: { text?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
        <rect x="8" y="10" width="32" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M8 22h10l3 5h6l3-5h10" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <p className="empty-title">{title}</p>
      {children ? <div className="empty-body">{children}</div> : null}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div className="alert alert-danger" role="alert">
      <strong>Hata:</strong> <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Tekrar dene
        </button>
      ) : null}
    </div>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children?: ReactNode
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title ? <strong className="alert-title">{title}</strong> : null}
      {children ? <div>{children}</div> : null}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

/** Generic list wrapper: loading → error → empty → content. */
export function ListState<T>({
  loading,
  error,
  items,
  empty,
  onRetry,
  children,
}: {
  loading: boolean
  error: string | null
  items: T[] | undefined
  empty: string
  onRetry?: () => void
  children: (items: T[]) => ReactNode
}) {
  if (items === undefined) {
    if (error) return <ErrorBox message={error} onRetry={onRetry} />
    return <Loading />
  }
  return (
    <>
      <ErrorBox message={error} onRetry={onRetry} />
      {loading ? <p className="sr-only" role="status">Güncelleniyor…</p> : null}
      {items.length === 0 ? <Empty title={empty} /> : children(items)}
    </>
  )
}
