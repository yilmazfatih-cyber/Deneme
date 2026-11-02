import { useState } from 'react'
import { DISCHARGE, FLOW, MOODS, SEX, SYMPTOMS } from '../lib/catalog'
import { dayInfo } from '../lib/cycle'
import { formatLong, type ISODate } from '../lib/dates'
import type { DayLog } from '../lib/storage'
import { useStore } from '../state/store'
import { MultiChips, SingleChips } from './Chips'
import { Sheet } from './Sheet'

interface Props {
  date: ISODate
  today: ISODate
  onClose: () => void
}

/** Bir günün kaydı: adet, akıntı miktarı, belirtiler, ruh hali, akıntı, cinsellik, not. */
export function DayLogSheet({ date, today, onClose }: Props) {
  const { state, stats, dispatch } = useStore()
  const [log, setLog] = useState<DayLog>(() => ({ ...(state.logs[date] ?? {}) }))
  const info = dayInfo(date, state.periods, stats, today)
  const future = date > today

  const save = () => {
    dispatch({ type: 'setLog', date, log })
    onClose()
  }
  const toggleFlow = (flow: string | undefined) => {
    setLog({ ...log, flow })
    // Akıntı miktarı seçmek günü adet olarak işaretler.
    if (flow && !info.loggedPeriod) dispatch({ type: 'togglePeriodDay', date })
  }

  return (
    <Sheet title={formatLong(date)} onClose={onClose}>
      <div className="section">
        <div className="row between">
          <div>
            <h4 style={{ margin: 0 }}>Adet</h4>
            <p className="muted" style={{ fontSize: 14 }}>
              {info.loggedPeriod ? 'Bu gün adet olarak kayıtlı' : future ? 'Gelecek gün' : 'Adet değil'}
            </p>
          </div>
          <button
            className={`btn ${info.loggedPeriod ? 'secondary' : 'primary'}`}
            disabled={future}
            onClick={() => dispatch({ type: 'togglePeriodDay', date })}
          >
            {info.loggedPeriod ? 'Adet kaydını kaldır' : 'Adet olarak işaretle'}
          </button>
        </div>
      </div>

      <div className="section">
        <h4>Kanama miktarı</h4>
        <SingleChips options={FLOW} value={log.flow} onChange={toggleFlow} label="Kanama miktarı" />
      </div>

      <div className="section">
        <h4>Belirtiler</h4>
        <MultiChips
          options={SYMPTOMS}
          value={log.symptoms ?? []}
          onChange={(v) => setLog({ ...log, symptoms: v })}
          label="Belirtiler"
        />
      </div>

      <div className="section">
        <h4>Ruh hali</h4>
        <MultiChips
          options={MOODS}
          value={log.moods ?? []}
          onChange={(v) => setLog({ ...log, moods: v })}
          label="Ruh hali"
        />
      </div>

      <div className="section">
        <h4>Vajinal akıntı</h4>
        <SingleChips
          options={DISCHARGE}
          value={log.discharge}
          onChange={(v) => setLog({ ...log, discharge: v })}
          label="Vajinal akıntı"
        />
      </div>

      <div className="section">
        <h4>Cinsellik</h4>
        <MultiChips
          options={SEX}
          value={log.sex ?? []}
          onChange={(v) => setLog({ ...log, sex: v })}
          label="Cinsellik"
        />
      </div>

      <div className="section">
        <h4>Not</h4>
        <textarea
          aria-label="Not"
          placeholder="Bugünle ilgili eklemek istediğin bir şey…"
          value={log.note ?? ''}
          onChange={(e) => setLog({ ...log, note: e.target.value })}
        />
      </div>

      <button className="btn primary block" onClick={save}>
        Kaydet
      </button>
    </Sheet>
  )
}
