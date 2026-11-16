/**
 * Simülasyon, deney ve rapor komutları (commands.ts'teki çekirdek komutlara eklenir).
 *
 *   sim kur        katalog köprüsü: lab'ın başlıklarından uygulamanın yükleyebildiği katalog
 *   sim karne      simülatörü gerçek veriye kalibre et ve gerçeklik karnesini çıkar
 *   sim varsayim   hangi parametre veriden, hangisi kalibrasyondan, hangisi varsayım
 *   deney liste    uygulamadaki deney tanımları + veride görülen gerçek deneyler + geçmiş koşular
 *   deney calistir <anahtar>   uygulama deneyini simülasyonda (ikiz evren) çalıştır
 *   deney dene --bayrak k=v …  tanım yazmadan tek bir değişikliği kontrolle karşılaştır
 *   deney sonuc <anahtar>      son koşunun sonucu
 *   deney guc      gerçek veriden güç / örneklem / süre tablosu
 *   deney gercek [ad]          içe alınan gerçek deney verisini çözümle
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zExperimentsFile, type Experiment } from '../../../shared/experiments'
import { FLAGS, isFlagKey, isFlagValue, type Flags } from '../../../shared/flags'
import type { ChurnDeep, ChurnDefinition, ExperimentRun, SimCalibration } from '../../../shared/lab'
import { formatAssumptions, formatCalibration, formatExperiment, formatPower } from '../ab/format'
import { METRICS, metricByKey } from '../ab/metrics'
import {
  analyzeRealExperiment,
  listRealExperiments,
  powerTable,
  runSimExperiment,
  specFromExperiment,
  type SimExperimentSpec,
} from '../ab/run'
import { loadChurnData, loadMeta, type ChurnData } from '../churn/data'
import { runDeep } from '../churn/deep'
import type { HazardModel } from '../churn/triggers'
import { dayStr, ek, kv, num, pct, table } from '../core/format'
import { loadResult, saveResult, tvplusRoot, type Lab } from '../core/lab'
import { buildBridge, defaultTwins, loadBridge } from '../sim/bridge'
import type { Treatment } from '../sim/engine'
import { calibrate } from '../sim/fidelity'
import { flagBool, flagNum, flagStr, type Args } from './args'
import type { CommandContext, CommandResult, ExtraCommands } from './commands'
import { buildReport } from './report'

interface Prepared {
  d: ChurnData
  def: ChurnDefinition
  hazard: HazardModel
}

/** Churn tanımı ve risk modeli: güncel önbellek varsa oradan, yoksa analiz çalıştırılır. */
function prepare(ctx: CommandContext): Prepared {
  const { lab } = ctx
  const meta = loadMeta(lab)
  if (!meta) throw new Error('Tablolar kurulmamış. Önce: kur (veri yoksa: demo)')
  const d = loadChurnData(lab)
  const churn = loadResult<ChurnDeep>(lab, 'churn')
  const risk = loadResult<HazardModel>(lab, 'churn-risk')
  if (churn && risk && churn.dataRev === meta.dataRev && risk.dataRev === meta.dataRev)
    return { d, def: churn.data.overview.definition, hazard: risk.data }
  ctx.progress('churn analizi çalışıyor (risk modeli için)…')
  const deep = runDeep(lab, { data: d })
  if (!deep.hazard)
    throw new Error(
      'Risk modeli kurulamadı (çok az churn olayı). Simülasyon için daha uzun ya da daha büyük veri gerekir.',
    )
  return { d, def: deep.result.overview.definition, hazard: deep.hazard }
}

function freshCalibration(lab: Lab): SimCalibration | null {
  const meta = loadMeta(lab)
  const cal = loadResult<SimCalibration>(lab, 'sim-karne')
  return cal && meta && cal.dataRev === meta.dataRev ? cal.data : null
}

function ensureBridge(ctx: CommandContext, maxTitles?: number): ReturnType<typeof buildBridge> {
  const meta = loadMeta(ctx.lab)
  const existing = loadBridge(ctx.lab)
  if (existing && meta && existing.dataRev === meta.dataRev && maxTitles === undefined) return existing
  ctx.progress('katalog köprüsü kuruluyor…')
  return buildBridge(ctx.lab, { maxTitles })
}

