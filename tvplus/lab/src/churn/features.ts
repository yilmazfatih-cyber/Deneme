/**
 * Anlık görüntü çerçevesi: "T gününde hâlâ etkin olan kullanıcı, sonraki n günde gidecek mi?"
 *
 *   uygunluk  T'den önceki n gün içinde en az bir etkin günü olanlar (zaten gitmiş olanlar çerçeveye girmez)
 *   özellik   yalnız [T − lookback, T) aralığından (gelecekten sızıntı yok)
 *   etiket    [T, T + n) aralığında hiç etkinlik yoksa 1
 *
 * Birden çok T kullanılır (aralarında n gün: etiket pencereleri çakışmaz). En yeni T sınama kümesidir; model geçmiş
 * anlık görüntülerle eğitilir ve gelecektekiyle sınanır — gerçekte kullanılacağı gibi.
 */
import type { ChurnDefinition, ReasonFamily } from '../../../shared/lab'
import { DEVICE_CLASSES } from '../data/events'
import { SUB_CANCEL, SUB_EXPIRE, SUB_PAYMENT_FAIL } from '../data/build'
import { isActiveRow, type ChurnData } from './data'

export interface FeatureSpec {
  key: string
  label: string
  family: ReasonFamily
  /** Modelde dönüşüm: 'log' → log1p (çarpık sayımlar), 'flag' → 0/1, 'none' */
  transform: 'log' | 'flag' | 'none'
}

export const FEATURES: readonly FeatureSpec[] = [
  { key: 'gun_son', label: 'Son etkinlikten beri gün', family: 'aliskanlik', transform: 'log' },
  { key: 'aktif_gun_7', label: 'Son 7 günde etkin gün', family: 'aliskanlik', transform: 'none' },
  { key: 'aktif_gun_28', label: 'Son 28 günde etkin gün', family: 'aliskanlik', transform: 'none' },
  { key: 'oturum_28', label: 'Son 28 günde oturum', family: 'aliskanlik', transform: 'log' },
  { key: 'egilim', label: 'Etkinlik eğilimi (son 14 − önceki 14 gün)', family: 'aliskanlik', transform: 'none' },
  { key: 'izleme_dk_28', label: 'Son 28 günde izleme (dk)', family: 'aliskanlik', transform: 'log' },
  { key: 'izleme_dk_7', label: 'Son 7 günde izleme (dk)', family: 'aliskanlik', transform: 'log' },
  { key: 'dk_gun', label: 'Etkin gün başına izleme (dk)', family: 'aliskanlik', transform: 'log' },
  { key: 'tamamlama', label: 'Tamamlama oranı', family: 'icerik', transform: 'none' },
  { key: 'yeni_baslik_28', label: 'Son 28 günde başlanan yeni başlık', family: 'icerik', transform: 'log' },
  { key: 'yeni_baslik_7', label: 'Son 7 günde başlanan yeni başlık', family: 'icerik', transform: 'log' },
  { key: 'ana_pay', label: 'Tek başlığın izlemedeki payı', family: 'icerik', transform: 'none' },
  { key: 'dizi_bitti', label: 'Son 14 günde bir dizi bitirdi', family: 'icerik', transform: 'flag' },
  { key: 'canli_pay', label: 'Canlı yayının izlemedeki payı', family: 'icerik', transform: 'none' },
  { key: 'liste_28', label: 'Son 28 günde listeye ekleme', family: 'icerik', transform: 'log' },
  { key: 'bos_oturum', label: 'Boş (oynatmasız) oturum oranı', family: 'kesif', transform: 'none' },
  { key: 'bos_gun_7', label: 'Son 7 günde hiç oynatmasız gün', family: 'kesif', transform: 'none' },
  { key: 'sonucsuz_arama', label: 'Son 28 günde sonuçsuz arama', family: 'kesif', transform: 'log' },
  { key: 'arama_28', label: 'Son 28 günde arama', family: 'kesif', transform: 'log' },
  { key: 'ilk_oynatma_sn', label: 'Oturumda ilk oynatmaya kadar süre (sn)', family: 'kesif', transform: 'log' },
  { key: 'hata_oynatma', label: 'Oynatma başına hata', family: 'kalite', transform: 'none' },
  { key: 'hata_7', label: 'Son 7 günde oynatma hatası', family: 'kalite', transform: 'log' },
  { key: 'takilma_saat', label: 'İzleme saati başına takılma', family: 'kalite', transform: 'log' },
  { key: 'takilma_sn_saat', label: 'İzleme saati başına takılma süresi (sn)', family: 'kalite', transform: 'log' },
  { key: 'odeme_hata', label: 'Son 28 günde ödeme hatası', family: 'abonelik', transform: 'flag' },
  { key: 'iptal', label: 'Son 28 günde iptal / abonelik sonu olayı', family: 'abonelik', transform: 'flag' },
  { key: 'kidem_gun', label: 'Kıdem (ilk görüldüğünden beri gün)', family: 'yasam', transform: 'log' },
  { key: 'yeni', label: 'Yeni kullanıcı (kıdem ≤ 14 gün)', family: 'yasam', transform: 'flag' },
  { key: 'hafta_sonu_pay', label: 'Hafta sonunun izlemedeki payı', family: 'baglam', transform: 'none' },
  { key: 'prime_pay', label: 'Akşam saatlerinin (19–24) izlemedeki payı', family: 'baglam', transform: 'none' },
  { key: 'cok_cihaz', label: 'Birden çok cihaz türü kullanıyor', family: 'baglam', transform: 'flag' },
  { key: 'bildirim_28', label: 'Son 28 günde açılan bildirim', family: 'baglam', transform: 'log' },
]

