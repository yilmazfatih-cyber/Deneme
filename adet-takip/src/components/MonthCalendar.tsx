import { dayInfo } from '../lib/cycle'
import {
  addDays,
  daysInMonth,
  formatLong,
  fromISO,
  startOfMonth,
  weekdayIndex,
  WEEKDAYS_SHORT,
  type ISODate,
} from '../lib/dates'
import { useStore } from '../state/store'
import { dayAria, numClass } from './DayCell'

interface Props {
  month: ISODate
  today: ISODate
  selected: ISODate | null
  onSelect: (d: ISODate) => void
}

export function MonthCalendar({ month, today, selected, onSelect }: Props) {
  const { state, stats } = useStore()
  const first = startOfMonth(month)
  const lead = weekdayIndex(first)
  const n = daysInMonth(first)
  const cells: (ISODate | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: n }, (_, i) => addDays(first, i)),
  ]
  while (cells.length % 7) cells.push(null)

  return (
    <div>
      <div className="cal-head" aria-hidden="true">
        {WEEKDAYS_SHORT.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cal-grid" role="grid" aria-label="Takvim">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} className="cal-day other" aria-hidden="true" />
          const info = dayInfo(d, state.periods, stats, today)
          const hasLog = !!state.logs[d]
          return (
            <button
              key={d}
              role="gridcell"
              aria-selected={d === selected}
              aria-label={dayAria(info, formatLong(d), hasLog)}
              className={`cal-day${d === today ? ' today' : ''}${d === selected ? ' sel' : ''}`}
              onClick={() => onSelect(d)}
            >
              <span className={numClass(info)}>{fromISO(d).getDate()}</span>
              <span className={`dot${hasLog ? '' : ' hidden'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
