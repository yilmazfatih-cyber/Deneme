/**
 * Yer gerçeği doğrulaması: lab'ın bulduklarını dünyanın GÖMÜLÜ gerçekleriyle karşılaştırır.
 * `npm run lab -- demo` sonunda ve testlerde çalışır. Gerçek veride karşılığı yoktur (gerçek bilinmez); amacı
 * yöntemin, gerçeğin bilindiği bir yerde doğru çalıştığını göstermektir.
 */
import { readFileSync } from 'node:fs'
import type { ChurnDeep } from '../../../shared/lab'
import { REASON_FAMILIES } from '../../../shared/lab'
import type { ChurnData } from '../churn/data'
import { BASELINE, type HazardModel } from '../churn/triggers'
import type { Lab } from '../core/lab'
import { createUidFn } from '../data/ingest'
import type { WorldCause, WorldTruth } from './world'

export interface WorldCheck {
  name: string
  ok: boolean
  detail: string
  /**
   * Zayıf etki: gömülü ama küçük; görülmesi örneklem büyüklüğüne bağlıdır. Bilgi içindir, geçti/kaldı sayımına girmez
   * (küçük veride görülememesi yöntemin hatası değil, gücün sınırıdır).
   */
  weak?: boolean
}

export interface WorldValidation {
  users: number
  /** Gerçekte bırakan ve lab'da bulunan kullanıcı */
  quitters: number
  /** Churn olayı çözümlenen (risk kümesine giren) bırakanlar */
  analyzed: number
  /** gerçek neden → bulunan aile ('taban' dahil) → sayı */
  confusion: Record<string, Record<string, number>>
  perCause: { cause: string; n: number; hit: number; recall: number }[]
  /** Doğrudan karşılığı olan nedenlerde toplam isabet */
  accuracy: number
  checks: WorldCheck[]
  passed: number
}

/** Dünyanın nedeni → lab'ın bulması beklenen aile(ler) */
const EXPECTED: Record<WorldCause, string[] | null> = {
  kalite: ['kalite'],
  kesif: ['kesif'],
  aliskanlik: ['aliskanlik'],
  fiyat: ['abonelik'],
  icerik: ['icerik', 'kesif'],
  baslangic: ['yasam', 'kesif'],
  dogal: ['taban', 'aliskanlik'],
  // Sezon sonu veride doğrudan görünen bir olay değildir; puanlanmaz
  sezon: null,
}

export function loadTruth(path: string): WorldTruth {
  return JSON.parse(readFileSync(path, 'utf8')) as WorldTruth
}

