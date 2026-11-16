/**
 * Deney, karne ve güç sonuçlarının kompakt metni.
 */
import type { ExperimentMetric, ExperimentRun, PowerTable, SimCalibration } from '../../../shared/lab'
import { ci, ek, num, pct, pp, pval, rel, table } from '../core/format'

const value = (m: ExperimentMetric, x: number): string => (m.unit === 'oran' ? pct(x) : num(x))
const delta = (m: ExperimentMetric): string =>
  m.unit === 'oran' ? pp(m.diff) : `${m.diff >= 0 ? '+' : '−'}${num(Math.abs(m.diff))}`
const ROLE_MARK: Record<ExperimentMetric['role'], string> = { birincil: '★', koruma: '◆', ikincil: ' ' }
const VERDICT: Record<ExperimentMetric['verdict'], string> = { iyi: 'iyileşme', kötü: 'BOZULMA', belirsiz: 'fark yok' }
const DECISION: Record<ExperimentRun['arms'][number]['decision'], string> = {
  aday: 'GERÇEK DENEYE ADAY',
  riskli: 'RİSKLİ (koruma ölçüsü bozuldu)',
  zararlı: 'ZARARLI (birincil ölçü bozuldu)',
  etkisiz: 'ETKİSİZ (fark gösterilemedi)',
}

/** Kolun özeti, ölçü anahtarlarıyla (tablodaki adlarla aynı; `arm.summary` insan için uzun adları kullanır). */
function armSummary(arm: ExperimentRun['arms'][number]): string {
  const keys = (list: ExperimentMetric[]): string => list.map((m) => m.key).join(', ')
  const primary = arm.metrics.find((m) => m.role === 'birincil')
  const broken = arm.metrics.filter((m) => m.role === 'koruma' && m.verdict === 'kötü')
  const better = arm.metrics.filter((m) => m.role !== 'birincil' && m.verdict === 'iyi')
  const worse = arm.metrics.filter((m) => m.role === 'ikincil' && m.verdict === 'kötü')
  const head =
    arm.decision === 'zararlı'
      ? `birincil ölçü (${primary?.key ?? '–'}) anlamlı ölçüde bozuldu`
      : arm.decision === 'riskli'
        ? `koruma ölçüsü bozuldu: ${keys(broken)}`
        : arm.decision === 'aday'
          ? `birincil ölçü (${primary?.key ?? '–'}) iyileşti, koruma ölçüleri bozulmadı`
          : `birincil ölçüde (${primary?.key ?? '–'}) anlamlı fark görülmedi`
  return (
    head +
    (better.length ? ` · iyileşen: ${keys(better)}` : '') +
    (worse.length ? ` · bozulan ikincil: ${keys(worse)}` : '')
  )
}

export function formatExperiment(r: ExperimentRun, limit = 10): string {
  const out: string[] = []
  const size =
    r.design === 'ikiz evren'
      ? `${num(r.control.n)} ikiz`
      : `${[r.control, ...r.arms].map((a) => `${a.key} ${num(a.n)}`).join(' · ')} kullanıcı`
  out.push(
    `DENEY · ${r.key}${r.name !== r.key ? ` — ${r.name}` : ''} · ${r.source} (${r.design}) · ${size} × ${r.days} gün` +
      (r.synthetic ? ' · SENTETİK DEMO VERİSİ' : ''),
  )
  for (const arm of r.arms) {
    out.push('')
    out.push(
      `${r.control.key} ↔ ${arm.key}${arm.name !== arm.key ? ` (${arm.name})` : ''} · değişen: ${arm.changes.join('; ')}`,
    )
    out.push(
      table(
        arm.metrics,
        [
          { h: '', v: (m) => ROLE_MARK[m.role] },
          { h: 'ölçü', v: 'key' },
          { h: r.control.key, v: (m) => value(m, m.control), align: 'r' },
          { h: arm.key, v: (m) => value(m, m.treatment), align: 'r' },
          { h: 'fark', v: (m) => delta(m), align: 'r' },
          { h: 'göreli', v: (m) => rel(m.rel), align: 'r' },
          { h: '%95 aralık (göreli)', v: (m) => ci(m.relLo, m.relHi, rel) },
          { h: 'p', v: (m) => pval(m.pAdj), align: 'r' },
          { h: 'iyi olma olasılığı', v: (m) => pct(m.probBetter, 0), align: 'r' },
          { h: 'sonuç', v: (m) => VERDICT[m.verdict] },
        ],
        { limit, more: '--limit 20' },
      ),
    )
    out.push(`karar: ${DECISION[arm.decision]} — ${armSummary(arm)}`)
    const seq = arm.metrics.find((m) => m.pAlways !== undefined)
    if (seq?.pAlways !== undefined)
      out.push(
        `erken bakış: ${seq.key} için her an geçerli p ${pval(seq.pAlways)} — deney sürerken tekrar tekrar bakılabilir; yukarıdaki p yalnız planlanan sürenin sonunda geçerlidir`,
      )
  }
  out.push('')
  out.push('★ birincil ölçü · ◆ koruma ölçüsü · p: ikincil ve koruma ölçülerinde çoklu karşılaştırma düzeltmeli')
  if (r.srm)
    out.push(
      `örneklem oranı denetimi (SRM): ${r.srm.ok ? 'uyumlu' : 'UYUMSUZ'} (p ${pval(r.srm.p)}; eşik ${r.srm.threshold ?? 0.001} — altı atama bozukluğu sayılır)`,
    )
  for (const n of r.notes) out.push(`not: ${n}`)
  if (r.source === 'simülasyon')
    out.push(
      `güven: ${r.fidelity === null ? 'karne yok (sim karne)' : `gerçeklik karnesi ${r.fidelity.toFixed(2)} / 1`} · simülasyon gerçek A/B'nin yerini tutmaz; gerçek deney planı için: deney guc`,
    )
  return out.join('\n')
}