export const FEATURE_INDEX: Record<string, number> = Object.fromEntries(FEATURES.map((f, i) => [f.key, i]))

export interface CategoricalFeature {
  key: string
  label: string
  family: ReasonFamily
  codes: Uint16Array
  dict: string[]
}

export interface FeatureFrame {
  rows: number
  /** Sayısal özellikler: satır öncelikli rows × FEATURES.length */
  X: Float32Array
  y: Uint8Array
  /** Satırın kullanıcı dizini ve anlık görüntü günü */
  uid: Uint32Array
  snap: Int32Array
  cats: CategoricalFeature[]
  /** Kullanılan anlık görüntü günleri (eskiden yeniye) */
  snapshots: number[]
  lookback: number
}

/** Boyut adından neden ailesi: plan / paket / fiyat benzeri boyutlar aboneliğe, kalanı bağlama yazılır. */
export function familyOfDim(name: string): ReasonFamily {
  return /plan|paket|abone|fiyat|ucret|tarife/.test(name) ? 'abonelik' : 'baglam'
}

/** Anlık görüntü günleri: en yenisi pencere sonundan n gün önce; geriye doğru n gün arayla; tam özellik penceresi şart. */
export function snapshotDays(d: ChurnData, n: number, lookback: number, max = 6): number[] {
  const out: number[] = []
  for (let t = d.dayMax + 1 - n; t - lookback >= d.dayMin && out.length < max; t -= n) out.push(t)
  // Pencere kısa ise: özellik penceresi kısaltılmış tek anlık görüntü
  if (!out.length && d.dayMax + 1 - n - 7 >= d.dayMin) out.push(d.dayMax + 1 - n)
  return out.reverse()
}

