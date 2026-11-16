/**
 * Derin churn analizi: tanım → genel görünüm → etkenler ve model → nedenler → tetikleyiciler → kim gidiyor →
 * yeni kullanıcılar. Tek çağrıda hepsini çalıştırır, sonucu `sonuc/churn.json` olarak yazar ve en önemli bulguları
 * kanıt sayılarıyla sıralar. Ajan ya da insan önce bulgulara bakar, gerekirse bölümlere iner.
 */
import type { ChurnDeep, Finding, ReasonFamily } from '../../../shared/lab'
import { REASON_LABEL } from '../../../shared/lab'
import { ci, ek, pct, times } from '../core/format'
import { saveResult, type Lab } from '../core/lab'
import { loadChurnData, labelUsers, statusOf, type Activity, type ChurnData } from './data'
import { chooseDefinition } from './definition'
import { earlyLife } from './early'
import { buildFrame } from './features'
import { fitChurnModel } from './model'
import { overview } from './overview'
import { scanSegments } from './segments'
import { analyzeTriggers, type HazardModel } from './triggers'

export interface DeepOptions {
  /** Churn süresi (gün); verilmezse veriden seçilir */
  n?: number
  activity?: Activity
  /** Ağaç modeli çalışsın mı (varsayılan evet) */
  gbdt?: boolean
  lookback?: number
  /** Önceden yüklenmiş veri (testler) */
  data?: ChurnData
}

export const CAVEATS: readonly string[] = [
  'Etken ve neden tabloları ilişkiseldir: bir özelliğin churn ile birlikte görülmesi onu neden yapmaz.',
  'Tetikleyici risk oranları benzer kullanıcılar arasında karşılaştırılır (kıdem × önceki etkinlik × cihaz) ama gözlemseldir; kesin nedensellik deneyle ölçülür.',
  '"Giderilirse" sütunu modele dayalı bir üst sınırdır; gerçek kazanım çoğunlukla daha küçüktür.',
  'Pencerenin son n günü etiketlenemez (kullanıcının geri dönüp dönmeyeceği henüz bilinmiyor); o günler analize girmez.',
]

export function runDeep(
  lab: Lab,
  opts: DeepOptions = {},
): { result: ChurnDeep; hazard: HazardModel | null; primaryOfUser: Int8Array } {
  const d = opts.data ?? loadChurnData(lab)
  const k = lab.settings.kAnonim
  const def = chooseDefinition(d, { n: opts.n, activity: opts.activity })
  const labels = labelUsers(d, def.n, def.activity)
  const ov = overview(d, def, labels)
  const frame = buildFrame(d, def, { lookback: opts.lookback })
  let pos = 0
  for (let i = 0; i < frame.rows; i++) pos += frame.y[i]
  const enough = frame.rows >= 300 && pos >= 40 && frame.rows - pos >= 40
  const fitted = enough ? fitChurnModel(frame, { minBin: k, gbdt: opts.gbdt }) : null
  const trig = analyzeTriggers(d, def, { minExposed: Math.max(30, k) })
  const segments = enough ? scanSegments(frame, fitted, { minBin: k }) : null
  const early = earlyLife(d, def, labels, { minGroup: Math.max(30, k) })

  const result: ChurnDeep = {
    status: statusOf(d.meta),
    overview: ov,
    model: fitted?.result ?? null,
    reasons: trig.reasons,
    triggers: trig.triggers.rows.length ? trig.triggers : null,
    segments,
    early,
    findings: [],
    caveats: [...CAVEATS],
  }
  result.findings = findingsOf(result)
  saveResult(lab, 'churn', result, { dataRev: d.meta.dataRev, params: { n: def.n, activity: def.activity } })
  if (trig.hazard) saveResult(lab, 'churn-risk', trig.hazard, { dataRev: d.meta.dataRev, params: { n: def.n } })
  return { result, hazard: trig.hazard, primaryOfUser: trig.primaryOfUser }
}

