import { MOODS, SYMPTOMS } from '../lib/catalog'
import { cycleHistory } from '../lib/cycle'
import { formatDayMonthYear, type ISODate } from '../lib/dates'
import { useStore } from '../state/store'

export function Insights({ today }: { today: ISODate }) {
  const { state, stats } = useStore()
  const rows = cycleHistory(state.periods, today)
  const bars = stats.cycleLengths.slice(-8)
  const maxBar = Math.max(35, ...bars)

  // En sık belirtiler ve ruh halleri (son 90 gün)
  const counts = new Map<string, number>()
  const moodCounts = new Map<string, number>()
  let logged = 0
  for (const [d, log] of Object.entries(state.logs)) {
    if (d > today) continue
    logged++
    for (const s of log.symptoms ?? []) counts.set(s, (counts.get(s) ?? 0) + 1)
    for (const m of log.moods ?? []) moodCounts.set(m, (moodCounts.get(m) ?? 0) + 1)
  }
  const top = (m: Map<string, number>, cat: typeof SYMPTOMS) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => ({
        label: cat.find((o) => o.key === k)?.label ?? k,
        n,
        icon: cat.find((o) => o.key === k)?.icon ?? '',
      }))

  const regularity =
    stats.cycleSamples < 2
      ? null
      : stats.variation <= 7
        ? 'Düzenli'
        : stats.variation <= 9
          ? 'Hafif değişken'
          : 'Düzensiz'

  return (
    <div className="screen">
      <h1 className="screen-title">Analiz</h1>

      <div className="stat-grid">
        <div className="stat">
          <div className="v">{stats.cycleLength} gün</div>
          <div className="l">
            Ortalama döngü{stats.cycleSamples ? ` · ${stats.cycleSamples} döngü` : ' · varsayılan'}
          </div>
        </div>
        <div className="stat">
          <div className="v">{stats.periodLength} gün</div>
          <div className="l">
            Ortalama adet{stats.periodSamples ? ` · ${stats.periodSamples} adet` : ' · varsayılan'}
          </div>
        </div>
        <div className="stat">
          <div className="v">{regularity ?? '—'}</div>
          <div className="l">
            {regularity ? `Döngü değişkenliği ${stats.variation} gün` : 'Düzen için en az 3 adet kaydı gerekir'}
          </div>
        </div>
        <div className="stat">
          <div className="v">{logged}</div>
          <div className="l">Kayıtlı gün</div>
        </div>
      </div>

      <div className="card">
        <h3>Döngü uzunlukları</h3>
        {bars.length === 0 ? (
          <p className="muted">İki adet kaydından sonra burada döngü grafiği görünür.</p>
        ) : (
          <div className="bars" role="img" aria-label={`Son döngüler: ${bars.join(', ')} gün`}>
            {bars.map((n, i) => (
              <div className="bar" key={i}>
                <b>{n}</b>
                <i
                  style={{
                    height: `${(n / maxBar) * 100}%`,
                    background: n === bars[bars.length - 1] ? 'var(--primary)' : undefined,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Sık belirtiler</h3>
        {counts.size === 0 ? (
          <p className="muted">Günlük kayıtlarında belirti işaretledikçe burada toplanır.</p>
        ) : (
          <div className="list">
            {top(counts, SYMPTOMS).map((s) => (
              <div className="list-row" key={s.label}>
                <span>
                  <span aria-hidden="true">{s.icon}</span> {s.label}
                </span>
                <span className="muted">{s.n} gün</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {moodCounts.size > 0 && (
        <div className="card">
          <h3>Ruh hali</h3>
          <div className="list">
            {top(moodCounts, MOODS).map((s) => (
              <div className="list-row" key={s.label}>
                <span>
                  <span aria-hidden="true">{s.icon}</span> {s.label}
                </span>
                <span className="muted">{s.n} gün</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Geçmiş döngüler</h3>
        {rows.length === 0 ? (
          <p className="muted">Henüz adet kaydı yok.</p>
        ) : (
          <div className="list">
            {rows.map((r) => (
              <div className="list-row" key={r.start}>
                <div>
                  <div style={{ fontWeight: 600 }}>{formatDayMonthYear(r.start)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Adet {r.periodLength} gün{r.ongoing ? ' (devam ediyor)' : ''}
                  </div>
                </div>
                <span className="muted">{r.cycleLength ? `${r.cycleLength} günlük döngü` : 'Mevcut döngü'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
