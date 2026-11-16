/**
 * Deney ölçümleri: kullanıcı düzeyi ham sütunlar ve bunlardan kurulan ölçü sözlüğü. Aynı sözlük simülasyon
 * evrenleri ve gerçek deney verisi için kullanılır; `content/experiments.json` içindeki `primaryMetric` ve
 * `guardrails` anahtarları buradaki anahtarlardır.
 */
import type { ChurnData } from '../churn/data'
import type { UniverseResult } from '../sim/engine'

/** Kullanıcı başına ham sütunlar (hepsi aynı uzunlukta) */
export interface UnitTable {
  n: number
  cols: Record<string, Float64Array>
}

export interface MetricDef {
  key: string
  label: string
  unit: 'sayı' | 'oran' | 'dk'
  higherIsBetter: boolean
  /** ortalama: kullanıcı başına değer · ikili: 0/1 · bolum: toplamların oranı (pay / payda) */
  kind: 'ortalama' | 'ikili' | 'bolum'
  col: string
  den?: string
}

export const METRICS: readonly MetricDef[] = [
  {
    key: 'izleme_dk',
    label: 'Kullanıcı başına izleme (dk)',
    unit: 'dk',
    higherIsBetter: true,
    kind: 'ortalama',
    col: 'watchMin',
  },
  {
    key: 'oynatma',
    label: 'Kullanıcı başına oynatma',
    unit: 'sayı',
    higherIsBetter: true,
    kind: 'ortalama',
    col: 'plays',
  },
  {
    key: 'uygulama_gunu',
    label: 'Kullanıcı başına uygulama günü',
    unit: 'sayı',
    higherIsBetter: true,
    kind: 'ortalama',
    col: 'appDays',
  },
  {
    key: 'tamamlama',
    label: 'Kullanıcı başına tamamlanan içerik',
    unit: 'sayı',
    higherIsBetter: true,
    kind: 'ortalama',
    col: 'completions',
  },
  {
    key: 'yeni_baslik',
    label: 'Kullanıcı başına yeni başlık',
    unit: 'sayı',
    higherIsBetter: true,
    kind: 'ortalama',
    col: 'newTitles',
  },
  {
    key: 'bos_oturum',
    label: 'Boş (oynatmasız) oturum payı',
    unit: 'oran',
    higherIsBetter: false,
    kind: 'bolum',
    col: 'bounceSessions',
    den: 'sessions',
  },
  {
    key: 'bos_gun',
    label: 'Hiç izlenmeden biten gün payı',
    unit: 'oran',
    higherIsBetter: false,
    kind: 'bolum',
    col: 'bounceDays',
    den: 'appDays',
  },
  {
    key: 'hata_orani',
    label: 'Oynatma denemesi başına hata',
    unit: 'oran',
    higherIsBetter: false,
    kind: 'bolum',
    col: 'errors',
    den: 'attempts',
  },
  { key: 'churn', label: 'Dönem içinde gidenler', unit: 'oran', higherIsBetter: false, kind: 'ikili', col: 'gone' },
  {
    key: 'son_hafta',
    label: 'Son 7 günde etkin olanlar',
    unit: 'oran',
    higherIsBetter: true,
    kind: 'ikili',
    col: 'lastWeek',
  },
]

export const metricByKey = (key: string): MetricDef | undefined => METRICS.find((m) => m.key === key)

/**
 * Simülasyon evreninden kullanıcı tablosu.
 * `gone`: ikiz ufuk içinde bırakma kararı verdi. Bu, simülatörün gizli durumudur; gerçek veride ancak churn süresi
 * kadar sessizlikten sonra görülür. Gözlenen tanım ("son N günde yok") kısa ufuklarda hiçbir şey ölçemeyeceği için
 * burada kullanılmaz. Başlangıçta çoktan gitmiş sayılan ikizler (quitDay = −2) her evrende aynıdır; sayılmazlar.
 */
export function unitsFromUniverse(r: UniverseResult): UnitTable {
  const N = r.n
  const f = (a: ArrayLike<number>): Float64Array => Float64Array.from(a)
  const gone = new Float64Array(N)
  const lastWeek = new Float64Array(N)
  const attempts = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    gone[i] = r.quitDay[i] >= 0 ? 1 : 0
    lastWeek[i] = r.lastAppDay[i] >= r.days - 7 ? 1 : 0
    attempts[i] = r.plays[i] + r.errors[i]
  }
  return {
    n: N,
    cols: {
      watchMin: f(r.watchMin),
      plays: f(r.plays),
      appDays: f(r.appDays),
      sessions: f(r.sessions),
      completions: f(r.completions),
      newTitles: f(r.newTitles),
      bounceSessions: f(r.bounceSessions),
      bounceDays: f(r.bounceDays),
      errors: f(r.errors),
      attempts,
      gone,
      lastWeek,
    },
  }
}

/**
 * Gerçek veriden kullanıcı tablosu: her kullanıcının [from[i], from[i] + window) aralığındaki davranışı.
 * `gone`: aralığın son `n` gününde (n > window ise tüm aralıkta) hiç gelmedi · `lastWeek`: son 7 günde geldi.
 */
export function unitsFromReal(
  d: ChurnData,
  users: ArrayLike<number>,
  from: ArrayLike<number>,
  window: number,
  n: number,
): UnitTable {
  const N = users.length
  const c = d.days.cols
  const mk = (): Float64Array => new Float64Array(N)
  const cols = {
    watchMin: mk(),
    plays: mk(),
    appDays: mk(),
    sessions: mk(),
    completions: mk(),
    newTitles: mk(),
    bounceSessions: mk(),
    bounceDays: mk(),
    errors: mk(),
    attempts: mk(),
    gone: mk(),
    lastWeek: mk(),
  }
  const tail = Math.min(n, window)
  for (let i = 0; i < N; i++) {
    const u = users[i]
    const a = from[i]
    let last = -1
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day < a) continue
      if (day >= a + window) break
      if (d.dSessions[r] === 0) continue
      last = day
      cols.appDays[i]++
      cols.sessions[i] += c.sessions[r]
      cols.plays[i] += c.plays[r]
      cols.watchMin[i] += c.watch_sec[r] / 60
      cols.completions[i] += c.completions[r]
      cols.newTitles[i] += c.new_titles[r]
      cols.bounceSessions[i] += c.bounces[r]
      if (c.plays[r] === 0) cols.bounceDays[i]++
      cols.errors[i] += c.errors[r]
    }
    cols.attempts[i] = cols.plays[i] + cols.errors[i]
    cols.gone[i] = last < a + window - tail ? 1 : 0
    cols.lastWeek[i] = last >= a + window - 7 ? 1 : 0
  }
  return { n: N, cols }
}
