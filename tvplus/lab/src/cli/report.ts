/**
 * İnsan için rapor: tek dosyalık, kendi kendine yeten HTML (`lab klasörü/rapor/lab-raporu.html`).
 * Dışarıdan hiçbir şey yüklemez (yazı tipi, betik, görsel yok); grafikler satır içi SVG'dir. İçinde yalnız
 * sonuç dosyalarındaki toplamlar vardır — kurum içinde paylaşılabilir.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChurnDeep, ExperimentRun, SimCalibration } from '../../../shared/lab'
import { REASON_LABEL } from '../../../shared/lab'
import { num, pct, pval, rel, times } from '../core/format'
import { loadResult, type Lab } from '../core/lab'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const short = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const CSS = `
:root{--bg:#f7f7f5;--fg:#1c1c1a;--mut:#6b6b66;--line:#dcdcd6;--card:#fff;--acc:#0b63ce;--good:#1a7f4b;--bad:#b3261e;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecece8;--mut:#a3a39c;--line:#33332f;--card:#1d1d1b;--acc:#6aa9ff;--good:#5ccf8f;--bad:#ff8a80;--warn:#e3b341}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
h3{font-size:15px;margin:22px 0 8px}p{margin:6px 0}.mut{color:var(--mut)}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
.badge{display:inline-block;border:1px solid var(--warn);color:var(--warn);border-radius:999px;padding:1px 9px;font-size:12px;margin-left:8px;vertical-align:middle}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.stat b{display:block;font-size:22px}.stat span{color:var(--mut);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--mut);font-weight:600}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}.scroll{overflow-x:auto}.good{color:var(--good)}.bad{color:var(--bad)}
ol.find{padding-left:20px}ol.find li{margin:8px 0}svg{max-width:100%;height:auto;display:block}svg text{fill:var(--fg);font:12px system-ui,sans-serif}.ax{stroke:var(--line)}
`

interface Bar {
  label: string
  value: number
  note?: string
}
/** Yatay çubuk grafik (0 … en büyük değer). */
function barChart(bars: Bar[], fmt: (x: number) => string): string {
  const max = Math.max(1e-9, ...bars.map((b) => b.value))
  const h = 26
  const left = 250
  const width = 760
  const rows = bars
    .map((b, i) => {
      const w = Math.max(1, ((width - left - 150) * b.value) / max)
      return `<text x="${left - 8}" y="${i * h + 17}" text-anchor="end">${esc(short(b.label, 36))}</text><rect x="${left}" y="${i * h + 5}" width="${w.toFixed(1)}" height="16" rx="3" fill="var(--acc)"/><text x="${(left + w + 6).toFixed(1)}" y="${i * h + 17}">${esc(fmt(b.value))}${b.note ? ` <tspan fill="var(--mut)">${esc(b.note)}</tspan>` : ''}</text>`
    })
    .join('')
  return `<svg viewBox="0 0 ${width} ${bars.length * h + 6}" role="img">${rows}</svg>`
}

interface Interval {
  label: string
  mid: number
  lo: number
  hi: number
  good?: boolean | null
}
/** Aralık grafiği (orman grafiği). `log`: oranlar için logaritmik eksen, başvuru çizgisi 1; değilse 0. */
function forest(items: Interval[], log: boolean, fmt: (x: number) => string): string {
  const tx = (x: number): number => (log ? Math.log(Math.max(1e-6, x)) : x)
  const ref = log ? 0 : 0
  let lo = ref
  let hi = ref
  for (const it of items) {
    lo = Math.min(lo, tx(it.lo))
    hi = Math.max(hi, tx(it.hi))
  }
  const pad = (hi - lo) * 0.06 || 0.1
  lo -= pad
  hi += pad
  const h = 26
  const left = 400
  const width = 900
  const plot = width - left - 96
  const px = (x: number): number => left + ((tx(x) - lo) / (hi - lo)) * plot
  const refX = left + ((ref - lo) / (hi - lo)) * plot
  const rows = items
    .map((it, i) => {
      const y = i * h + 14
      const color = it.good === true ? 'var(--good)' : it.good === false ? 'var(--bad)' : 'var(--mut)'
      return `<text x="${left - 10}" y="${y + 4}" text-anchor="end">${esc(short(it.label, 58))}</text><line x1="${px(it.lo).toFixed(1)}" x2="${px(it.hi).toFixed(1)}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="2"/><circle cx="${px(it.mid).toFixed(1)}" cy="${y}" r="4" fill="${color}"/><text x="${width - 86}" y="${y + 4}">${esc(fmt(it.mid))}</text>`
    })
    .join('')
  return `<svg viewBox="0 0 ${width} ${items.length * h + 8}" role="img"><line class="ax" x1="${refX.toFixed(1)}" x2="${refX.toFixed(1)}" y1="0" y2="${items.length * h + 4}" stroke-dasharray="3 3"/>${rows}</svg>`
}

