import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import {
  clampCycle,
  clampPeriod,
  computeStats,
  endPeriod,
  startPeriod,
  togglePeriodDay,
  type CycleStats,
  type Profile,
} from '../lib/cycle'
import type { ISODate } from '../lib/dates'
import { EMPTY_STATE, loadState, normalize, saveState, type AppState, type DayLog, type Settings } from '../lib/storage'

export type Action =
  | { type: 'onboard'; profile: Profile; lastPeriodStart: ISODate | null }
  | { type: 'startPeriod'; date: ISODate }
  | { type: 'endPeriod'; date: ISODate }
  | { type: 'togglePeriodDay'; date: ISODate }
  | { type: 'setLog'; date: ISODate; log: DayLog }
  | { type: 'setProfile'; profile: Partial<Profile> }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'import'; state: AppState }
  | { type: 'reset' }

function isEmptyLog(log: DayLog): boolean {
  return (
    !log.flow &&
    !log.discharge &&
    !log.symptoms?.length &&
    !log.moods?.length &&
    !log.sex?.length &&
    !(log.note && log.note.trim())
  )
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'onboard': {
      const periods = action.lastPeriodStart ? startPeriod([], action.lastPeriodStart, action.profile.periodLength) : []
      return { ...state, onboarded: true, profile: action.profile, periods }
    }
    case 'startPeriod': {
      const stats = computeStats(state.periods, state.profile)
      return { ...state, periods: startPeriod(state.periods, action.date, stats.periodLength) }
    }
    case 'endPeriod':
      return { ...state, periods: endPeriod(state.periods, action.date) }
    case 'togglePeriodDay':
      return { ...state, periods: togglePeriodDay(state.periods, action.date) }
    case 'setLog': {
      const logs = { ...state.logs }
      if (isEmptyLog(action.log)) delete logs[action.date]
      else logs[action.date] = action.log
      return { ...state, logs }
    }
    case 'setProfile': {
      const p = { ...state.profile, ...action.profile }
      return {
        ...state,
        profile: { ...p, cycleLength: clampCycle(p.cycleLength), periodLength: clampPeriod(p.periodLength) },
      }
    }
    case 'setSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'import':
      return { ...normalize(action.state), onboarded: true }
    case 'reset':
      return EMPTY_STATE
  }
}

interface Store {
  state: AppState
  stats: CycleStats
  dispatch: (a: Action) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => saveState(state), [state])
  const stats = useMemo(() => computeStats(state.periods, state.profile), [state.periods, state.profile])
  const value = useMemo(() => ({ state, stats, dispatch }), [state, stats])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider eksik')
  return s
}