/* ───────────── sim ───────────── */

async function cmdSim(ctx: CommandContext, a: Args): Promise<CommandResult> {
  const { lab } = ctx
  const sub = a._[1] ?? 'durum'
  if (sub === 'kur') {
    const b = buildBridge(lab, { maxTitles: flagNum(a, 'baslik') })
    const shows = b.titles.filter((t) => t.type === 'SHOW').length
    const genres = Object.entries(b.genres)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 10)
      .map(([g, n]) => `${g} ${n}`)
      .join(' · ')
    return {
      text: [
        `KATALOG KÖPRÜSÜ KURULDU · ${num(b.titles.length)} başlık (${num(shows)} dizi, ${num(b.titles.length - shows)} film) · ${b.dir}`,
        `dışarıda kalan: ${num(b.skipped.live)} canlı kanal/spor/klip · ${num(b.skipped.unwatched)} hiç izlenmemiş · ${num(b.skipped.overLimit)} sınır üstü` +
          (b.skipped.overLimit > 0
            ? ` (köprü isteğe bağlı izlemenin ${ek(pct(b.coverage ?? 1), 'i')} kapsıyor; sınırı değiştirmek için: sim kur --baslik N — büyük katalog simülasyonu yavaşlatır)`
            : ''),
        `türler (uygulamanın sözlüğüne çevrildi): ${genres}`,
        b.unmappedGenres.length
          ? `çevrilemeyen tür adları ('dram' sayıldı): ${b.unmappedGenres.slice(0, 12).join(', ')}`
          : 'tüm tür adları çevrildi',
        'simülasyon bu katalogla uygulamanın kendi kodunu (ana sayfa, tahmin modeli, Top 10) çalıştırır · sıradaki: sim karne',
      ].join('\n'),
      json: { titles: b.titles.length, genres: b.genres, skipped: b.skipped, unmappedGenres: b.unmappedGenres },
    }
  }
  if (sub === 'karne') {
    const cached = freshCalibration(lab)
    if (cached && !flagBool(a, 'yeniden')) return { text: formatCalibration(cached), json: cached }
    const p = prepare(ctx)
    const bridge = ensureBridge(ctx)
    const cal = await calibrate(lab, p.d, p.def, p.hazard, {
      twins: flagNum(a, 'ikiz') ?? defaultTwins(bridge.titles.length),
      horizon: flagNum(a, 'gun'),
      seed: flagNum(a, 'tohum'),
      onProgress: ctx.progress,
    })
    saveResult(lab, 'sim-karne', cal, { dataRev: p.d.meta.dataRev })
    return {
      text: `${formatCalibration(cal)}\nsıradaki: deney liste | deney calistir <anahtar> | deney dene --bayrak …`,
      json: cal,
    }
  }
  if (sub === 'varsayim' || sub === 'varsayım') {
    const cal = freshCalibration(lab)
    if (!cal) throw new Error('Karne yok. Önce: sim karne')
    return { text: formatAssumptions(cal), json: cal.assumptions }
  }
  if (sub === 'durum') {
    const b = loadBridge(lab)
    const cal = loadResult<SimCalibration>(lab, 'sim-karne')
    const meta = loadMeta(lab)
    return {
      text: [
        'SİMÜLASYON',
        `katalog köprüsü: ${b ? `${num(b.titles.length)} başlık${meta && b.dataRev !== meta.dataRev ? ' (ESKİ veriyle; sim kur)' : ''}` : 'yok (sim kur)'}`,
        `karne: ${cal ? `puan ${cal.data.score.toFixed(2)} · ${cal.at.slice(0, 16).replace('T', ' ')}${meta && cal.dataRev !== meta.dataRev ? ' (ESKİ veriyle; sim karne --yeniden)' : ''}` : 'yok (sim karne)'}`,
        `sıradaki: ${!b ? 'sim kur' : !cal ? 'sim karne' : 'deney liste'}`,
      ].join('\n'),
    }
  }
  throw new Error(`Bilinmeyen alt komut: sim ${sub}. Olanlar: kur, karne, varsayim, durum`)
}

