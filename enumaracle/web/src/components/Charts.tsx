import type { DailyStat } from '../types'
import { fmtNum } from '../format'

export interface BarDatum {
  label: string
  value: number
  /** CSS color token name, e.g. "--c-success". */
  color: string
}

/** Horizontal bar chart with labels and values always visible as text. */
export function BarChart({ data, title }: { data: BarDatum[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((s, d) => s + d.value, 0)
  const row = 30
  const labelW = 96
  const valueW = 72
  const width = 420
  const barW = width - labelW - valueW
  const height = data.length * row
  return (
    <figure className="chart chart-bars">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
        preserveAspectRatio="xMinYMin meet"
      >
        {data.map((d, i) => {
          const w = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * barW)
          const y = i * row
          const pct = total ? Math.round((d.value / total) * 100) : 0
          return (
            <g key={d.label}>
              <text x={0} y={y + row / 2} dominantBaseline="middle" className="chart-label">
                {d.label}
              </text>
              <rect x={labelW} y={y + 6} width={barW} height={row - 12} rx={4} className="chart-track" />
              <rect x={labelW} y={y + 6} width={w} height={row - 12} rx={4} style={{ fill: `var(${d.color})` }} />
              <text x={labelW + barW + 8} y={y + row / 2} dominantBaseline="middle" className="chart-value">
                {fmtNum(d.value)} ({pct}%)
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

const SERIES: { key: keyof Omit<DailyStat, 'day'>; label: string; color: string }[] = [
  { key: 'calls', label: 'Çağrı', color: '--c-series-1' },
  { key: 'answered', label: 'Cevaplanan', color: '--c-series-2' },
  { key: 'short', label: 'Kısa (< 6 sn)', color: '--c-series-3' },
  { key: 'complaints', label: 'Şikâyet', color: '--c-series-4' },
]

function dayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  return m ? `${m[3]}.${m[2]}` : day
}

/** 14-day line chart with legend and a data table fallback. */
export function DailyChart({ data }: { data: DailyStat[] }) {
  const W = 560
  const H = 220
  const pad = { l: 40, r: 12, t: 12, b: 28 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const max = Math.max(4, ...data.flatMap((d) => SERIES.map((s) => d[s.key] ?? 0)))
  const niceMax = Math.ceil(max / 4) * 4
  const x = (i: number) => pad.l + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v: number) => pad.t + innerH - (v / niceMax) * innerH
  const ticks = [0, 1, 2, 3, 4].map((k) => (niceMax / 4) * k)

  return (
    <figure className="chart chart-daily">
      <ul className="legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="legend-swatch" style={{ background: `var(${s.color})` }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Son 14 günün günlük çağrı grafiği; ayrıntılar aşağıdaki tabloda">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="chart-axis">
              {fmtNum(Math.round(t))}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % 2 === 0 || data.length <= 7 ? (
            <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis">
              {dayLabel(d.day)}
            </text>
          ) : null,
        )}
        {SERIES.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              style={{ stroke: `var(${s.color})` }}
              strokeDasharray={s.key === 'complaints' ? '5 3' : s.key === 'short' ? '2 3' : undefined}
              points={data.map((d, i) => `${x(i)},${y(d[s.key] ?? 0)}`).join(' ')}
            />
            {data.map((d, i) => (
              <circle key={d.day} cx={x(i)} cy={y(d[s.key] ?? 0)} r={2.5} style={{ fill: `var(${s.color})` }} />
            ))}
          </g>
        ))}
      </svg>
      <details className="chart-table">
        <summary>Tablo olarak göster</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Gün</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{dayLabel(d.day)}</th>
                  {SERIES.map((s) => (
                    <td key={s.key} className="num">
                      {fmtNum(d[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** Small circular score gauge (0–100, -1 = no data). */
export function ScoreGauge({ score, size = 64 }: { score: number; size?: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const has = score >= 0
  const pct = has ? Math.min(100, score) / 100 : 0
  const color = !has ? '--c-muted' : score >= 70 ? '--c-success' : score >= 50 ? '--c-info' : score >= 30 ? '--c-warning' : '--c-danger'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={has ? `Puan ${score} / 100` : 'Puan yok'}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="chart-track-stroke" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        style={{ stroke: `var(${color})` }}
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="middle" className="gauge-text">
        {has ? score : '—'}
      </text>
    </svg>
  )
}
