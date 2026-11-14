/**
 * Stüdyonun ortak parçaları: bölüm sınırı (bir bölüm çökerse sayfa boşalmaz), yükleme/hazır değil durumları,
 * panel, sayı kutusu, durum çipleri ve dürüstlük etiketleri ("Sentetik örnek", "Örnek (izlenmeden)", "Model önerisi").
 */
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import type { EffectiveTags, TagSheetSource, ViewingSource } from '../../../../shared/intelligence'
import { Button, Skeleton, SkeletonText } from '../../ui'
import type { Resource } from './api'

/* ───────────── Bölüm sınırı ───────────── */

interface BoundaryState {
  error: Error | null
}

/** Çizim hatasını bölüm içinde tutar; "Tekrar dene" bölümü yeniden kurar. */
export class SectionBoundary extends Component<{ children: ReactNode; name: string }, BoundaryState> {
  state: BoundaryState = { error: null }
  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(`Stüdyo bölümü çizilemedi (${this.props.name})`, error, info.componentStack)
  }
  render(): ReactNode {
    if (this.state.error)
      return (
        <NotReady
          title={`${this.props.name} çizilemedi`}
          detail={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      )
    return this.props.children
  }
}

/* ───────────── Durumlar ───────────── */

export function NotReady({
  title = 'Bu bölüm henüz hazır değil',
  detail,
  onRetry,
}: {
  title?: string
  detail?: ReactNode
  onRetry?: () => void
}): ReactElement {
  return (
    <div className="st-notready" role="status">
      <p className="st-notready__title">{title}</p>
      {detail && <p className="ui-meta">{detail}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      )}
    </div>
  )
}

/** İskelet: birkaç satır + blok */
export function LoadingBlock({ lines = 3, block = true }: { lines?: number; block?: boolean }): ReactElement {
  return (
    <div className="st-loading" aria-busy="true" aria-label="Yükleniyor">
      <SkeletonText lines={lines} />
      {block && <Skeleton variant="block" height={140} />}
    </div>
  )
}

/**
 * Kaynak durumuna göre çizer: yükleniyor → iskelet · hata (veri yok) → "henüz hazır değil" + yeniden dene ·
 * veri → children. Veri varken yeniden çekmede hata olursa veri kalır, altına kısa not düşer.
 */
export function Loadable<T>({
  res,
  children,
  skeleton,
  what,
}: {
  res: Resource<T>
  children: (data: T) => ReactNode
  skeleton?: ReactNode
  /** Hata iletisinde geçen ad: "Topluluklar" */
  what?: string
}): ReactElement {
  if (res.data === undefined) {
    if (res.error)
      return (
        <NotReady
          detail={
            res.error.unavailable
              ? `${what ? `${what}: ` : ''}servis yanıt vermiyor (${res.error.message})`
              : res.error.message
          }
          onRetry={res.refetch}
        />
      )
    return <>{skeleton ?? <LoadingBlock />}</>
  }
  return (
    <>
      {children(res.data)}
      {res.error && (
        <p className="ui-caption st-stale" role="status">
          Son yenileme başarısız: {res.error.message}{' '}
          <button type="button" className="st-link" onClick={res.refetch}>
            Tekrar dene
          </button>
        </p>
      )}
    </>
  )
}

/* ───────────── Yerleşim ───────────── */

export function Panel({
  title,
  sub,
  actions,
  children,
  id,
  className,
}: {
  title?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  id?: string
  className?: string
}): ReactElement {
  return (
    <section
      className={`st-panel${className ? ` ${className}` : ''}`}
      aria-labelledby={id && title ? `${id}-h` : undefined}
    >
      {(title || actions) && (
        <header className="st-panel__head">
          <div>
            {title && (
              <h2 className="st-panel__title" id={id ? `${id}-h` : undefined}>
                {title}
              </h2>
            )}
            {sub && <p className="ui-meta st-panel__sub">{sub}</p>}
          </div>
          {actions && <div className="st-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function SectionHead({
  title,
  lead,
  actions,
}: {
  title: string
  lead?: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <header className="st-head">
      <div>
        <h1 className="st-head__title">{title}</h1>
        {lead && <p className="ui-body st-head__lead">{lead}</p>}
      </div>
      {actions && <div className="st-head__actions">{actions}</div>}
    </header>
  )
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }): ReactElement {
  return (
    <div className="st-stat">
      <span className="st-stat__label">{label}</span>
      <span className="st-stat__value">{value}</span>
      {note && <span className="st-stat__note">{note}</span>}
    </div>
  )
}

/* ───────────── Çipler ───────────── */

export type ChipTone = 'neutral' | 'accent' | 'sample' | 'model' | 'ok' | 'warn' | 'muted'

export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: ChipTone
  title?: string
}): ReactElement {
  return (
    <span className={`st-chip st-chip--${tone}`} title={title}>
      {children}
    </span>
  )
}