export function formatCalibration(c: SimCalibration): string {
  const out: string[] = []
  out.push(
    `GERÇEKLİK KARNESİ · puan ${c.score.toFixed(2)} / 1 (uydurulmayan ölçülerin ortalama uyumu) · ${num(c.twins)} ikiz × ${c.horizon} gün, başlangıç ${c.from}` +
      (c.synthetic ? ' · SENTETİK DEMO VERİSİ' : ''),
  )
  out.push(
    `dünya: ${num(c.world.titles)} başlık · tahmin modeli ${c.world.modelReady ? `${num(c.world.viewers)} izleyiciyle eğitildi` : 'EĞİTİLEMEDİ'} · ` +
      `tercih kâhini gerçek seçimleri AUC ${c.oracle.auc === null ? '–' : c.oracle.auc.toFixed(2)} ile sıralıyor`,
  )
  out.push(
    table(c.metrics, [
      { h: '', v: (m) => (m.ok ? '✓' : '✗') },
      { h: 'ölçü', v: 'label', max: 46 },
      { h: 'gerçek', v: (m) => (m.unit === 'oran' ? pct(m.real) : num(m.real)), align: 'r' },
      { h: 'simülasyon', v: (m) => (m.unit === 'oran' ? pct(m.sim) : num(m.sim)), align: 'r' },
      { h: 'oran', v: 'ratio', f: 'x' },
      { h: '', v: (m) => (m.calibrated ? 'uyduruldu' : '') },
    ]),
  )
  if (c.absent?.length)
    out.push(`veride olmayan ölçüler (karneye girmedi; ilgili olaylar eşlenmemiş): ${c.absent.join(' · ')}`)
  out.push(
    `haftalık etkin ikiz payı (gerçek/sim): ${c.weekly.map((w) => `h${w.week} ${pct(w.real, 0)}/${pct(w.sim, 0)}`).join(' · ')}`,
  )
  const bad = c.metrics.filter((m) => !m.ok && !m.calibrated)
  if (bad.length)
    out.push(
      `✗ ölçüler: simülatör bunları yeniden üretemiyor (${bad.map((m) => m.label).join('; ')}). Olası neden: dönem içinde değişen bir şey (sürüm, sezon, katalog) ya da modelde olmayan bir davranış. Bu ölçülere dayanan deney sonuçlarına temkinli bakın.`,
    )
  out.push('ayrıntı: sim varsayim (hangi parametre veriden, hangisi varsayım)')
  return out.join('\n')
}

export function formatAssumptions(c: SimCalibration): string {
  return [
    'SİMÜLATÖR PARAMETRELERİ',
    table(c.assumptions, [
      { h: 'kaynak', v: 'source' },
      { h: 'parametre', v: 'name', max: 90 },
      { h: 'değer', v: 'value', max: 46 },
    ]),
    'veriden: gerçek veriden kestirildi · kalibrasyon: gerçek veriye uydurularak bulundu · varsayım: veride karşılığı yok (sonuçların en zayıf yeri)',
  ].join('\n')
}

export function formatPower(p: PowerTable): string {
  const out: string[] = []
  out.push(
    `GÜÇ VE SÜRE · ${p.metric} — ${p.label} · trafik ${pct(p.traffic, 0)}, iki eşit kol, iki yönlü α 0.05, güç %80`,
  )
  if (p.durations.length) {
    out.push(
      'deney ne kadar sürerse hangi etki görülür (o sürede uygulamaya gelen herkes deneye girer; ölçü süre boyunca toplanır)',
    )
    out.push(
      table(p.durations, [
        { h: 'süre', v: (r) => `${r.days} gün` },
        { h: 'kullanıcı', v: 'users' },
        { h: 'ortalama', v: 'mean' },
        { h: 'ss', v: 'sd' },
        { h: 'ön dönem ρ', v: (r) => r.preCorrelation.toFixed(2), align: 'r' },
        { h: 'görülebilen en küçük etki', v: (r) => pct(r.mde), align: 'r' },
        { h: 'CUPED ile', v: (r) => pct(r.mdeCuped), align: 'r' },
      ]),
    )
  }
  const gain = 1 - p.preCorrelation * p.preCorrelation
  out.push(
    `${p.window} günlük ölçüm: ortalama ${num(p.mean)}, ss ${num(p.sd)} · uygun kullanıcı ≈ ${num(p.eligible)} (kol başına ${num(Math.floor(p.eligible / 2))}) · ` +
      (gain > 0.97
        ? 'ön dönemle ilişki zayıf (CUPED kazancı yok)'
        : `ön dönem ρ ${p.preCorrelation.toFixed(2)} (CUPED varyansı ${ek(pct(gain, 0), 'e')} indirir)`) +
      ` → görülebilen en küçük etki ${pct(p.mde)}${gain > 0.97 ? '' : ` · CUPED ile ${pct(p.mdeCuped)}`}`,
  )
  out.push(
    table(p.rows, [
      { h: 'hedef etki', v: 'effect', f: 'pct' },
      { h: 'kol başına gereken', v: 'perArm' },
      { h: 'yeter mi', v: (r) => (r.enough ? 'evet' : 'hayır') },
      { h: 'CUPED ile gereken', v: 'perArmCuped' },
      { h: 'yeter mi', v: (r) => (r.enoughCuped ? 'evet' : 'hayır') },
    ]),
  )
  for (const n of p.notes) out.push(`not: ${n}`)
  out.push(
    'küçük etkiler için: CUPED, daha duyarlı ölçü, daha uzun süre, daha büyük trafik payı — ya da önce simülasyonda eleyin (deney calistir).',
  )
  return out.join('\n')
}
