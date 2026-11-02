import { useState } from 'react'
import { DayLogSheet } from '../components/DayLogSheet'
import { Ring } from '../components/Ring'
import { WeekStrip } from '../components/WeekStrip'
import { CHANCE_LABEL, MOODS, PHASE_LABEL, PHASE_TIPS, SYMPTOMS } from '../lib/catalog'
import { dayInfo, predict, todayStatus } from '../lib/cycle'
import { formatShort, type ISODate } from '../lib/dates'
import { useStore } from '../state/store'

export function Today({ today }: { today: ISODate }) {
  const { state, stats, dispatch } = useStore()
  const [selected, setSelected] = useState<ISODate>(today)
  const [logOpen, setLogOpen] = useState(false)

  const status = todayStatus(state.periods, stats, today)
  const pred = predict(state.periods, stats, today)
  const selInfo = dayInfo(selected, state.periods, stats, today)
  const log = state.logs[selected]

  // Halka: döngü günü / döngü uzunluğu
  const progress = status.cycleDay ? status.cycleDay / stats.cycleLength : 0

  let kicker = ''
  let main = ''
  let sub = ''
  let cta: { label: string; action: () => void; kind: 'primary' | 'secondary' } | null = null
  switch (status.kind) {
    case 'none':
      kicker = 'Henüz kayıt yok'
      main = 'Adetin başladı mı?'
      sub = 'Aşağıdan kaydet, takvim oluşsun'
      cta = { label: 'Adet başladı', action: () => dispatch({ type: 'startPeriod', date: today }), kind: 'primary' }
      break
    case 'period':
      kicker = 'Adet'
      main = `${status.n}. gün`
      sub = status.periodOngoing?.endConfirmed ? '' : `Tahmini bitiş ${formatShort(status.periodOngoing!.end)}`
      cta = { label: 'Adet bitti', action: () => dispatch({ type: 'endPeriod', date: today }), kind: 'secondary' }
      break
    case 'countdown':
      kicker = 'Adete'
      main = status.n === 0 ? 'bugün' : `${status.n} gün`
      sub = status.n === 0 ? 'Tahmini başlangıç bugün' : `Tahmini ${formatShort(pred.nextStart!)}`
      cta = { label: 'Adet başladı', action: () => dispatch({ type: 'startPeriod', date: today }), kind: 'primary' }
      break
    case 'late':
      kicker = 'Adet gecikti'
      main = `${status.n} gün`
      sub = 'Başladıysa kaydet; tahmin güncellenir'
      cta = { label: 'Adet başladı', action: () => dispatch({ type: 'startPeriod', date: today }), kind: 'primary' }
      break
    case 'ovulation':
      kicker = 'Tahmini'
      main = 'Yumurtlama günü'
      sub = `Adete ${status.n} gün`
      cta = { label: 'Adet başladı', action: () => dispatch({ type: 'startPeriod', date: today }), kind: 'secondary' }
      break
    case 'fertile':
      kicker = 'Doğurgan pencere'
      main = 'Yüksek olasılık'
      sub = `Adete ${status.n} gün`
      cta = { label: 'Adet başladı', action: () => dispatch({ type: 'startPeriod', date: today }), kind: 'secondary' }
      break
  }

  const reminder =
    state.settings.periodReminder && status.kind === 'countdown' && status.n > 0 && status.n <= 3
      ? `Adetin ${status.n} gün içinde başlayabilir. Ped veya tampon bulundurmayı unutma.`
      : null

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="screen-title">Bugün</h1>
        {status.phase && (
          <span className={`phase-pill ${status.phase}`}>
            {PHASE_LABEL[status.phase]}
            {status.cycleDay ? ` · ${status.cycleDay}. gün` : ''}
          </span>
        )}
      </div>

      <WeekStrip today={today} selected={selected} onSelect={setSelected} />

      <Ring
        progress={progress}
        phase={status.phase}
        kicker={kicker}
        main={main}
        sub={sub}
        small={status.kind === 'ovulation' || status.kind === 'fertile' || status.kind === 'none'}
      />

      {cta && (
        <button className={`btn ${cta.kind} block`} onClick={cta.action}>
          {cta.label}
        </button>
      )}

      {reminder && (
        <div className="banner" role="status">
          <span>🔔 {reminder}</span>
        </div>
      )}

      {status.chance && (
        <div className="card">
          <h3>Gebelik olasılığı</h3>
          <div className="row between">
            <p>
              <strong>{CHANCE_LABEL[status.chance]}</strong>
              {pred.ovulation && status.phase !== 'period' && (
                <span className="muted"> · Tahmini yumurtlama {formatShort(pred.ovulation)}</span>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>{selected === today ? 'Bugün nasılsın?' : formatShort(selected)}</h3>
          <button className="btn ghost" onClick={() => setLogOpen(true)}>
            {log ? 'Düzenle' : 'Kaydet'} ＋
          </button>
        </div>
        {log ? (
          <p style={{ marginTop: 8 }}>
            {[
              ...(log.symptoms ?? []).map((k) => SYMPTOMS.find((o) => o.key === k)?.label),
              ...(log.moods ?? []).map((k) => MOODS.find((o) => o.key === k)?.label),
            ]
              .filter(Boolean)
              .join(' · ') || 'Kayıt var'}
            {log.note && <span className="muted"> · {log.note}</span>}
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>
            Belirti, ruh hali ve notlarını ekle; analiz ekranında örüntüleri gör.
          </p>
        )}
      </div>

      {selInfo.phase && (
        <div className="card">
          <h3>{PHASE_LABEL[selInfo.phase]}</h3>
          <p>{PHASE_TIPS[selInfo.phase]}</p>
        </div>
      )}

      {logOpen && <DayLogSheet date={selected} today={today} onClose={() => setLogOpen(false)} />}
    </div>
  )
}