/** Bulgular: her bölümün en güçlü sonucu, kanıt sayısıyla; önem sırasına dizilir. */
export function findingsOf(r: ChurnDeep): Finding[] {
  const out: Finding[] = []
  const add = (f: Omit<Finding, 'id'>): void => {
    out.push({ id: `b${out.length + 1}`, ...f })
  }
  const ov = r.overview
  const lastPeriod = ov.periods[ov.periods.length - 1]
  if (lastPeriod)
    add({
      severity: 3,
      family: null,
      title: `Her ${ov.definition.n} günde etkin kullanıcıların ${ek(pct(lastPeriod.rate), 'i')} gidiyor`,
      evidence: `${lastPeriod.from}…${lastPeriod.to} döneminde etkin ${lastPeriod.base} kullanıcının ${ek(String(lastPeriod.churned), 'i')} sonraki ${ov.definition.n} günde hiç izlemedi.`,
      next: 'churn genel',
    })
  const s30 = ov.survival.find((p) => p.day === 30) ?? ov.survival[ov.survival.length - 1]
  if (s30 && ov.newUsers >= 50)
    add({
      severity: 2,
      family: 'yasam',
      title: `Yeni kullanıcıların ${ek(pct(1 - s30.s), 'i')} ilk ${s30.day} günde bırakıyor`,
      evidence: `${ov.newUsers} yeni kullanıcıda ${s30.day}. gün tutunma ${pct(s30.s)} ${ci(s30.lo, s30.hi, pct)}${ov.medianLifetime ? `; yarısı ${Math.round(ov.medianLifetime)} günde gidiyor` : ''}.`,
      next: 'churn yeni',
    })
  if (r.reasons) {
    for (const row of r.reasons.rows.filter((x) => x.fraction >= 0.05).slice(0, 4)) {
      const sig = row.signals[0]
      add({
        severity: row.fraction >= 0.15 ? 3 : 2,
        family: row.family,
        title: `Churn'ün ${ek(pct(row.fraction), 'i')} ${row.label.toLocaleLowerCase('tr-TR')} kaynaklı görünüyor`,
        evidence:
          `Churn olaylarının ${ek(pct(row.share), 'de')} (${Math.round(row.churners)}) birincil neden; bu ailenin zararlı etkileri olmasaydı churn en çok ${pct(row.avoidableShare)} azalırdı.` +
          (sig
            ? ` En sık işaret: "${sig.label}" (bu gidenlerin ${ek(pct(sig.share), 'de')}, tüm günlerin ${ek(pct(sig.overall), 'de')}).`
            : ''),
        next: 'churn neden',
      })
    }
    add({
      severity: 1,
      family: null,
      title: `Churn'ün ${ek(pct(r.reasons.baselineFraction), 'i')} özel bir işarete bağlanamıyor (taban risk)`,
      evidence: `Churn olaylarının ${ek(pct(r.reasons.baselineShare), 'de')} son günlerde ölçülen hiçbir zararlı deneyim ya da durum baskın değil.`,
      next: 'churn neden',
    })
  }
  if (r.triggers) {
    const harmful = r.triggers.rows.filter((t) => t.pAdj < 0.05 && t.lo > 1.1).slice(0, 4)
    for (const t of harmful)
      add({
        severity: t.rr >= 2 || t.attributableShare >= 0.05 ? 3 : 2,
        family: t.family,
        title: `"${t.label}" olan gün, son gün olma riskini ${times(t.rr)} artırıyor`,
        evidence: `Benzer kullanıcılarla karşılaştırma: ${times(t.rr)} ${ci(t.lo, t.hi, times)}; günlerin ${ek(pct(t.prevalence), 'de')} yaşanıyor, son günlerin ${ek(pct(t.attributableShare), 'i')} buna atfedilebilir.`,
        next: 'churn tetik',
      })
    const protective = r.triggers.rows.filter((t) => t.pAdj < 0.05 && t.hi < 0.9).sort((a, b) => a.rr - b.rr)[0]
    if (protective)
      add({
        severity: 1,
        family: protective.family,
        title: `Koruyucu deneyim: "${protective.label}"`,
        evidence: `O günün son gün olma riski ${times(protective.rr)} ${ci(protective.lo, protective.hi, times)} (benzer kullanıcılara göre).`,
        next: 'churn tetik',
      })
  }
  if (r.segments) {
    const base = r.segments.baseRate
    const hot = r.segments.dims.filter((x) => x.p < 0.05 && x.lift >= 1.25).slice(0, 2)
    for (const x of hot)
      add({
        severity: x.lift >= 1.5 ? 3 : 2,
        family: 'baglam',
        title: `${x.dim} = ${x.value}: churn ${pct(x.churnRate)} (genel ${pct(base)})`,
        evidence: `${x.n} kullanıcı-anı; genelin ${times(x.lift)} katı (düzeltilmiş p ${x.p < 0.001 ? '<0.001' : x.p.toFixed(3)}).`,
        next: 'churn kim',
      })
    const pocket = r.segments.pockets[0]
    if (pocket)
      add({
        severity: 2,
        family: 'baglam',
        title: `Cep: ${pocket.dims.map((x) => `${x.dim}=${x.value}`).join(' + ')} → churn ${pct(pocket.churnRate)}`,
        evidence: `Boyutların tek tek etkisinden beklenen ${pct(pocket.expected)}; ${pocket.n} kullanıcı-anında beklenenden ${Math.round(pocket.excess)} fazla churn.`,
        next: 'churn kim',
      })
    const flat = [...new Set(r.segments.dims.map((x) => x.dim))].filter(
      (dim) => !r.segments!.dims.some((x) => x.dim === dim && x.p < 0.05),
    )
    if (flat.length)
      add({
        severity: 1,
        family: null,
        title: `Fark görülmeyen boyutlar: ${flat.join(', ')}`,
        evidence:
          'Bu boyutların hiçbir değerinde churn genelden anlamlı ölçüde farklı değil (çoklu karşılaştırma düzeltmeli).',
      })
  }
  if (r.early) {
    const best = r.early.moments.filter((m) => m.hi < 0.9)[0]
    if (best)
      add({
        severity: 2,
        family: 'yasam',
        title: `İlk hafta işareti: "${best.label}"`,
        evidence: `Bunu yapan yeni kullanıcılarda bırakma ${pct(best.rateWith)}, yapmayanlarda ${pct(best.rateWithout)} (yeni kullanıcıların ${ek(pct(best.share), 'i')} yapıyor).`,
        next: 'churn yeni',
      })
  }
  if (r.model)
    add({
      severity: 1,
      family: null,
      title: `Risk modeli: AUC ${(r.model.gbdt?.auc ?? r.model.logistic.auc).toFixed(2)}, en riskli %10'da churn genelin ${times(r.model.gbdt?.lift10 ?? r.model.logistic.lift10)} katı`,
      evidence: `Geçmiş anlık görüntülerle eğitildi, en yenisiyle sınandı (${r.model.rows} satır; lojistik AUC ${r.model.logistic.auc.toFixed(2)}${r.model.gbdt ? `, ağaç AUC ${r.model.gbdt.auc.toFixed(2)}` : ''}).`,
      next: 'churn etken',
    })
  return out.sort((a, b) => b.severity - a.severity).map((f, i) => ({ ...f, id: `b${i + 1}` }))
}

export const familyLabel = (f: ReasonFamily | null): string => (f ? REASON_LABEL[f] : 'genel')
