import { dayInfo } from '../lib/cycle'
import { addDays, formatLong, fromISO, weekdayIndex, WEEKDAYS_SHORT, type ISODate } from '../lib/dates'
import { useStore } from '../state/store'
import { dayAria, numClass } from './DayCell'

interface Props {
  today: ISODate
  selected: ISODate
  onSelect: (d: ISODate) => void
}

/** Bugünün içinde olduğu hafta (Pazartesi başlangıçlı). */
export function WeekStrip({ today, selected, onSelect }: Props) {
  const { state, stats } = useStore()
  const monday = addDays(today, -weekdayIndex(today))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return (
    <div className="week" role="listbox" aria-label="Bu hafta">
      {days.map((d) => {
        const info = dayInfo(d, state.periods, stats, today)
        const hasLog = !!state.logs[d]
        return (
          <button
            key={d}
            role="option"
            aria-selected={d === selected}
            aria-label={dayAria(info, formatLong(d), hasLog)}
            className={`week-day${d === today ? ' today' : ''}${d === selected ? ' sel' : ''}`}
            onClick={() => onSelect(d)}
          >
            <span className="wd">{WEEKDAYS_SHORT[weekdayIndex(d)]}</span>
            <span className={numClass(info)}>{fromISO(d).getDate()}</span>
            <span className={`dot${hasLog ? '' : ' hidden'}`} />
          </button>
        )
      })}
    </div>
  )
}