/* ───────────── deney ───────────── */

function loadExperiments(): Experiment[] {
  const file = join(tvplusRoot(), 'content', 'experiments.json')
  if (!existsSync(file)) return []
  const r = zExperimentsFile.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!r.success) throw new Error(`content/experiments.json geçersiz: ${r.error.issues[0]?.message ?? ''}`)
  return r.data
}

const runName = (key: string): string => `deney-${key.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`

function parseFlags(text: string | undefined): Partial<Flags> {
  const out: Record<string, string> = {}
  for (const part of (text ?? '').split(',')) {
    const s = part.trim()
    if (!s) continue
    const eq = s.indexOf('=')
    const k = eq > 0 ? s.slice(0, eq).trim() : s
    const v = eq > 0 ? s.slice(eq + 1).trim() : ''
    if (!isFlagKey(k)) throw new Error(`Bilinmeyen bayrak: ${k}. Bayraklar: ${Object.keys(FLAGS).join(', ')}`)
    if (!isFlagValue(k, v))
      throw new Error(`'${k}' için geçersiz değer: ${v}. Değerler: ${FLAGS[k].values.join(' | ')}`)
    out[k] = v
  }
  return out as Partial<Flags>
}

/** --pay "kontrol=0.9,varyant=0.1" → kol adı → pay */
function parseWeights(text: string | undefined): Record<string, number> | undefined {
  if (!text) return undefined
  const out: Record<string, number> = {}
  for (const part of text.split(',')) {
    const eq = part.lastIndexOf('=')
    const w = eq > 0 ? Number(part.slice(eq + 1)) : NaN
    if (!(w > 0)) throw new Error(`--pay biçimi: "kol=0.9,kol=0.1" (verilen: ${part.trim()})`)
    out[part.slice(0, eq).trim()] = w
  }
  return out
}

async function runAndSave(ctx: CommandContext, a: Args, spec: SimExperimentSpec): Promise<CommandResult> {
  const p = prepare(ctx)
  const bridge = ensureBridge(ctx)
  // --ikiz verilmediyse ikiz sayısı katalog boyutuna göre seçilir (büyük katalogda kurulum yavaştır)
  if (flagNum(a, 'ikiz') === undefined) spec = { ...spec, twins: defaultTwins(bridge.titles.length) }
  const cal = freshCalibration(ctx.lab)
  if (!cal) ctx.progress('uyarı: güncel karne yok; varsayılan ayarlarla koşulacak (önce "sim karne" önerilir)')
  const run = await runSimExperiment(ctx.lab, p.d, p.def, p.hazard, cal, spec, ctx.progress)
  saveResult(ctx.lab, runName(spec.key), run, {
    dataRev: p.d.meta.dataRev,
    params: { days: spec.days, twins: spec.twins, seed: spec.seed },
  })
  return { text: formatExperiment(run, flagNum(a, 'limit')), json: run }
}