export function buildFrame(
  d: ChurnData,
  def: ChurnDefinition,
  opts: { lookback?: number; snapshots?: number[] } = {},
): FeatureFrame {
  const lookback = opts.lookback ?? 28
  const n = def.n
  const snaps = opts.snapshots ?? snapshotDays(d, n, lookback)
  const P = FEATURES.length
  const days = d.days.cols
  const firstDay = d.users.cols.first_day as Int32Array
  const nDims = d.tuples.dimNames.length
  let cap = 1024
  let X = new Float32Array(cap * P)
  let y = new Uint8Array(cap)
  let uid = new Uint32Array(cap)
  let snap = new Int32Array(cap)
  let device = new Uint16Array(cap)
  let dimCodes: Uint16Array[] = []
  for (let k = 0; k < nDims; k++) dimCodes.push(new Uint16Array(cap))
  let rows = 0
  const grow = (): void => {
    cap *= 2
    const nx = new Float32Array(cap * P)
    nx.set(X)
    X = nx
    const ny = new Uint8Array(cap)
    ny.set(y)
    y = ny
    const nu = new Uint32Array(cap)
    nu.set(uid)
    uid = nu
    const ns = new Int32Array(cap)
    ns.set(snap)
    snap = ns
    const nd = new Uint16Array(cap)
    nd.set(device)
    device = nd
    dimCodes = dimCodes.map((c) => {
      const nc = new Uint16Array(cap)
      nc.set(c)
      return nc
    })
  }
  const F = FEATURE_INDEX
  const titleSec = new Map<number, number>()
  const devCount = new Float64Array(DEVICE_CLASSES.length)

  for (const T of snaps) {
    const from = T - lookback
    for (let u = 0; u < d.n; u++) {
      const r0 = d.dayFrom[u]
      const r1 = d.dayTo[u]
      if (r0 === r1) continue
      // Uygunluk ve etiket
      let alive = false
      let future = false
      for (let r = r0; r < r1; r++) {
        if (!isActiveRow(d, r, def.activity)) continue
        const day = d.dDay[r]
        if (day >= T - n && day < T) alive = true
        else if (day >= T && day < T + n) {
          future = true
          break
        }
      }
      if (!alive) continue

      let act28 = 0
      let act7 = 0
      let act14a = 0
      let act14b = 0
      let sess = 0
      let watch = 0
      let watch7 = 0
      let plays = 0
      let completions = 0
      let newTitles = 0
      let newTitles7 = 0
      let live = 0
      let prime = 0
      let weekend = 0
      let errors = 0
      let errors7 = 0
      let buffers = 0
      let bufSec = 0
      let searches = 0
      let fails = 0
      let bounces = 0
      let bounceDays7 = 0
      let listAdds = 0
      let notif = 0
      let finished14 = 0
      let payFail = 0
      let cancel = 0
      let recency = lookback
      let delaySum = 0
      let delayN = 0
      // Boyutlar ve yedek cihaz: T'den önceki SON uygulama gününden (özellik penceresinin dışında kalsa bile)
      let lastTuple = 0
      let lastDevice = 0
      titleSec.clear()
      devCount.fill(0)
      for (let r = r0; r < r1; r++) {
        const day = d.dDay[r]
        if (day >= T) break
        if (days.sessions[r] > 0) {
          lastTuple = days.tuple[r]
          lastDevice = days.device[r]
        }
        if (day < from) continue
        const age = T - 1 - day
        const active = isActiveRow(d, r, def.activity)
        if (active) {
          act28++
          if (age < 7) act7++
          if (age < 14) act14a++
          else act14b++
          if (age < recency) recency = age
        }
        const s = days.sessions[r]
        sess += s
        const w = days.watch_sec[r]
        watch += w
        if (age < 7) watch7 += w
        plays += days.plays[r]
        completions += days.completions[r]
        newTitles += days.new_titles[r]
        if (age < 7) newTitles7 += days.new_titles[r]
        live += days.live_sec[r]
        prime += days.prime_sec[r]
        // 1970-01-01 Perşembe: (gün + 3) mod 7 → 0 = Pazartesi
        const dow = (((day + 3) % 7) + 7) % 7
        if (dow >= 5) weekend += w
        errors += days.errors[r]
        if (age < 7) errors7 += days.errors[r]
        buffers += days.buffers[r]
        bufSec += days.buffer_sec[r]
        searches += days.searches[r]
        fails += days.search_fails[r]
        bounces += days.bounces[r]
        if (age < 7 && s > 0 && days.plays[r] === 0) bounceDays7++
        listAdds += days.list_adds[r]
        notif += days.notif_opens[r]
        if (age < 14 && days.series_finished[r] > 0) finished14 = 1
        const sub = days.sub[r]
        if (sub & SUB_PAYMENT_FAIL) payFail = 1
        if (sub & (SUB_CANCEL | SUB_EXPIRE)) cancel = 1
        const fd = days.first_delay[r]
        if (fd >= 0) {
          delaySum += fd
          delayN++
        }
        const mt = days.main_tid[r]
        if (mt > 0) titleSec.set(mt, (titleSec.get(mt) ?? 0) + days.main_sec[r])
        if (s > 0) devCount[days.device[r]]++
      }
      if (rows === cap) grow()
      const o = rows * P
      const tenure = Math.max(0, T - firstDay[u])
      let top = 0
      for (const sec of titleSec.values()) if (sec > top) top = sec
      let devMain = 0
      let devKinds = 0
      for (let k = 1; k < devCount.length; k++) {
        if (devCount[k] > 0) devKinds++
        if (devCount[k] > devCount[devMain] || (devMain === 0 && devCount[k] > 0)) devMain = k
      }
      if (devMain === 0) devMain = lastDevice
      const hours = watch / 3600
      X[o + F.gun_son] = recency
      X[o + F.aktif_gun_7] = act7
      X[o + F.aktif_gun_28] = act28
      X[o + F.oturum_28] = sess
      X[o + F.egilim] = act14a - act14b
      X[o + F.izleme_dk_28] = watch / 60
      X[o + F.izleme_dk_7] = watch7 / 60
      X[o + F.dk_gun] = act28 > 0 ? watch / 60 / act28 : 0
      X[o + F.tamamlama] = plays > 0 ? Math.min(1, completions / plays) : 0
      X[o + F.yeni_baslik_28] = newTitles
      X[o + F.yeni_baslik_7] = newTitles7
      X[o + F.ana_pay] = watch > 0 ? Math.min(1, top / watch) : 0
      X[o + F.dizi_bitti] = finished14
      X[o + F.canli_pay] = watch > 0 ? Math.min(1, live / watch) : 0
      X[o + F.liste_28] = listAdds
      X[o + F.bos_oturum] = sess > 0 ? Math.min(1, bounces / sess) : 0
      X[o + F.bos_gun_7] = bounceDays7
      X[o + F.sonucsuz_arama] = fails
      X[o + F.arama_28] = searches
      X[o + F.ilk_oynatma_sn] = delayN > 0 ? delaySum / delayN : 0
      X[o + F.hata_oynatma] = plays + errors > 0 ? errors / (plays + errors) : 0
      X[o + F.hata_7] = errors7
      X[o + F.takilma_saat] = hours > 0.05 ? buffers / hours : 0
      X[o + F.takilma_sn_saat] = hours > 0.05 ? bufSec / hours : 0
      X[o + F.odeme_hata] = payFail
      X[o + F.iptal] = cancel
      X[o + F.kidem_gun] = tenure
      X[o + F.yeni] = tenure <= 14 ? 1 : 0
      X[o + F.hafta_sonu_pay] = watch > 0 ? Math.min(1, weekend / watch) : 0
      X[o + F.prime_pay] = watch > 0 ? Math.min(1, prime / watch) : 0
      X[o + F.cok_cihaz] = devKinds >= 2 ? 1 : 0
      X[o + F.bildirim_28] = notif
      y[rows] = future ? 0 : 1
      uid[rows] = u
      snap[rows] = T
      device[rows] = devMain
      const tuple = d.tuples.tuples[lastTuple]
      for (let k = 0; k < nDims; k++) dimCodes[k][rows] = tuple ? (tuple[k] ?? 0) : 0
      rows++
    }
  }
  const cats: CategoricalFeature[] = []
  for (let k = 0; k < nDims; k++) {
    const name = d.tuples.dimNames[k]
    // 'cihaz' boyutu olay düzeyi cihaz sınıfıdır; pencere içindeki baskın cihaz daha kararlıdır
    if (name === 'cihaz')
      cats.push({
        key: 'cihaz',
        label: 'Ana cihaz',
        family: 'baglam',
        codes: device.slice(0, rows),
        dict: [...DEVICE_CLASSES],
      })
    else
      cats.push({
        key: name,
        label: name,
        family: familyOfDim(name),
        codes: dimCodes[k].slice(0, rows),
        dict: d.tuples.dimValues[k],
      })
  }
  if (!cats.some((c) => c.key === 'cihaz'))
    cats.unshift({
      key: 'cihaz',
      label: 'Ana cihaz',
      family: 'baglam',
      codes: device.slice(0, rows),
      dict: [...DEVICE_CLASSES],
    })
  return {
    rows,
    X: X.slice(0, rows * P),
    y: y.slice(0, rows),
    uid: uid.slice(0, rows),
    snap: snap.slice(0, rows),
    cats,
    snapshots: snaps,
    lookback,
  }
}
