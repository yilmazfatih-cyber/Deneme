/**
 * Yeni kullanıcıların ilk günleri: hangi "anlar" tutunanları bırakanlardan ayırıyor?
 *
 *   kapsam   pencere içinde başlayan kullanıcılar (ilk etkin günü + pencere + n ≤ veri sonu)
 *   özellik  ilk `window` gün (varsayılan 7)
 *   etiket   ilk `window` günden sonraki n günde hiç etkinlik yok
 *
 * Buradaki oranlar katmansız karşılaştırmadır: "ilk 3 günde bir içerik bitirenler daha çok kalıyor" bulgusu, bitirmenin
 * tutunmaya NEDEN olduğunu göstermez (zaten hevesli olan bitirir). Ürün kararı için hipotez üretir; doğrulaması
 * deneyle yapılır (ör. ilk açılışta bitirilebilir kısa içerik önermek).
 */
import type { ChurnDefinition, EarlyLife } from '../../../shared/lab'
import { mantelHaenszelRR } from '../core/stats'
import { isActiveRow, type ChurnData, type Labels } from './data'
import { newUserMask } from './overview'

interface Moment {
  key: string
  label: string
}
const MOMENTS: readonly Moment[] = [
  { key: 'iki_gun', label: 'İlk 7 günde en az 2 ayrı gün izledi' },
  { key: 'uc_gun', label: 'İlk 7 günde en az 3 ayrı gün izledi' },
  { key: 'tamamladi_3', label: 'İlk 3 günde bir içerik bitirdi' },
  { key: 'saat_1', label: 'İlk 7 günde 1 saatten çok izledi' },
  { key: 'uc_baslik', label: 'İlk 7 günde 3+ farklı başlığa başladı' },
  { key: 'hata', label: 'İlk 7 günde oynatma hatası yaşadı' },
  { key: 'bos_oturum', label: 'İlk 7 günde boş oturumu oldu' },
  { key: 'sonucsuz_arama', label: 'İlk 7 günde sonuçsuz arama yaptı' },
  { key: 'liste', label: 'İlk 7 günde listesine içerik ekledi' },
  { key: 'tv', label: 'İlk 7 günde ağırlıkla TV kullandı' },
]

export function earlyLife(
  d: ChurnData,
  def: ChurnDefinition,
  labels: Labels,
  opts: { window?: number; minGroup?: number } = {},
): EarlyLife | null {
  const window = opts.window ?? 7
  const minGroup = opts.minGroup ?? 30
  const isNew = newUserMask(d, labels, def)
  const c = d.days.cols
  const M = MOMENTS.length
  // [an][var/yok][kaldı/gitti]
  const counts = new Float64Array(M * 4)
  let users = 0
  let churned = 0
  const flag = new Uint8Array(M)
  for (let u = 0; u < d.n; u++) {
    if (!isNew[u]) continue
    const f = labels.first[u]
    if (f + window + def.n > d.dayMax + 1) continue
    let activeDays = 0
    let done3 = 0
    let watch = 0
    let newTitles = 0
    let errors = 0
    let bounces = 0
    let fails = 0
    let lists = 0
    let tvDays = 0
    let appDays = 0
    let later = false
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      const day = d.dDay[r]
      if (day < f) continue
      if (day >= f + window) {
        if (day < f + window + def.n && isActiveRow(d, r, def.activity)) later = true
        if (day >= f + window + def.n || later) break
        continue
      }
      if (isActiveRow(d, r, def.activity)) activeDays++
      if (day - f <= 2 && c.completions[r] > 0) done3 = 1
      watch += c.watch_sec[r]
      newTitles += c.new_titles[r]
      errors += c.errors[r]
      bounces += c.bounces[r]
      fails += c.search_fails[r]
      lists += c.list_adds[r]
      if (c.sessions[r] > 0) {
        appDays++
        if (c.device[r] === 1) tvDays++
      }
    }
    users++
    const gone = later ? 0 : 1
    churned += gone
    flag[0] = activeDays >= 2 ? 1 : 0
    flag[1] = activeDays >= 3 ? 1 : 0
    flag[2] = done3
    flag[3] = watch >= 3600 ? 1 : 0
    flag[4] = newTitles >= 3 ? 1 : 0
    flag[5] = errors >= 1 ? 1 : 0
    flag[6] = bounces >= 1 ? 1 : 0
    flag[7] = fails >= 1 ? 1 : 0
    flag[8] = lists >= 1 ? 1 : 0
    flag[9] = appDays > 0 && tvDays >= appDays / 2 ? 1 : 0
    for (let m = 0; m < M; m++) counts[m * 4 + (flag[m] ? 0 : 2) + gone]++
  }
  if (users < Math.max(100, minGroup * 4)) return null
  const moments: EarlyLife['moments'] = []
  for (let m = 0; m < M; m++) {
    const withN = counts[m * 4] + counts[m * 4 + 1]
    const withoutN = counts[m * 4 + 2] + counts[m * 4 + 3]
    if (withN < minGroup || withoutN < minGroup) continue
    const mh = mantelHaenszelRR([{ a: counts[m * 4 + 1], n1: withN, c: counts[m * 4 + 3], n0: withoutN }])
    if (!Number.isFinite(mh.rr)) continue
    moments.push({
      key: MOMENTS[m].key,
      label: MOMENTS[m].label,
      share: withN / users,
      rateWith: counts[m * 4 + 1] / withN,
      rateWithout: counts[m * 4 + 3] / withoutN,
      rr: mh.rr,
      lo: mh.lo,
      hi: mh.hi,
    })
  }
  moments.sort((a, b) => Math.abs(Math.log(b.rr)) - Math.abs(Math.log(a.rr)))
  return { users, window, churnRate: churned / users, moments }
}