async function cmdExperiment(ctx: CommandContext, a: Args): Promise<CommandResult> {
  const { lab } = ctx
  const sub = a._[1] ?? 'liste'
  if (sub === 'liste') {
    const defs = loadExperiments()
    const lines: string[] = ['DENEYLER']
    lines.push(
      'uygulamadaki tanımlar (content/experiments.json) — simülasyonda çalıştırmak için: deney calistir <anahtar>',
    )
    lines.push(
      table(defs, [
        { h: 'anahtar', v: 'key' },
        { h: 'durum', v: 'status' },
        {
          h: 'kollar',
          v: (e) =>
            e.variants
              .map(
                (v) =>
                  `${v.key}${
                    Object.keys(v.flags).length
                      ? ` (${Object.entries(v.flags)
                          .map(([k, x]) => `${k}=${x}`)
                          .join(', ')})`
                      : ''
                  }`,
              )
              .join(' | '),
          max: 110,
        },
        { h: 'birincil', v: 'primaryMetric' },
      ]),
    )
    lines.push(
      `bayraklar: ${Object.entries(FLAGS)
        .map(([k, f]) => `${k} [${f.values.join('|')}]`)
        .join(' · ')}`,
    )
    lines.push(
      'tanım yazmadan denemek için: deney dene --bayrak home.pageRanker=personal [--hata 0.5] [--takilma 0.5] [--devam 1.2] [--arama-hata 0.7]',
    )
    if (loadMeta(lab)) {
      const real = listRealExperiments(lab, lab.settings.kAnonim)
      if (real.length) {
        lines.push('', 'veride görülen gerçek deneyler — çözümlemek için: deney gercek "<ad>"')
        lines.push(
          table(real, [
            { h: 'ad', v: 'name', max: 50 },
            { h: 'kollar', v: (e) => e.variants.map((v) => `${v.name} ${num(v.users)}`).join(' | '), max: 70 },
            { h: 'maruziyet', v: (e) => `${dayStr(e.firstDay)}…${dayStr(e.lastDay)}` },
          ]),
        )
      } else lines.push('', 'veride maruziyet olayı yok (gerçek deney çözümlemesi için eşlemede EXPOSURE türü gerekir)')
    }
    const runs = readdirSync(lab.resultDir)
      .filter((f) => f.startsWith('deney-') || f.startsWith('gercek-'))
      .map((f) => loadResult<ExperimentRun>(lab, f.replace(/\.json$/, '')))
      .filter((r): r is NonNullable<typeof r> => !!r)
    if (runs.length) {
      lines.push('', 'geçmiş koşular — deney sonuc <anahtar>')
      lines.push(
        table(runs, [
          { h: 'anahtar', v: (r) => r.data.key },
          { h: 'kaynak', v: (r) => r.data.source },
          { h: 'an', v: (r) => r.at.slice(0, 16).replace('T', ' ') },
          { h: 'karar', v: (r) => r.data.arms.map((x) => `${x.key}: ${x.decision}`).join(' | '), max: 70 },
        ]),
      )
    }
    lines.push(`ölçüler: ${METRICS.map((m) => m.key).join(', ')}`)
    return { text: lines.join('\n'), json: { definitions: defs } }
  }
  if (sub === 'calistir' || sub === 'çalıştır') {
    const key = a._[2]
    if (!key) throw new Error('Kullanım: deney calistir <anahtar> [--gun 28] [--ikiz 1500] [--tohum 1]')
    const def = loadExperiments().find((e) => e.key === key)
    if (!def) throw new Error(`Böyle bir deney tanımı yok: ${key}. Tanımlar: deney liste`)
    return runAndSave(
      ctx,
      a,
      specFromExperiment(def, { days: flagNum(a, 'gun'), twins: flagNum(a, 'ikiz'), seed: flagNum(a, 'tohum') }),
    )
  }
  if (sub === 'dene') {
    const treatment: Treatment = { flags: parseFlags(flagStr(a, 'bayrak')) }
    const err = flagNum(a, 'hata')
    const buf = flagNum(a, 'takilma')
    if (err !== undefined || buf !== undefined) treatment.env = { error: err, buffer: buf }
    const cont = flagNum(a, 'devam')
    const fail = flagNum(a, 'arama-hata')
    const sel = flagNum(a, 'secim')
    if (cont !== undefined || fail !== undefined || sel !== undefined)
      treatment.behavior = { continueRate: cont, searchFail: fail, select: sel }
    const changed =
      Object.keys(treatment.flags ?? {}).length > 0 ||
      err !== undefined ||
      buf !== undefined ||
      cont !== undefined ||
      fail !== undefined ||
      sel !== undefined
    if (!changed)
      throw new Error(
        'Bir değişiklik verin: --bayrak k=v[,k=v] (uygulama kodu) · --hata 0.5 --takilma 0.5 (ortam çarpanı) · --devam 1.2 --arama-hata 0.7 --secim 0.3 (davranış varsayımı)',
      )
    const key = flagStr(a, 'ad') ?? 'deneme'
    const primary = flagStr(a, 'olcu') ?? 'izleme_dk'
    if (!metricByKey(primary))
      throw new Error(`Bilinmeyen ölçü: ${primary}. Ölçüler: ${METRICS.map((m) => m.key).join(', ')}`)
    return runAndSave(ctx, a, {
      key,
      name: flagStr(a, 'baslik') ?? 'Tek değişiklik denemesi',
      days: flagNum(a, 'gun') ?? 28,
      twins: flagNum(a, 'ikiz') ?? 1500,
      seed: flagNum(a, 'tohum') ?? 1,
      arms: [
        { key: 'kontrol', name: 'Bugünkü davranış' },
        { key: 'varyant', name: 'Değişiklik', treatment },
      ],
      primaryMetric: primary,
      guardrails: ['bos_oturum', 'hata_orani', 'churn'].filter((g) => g !== primary),
    })
  }
  if (sub === 'sonuc' || sub === 'sonuç') {
    const key = a._[2]
    if (!key) throw new Error('Kullanım: deney sonuc <anahtar>')
    const r =
      loadResult<ExperimentRun>(lab, runName(key)) ?? loadResult<ExperimentRun>(lab, `gercek-${runName(key).slice(6)}`)
    if (!r) throw new Error(`'${key}' için kayıtlı koşu yok. Koşular: deney liste`)
    return { text: formatExperiment(r.data, flagNum(a, 'limit')), json: r.data }
  }
  if (sub === 'guc' || sub === 'güç') {
    const p = prepare(ctx)
    const t = powerTable(p.d, p.def, flagStr(a, 'olcu') ?? 'izleme_dk', {
      window: flagNum(a, 'pencere'),
      traffic: flagNum(a, 'trafik'),
    })
    return { text: formatPower(t), json: t }
  }
  if (sub === 'gercek' || sub === 'gerçek') {
    const name = a._[2]
    if (!name) {
      const real = listRealExperiments(lab, lab.settings.kAnonim)
      if (!real.length)
        return {
          text: 'Veride maruziyet olayı yok. Eşlemede deney maruziyeti olayını (ör. $experiment_started) EXPOSURE türüne eşleyin.',
        }
      return {
        text: [
          'VERİDEKİ GERÇEK DENEYLER — deney gercek "<ad>" [--pencere 14] [--kontrol <kol>]',
          table(real, [
            { h: 'ad', v: 'name', max: 50 },
            { h: 'kollar', v: (e) => e.variants.map((v) => `${v.name} ${num(v.users)}`).join(' | '), max: 70 },
            { h: 'maruziyet', v: (e) => `${dayStr(e.firstDay)}…${dayStr(e.lastDay)}` },
          ]),
        ].join('\n'),
        json: real,
      }
    }
    const p = prepare(ctx)
    const run = analyzeRealExperiment(lab, p.d, p.def, name, {
      window: flagNum(a, 'pencere'),
      control: flagStr(a, 'kontrol'),
      primaryMetric: flagStr(a, 'olcu'),
      weights: parseWeights(flagStr(a, 'pay')),
    })
    saveResult(lab, `gercek-${runName(name).slice(6)}`, run, { dataRev: p.d.meta.dataRev })
    return { text: formatExperiment(run, flagNum(a, 'limit')), json: run }
  }
  throw new Error(`Bilinmeyen alt komut: deney ${sub}. Olanlar: liste, calistir, dene, sonuc, guc, gercek`)
}

function cmdReport(ctx: CommandContext): CommandResult {
  const r = buildReport(ctx.lab)
  return {
    text: [
      `RAPOR YAZILDI · ${r.file}`,
      kv({ bölüm: r.sections.join(', '), boyut: `${num(r.bytes)} bayt` }),
      'tarayıcıda açılır; tek dosyadır (dışarıdan hiçbir şey yüklemez), kurum içinde paylaşılabilir. İçinde yalnız toplamlar vardır.',
    ].join('\n'),
    json: r,
  }
}

export const EXTRA_COMMANDS: ExtraCommands = {
  sim: cmdSim,
  deney: cmdExperiment,
  rapor: cmdReport,
}
