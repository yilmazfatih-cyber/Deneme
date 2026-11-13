/**
 * Elle çizilmiş grafikler (SVG/CSS; ek kütüphane yok). Kurallar: tek vurgu rengi "bizim / model" için, tabanlar ve
 * bağlam nötr gri; mümkünse doğrudan etiket; Türkçe sayı biçimi; her grafiğin metin karşılığı (tablo ya da aria-label).
 */
import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { fmtPct, fmtRatio, fmtSigned } from './format'
import { extent, groupedBars, linear, linePath, niceMax, symmetricMax, ticks, type PairedData } from './scales'

/* ───────────── Eşli çubuklar: katalog payı ↔ izlenme payı ───────────── */

export function PairedBars({
  data,
  caption,
  firstLabel = 'Katalog payı',
  secondLabel = 'İzlenme payı',
  sampleTag,
}: {
  data: PairedData
  caption: string
  firstLabel?: string
  secondLabel?: string
  /** Hesap sentetik veriyle yapıldıysa sayının yanına konan etiket */
  sampleTag?: ReactNode
}): ReactElement {
  if (!data.rows.length) return <p className="ui-meta">Gösterilecek satır yok.</p>
  return (
    <table className="st-paired">
      <caption className="ui-sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Ad</th>
          <th scope="col">
            <span className="st-key st-key--base" aria-hidden="true" />
            {firstLabel} <span className="st-dim">·</span> <span className="st-key st-key--accent" aria-hidden="true" />
            {secondLabel}
          </th>
          <th scope="col" className="st-num">
            Verim
          </th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className="st-paired__name">
              {r.name}
              <span className="st-dim"> · {r.titles}</span>
            </th>
            <td className="st-paired__bars">
              <span className="st-pbar">
                <span className="st-pbar__fill st-pbar__fill--base" style={{ width: `${(r.catalogShare / data.max) * 100}%` }} />
                <span className="st-pbar__val">{fmtPct(r.catalogShare)}</span>
              </span>
              <span className="st-pbar">
                <span className="st-pbar__fill st-pbar__fill--accent" style={{ width: `${(r.viewShare / data.max) * 100}%` }} />
                <span className="st-pbar__val">
                  {fmtPct(r.viewShare)}
                  {sampleTag}
                </span>
              </span>
            </td>
            <td className={`st-num${r.efficiency !== null && r.efficiency >= 1 ? ' st-strong' : ''}`}>
              {r.efficiency === null ? '—' : fmtRatio(r.efficiency, 2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ───────────── İki ince çubuk (topluluk: izleyici payı ↔ saat payı) ───────────── */

export function TwinBars({ a, b, aLabel, bLabel, max = 1 }: { a: number; b: number; aLabel: string; bLabel: string; max?: number }): ReactElement {
  return (
    <div className="st-twin">
      <span className="st-twin__row">
        <span className="st-twin__label">{aLabel}</span>
        <span className="st-twin__track">
          <span className="st-pbar__fill st-pbar__fill--base" style={{ width: `${Math.min(1, a / max) * 100}%` }} />
        </span>
        <span className="st-num">{fmtPct(a)}</span>
      </span>
      <span className="st-twin__row">
        <span className="st-twin__label">{bLabel}</span>
        <span className="st-twin__track">
          <span className="st-pbar__fill st-pbar__fill--accent" style={{ width: `${Math.min(1, b / max) * 100}%` }} />
        </span>
        <span className="st-num">{fmtPct(b)}</span>
      </span>
    </div>
  )
}

/* ───────────── İşaretli yatay çubuklar (ağırlıklar, katkılar) ───────────── */

export interface SignedItem {
  key: string
  label: ReactNode
  /** Erişilebilir ad (label düz metin değilse) */
  text: string
  value: number
  note?: ReactNode
}

export function SignedBars({ items, caption, digits = 2 }: { items: readonly SignedItem[]; caption: string; digits?: number }): ReactElement {
  const max = symmetricMax(items.map((i) => i.value))
  return (
    <ul className="st-signed" aria-label={caption}>
      {items.map((it) => {
        const w = (Math.abs(it.value) / max) * 50
        return (
          <li key={it.key} className="st-signed__row" aria-label={`${it.text}: ${fmtSigned(it.value, digits)}`}>
            <span className="st-signed__label">
              {it.label}
              {it.note && <span className="st-signed__note">{it.note}</span>}
            </span>
            <span className="st-signed__track" aria-hidden="true">
              <span className="st-signed__axis" />
              <span
                className={`st-signed__bar ${it.value >= 0 ? 'is-pos' : 'is-neg'}`}
                style={it.value >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
              />
            </span>
            <span className="st-num st-signed__val">{fmtSigned(it.value, digits)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/* ───────────── Gruplu çubuk grafiği (model ↔ tabanlar) ───────────── */

export interface BarSeries {
  key: string
  label: string
  /** 'accent' model · 'base1..3' tabanlar (koyulaşan gri) */
  tone: 'accent' | 'base1' | 'base2' | 'base3'
}

export function GroupedBarChart({
  groups,
  series,
  values,
  caption,
  format = (v: number) => fmtPct(v),
  height = 200,
}: {
  groups: readonly string[]
  series: readonly BarSeries[]
  values: readonly (readonly (number | null)[])[]
  caption: string
  format?: (v: number) => string
  height?: number
}): ReactElement {
  const W = 640
  const H = height
  const PAD = { l: 40, r: 8, t: 18, b: 26 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const layout = groupedBars(groups, series.map((s) => s.key), values, iw, ih)
  const y = linear([0, layout.max], [ih, 0])
  const toneOf = new Map(series.map((s) => [s.key, s.tone]))
  return (
    <figure className="st-figure">
      <div className="st-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key} className="st-legend__item">
            <span className={`st-key st-key--${s.tone}`} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="st-svg" role="img" aria-label={caption}>
        <g transform={`translate(${PAD.l},${PAD.t})`}>
          {ticks(0, layout.max, 4).map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} className="st-grid" />
              <text x={-6} y={y(t)} className="st-axis" textAnchor="end" dominantBaseline="middle">
                {format(t)}
              </text>
            </g>
          ))}
          {layout.groups.map((g) => (
            <g key={g.label}>
              {g.bars.map((b) => (
                <g key={b.key}>
                  <rect
                    x={b.x + 1}
                    y={b.y}
                    width={Math.max(1, layout.barWidth - 2)}
                    height={Math.max(0, b.h)}
                    className={`st-bar st-bar--${toneOf.get(b.key) ?? 'base1'}`}
                  />
                  {toneOf.get(b.key) === 'accent' && (
                    <text x={b.x + layout.barWidth / 2} y={b.y - 4} className="st-barlabel" textAnchor="middle">
                      {format(b.value)}
                    </text>
                  )}
                </g>
              ))}
              <text x={g.x} y={ih + 16} className="st-axis st-axis--x" textAnchor="middle">
                {g.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </figure>
  )
}

/* ───────────── Çizgi grafiği ───────────── */

export interface LineSeries {
  key: string
  label: string
  values: readonly (number | null)[]
  tone: 'accent' | 'base' | 'faint'
  dashed?: boolean
}

export function LineChart({
  xLabels,
  series,
  caption,
  format = (v: number) => fmtPct(v, 0),
  height = 220,
  yMax,
  xLabelEvery = 1,
}: {
  xLabels: readonly string[]
  series: readonly LineSeries[]
  caption: string
  format?: (v: number) => string
  height?: number
  yMax?: number
  xLabelEvery?: number
}): ReactElement {
  const W = 680
  const H = height
  const PAD = { l: 44, r: 150, t: 12, b: 24 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)))
  const top = yMax ?? niceMax(Math.max(0, ...all))
  const n = Math.max(1, xLabels.length - 1)
  const x = linear([0, n], [0, iw])
  const y = linear([0, top], [ih, 0])
  // Doğrudan etiketler: son noktanın hizasında, üst üste binmesin diye aralanır
  const ends = series
    .filter((s) => s.tone !== 'faint')
    .map((s) => {
      let i = s.values.length - 1
      while (i >= 0 && (s.values[i] === null || !Number.isFinite(s.values[i]!))) i--
      return { s, v: i >= 0 ? s.values[i]! : null }
    })
    .filter((e): e is { s: LineSeries; v: number } => e.v !== null)
    .sort((a, b) => y(a.v) - y(b.v))
  let last = -Infinity
  const labelY = ends.map((e) => {
    const yy = Math.max(y(e.v), last + 13)
    last = yy
    return { ...e, yy }
  })
  const order = [...series].sort((a, b) => rank(a.tone) - rank(b.tone))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="st-svg" role="img" aria-label={caption}>
      <g transform={`translate(${PAD.l},${PAD.t})`}>
        {ticks(0, top, 4).map((t) => (
          <g key={t}>
            <line x1={0} x2={iw} y1={y(t)} y2={y(t)} className="st-grid" />
            <text x={-6} y={y(t)} className="st-axis" textAnchor="end" dominantBaseline="middle">
              {format(t)}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          i % xLabelEvery === 0 || i === xLabels.length - 1 ? (
            <text key={l + i} x={x(i)} y={ih + 16} className="st-axis st-axis--x" textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {order.map((s) => (
          <path
            key={s.key + (s.dashed ? '-d' : '')}
            d={linePath(s.values.map((v, i) => (v === null ? null : { x: x(i), y: y(Math.min(top, v)) })))}
            className={`st-line st-line--${s.tone}${s.dashed ? ' is-dashed' : ''}`}
          />
        ))}
        {labelY.map((e) => (
          <text
            key={`${e.s.key}-${e.s.dashed ? 'd' : 's'}`}
            x={iw + 6}
            y={e.yy}
            dominantBaseline="middle"
            className={`st-linelabel st-linelabel--${e.s.tone}`}
          >
            {e.s.label} {format(e.v)}
          </text>
        ))}
      </g>
    </svg>
  )
}
const rank = (t: LineSeries['tone']) => (t === 'faint' ? 0 : t === 'base' ? 1 : 2)

/* ───────────── Dağılım grafiği (gömme haritası) ───────────── */

export interface ScatterPoint {
  id: number
  x: number
  y: number
  label: string
  /** 'a' / 'b' iki kategori (ör. film / dizi) */
  group: 'a' | 'b'
  /** Vurgulu (seçili başlık ve komşuları) */
  emphasis?: 'selected' | 'near' | null
}

export function ScatterPlot({
  points,
  caption,
  onSelect,
  height = 420,
}: {
  points: readonly ScatterPoint[]
  caption: string
  onSelect?: (id: number) => void
  height?: number
}): ReactElement {
  const W = 760
  const H = height
  const P = 16
  const xs = useMemo(() => extent(points.map((p) => p.x)), [points])
  const ys = useMemo(() => extent(points.map((p) => p.y)), [points])
  const sx = linear(xs, [P, W - P])
  const sy = linear(ys, [H - P, P])
  const [hover, setHover] = useState<number | null>(null)
  const tipId = useId()
  const active = points.find((p) => p.id === hover) ?? null
  const ordered = [...points].sort((a, b) => emph(a) - emph(b))
  return (
    <div className="st-scatter">
      <svg viewBox={`0 0 ${W} ${H}`} className="st-svg" role="group" aria-label={caption}>
        {ordered.map((p) => (
          <circle
            key={p.id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={p.emphasis === 'selected' ? 8 : p.emphasis === 'near' ? 6 : 5}
            className={`st-dot st-dot--${p.group}${p.emphasis ? ` is-${p.emphasis}` : ''}${hover === p.id ? ' is-hover' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={p.label}
            aria-describedby={hover === p.id ? tipId : undefined}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
            onFocus={() => setHover(p.id)}
            onBlur={() => setHover((h) => (h === p.id ? null : h))}
            onClick={() => onSelect?.(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(p.id)
              }
            }}
          />
        ))}
      </svg>
      {active && (
        <div
          id={tipId}
          role="tooltip"
          className="st-tip"
          style={{ left: `${(sx(active.x) / W) * 100}%`, top: `${(sy(active.y) / H) * 100}%` }}
        >
          {active.label}
        </div>
      )}
    </div>
  )
}
const emph = (p: ScatterPoint) => (p.emphasis === 'selected' ? 2 : p.emphasis === 'near' ? 1 : 0)

/* ───────────── Küçük ısı tablosu hücresi ───────────── */

/** 0–1 değer için zemin yoğunluğu (vurgu renginin saydamlığı). */
export function heat(v: number): { background: string } {
  const a = Math.max(0, Math.min(1, v))
  return { background: `rgba(247, 216, 73, ${(0.06 + a * 0.5).toFixed(3)})` }
}
