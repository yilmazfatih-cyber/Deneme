import { useState } from 'react'
import { DayLogSheet } from '../components/DayLogSheet'
import { MonthCalendar } from '../components/MonthCalendar'
import { PHASE_LABEL } from '../lib/catalog'
import { dayInfo } from '../lib/cycle'
import { addMonths, formatMonthYear, formatLong, startOfMonth, type ISODate } from '../lib/dates'
import { useStore } from '../state/store'

export function Calendar({ today }: { today: ISODate }) {
  const { state, stats, dispatch } = useStore()
  const [month, setMonth] = useState(startOfMonth(today))
  const [selected, setSelected] = useState<ISODate | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const info = selected ? dayInfo(selected, state.periods, stats, today) : null

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Önceki ay" onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <h1
          className="screen-title"
          style={{ margin: 0, fontSize: 20, textTransform: 'capitalize' }}
          aria-live="polite"
        >
          {formatMonthYear(month)}
        </h1>
        <button className="icon-btn" aria-label="Sonraki ay" onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
      </div>

      <div className="card">
        <MonthCalendar month={month} today={today} selected={selected} onSelect={setSelected} />
      </div>

      <div className="legend" aria-label="Açıklama">
        <span>
          <i style={{ background: 'var(--primary)' }} /> Adet
        </span>
        <span>
          <i style={{ border: '2px dashed var(--primary)' }} /> Tahmini adet
        </span>
        <span>
          <i style={{ background: 'var(--fertile-soft)', border: '1px solid var(--fertile)' }} /> Doğurgan
        </span>
        <span>
          <i style={{ background: 'var(--ovulation)' }} /> Yumurtlama
        </span>
        <span>
          <i style={{ background: 'var(--luteal)', width: 8, height: 8 }} /> Kayıt
        </span>
      </div>

      {month !== startOfMonth(today) && (
        <button className="btn ghost" onClick={() => setMonth(startOfMonth(today))}>
          Bugüne dön
        </button>
      )}

      {selected && info && (
        <div className="card">
          <h3>{formatLong(selected)}</h3>
          <p>
            {info.loggedPeriod && 'Adet günü'}
            {!info.loggedPeriod && info.predictedPeriod && 'Tahmini adet günü'}
            {!info.loggedPeriod && !info.predictedPeriod && info.phase && PHASE_LABEL[info.phase]}
            {!info.phase && 'Döngü bilgisi yok'}
            {info.cycleDay && <span className="muted"> · döngünün {info.cycleDay}. günü</span>}
          </p>
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className={`btn ${info.loggedPeriod ? 'secondary' : 'primary'}`}
              disabled={selected > today}
              onClick={() => dispatch({ type: 'togglePeriodDay', date: selected })}
            >
              {info.loggedPeriod ? 'Adet kaydını kaldır' : 'Adet olarak işaretle'}
            </button>
            <button className="btn ghost" onClick={() => setLogOpen(true)}>
              {state.logs[selected] ? 'Kaydı düzenle' : 'Belirti ekle'}
            </button>
          </div>
        </div>
      )}

      {logOpen && selected && <DayLogSheet date={selected} today={today} onClose={() => setLogOpen(false)} />}
    </div>
  )
}
