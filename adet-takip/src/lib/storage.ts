import type { Period, Profile } from './cycle'
import { DEFAULT_PROFILE } from './cycle'
import type { ISODate } from './dates'

export interface DayLog {
  flow?: string
  symptoms?: string[]
  moods?: string[]
  discharge?: string
  sex?: string[]
  note?: string
}

export interface Settings {
  /** Adet yaklaşınca hatırlatma göster (uygulama açıkken). */
  periodReminder: boolean
  /** Her gün kayıt hatırlatması. */
  logReminder: boolean
}

export interface AppState {
  version: 1
  onboarded: boolean
  profile: Profile
  periods: Period[]
  logs: Record<ISODate, DayLog>
  settings: Settings
}

export const STORAGE_KEY = 'dongu.v1'

export const EMPTY_STATE: AppState = {
  version: 1,
  onboarded: false,
  profile: DEFAULT_PROFILE,
  periods: [],
  logs: {},
  settings: { periodReminder: true, logReminder: false },
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    return normalize(JSON.parse(raw))
  } catch {
    return EMPTY_STATE
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Depolama kapalıysa (gizli sekme vb.) sessizce geç; uygulama bellekte çalışmaya devam eder.
  }
}

/** Dışarıdan gelen (yedek dosyası, eski sürüm) veriyi güvenli biçime getirir. */
export function normalize(input: unknown): AppState {
  const o = (input && typeof input === 'object' ? input : {}) as Partial<AppState>
  const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const periods: Period[] = Array.isArray(o.periods)
    ? o.periods
        .filter((p): p is Period => !!p && isDate(p.start) && isDate(p.end) && p.start <= p.end)
        .map((p) => ({
          id: typeof p.id === 'string' ? p.id : Math.random().toString(36).slice(2, 10),
          start: p.start,
          end: p.end,
          endConfirmed: p.endConfirmed !== false,
        }))
    : []
  const logs: Record<ISODate, DayLog> = {}
  if (o.logs && typeof o.logs === 'object') {
    for (const [k, v] of Object.entries(o.logs)) if (isDate(k) && v && typeof v === 'object') logs[k] = v as DayLog
  }
  const p = o.profile ?? DEFAULT_PROFILE
  return {
    version: 1,
    onboarded: !!o.onboarded,
    profile: {
      cycleLength: Number.isFinite(p.cycleLength) ? p.cycleLength : DEFAULT_PROFILE.cycleLength,
      periodLength: Number.isFinite(p.periodLength) ? p.periodLength : DEFAULT_PROFILE.periodLength,
      manualLengths: !!p.manualLengths,
    },
    periods,
    logs,
    settings: { ...EMPTY_STATE.settings, ...(o.settings ?? {}) },
  }
}

export function exportJSON(state: AppState): string {
  return JSON.stringify({ app: 'dongu', exportedAt: new Date().toISOString(), ...state }, null, 2)
}
