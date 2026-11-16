/**
 * Küçük görsel yapı taşları: Badge (etiket), Card (kart), EmptyState (boş durum), PageHeader (sayfa başlığı).
 *
 *   <Badge tone="danger">Gecikti</Badge>
 *   <Card title="Görünüm" description="…">…</Card>
 *   <EmptyState icon={Inbox} title="Henüz görev yok" message="…" action={<Button …/>} />
 *   <PageHeader title="Görevler" description="…" actions={<Button …/>} back={{ to: '/gorevler', label: 'Görevler' }} />
 *
 * Sayfanın tek `<h1>`'i PageHeader'dadır; bölüm başlıkları (Card title) `<h2>` olur.
 * Genişletme: yeni rozet tonu → BADGE_TONES'a satır ekleyin.
 */
import { ChevronLeft, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from './cx.ts'

export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent-text',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
}

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: BadgeTone
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden size={14} strokeWidth={2.4} />}
      {children}
    </span>
  )
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cx('rounded-3xl border border-line bg-surface p-5 shadow-[0_1px_0_var(--line)]', className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <h2 className="text-lg font-bold tracking-tight">{title}</h2>}
            {description && <p className="text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line-strong/60 px-6 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        <Icon aria-hidden size={30} strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {message && <p className="max-w-sm text-pretty text-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      {back && (
        <Link
          to={back.to}
          className="-ml-2 inline-flex min-h-12 w-fit items-center gap-1 rounded-xl px-2 font-semibold text-accent-text hover:bg-surface-2"
        >
          <ChevronLeft aria-hidden size={20} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            tabIndex={-1}
            data-page-title
            className="text-3xl font-extrabold tracking-tight text-balance outline-none"
          >
            {title}
          </h1>
          {description && <div className="text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}