/** Sentetik veriyle hesaplanmış bir sayının yanına konur. */
export function SyntheticTag({ show = true }: { show?: boolean }): ReactElement | null {
  if (!show) return null
  return (
    <Chip tone="sample" title="Gerçek izleme verisi değil; tohumlu üreteçten">
      Sentetik örnek
    </Chip>
  )
}

/** Etkin kaynaklar yalnız sentetik mi (ya da sentetik içeriyor mu). */
export function usesSynthetic(sources: readonly ViewingSource[] | null | undefined): boolean {
  return !!sources?.includes('SYNTHETIC')
}

export const BASIS_LABEL: Record<EffectiveTags['basis'], string> = {
  CONSENSUS: 'Uzlaşı',
  SAMPLE: 'Örnek (izlenmeden)',
  MODEL: 'Model önerisi',
  NONE: 'Etiketsiz',
}
export const BASIS_TONE: Record<EffectiveTags['basis'], ChipTone> = {
  CONSENSUS: 'ok',
  SAMPLE: 'sample',
  MODEL: 'model',
  NONE: 'muted',
}

export function BasisChip({ basis }: { basis: EffectiveTags['basis'] }): ReactElement {
  return <Chip tone={BASIS_TONE[basis]}>{BASIS_LABEL[basis]}</Chip>
}

export const SHEET_SOURCE_LABEL: Record<TagSheetSource, string> = {
  SAMPLE: 'Örnek (izlenmeden)',
  TAGGER: 'Etiketleyici',
  MODEL: 'Model önerisi',
  IMPORT: 'Dış sistem',
}
export const SHEET_SOURCE_TONE: Record<TagSheetSource, ChipTone> = {
  SAMPLE: 'sample',
  TAGGER: 'neutral',
  MODEL: 'model',
  IMPORT: 'neutral',
}
export const STATUS_LABEL = { DRAFT: 'Taslak', SUBMITTED: 'Gönderildi', APPROVED: 'Onaylandı' } as const

export const SOURCE_LABEL: Record<ViewingSource, string> = {
  TVPLUS: 'TV+ uygulaması',
  MIXPANEL: 'Mixpanel',
  SYNTHETIC: 'Sentetik örnek',
}

export const TYPE_LABEL = { MOVIE: 'Film', SHOW: 'Dizi' } as const

export const SLOT_LABEL: Record<string, string> = {
  ADJECTIVE: 'Sıfat',
  REGION: 'Köken',
  SOURCE: 'Uyarlama',
  SETTING: 'Mekân',
  PERIOD: 'Dönem',
  SUBJECT: 'Konu',
  AGE: 'Yaş grubu',
  LEAD: 'Ana karakter',
  FORMAT: 'Biçim',
  ERA: 'Yapım dönemi',
  PERSON: 'Kişi',
}

export const DEVICE_LABEL: Record<string, string> = { TV: 'TV', MOBILE: 'Mobil', WEB: 'Web', OTHER: 'Diğer' }

/** Ülke kodu → Türkçe ad (tarayıcının Intl verisiyle; bilinmeyen 'ZZ'). */
const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' })
  } catch {
    return null
  }
})()
export function countryName(code: string): string {
  if (code === 'ZZ') return 'Bilinmiyor'
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** Açılır ayrıntı (<details>) — klavyeyle açılır, durum ekran okuyucuya bildirilir. */
export function Disclosure({
  summary,
  children,
  open,
}: {
  summary: ReactNode
  children: ReactNode
  open?: boolean
}): ReactElement {
  return (
    <details className="st-disclosure" open={open}>
      <summary>{summary}</summary>
      <div className="st-disclosure__body">{children}</div>
    </details>
  )
}

/** Basit bölümlü seçim (radyo grubu görünümünde düğmeler). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}): ReactElement {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={o.id === value ? 'st-seg__btn is-on' : 'st-seg__btn'}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