export function validateWorld(
  lab: Lab,
  truth: WorldTruth,
  d: ChurnData,
  deep: ChurnDeep,
  hazard: HazardModel | null,
  primaryOfUser: Int8Array,
): WorldValidation {
  const uidOf = createUidFn(lab.key)
  const index = new Map<string, number>()
  const hi = d.users.cols.uid_hi
  const lo = d.users.cols.uid_lo
  for (let u = 0; u < d.n; u++) index.set(`${hi[u]}:${lo[u]}`, u)
  const confusion: Record<string, Record<string, number>> = {}
  let quitters = 0
  let analyzed = 0
  for (const tu of truth.users) {
    if (!tu.cause) continue
    const id = uidOf(tu.id)
    const u = index.get(`${id.hi}:${id.lo}`)
    if (u === undefined) continue
    quitters++
    const p = primaryOfUser[u]
    if (p < 0) continue
    analyzed++
    const fam = p === BASELINE ? 'taban' : REASON_FAMILIES[p]
    const row = (confusion[tu.cause] ??= {})
    row[fam] = (row[fam] ?? 0) + 1
  }
  const perCause: WorldValidation['perCause'] = []
  let scored = 0
  let hits = 0
  for (const [cause, row] of Object.entries(confusion)) {
    const expected = EXPECTED[cause as WorldCause]
    const n = Object.values(row).reduce((a, b) => a + b, 0)
    if (!expected) continue
    const hit = expected.reduce((a, f) => a + (row[f] ?? 0), 0)
    perCause.push({ cause, n, hit, recall: n ? hit / n : 0 })
    scored += n
    hits += hit
  }
  perCause.sort((a, b) => b.n - a.n)

  const checks: WorldCheck[] = []
  const check = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail })
  }
  const n = deep.overview.definition.n
  check('Churn süresi veriden makul seçildi (21–45 gün)', n >= 21 && n <= 45, `seçilen ${n} gün`)
  const trig = new Map((deep.triggers?.rows ?? []).map((t) => [t.key, t]))
  const harmful: [string, string][] = [
    ['hata', 'oynatma hatası'],
    ['bos_gun', 'boş gün'],
    ['sonucsuz_arama', 'sonuçsuz arama'],
  ]
  for (const [key, label] of harmful) {
    const t = trig.get(key)
    check(
      `Gömülü tetikleyici bulundu: ${label}`,
      !!t && t.lo > 1,
      t ? `risk oranı ${t.rr.toFixed(2)} [${t.lo.toFixed(2)}, ${t.hi.toFixed(2)}]` : 'tabloda yok',
    )
  }
  // Takılma: dünyada etki "tek oynatmada 3+ takılma"dır; veride ancak "günde 3+ takılma" görülür (kısmen örtüşür) ve
  // etki küçüktür. Görülmesi örnekleme bağlıdır → zayıf etki olarak raporlanır.
  const buf = trig.get('takilma_3')
  checks.push({
    name: 'Zayıf gömülü etki: takılma',
    ok: !!buf && buf.lo > 1,
    weak: true,
    detail: buf
      ? `risk oranı ${buf.rr.toFixed(2)} [${buf.lo.toFixed(2)}, ${buf.hi.toFixed(2)}]` +
        (buf.lo > 1 ? ' — görüldü' : ' — bu büyüklükte veriyle ayırt edilemedi (daha büyük veriyle görülür)')
      : 'tabloda yok (yeterli gözlem yok)',
  })
  const notif = trig.get('bildirim')
  check(
    'Etkisi olmayan deneyime etki yakıştırılmadı: bildirim',
    !notif || (notif.lo <= 1 && notif.hi >= 1) || notif.pAdj >= 0.05,
    notif ? `risk oranı ${notif.rr.toFixed(2)} [${notif.lo.toFixed(2)}, ${notif.hi.toFixed(2)}]` : 'tabloda yok',
  )
  if (hazard) {
    const P = truth.params
    const coefOf = (name: string): number | null => {
      const k = hazard.columns.findIndex((c) => c.name === name)
      return k >= 0 ? hazard.coef[k + 1] : null
    }
    // Gömülü katsayılar (o günkü hayal kırıklığı payı dahil) — geniş hoşgörüyle
    const targets: [string, number][] = [
      ['bos_gun', P.bounceDay + 0.25 * P.discoveryFrustration],
      ['sonucsuz_arama', P.zeroSearch + 0.5 * P.discoveryFrustration],
      ['hata', P.errorFail + 0.8 * P.qualityFrustration],
    ]
    for (const [name, target] of targets) {
      const got = coefOf(name)
      check(
        `Risk modeli katsayısı gerçeğe yakın: ${name}`,
        // Göreli hoşgörü: nadir olaylarda ceza terimi ve bağlı sütunlar (ör. hata / hata_2) katsayıyı küçültür
        got !== null && got > 0 && Math.abs(got / target - 1) <= 0.5,
        got === null ? 'modelde yok' : `bulunan ${got.toFixed(2)}, gömülü ≈ ${target.toFixed(2)}`,
      )
    }
  }
  const dims = deep.segments?.dims ?? []
  const bug = dims.find((x) => x.dim === 'surum' && x.value === truth.bug.version)
  check(
    `Hatalı sürüm (${truth.bug.platform} ${truth.bug.version}) yüksek churn cebi olarak bulundu`,
    !!bug && bug.p < 0.05 && bug.lift >= 1.25,
    bug ? `churn genelin ${bug.lift.toFixed(2)} katı (p ${bug.p.toExponential(1)})` : 'tabloda yok',
  )
  const promo = dims.find((x) => x.dim === 'plan' && x.value === 'promo-3ay')
  check(
    'Promosyon planı yüksek churn olarak bulundu',
    !!promo && promo.lift > 1.1,
    promo ? `genelin ${promo.lift.toFixed(2)} katı` : 'tabloda yok',
  )
  const yearly = dims.find((x) => x.dim === 'plan' && x.value === 'yillik')
  check(
    'Yıllık plan düşük churn olarak bulundu',
    !!yearly && yearly.lift < 0.85,
    yearly ? `genelin ${yearly.lift.toFixed(2)} katı` : 'tabloda yok',
  )
  for (const dim of ['sehir', 'dil']) {
    const flagged = dims.filter((x) => x.dim === dim && x.p < 0.05)
    check(
      `Etkisi olmayan boyuta etki yakıştırılmadı: ${dim}`,
      flagged.length === 0,
      flagged.length
        ? flagged.map((x) => `${x.value} (p ${x.p.toExponential(1)})`).join(', ')
        : 'hiçbir değeri anlamlı değil',
    )
  }
  check(
    'Gömülü olmayan etkileşim (cep) uydurulmadı',
    (deep.segments?.pockets.length ?? 0) <= 1,
    `${deep.segments?.pockets.length ?? 0} cep`,
  )
  for (const cause of ['kalite', 'kesif'] as const) {
    const row = perCause.find((x) => x.cause === cause)
    check(
      `Neden atfı: gerçek nedeni "${cause}" olanların çoğu doğru aileye yazıldı`,
      !!row && row.recall >= 0.5,
      row ? `${row.hit}/${row.n} (%${(row.recall * 100).toFixed(0)})` : 'çözümlenen olay yok',
    )
  }
  return {
    users: truth.users.length,
    quitters,
    analyzed,
    confusion,
    perCause,
    accuracy: scored ? hits / scored : 0,
    checks,
    passed: checks.filter((c) => c.ok && !c.weak).length,
  }
}