interface Series {
  name: string
  color: string
  points: [number, number][]
}
function lineChart(series: Series[], xLabel: (x: number) => string, yFmt: (y: number) => string): string {
  const all = series.flatMap((s) => s.points)
  if (!all.length) return ''
  const xs = all.map((p) => p[0])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...all.map((p) => p[1]), 1e-9)
  const w = 760
  const h = 240
  const l = 52
  const r = 34
  const top = 28
  const b = 26
  const px = (x: number): number => l + ((x - x0) / Math.max(1e-9, x1 - x0)) * (w - l - r)
  const py = (y: number): number => h - b - (y / y1) * (h - b - top)
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (f) =>
        `<line class="ax" x1="${l}" x2="${w - r}" y1="${py(f * y1).toFixed(1)}" y2="${py(f * y1).toFixed(1)}"/><text x="${l - 6}" y="${(py(f * y1) + 4).toFixed(1)}" text-anchor="end">${esc(yFmt(f * y1))}</text>`,
    )
    .join('')
  const lines = series
    .map(
      (s) =>
        `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${s.points.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ')}"/>`,
    )
    .join('')
  // Eksen etiketleri: birbirine 64 pikselden yakın olanlar atlanır (sondaki her zaman yazılır)
  const marks = [...new Set(series[0].points.map((p) => p[0]))].sort((a, c) => a - c)
  const shown: number[] = []
  for (const x of marks) {
    if (!shown.length || px(x) - px(shown[shown.length - 1]) >= 64) shown.push(x)
  }
  const lastMark = marks[marks.length - 1]
  if (shown[shown.length - 1] !== lastMark) {
    if (shown.length > 1 && px(lastMark) - px(shown[shown.length - 1]) < 64) shown.pop()
    shown.push(lastMark)
  }
  const ticks = shown
    .map((x) => `<text x="${px(x).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(xLabel(x))}</text>`)
    .join('')
  const legend = series
    .map(
      (s, i) =>
        `<rect x="${l + i * 150}" y="4" width="14" height="4" fill="${s.color}"/><text x="${l + i * 150 + 20}" y="11">${esc(s.name)}</text>`,
    )
    .join('')
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${grid}${lines}${ticks}${legend}</svg>`
}

function tableHtml(head: string[], rows: string[][], right: number[] = []): string {
  const th = head.map((h, i) => `<th${right.includes(i) ? ' class="r"' : ''}>${esc(h)}</th>`).join('')
  const tr = rows
    .map((r) => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`
}

