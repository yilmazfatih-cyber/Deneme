/**
 * Churn sonuçlarının kompakt metni. Her bölüm az satırda en çok bilgiyi verir; ayrıntı bir alt komutla istenir.
 * Aynı sonuç (shared/lab ChurnDeep) Stüdyo'da grafik olarak çizilir.
 */
import type { ChurnDeep, DriverRow, LabDataStatus } from '../../../shared/lab'
import { REASON_LABEL } from '../../../shared/lab'
import { bar, ci, ek, num, pct, pval, table, times } from '../core/format'

export function headerOf(s: LabDataStatus): string {
  const parts = [
    `${num(s.users)} kullanıcı`,
    `${s.from}…${s.to} (${s.days} gün)`,
    s.sample < 1 ? `kullanıcı örneklemi ${pct(s.sample)}` : '',
    s.synthetic ? 'SENTETİK DEMO VERİSİ' : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

const dots = (severity: number): string => '●'.repeat(severity) + '○'.repeat(3 - severity)

/** Ana çıktı: tanım + bulgular. `full` kanıt cümlelerini tüm bulgular için yazar. */
export function formatDeep(r: ChurnDeep, opts: { limit?: number; brief?: boolean } = {}): string {
  const ov = r.overview
  const def = ov.definition
  const gap = def.gaps.find((g) => g.n === def.n)
  const last = ov.periods[ov.periods.length - 1]
  const s30 = ov.survival.find((p) => p.day === 30)
  const out: string[] = []
  out.push(`CHURN · ${headerOf(r.status)}`)
  out.push(
    `tanım: ${def.n} gün ${def.activity === 'izleme' ? 'izleme' : 'oturum'} yok` +
      (def.chosenBy === 'veri' && gap
        ? ` (veriden: ${def.n} gün sessiz kalanın geri dönme olasılığı ${pct(gap.returnRate, 0)})`
        : ' (elle verildi)'),
  )
  const sum: string[] = []
  if (last) sum.push(`${def.n} günde giden ${pct(last.rate)}`)
  if (s30) sum.push(`yeni kullanıcı 30. gün tutunma ${pct(s30.s)}`)
  if (r.model) sum.push(`risk modeli AUC ${(r.model.gbdt?.auc ?? r.model.logistic.auc).toFixed(2)}`)
  sum.push(`pencere sonunda gitmiş ${pct(ov.churnedShare)} (${num(ov.churned)}/${num(ov.everActive)})`)
  out.push(`özet: ${sum.join(' · ')}`)
  out.push('')
  out.push('BULGULAR (önem sırasıyla)')
  const limit = opts.limit ?? 10
  r.findings.slice(0, limit).forEach((f, i) => {
    out.push(`${f.id.padEnd(3)} ${dots(f.severity)} ${f.title}`)
    if (!opts.brief && i < 8) out.push(`        ${f.evidence}${f.next ? ` → ${f.next}` : ''}`)
  })
  if (r.findings.length > limit) out.push(`… +${r.findings.length - limit} bulgu daha (--limit ${r.findings.length})`)
  out.push('')
  out.push('ayrıntı: churn genel | neden | tetik | etken [ad] | kim | yeni | tanim')
  out.push('not: bulgular gözlemseldir; nedensellik için simülasyon ya da gerçek deney gerekir (deney …)')
  return out.join('\n')
}

export function formatDefinition(r: ChurnDeep): string {
  const def = r.overview.definition
  return [
    `CHURN TANIMI · ${headerOf(r.status)}`,
    `seçilen: ${def.n} gün ${def.activity === 'izleme' ? 'izleme' : 'oturum'} yok (${def.chosenBy === 'veri' ? `geri dönme olasılığı ≤ ${pct(def.threshold, 0)} olan ilk süre` : 'elle'})`,
    table(def.gaps, [
      { h: 'sessiz gün', v: 'n' },
      { h: 'boşlukların bu süreyi aşma payı', v: 'exceedShare', f: 'pct' },
      { h: 'sonradan geri dönme olasılığı', v: 'returnRate', f: 'pct' },
      { h: '', v: (g) => (g.n === def.n ? '← seçilen' : '') },
    ]),
    'değiştirmek için: churn --n <gün> [--etkinlik izleme|uygulama] --yeniden',
  ].join('\n')
}

export function formatOverview(r: ChurnDeep): string {
  const ov = r.overview
  const out: string[] = [`CHURN GENEL · ${headerOf(r.status)}`]
  out.push(
    `kullanıcı ${num(ov.users)} · en az bir kez etkin ${num(ov.everActive)} · hiç etkin olmamış ${num(ov.neverActive)} · ` +
      `pencere sonunda gitmiş ${num(ov.churned)} (${pct(ov.churnedShare)}) · hâlâ etkin ${num(ov.active)}` +
      (ov.stickiness !== null ? ` · yapışkanlık (günlük/28 günlük etkin) ${pct(ov.stickiness)}` : ''),
  )
  if (ov.periods.length) {
    out.push('', `DÖNEM CHURN'Ü (${ov.definition.n} günlük dönemde etkin olup sonrakinde hiç etkin olmayanlar)`)
    out.push(
      table(ov.periods, [
        { h: 'dönem', v: (p) => `${p.from}…${p.to}` },
        { h: 'etkin', v: 'base' },
        { h: 'giden', v: 'churned' },
        { h: 'oran', v: 'rate', f: 'pct' },
      ]),
    )
  }
  if (ov.survival.length) {
    out.push('', `YENİ KULLANICI TUTUNMASI (${num(ov.newUsers)} kullanıcı; Kaplan–Meier)`)
    out.push(
      table(ov.survival, [
        { h: 'gün', v: 'day' },
        { h: 'hâlâ etkin', v: 's', f: 'pct' },
        { h: '%95 aralık', v: (p) => ci(p.lo, p.hi, pct) },
        { h: '', v: (p) => bar(p.s, 20) },
      ]),
    )
    if (ov.medianLifetime) out.push(`yarısının bıraktığı gün: ${Math.round(ov.medianLifetime)}`)
  }
  if (ov.hazardByTenure.length) {
    out.push('', 'KIDEME GÖRE RİSK (etkin günün son gün olma oranı)')
    out.push(
      table(ov.hazardByTenure, [
        { h: 'kıdem', v: 'bucket' },
        { h: 'etkin gün', v: 'days' },
        { h: 'son gün', v: 'terminal' },
        { h: 'oran', v: 'rate', f: (v) => pct(v as number, 2) },
      ]),
    )
  }
  if (ov.weekly.length)
    out.push(
      '',
      `haftalık tutunma (başlangıçtan k hafta sonra o hafta etkin): ${ov.weekly.map((w) => `h${w.week} ${pct(w.rate, 0)}`).join(' · ')}`,
    )
  return out.join('\n')
}

export function formatReasons(r: ChurnDeep): string {
  if (!r.reasons) return 'Neden dağılımı için veri yetersiz (çok az churn olayı).'
  const rs = r.reasons
  const out: string[] = [`CHURN NEDENLERİ · ${headerOf(r.status)}`]
  out.push(
    `${num(rs.churners)} churn olayı (kullanıcının son uygulama günü) ortak risk modeliyle ayrıştırıldı. ` +
      'pay: riskin o aileye atfedilen kısmı · birincil: baskın nedeni o aile olan olaylar · giderilirse: ailenin zararlı etkileri hiç olmasaydı beklenen azalma (üst sınır)',
  )
  out.push(
    table(
      [
        ...rs.rows.map((x) => ({
          aile: x.label,
          pay: x.fraction,
          birincil: x.share,
          giderilirse: x.avoidableShare,
          isaret: x.signals
            .slice(0, 2)
            .map((s) => `${s.label} (${pct(s.share, 0)}; genelde ${pct(s.overall, 0)})`)
            .join(' · '),
        })),
        {
          aile: 'Taban risk (özel işaret yok)',
          pay: rs.baselineFraction,
          birincil: rs.baselineShare,
          giderilirse: NaN,
          isaret: '',
        },
      ],
      [
        { h: 'neden ailesi', v: 'aile' },
        { h: 'pay', v: 'pay', f: 'pct' },
        { h: 'birincil', v: 'birincil', f: 'pct' },
        { h: 'giderilirse', v: 'giderilirse', f: (v) => (Number.isNaN(v as number) ? '–' : `−${pct(v as number)}`) },
        { h: 'en sık işaretler (bu nedenle gidenlerin son gününde)', v: 'isaret', max: 110 },
      ],
    ),
  )
  out.push('cihaz, sürüm, şehir gibi bağlam boyutları neden sayılmaz; onlar için: churn kim')
  return out.join('\n')
}

export function formatTriggers(r: ChurnDeep, limit = 14): string {
  if (!r.triggers) return 'Tetikleyici analizi için veri yetersiz.'
  const t = r.triggers
  const out: string[] = [`CHURN TETİKLEYİCİLERİ · ${headerOf(r.status)}`]
  out.push(
    `${num(t.days)} uygulama günü, ${ek(num(t.terminal), 'i')} son gün (${pct(t.baseRate, 2)}). ` +
      'RO: o deneyimin yaşandığı günün son gün olma riski, benzer kullanıcıların (kıdem × önceki etkinlik × cihaz) yaşamadığı günlere oranı.',
  )
  out.push(
    table(
      t.rows,
      [
        { h: 'deneyim', v: 'label', max: 52 },
        { h: 'aile', v: (x) => REASON_LABEL[x.family].split(' ')[0] },
        { h: 'günlerin', v: 'prevalence', f: 'pct' },
        { h: 'RO', v: 'rr', f: 'x' },
        { h: '%95 aralık', v: (x) => ci(x.lo, x.hi, times) },
        { h: 'p (düz.)', v: 'pAdj', f: 'p' },
        { h: 'atfedilen', v: 'attributableShare', f: 'pct' },
      ],
      { limit, more: '--limit 30' },
    ),
  )
  out.push('atfedilen: son günlerin bu deneyime bağlanabilen payı (RO > 1 ise). RO < 1 koruyucudur.')
  return out.join('\n')
}

const directionMark = (d: DriverRow['direction']): string =>
  d === 'artınca artar' ? '↑' : d === 'artınca azalır' ? '↓' : d === 'karışık' ? '↕' : ''

export function formatDrivers(r: ChurnDeep, limit = 14): string {
  if (!r.model) return 'Etken modeli için veri yetersiz (anlık görüntüde çok az satır ya da churn).'
  const m = r.model
  const out: string[] = [`CHURN ETKENLERİ (risk işaretleri) · ${headerOf(r.status)}`]
  out.push(
    `model: ${m.snapshots.map((s) => `${s.day} (${num(s.n)}, churn ${pct(s.churnRate)}, ${s.role})`).join(' · ')} · özellik penceresi ${m.lookback} gün`,
  )
  out.push(
    `sınama: lojistik AUC ${m.logistic.auc.toFixed(3)}, en riskli %10'da kaldıraç ${times(m.logistic.lift10)}` +
      (m.gbdt ? ` · ağaç AUC ${m.gbdt.auc.toFixed(3)}, kaldıraç ${times(m.gbdt.lift10)}` : ''),
  )
  out.push(
    table(
      m.drivers,
      [
        { h: 'özellik', v: 'feature' },
        { h: 'açıklama', v: 'label', max: 40 },
        { h: 'aile', v: (x) => REASON_LABEL[x.family].split(' ')[0] },
        { h: 'yön', v: (x) => directionMark(x.direction) },
        { h: 'BD', v: 'iv', f: (v) => (v as number).toFixed(2) },
        {
          h: 'en riskli dilim',
          v: (x) => `${x.worst.label}: ${pct(x.worst.rate, 0)} (${times(x.worst.lift)})`,
          max: 30,
        },
        { h: 'OO', v: (x) => (x.oddsRatio === null ? '–' : x.oddsRatio.toFixed(2)) },
        { h: 'p', v: 'p', f: 'p' },
      ],
      { limit, more: '--limit 40' },
    ),
  )
  out.push(
    'BD: bilgi değeri (tek başına ayırma gücü; > 0.1 güçlü) · OO: diğer özellikler sabitken olasılık oranı (sayısalda 1 standart sapma başına)',
  )
  out.push('bunlar işarettir, neden değil (çoğu gidişin sonucudur). Bir özelliğin dilimleri: churn etken <özellik>')
  return out.join('\n')
}

export function formatDriver(r: ChurnDeep, feature: string): string {
  const d = r.model?.drivers.find((x) => x.feature === feature)
  if (!d) {
    const names = r.model?.drivers.map((x) => x.feature).join(', ') ?? ''
    return `Böyle bir özellik yok: ${feature}. Olanlar: ${names}`
  }
  const out: string[] = [`ETKEN · ${d.feature} — ${d.label} (${REASON_LABEL[d.family]})`]
  out.push(
    `bilgi değeri ${d.iv.toFixed(3)} · tek değişkenli AUC ${d.auc.toFixed(3)} · yön: ${d.direction}` +
      (d.oddsRatio !== null
        ? ` · çok değişkenli OO ${d.oddsRatio.toFixed(2)} ${ci(d.orLo ?? NaN, d.orHi ?? NaN, (x) => x.toFixed(2))} p ${pval(d.p)}`
        : '') +
      (d.importance !== null ? ` · ağaç önemi ${d.importance.toFixed(4)}` : ''),
  )
  out.push(
    table(d.bins, [
      { h: 'dilim', v: 'label' },
      { h: 'satır', v: 'n' },
      { h: 'churn', v: 'rate', f: 'pct' },
      { h: '%95 aralık', v: (b) => ci(b.lo, b.hi, pct) },
      { h: '', v: (b) => bar(Math.min(1, b.rate / Math.max(...d.bins.map((x) => x.rate), 1e-9)), 16) },
    ]),
  )
  return out.join('\n')
}

export function formatSegments(r: ChurnDeep, limit = 12): string {
  if (!r.segments) return 'Segment taraması için veri yetersiz.'
  const s = r.segments
  const out: string[] = [`KİM GİDİYOR · ${headerOf(r.status)} · genel churn ${pct(s.baseRate)}`]
  out.push('BOYUT DEĞERLERİ (p: çoklu karşılaştırma ve tekrar eden kullanıcı düzeltmeli)')
  out.push(
    table(
      s.dims,
      [
        { h: 'boyut = değer', v: (x) => `${x.dim} = ${x.value}`, max: 44 },
        { h: 'satır', v: 'n' },
        { h: 'churn', v: 'churnRate', f: 'pct' },
        { h: 'genele oran', v: 'lift', f: 'x' },
        { h: 'p', v: 'p', f: 'p' },
      ],
      { limit, more: '--limit 40' },
    ),
  )
  if (s.pockets.length) {
    out.push('', 'CEPLER (iki boyutun birleşiminde, tek tek etkilerinden beklenenin üstünde churn)')
    out.push(
      table(s.pockets, [
        { h: 'birleşim', v: (x) => x.dims.map((d) => `${d.dim}=${d.value}`).join(' + '), max: 60 },
        { h: 'satır', v: 'n' },
        { h: 'churn', v: 'churnRate', f: 'pct' },
        { h: 'beklenen', v: 'expected', f: 'pct' },
        { h: 'fazla', v: 'excess' },
        { h: 'p', v: 'p', f: 'p' },
      ]),
    )
  } else out.push('', 'cep yok: boyut çiftlerinde tek tek etkilerden beklenenin üstünde anlamlı churn görülmedi')
  if (s.clusters.length) {
    out.push('', 'CHURN EDEN TİPLERİ (son 28 günün davranışına göre kümeler)')
    out.push(
      table(s.clusters, [
        { h: 'küme', v: 'id' },
        { h: 'pay', v: 'share', f: 'pct' },
        {
          h: 'ayırt eden özellikler (ortalama değer)',
          v: (c) =>
            c.traits
              .slice(0, 3)
              .map((t) => `${t.label} ${t.z >= 0 ? '↑' : '↓'} (${num(t.value)})`)
              .join(' · '),
          max: 150,
        },
      ]),
    )
  }
  return out.join('\n')
}

export function formatEarly(r: ChurnDeep): string {
  if (!r.early) return 'Yeni kullanıcı analizi için veri yetersiz (pencere içinde başlayan çok az kullanıcı).'
  const e = r.early
  const out: string[] = [`YENİ KULLANICILAR · ${headerOf(r.status)}`]
  out.push(
    `${num(e.users)} yeni kullanıcı; ilk ${e.window} günden sonraki ${r.overview.definition.n} günde hiç izlemeyen ${pct(e.churnRate)}.`,
  )
  out.push(
    table(e.moments, [
      { h: `ilk ${e.window} gündeki an`, v: 'label', max: 48 },
      { h: 'yapan', v: 'share', f: 'pct' },
      { h: 'yapanda bırakma', v: 'rateWith', f: 'pct' },
      { h: 'yapmayanda', v: 'rateWithout', f: 'pct' },
      { h: 'oran', v: 'rr', f: 'x' },
      { h: '%95 aralık', v: (m) => ci(m.lo, m.hi, times) },
    ]),
  )
  out.push('katmansız karşılaştırmadır: hevesli kullanıcı bu anları zaten yaşar. Hipotez üretir; deneyle doğrulanır.')
  return out.join('\n')
}
