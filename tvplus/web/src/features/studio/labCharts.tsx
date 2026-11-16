/**
 * Laboratuvar sayfalarının grafik parçaları (elle; ek kütüphane yok — bkz. charts.tsx'teki kurallar):
 *   IntervalChart  — kestirim + güven aralığı satırları (orman grafiği): risk oranları için logaritmik, göreli etkiler
 *                    için doğrusal eksen. Tablo olarak kurulur; her satırın sayısal okuması yanındadır.
 *   IntervalLegend — aralık grafiğinin göstergesi (nokta biçimleri, güven aralığı çizgisi, eksen dışı oku)
 *   SurvivalChart  — tutunma eğrisi (Kaplan–Meier noktaları) ve güven bandı; gün ekseni gerçek ölçeklidir.
 * Renk tek başına anlam taşımaz: yön/sonuç her satırda ayrıca metinle yazılır; fark gösterilemeyen satırın noktası içi boştur.
 */
import type { ReactElement, ReactNode } from 'react'
import { fmtPct } from './format'
import { fin, type IntervalAxis } from './labScales'
import { linear, linePath, ticks } from './scales'

/* ───────────── Aralık (orman) grafiği ───────────── */

/** good: iyileşme / koruyucu · bad: bozulma / riski artırır · neutral: fark gösterilemedi */
export type IntervalTone = 'good' | 'bad' | 'neutral'

export interface IntervalColumn {
  key: string
  head: ReactNode
  num?: boolean
}

export interface IntervalRow {
  key: string
  /** Satır başlığı */
  label: ReactNode
  /** Düz metin ad (imleç ipucu için) */
  text: string
  value: number | null | undefined
  lo: number | null | undefined
  hi: number | null | undefined
  tone: IntervalTone
  /** Kestirimin ve aralığın metni: "4,15× [3,55; 4,85]" — grafiğin metin karşılığı */
  reading: string
  /** Grafikten önceki / okumadan sonraki ek hücreler (`before` / `after` sütunlarıyla aynı sırada) */
  before?: readonly ReactNode[]
  after?: readonly ReactNode[]
}

const clamp01 = (p: number): number => (Number.isNaN(p) ? 0 : Math.max(0, Math.min(1, p)))
const left = (p: number): string => `${(clamp01(p) * 100).toFixed(2)}%`