function churnSection(r: ChurnDeep): string {
  const ov = r.overview
  const last = ov.periods[ov.periods.length - 1]
  const out: string[] = ['<h2>Churn analizi</h2>']
  out.push(
    `<div class="grid card"><div class="stat"><b>${ov.definition.n} gün</b><span>etkinlik yoksa churn (${ov.definition.chosenBy === 'veri' ? 'veriden seçildi' : 'elle'})</span></div>` +
      (last
        ? `<div class="stat"><b>${pct(last.rate)}</b><span>her ${ov.definition.n} günde giden etkin kullanıcı</span></div>`
        : '') +
      `<div class="stat"><b>${pct(ov.churnedShare)}</b><span>pencere sonunda gitmiş (${num(ov.churned)} / ${num(ov.everActive)})</span></div>` +
      (r.model
        ? `<div class="stat"><b>${(r.model.gbdt?.auc ?? r.model.logistic.auc).toFixed(2)}</b><span>risk modeli AUC (gelecek dönemde sınandı)</span></div>`
        : '') +
      '</div>',
  )
  out.push('<h3>Bulgular</h3><ol class="find">')
  for (const f of r.findings) out.push(`<li><b>${esc(f.title)}</b><br><span class="mut">${esc(f.evidence)}</span></li>`)
  out.push('</ol>')
  if (r.reasons) {
    out.push(
      '<h3>Neden dağılımı</h3><p class="mut">Her churn olayında riski tabanın üstüne çıkaran pay, o gün var olan zararlı deneyim ve durumlara dağıtıldı.</p>',
    )
    out.push(
      barChart(
        [
          ...r.reasons.rows
            .filter((x) => x.fraction > 0.001)
            .map((x) => ({ label: x.label, value: x.fraction, note: `giderilirse −${pct(x.avoidableShare)}` })),
          { label: 'Taban risk (özel işaret yok)', value: r.reasons.baselineFraction },
        ],
        (x) => pct(x),
      ),
    )
  }
  if (r.triggers) {
    const rows = r.triggers.rows.filter((t) => t.pAdj < 0.05).slice(0, 14)
    out.push(
      '<h3>Tetikleyiciler</h3><p class="mut">O deneyimin yaşandığı günün kullanıcının son günü olma riski, benzer kullanıcıların yaşamadığı günlere oranı (logaritmik eksen; kesikli çizgi = fark yok).</p>',
    )
    out.push(
      forest(
        rows.map((t) => ({ label: t.label, mid: t.rr, lo: t.lo, hi: t.hi, good: t.rr < 1 })),
        true,
        times,
      ),
    )
  }
  if (ov.survival.length) {
    out.push(`<h3>Yeni kullanıcı tutunması</h3><p class="mut">${num(ov.newUsers)} yeni kullanıcı (Kaplan–Meier).</p>`)
    out.push(
      lineChart(
        [
          {
            name: 'hâlâ etkin',
            color: 'var(--acc)',
            points: [[0, 1], ...ov.survival.map((p): [number, number] => [p.day, p.s])],
          },
        ],
        (x) => `${x}. gün`,
        (y) => pct(y, 0),
      ),
    )
  }
  if (r.segments) {
    out.push('<h3>Kim gidiyor</h3>')
    out.push(
      tableHtml(
        ['boyut = değer', 'satır', 'churn', 'genele oran', 'p (düzeltilmiş)'],
        r.segments.dims
          .slice(0, 12)
          .map((x) => [esc(`${x.dim} = ${x.value}`), num(x.n), pct(x.churnRate), times(x.lift), esc(pval(x.p))]),
        [1, 2, 3, 4],
      ),
    )
  }
  if (r.model) {
    out.push(
      '<h3>Risk işaretleri</h3><p class="mut">Bunlar işarettir, neden değil: çoğu gidişin sonucudur. Kimin risk altında olduğunu gösterir.</p>',
    )
    out.push(
      tableHtml(
        ['özellik', 'aile', 'bilgi değeri', 'en riskli dilim', 'churn'],
        r.model.drivers
          .slice(0, 12)
          .map((d) => [
            esc(d.label),
            esc(REASON_LABEL[d.family]),
            d.iv.toFixed(2),
            esc(d.worst.label),
            `${pct(d.worst.rate, 0)} (${times(d.worst.lift)})`,
          ]),
        [2, 4],
      ),
    )
  }
  return out.join('\n')
}

function simSection(c: SimCalibration): string {
  const out: string[] = ['<h2>Simülasyon: gerçeklik karnesi</h2>']
  out.push(
    `<div class="grid card"><div class="stat"><b>${c.score.toFixed(2)} / 1</b><span>uydurulmayan ölçülerin ortalama uyumu</span></div><div class="stat"><b>${num(c.twins)}</b><span>ikiz × ${c.horizon} gün (başlangıç ${esc(c.from)})</span></div><div class="stat"><b>${num(c.world.titles)}</b><span>köprülenen başlık</span></div><div class="stat"><b>${c.oracle.auc === null ? '–' : c.oracle.auc.toFixed(2)}</b><span>tercih kâhininin gerçek seçimleri sıralama AUC'si</span></div></div>`,
  )
  out.push(
    tableHtml(
      ['', 'ölçü', 'gerçek', 'simülasyon', 'oran', ''],
      c.metrics.map((m) => [
        m.ok ? '<span class="good">✓</span>' : '<span class="bad">✗</span>',
        esc(m.label),
        m.unit === 'oran' ? pct(m.real) : num(m.real),
        m.unit === 'oran' ? pct(m.sim) : num(m.sim),
        times(m.ratio),
        m.calibrated ? '<span class="mut">uyduruldu</span>' : '',
      ]),
      [2, 3, 4],
    ),
  )
  if (c.absent?.length)
    out.push(`<p class="mut">Veride olmayan ölçüler (karneye girmedi): ${esc(c.absent.join(' · '))}</p>`)
  out.push('<h3>Haftalık etkin ikiz payı</h3>')
  out.push(
    lineChart(
      [
        { name: 'gerçek', color: 'var(--fg)', points: c.weekly.map((w): [number, number] => [w.week, w.real]) },
        { name: 'simülasyon', color: 'var(--acc)', points: c.weekly.map((w): [number, number] => [w.week, w.sim]) },
      ],
      (x) => `h${x}`,
      (y) => pct(y, 0),
    ),
  )
  out.push('<h3>Parametreler nereden geliyor</h3>')
  out.push(
    tableHtml(
      ['kaynak', 'parametre', 'değer'],
      c.assumptions.map((a) => [esc(a.source), esc(a.name), esc(a.value)]),
    ),
  )
  return out.join('\n')
}

