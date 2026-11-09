import { useEffect, type ReactNode } from 'react'
import {
  CHANNELS,
  PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type Channel,
  type Priority,
  type TicketCategory,
  type TicketStatus,
} from '../../shared/labels.ts'
import { money } from '../lib.ts'

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  )
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'ai' | 'neutral'

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone === 'neutral' ? '' : tone}`} title={title}>
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'bad' | 'ok'
}) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="value" style={tone ? { color: tone === 'bad' ? 'var(--danger)' : 'var(--success)' } : undefined}>
        {value}
      </span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export const Spinner = () => <div className="spinner" role="progressbar" aria-label="Yükleniyor" />

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert bad row between">
      <span>{error}</span>
      {onRetry && (
        <button className="btn small" onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  )
}

/** Yükleme / hata / veri durumlarını tek yerde ele alır. */
export function Load<T>({
  data,
  error,
  reload,
  children,
}: {
  data: T | undefined
  error?: string
  reload?: () => void
  children: (d: T) => ReactNode
}) {
  if (error && data === undefined) return <ErrorBox error={error} onRetry={reload} />
  if (data === undefined) return <Spinner />
  return <>{children(data)}</>
}

export function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string
  children: ReactNode
  className?: string
  hint?: ReactNode
}) {
  return (
    <label className={`field ${className ?? ''}`}>
      {label}
      {children}
      {hint && <small style={{ fontWeight: 400 }}>{hint}</small>}
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          className={value === key ? 'active' : ''}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export const Money = ({ value, tone }: { value: number | null | undefined; tone?: boolean }) => (
  <span className="num" style={tone && value ? { color: value > 0 ? 'var(--danger)' : 'var(--success)' } : undefined}>
    {money(value)}
  </span>
)

const PRIORITY_TONE: Record<Priority, Tone> = { acil: 'bad', yuksek: 'warn', normal: 'info', dusuk: 'neutral' }
export const PriorityBadge = ({ value }: { value: string }) => (
  <Badge tone={PRIORITY_TONE[value as Priority] ?? 'neutral'}>{PRIORITIES[value as Priority] ?? value}</Badge>
)

const STATUS_TONE: Record<TicketStatus, Tone> = {
  acik: 'warn',
  atandi: 'info',
  islemde: 'brand',
  beklemede: 'neutral',
  cozuldu: 'ok',
  kapandi: 'ok',
}
export const TicketStatusBadge = ({ value }: { value: string }) => (
  <Badge tone={STATUS_TONE[value as TicketStatus] ?? 'neutral'}>
    {TICKET_STATUSES[value as TicketStatus] ?? value}
  </Badge>
)

export const CategoryLabel = ({ value }: { value: string }) => (
  <>{TICKET_CATEGORIES[value as TicketCategory] ?? value}</>
)

const CHANNEL_ICON: Record<Channel, string> = { whatsapp: '💬', sms: '✉️', email: '📧', portal: '🏠', telefon: '📞' }
export const ChannelBadge = ({ value }: { value: string }) => (
  <Badge>
    <span aria-hidden>{CHANNEL_ICON[value as Channel] ?? '•'}</span> {CHANNELS[value as Channel] ?? value}
  </Badge>
)

export function EngineBadge({ engine, model }: { engine: string; model?: string | null }) {
  return engine === 'claude' ? (
    <Badge tone="ai" title={model ?? undefined}>
      ✦ Claude
    </Badge>
  ) : (
    <Badge tone="neutral" title="API anahtarı olmadan çalışan yerel Türkçe kural motoru">
      ⚙ Kural motoru
    </Badge>
  )
}

/** İki seri (tahakkuk / tahsilat) için basit sütun grafik. */
export function PairChart({ series }: { series: { label: string; charged: number; collected: number }[] }) {
  const max = Math.max(1, ...series.flatMap((s) => [s.charged, s.collected]))
  const w = 100 / series.length
  return (
    <div>
      <svg
        className="chart"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        role="img"
        aria-label="Aylık tahakkuk ve tahsilat"
      >
        {series.map((s, i) => {
          const h1 = (s.charged / max) * 50
          const h2 = (s.collected / max) * 50
          const x = i * w + w * 0.18
          const bw = w * 0.3
          return (
            <g key={s.label}>
              <rect x={x} y={52 - h1} width={bw} height={h1} rx="0.8" fill="var(--border)">
                <title>{`${s.label} tahakkuk: ${money(s.charged)}`}</title>
              </rect>
              <rect x={x + bw + w * 0.04} y={52 - h2} width={bw} height={h2} rx="0.8" fill="var(--primary)">
                <title>{`${s.label} tahsilat: ${money(s.collected)}`}</title>
              </rect>
            </g>
          )
        })}
        <line x1="0" x2="100" y1="52.2" y2="52.2" stroke="var(--border)" strokeWidth="0.3" />
      </svg>
      <div className="row between" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
        {series.map((s) => (
          <span key={s.label} style={{ width: `${w}%`, textAlign: 'center' }}>
            {s.label}
          </span>
        ))}
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <i style={{ background: 'var(--border)' }} />
          Tahakkuk
        </span>
        <span>
          <i style={{ background: 'var(--primary)' }} />
          Tahsilat
        </span>
      </div>
    </div>
  )
}

export function Meter({ value, tone }: { value: number; tone?: 'ok' | 'bad' }) {
  return (
    <div
      className={`meter ${tone ?? ''}`}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}