export function IntervalChart({
  rows,
  axis,
  caption,
  labelHead,
  readingHead,
  formatTick,
  before = [],
  after = [],
}: {
  rows: readonly IntervalRow[]
  axis: IntervalAxis
  caption: string
  labelHead: ReactNode
  readingHead: ReactNode
  formatTick: (v: number) => string
  before?: readonly IntervalColumn[]
  after?: readonly IntervalColumn[]
}): ReactElement {
  if (!rows.length) return <p className="ui-meta">Gösterilecek satır yok.</p>
  const headCell = (c: IntervalColumn) => (
    <th key={c.key} scope="col" className={c.num ? 'st-num' : undefined}>
      {c.head}
    </th>
  )
  return (
    <div className="st-scroll">
      <table className="st-table st-table--compact st-iv">
        <caption className="ui-sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labelHead}</th>
            {before.map(headCell)}
            <th scope="col" className="st-iv__cell">
              <span className="ui-sr-only">Grafik</span>
              <span className="st-iv__plot" aria-hidden="true">
                {axis.ticks.map((t) => {
                  const p = axis.pos(t)
                  return (
                    <span
                      key={t}
                      className={`st-iv__tick${p < 0.06 ? ' is-start' : p > 0.94 ? ' is-end' : ''}`}
                      style={{ left: left(p) }}
                    >
                      {formatTick(t)}
                    </span>
                  )
                })}
              </span>
            </th>
            <th scope="col">{readingHead}</th>
            {after.map(headCell)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {before.map((c, i) => (
                <td key={c.key} className={c.num ? 'st-num' : undefined}>
                  {r.before?.[i]}
                </td>
              ))}
              <td className="st-iv__cell">
                <IntervalMark row={r} axis={axis} />
              </td>
              <td className="st-iv__reading">{r.reading}</td>
              {after.map((c, i) => (
                <td key={c.key} className={c.num ? 'st-num' : undefined}>
                  {r.after?.[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Bir satırın çizimi: eksen çizgileri, etkisizlik çizgisi, aralık ve nokta; eksen dışına taşan uç okla gösterilir. */
function IntervalMark({ row, axis }: { row: IntervalRow; axis: IntervalAxis }): ReactElement {
  const value = fin(row.value)
  const lo = fin(row.lo)
  const hi = fin(row.hi)
  const pv = value === null ? null : axis.pos(value)
  const pl = lo === null ? null : axis.pos(lo)
  const ph = hi === null ? null : axis.pos(hi)
  // Aralık yoksa (ör. hiç fark yokken 0 genişlik) yalnız nokta çizilir
  const a = pl === null ? pv : pl
  const b = ph === null ? pv : ph
  const offLo = (a !== null && a < 0) || (pv !== null && pv < 0)
  const offHi = (b !== null && b > 1) || (pv !== null && pv > 1)
  const inside = pv !== null && pv >= 0 && pv <= 1
  const whisker = a !== null && b !== null && clamp01(b) > clamp01(a)
  return (
    <span className="st-iv__plot" aria-hidden="true" title={`${row.text}: ${row.reading}`}>
      {axis.ticks.map((t) => (
        <span key={t} className="st-iv__grid" style={{ left: left(axis.pos(t)) }} />
      ))}
      <span className="st-iv__ref" style={{ left: left(axis.pos(axis.reference)) }} />
      {whisker && (
        <span
          className={`st-iv__whisker st-iv__whisker--${row.tone}`}
          style={{ left: left(a), width: `${((clamp01(b) - clamp01(a)) * 100).toFixed(2)}%` }}
        />
      )}
      {/* Aralığın tamamı eksen dışındaysa kenarda kısa bir çizgi ve ok: "bu yönde, ölçeğin ötesinde" */}
      {!whisker && offLo && <span className={`st-iv__stub st-iv__stub--lo st-iv__whisker--${row.tone}`} />}
      {!whisker && offHi && <span className={`st-iv__stub st-iv__stub--hi st-iv__whisker--${row.tone}`} />}
      {offLo && <span className={`st-iv__arrow st-iv__arrow--lo st-iv__arrow--${row.tone}`} />}
      {offHi && <span className={`st-iv__arrow st-iv__arrow--hi st-iv__arrow--${row.tone}`} />}
      {inside && <span className={`st-iv__dot st-iv__dot--${row.tone}`} style={{ left: left(pv) }} />}
    </span>
  )
}

/** Aralık grafiğinin gösterge satırı: nokta biçimlerinin anlamı (sıra çağırandan gelir). */
export function IntervalLegend({
  items,
  clipped = false,
}: {
  items: readonly { tone: IntervalTone; label: string }[]
  /** Eksen daraltıldıysa okun anlamı da yazılır */
  clipped?: boolean
}): ReactElement {
  return (
    <p className="st-legend st-iv__legend">
      {items.map((it) => (
        <span key={it.tone} className="st-legend__item">
          <span className={`st-iv__key st-iv__dot--${it.tone}`} aria-hidden="true" />
          {it.label}
        </span>
      ))}
      <span className="st-legend__item">
        <span className="st-iv__key st-iv__key--line" aria-hidden="true" />
        %95 güven aralığı
      </span>
      {clipped && (
        <span className="st-legend__item">
          <span className="st-iv__key st-iv__key--arrow" aria-hidden="true" />
          Eksen dışı: öteki satırlar okunabilsin diye eksen daraltıldı, değer yanındaki sütunda
        </span>
      )}
    </p>
  )
}

/* ───────────── Tutunma eğrisi ───────────── */

export interface SurvivalDatum {
  day: number
  s: number
  lo: number
  hi: number
}

export function SurvivalChart({
  points,
  caption,
  markDay,
  width = 480,
  height = 270,
}: {
  points: readonly SurvivalDatum[]
  caption: string
  /** Ayrıca etiketlenecek gün (churn tanımındaki süre) */
  markDay?: number
  /** Çizim genişliği (viewBox birimi): yarım sütuna göre seçildi, yazılar okunur kalır */
  width?: number
  height?: number
}): ReactElement {
  const data = points
    .filter((p) => fin(p.day) !== null && fin(p.s) !== null)
    .map((p) => ({ day: p.day, s: p.s, lo: Math.max(0, fin(p.lo) ?? p.s), hi: Math.min(1, fin(p.hi) ?? p.s) }))
    .sort((a, b) => a.day - b.day)
  if (!data.length) return <p className="ui-meta">Tutunma eğrisi için veri yok.</p>
  // Eğri tanım gereği 0. günde %100'den başlar
  const curve = data[0]!.day > 0 ? [{ day: 0, s: 1, lo: 1, hi: 1 }, ...data] : data
  const W = width
  const H = height
  const PAD = { l: 44, r: 52, t: 22, b: 40 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const lastDay = curve[curve.length - 1]!.day
  const lowest = Math.min(...curve.map((p) => Math.min(p.s, p.lo)))
  const yMin = Math.max(0, Math.min(0.9, Math.floor((lowest - 0.02) * 10) / 10))
  const x = linear([0, Math.max(1, lastDay)], [0, iw])
  const y = linear([yMin, 1], [ih, 0])
  const band =
    curve.map((p, i) => `${i ? 'L' : 'M'}${r2(x(p.day))} ${r2(y(p.hi))}`).join(' ') +
    ' ' +
    [...curve]
      .reverse()
      .map((p) => `L${r2(x(p.day))} ${r2(y(p.lo))}`)
      .join(' ') +
    ' Z'
  // Gün etiketleri: veri günleri; birbirine 26 birimden yakın düşenler atlanır (son gün hep yazılır)
  const dayTicks: number[] = []
  for (const p of curve) {
    const prev = dayTicks[dayTicks.length - 1]
    if (prev === undefined || x(p.day) - x(prev) >= 26) dayTicks.push(p.day)
  }
  if (dayTicks[dayTicks.length - 1] !== lastDay) {
    if (dayTicks.length > 1 && x(lastDay) - x(dayTicks[dayTicks.length - 1]!) < 26) dayTicks.pop()
    dayTicks.push(lastDay)
  }
  const end = curve[curve.length - 1]!
  const marked = markDay !== undefined && markDay !== end.day ? data.find((p) => p.day === markDay) : undefined
  const reading = (p: SurvivalDatum) => `${p.day}. gün: ${fmtPct(p.s)} [${fmtPct(p.lo)}; ${fmtPct(p.hi)}]`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="st-svg" role="img" aria-label={caption}>
      <g transform={`translate(${PAD.l},${PAD.t})`}>
        {ticks(yMin, 1, 4).map((t) => (
          <g key={t}>
            <line x1={0} x2={iw} y1={y(t)} y2={y(t)} className="st-grid" />
            <text x={-6} y={y(t)} className="st-axis" textAnchor="end" dominantBaseline="middle">
              {fmtPct(t, 0)}
            </text>
          </g>
        ))}
        {dayTicks.map((d) => (
          <text key={d} x={x(d)} y={ih + 16} className="st-axis st-axis--x" textAnchor="middle">
            {d}
          </text>
        ))}
        <text x={iw / 2} y={ih + 34} className="st-axis" textAnchor="middle">
          başlangıçtan sonraki gün
        </text>
        <path d={band} className="st-surv__band" />
        <path d={linePath(curve.map((p) => ({ x: x(p.day), y: y(p.s) })))} className="st-line st-line--accent" />
        {data.map((p) => (
          <circle key={p.day} cx={x(p.day)} cy={y(p.s)} r={4} className="st-surv__dot">
            <title>{reading(p)}</title>
          </circle>
        ))}
        {marked && (
          <text x={x(marked.day)} y={y(marked.hi) - 8} className="st-linelabel" textAnchor="middle">
            {marked.day}. gün {fmtPct(marked.s)}
          </text>
        )}
        <text x={x(end.day) + 8} y={y(end.s)} dominantBaseline="middle" className="st-linelabel st-linelabel--accent">
          {fmtPct(end.s)}
        </text>
      </g>
    </svg>
  )
}

const r2 = (n: number): number => Math.round(n * 100) / 100