function experimentSection(r: ExperimentRun): string {
  const out: string[] = [`<h3>${esc(r.key)} — ${esc(r.name)}</h3>`]
  out.push(
    `<p class="mut">${esc(r.source)} · ${esc(r.design)} · ${num(r.control.n)} birim × ${r.days} gün${r.fidelity !== null ? ` · karne ${r.fidelity.toFixed(2)}` : ''}</p>`,
  )
  for (const arm of r.arms) {
    const cls = arm.decision === 'aday' ? 'good' : arm.decision === 'etkisiz' ? 'mut' : 'bad'
    out.push(
      `<p><b>${esc(r.control.key)} ↔ ${esc(arm.key)}</b> · ${esc(arm.changes.join('; '))}<br><span class="${cls}"><b>${esc(arm.decision.toLocaleUpperCase('tr-TR'))}</b></span> — ${esc(arm.summary)}</p>`,
    )
    out.push(
      forest(
        arm.metrics.flatMap((m) =>
          m.rel === null || m.relLo === null || m.relHi === null
            ? []
            : [
                {
                  label: `${m.role === 'birincil' ? '★ ' : m.role === 'koruma' ? '◆ ' : ''}${m.label}`,
                  mid: m.rel,
                  lo: m.relLo,
                  hi: m.relHi,
                  good: m.verdict === 'iyi' ? true : m.verdict === 'kötü' ? false : null,
                },
              ],
        ),
        false,
        (x) => rel(x),
      ),
    )
  }
  for (const n of r.notes) out.push(`<p class="mut">${esc(n)}</p>`)
  return out.join('\n')
}

export function buildReport(lab: Lab): { file: string; sections: string[]; bytes: number } {
  const churn = loadResult<ChurnDeep>(lab, 'churn')
  const cal = loadResult<SimCalibration>(lab, 'sim-karne')
  const runs = readdirSync(lab.resultDir)
    .filter((f) => f.startsWith('deney-') || f.startsWith('gercek-'))
    .map((f) => loadResult<ExperimentRun>(lab, f.replace(/\.json$/, '')))
    .filter((r): r is NonNullable<typeof r> => !!r)
  if (!churn && !cal && !runs.length)
    throw new Error('Rapor için sonuç yok. Önce: churn (ve isteğe bağlı: sim karne, deney calistir …)')
  const sections: string[] = []
  const body: string[] = []
  const status = churn?.data.status
  body.push(
    `<h1>TV+ Lab raporu${status?.synthetic ? '<span class="badge">sentetik demo verisi</span>' : ''}</h1>` +
      `<p class="mut">${status ? `${num(status.users)} kullanıcı · ${esc(status.from)} – ${esc(status.to)} (${status.days} gün)${status.sample < 1 ? ` · kullanıcı örneklemi ${pct(status.sample)}` : ''} · ` : ''}oluşturuldu ${new Date().toLocaleString('tr-TR')}</p>`,
  )
  if (churn) {
    body.push(churnSection(churn.data))
    sections.push('churn')
  }
  if (cal) {
    body.push(simSection(cal.data))
    sections.push('simülasyon')
  }
  if (runs.length) {
    body.push(
      '<h2>Deneyler</h2><p class="mut">★ birincil ölçü · ◆ koruma ölçüsü · çubuklar göreli farkın %95 güven aralığıdır; kesikli çizgi = fark yok.</p>',
    )
    for (const r of runs) body.push(experimentSection(r.data))
    sections.push('deneyler')
  }
  const caveats = [
    ...(churn?.data.caveats ?? []),
    ...(runs.find((r) => r.data.source === 'simülasyon')?.data.caveats ?? []),
  ]
  if (caveats.length) body.push(`<h2>Yorum sınırları</h2><ul>${caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`)
  body.push(
    '<p class="mut">Bu raporda kullanıcı düzeyi veri yoktur; yalnız toplamlar vardır ve küçük gruplar gizlenmiştir.</p>',
  )
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TV+ Lab raporu</title><style>${CSS}</style></head><body><main>${body.join('\n')}</main></body></html>`
  const file = join(lab.reportDir, 'lab-raporu.html')
  writeFileSync(file, html)
  return { file, sections, bytes: statSync(file).size }
}
