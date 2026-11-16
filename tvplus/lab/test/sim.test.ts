/**
 * Simülasyon ve deney yürütücüsü, uçtan uca: sentetik dünya → içe alma → tablolar → churn → katalog köprüsü →
 * ikiz evren deneyi. Denetlenenler: A/A koşusu tam sıfır fark verir (evrenler yalıtılmış ve belirlenimci), bilinen bir
 * değişiklik (oynatma hatasını azaltmak) doğru yönde görülür, aynı şartname aynı sonucu verir; gerçek deney
 * çözümlemesi ve güç tablosu tutarlıdır.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChurnDefinition, ExperimentMetric, ExperimentRun } from '../../shared/lab'
import { METRICS } from '../src/ab/metrics'
import {
  analyzeRealExperiment,
  listRealExperiments,
  powerTable,
  runSimExperiment,
  type SimExperimentSpec,
} from '../src/ab/run'
import { loadChurnData, type ChurnData } from '../src/churn/data'
import { runDeep } from '../src/churn/deep'
import type { HazardModel } from '../src/churn/triggers'
import { buildReport } from '../src/cli/report'
import { openLab, saveResult, type Lab } from '../src/core/lab'
import { build } from '../src/data/build'
import { ingest } from '../src/data/ingest'
import { zLabMapping } from '../src/data/mapping'
import { buildBridge } from '../src/sim/bridge'
import { WORLD_MAPPING } from '../src/world/world'
import { writeWorld } from '../src/world/write'

const dir = mkdtempSync(join(tmpdir(), 'lab-sim-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let lab: Lab
let d: ChurnData
let def: ChurnDefinition
let hazard: HazardModel

const spec = (key: string, treatment: SimExperimentSpec['arms'][number]['treatment']): SimExperimentSpec => ({
  key,
  name: key,
  days: 10,
  twins: 160,
  seed: 3,
  arms: [
    { key: 'kontrol', name: 'Kontrol' },
    { key: 'varyant', name: 'Varyant', treatment },
  ],
  primaryMetric: 'izleme_dk',
  guardrails: ['bos_oturum', 'hata_orani', 'churn'],
})
const metric = (run: ExperimentRun, key: string): ExperimentMetric => {
  const m = run.arms[0].metrics.find((x) => x.key === key)
  if (!m) throw new Error(`ölçü yok: ${key}`)
  return m
}

beforeAll(async () => {
  const world = join(dir, 'dunya.jsonl.gz')
  await writeWorld(world, { users: 900, days: 100, seed: 11, end: '2026-11-10' })
  lab = openLab({ dir: join(dir, 'lab'), secret: 'sim-test' })
  await ingest(lab, [world], { mapping: zLabMapping.parse(WORLD_MAPPING), reset: true, synthetic: true })
  build(lab)
  d = loadChurnData(lab)
  const deep = runDeep(lab, { data: d, gbdt: false })
  if (!deep.hazard) throw new Error('risk modeli kurulamadı')
  def = deep.result.overview.definition
  hazard = deep.hazard
  buildBridge(lab, {})
}, 240_000)

describe('ikiz evren deneyi', () => {
  it('A/A: varyant kontrolle aynıysa her ölçüde fark tam sıfırdır', async () => {
    const run = await runSimExperiment(
      lab,
      d,
      def,
      hazard,
      null,
      spec('aa', { flags: { 'home.pageRanker': 'editorial' } }),
    )
    expect(run.source).toBe('simülasyon')
    expect(run.design).toBe('ikiz evren')
    expect(run.synthetic).toBe(true)
    expect(run.fidelity).toBeNull()
    expect(run.arms).toHaveLength(1)
    expect(run.arms[0].metrics.map((m) => m.key).sort()).toEqual(METRICS.map((m) => m.key).sort())
    for (const m of run.arms[0].metrics) {
      expect(m.diff, m.key).toBe(0)
      expect(m.verdict, m.key).toBe('belirsiz')
    }
    expect(run.arms[0].decision).toBe('etkisiz')
    expect(metric(run, 'izleme_dk').control).toBeGreaterThan(0)
  }, 120_000)

  it('oynatma hatasını beşte bire indirmek hata oranını düşürür, izlemeyi azaltmaz', async () => {
    const run = await runSimExperiment(lab, d, def, hazard, null, spec('kalite', { env: { error: 0.2, buffer: 0.2 } }))
    const err = metric(run, 'hata_orani')
    expect(err.control).toBeGreaterThan(0)
    expect(err.treatment).toBeLessThan(err.control * 0.6)
    // Küçük örneklemde anlamlılık şart değil; yön ve "iyi olma olasılığı" açık olmalı
    expect(err.probBetter).toBeGreaterThan(0.9)
    expect(err.verdict).not.toBe('kötü')
    expect(metric(run, 'izleme_dk').diff).toBeGreaterThanOrEqual(0)
    expect(metric(run, 'churn').treatment).toBeLessThanOrEqual(metric(run, 'churn').control)
    expect(run.arms[0].changes.join(' ')).toContain('oynatma hatası × 0.2')
    expect(['aday', 'etkisiz']).toContain(run.arms[0].decision)
  }, 120_000)

  it('aynı şartname aynı sonucu verir; bayrak değişikliği evrenleri ayrıştırır', async () => {
    const s = spec('siralama', { flags: { 'home.rowRanker': 'popularity', 'home.top10': 'off' } })
    const a = await runSimExperiment(lab, d, def, hazard, null, s)
    const b = await runSimExperiment(lab, d, def, hazard, null, s)
    const strip = (r: ExperimentRun): unknown =>
      r.arms.map((x) => x.metrics.map((m) => [m.key, m.control, m.treatment, m.p]))
    expect(strip(a)).toEqual(strip(b))
    // Ana sayfa gerçekten değişti: en az bir ölçü kıpırdamalı
    expect(a.arms[0].metrics.some((m) => m.diff !== 0)).toBe(true)
    for (const m of a.arms[0].metrics) {
      expect(m.p).toBeGreaterThanOrEqual(0)
      expect(m.p).toBeLessThanOrEqual(1)
      expect(m.pAdj).toBeGreaterThanOrEqual(m.role === 'birincil' ? m.p : m.p - 1e-12)
      if (m.relLo !== null && m.relHi !== null) expect(m.relLo).toBeLessThanOrEqual(m.relHi)
    }
  }, 180_000)

  it('tek kollu şartname reddedilir', async () => {
    const bad = { ...spec('tek', {}), arms: [{ key: 'kontrol', name: 'Kontrol' }] }
    await expect(runSimExperiment(lab, d, def, hazard, null, bad)).rejects.toThrow(/en az iki kol/)
  })
})

describe('gerçek deney ve güç', () => {
  it('veriye gömülü deney bulunur ve çözümlenir', () => {
    const real = listRealExperiments(lab, lab.settings.kAnonim)
    expect(real.map((x) => x.name)).toContain('anasayfa-kisisel-siralama')
    const exp = real.find((x) => x.name === 'anasayfa-kisisel-siralama')
    expect(exp?.variants.map((v) => v.name).sort()).toEqual(['control', 'personal'])
    const run = analyzeRealExperiment(lab, d, def, 'anasayfa-kisisel-siralama', {})
    expect(run.source).toBe('gerçek')
    expect(run.design).toBe('klasik bölme')
    expect(run.control.key).toBe('control')
    expect(run.arms[0].key).toBe('personal')
    expect(run.srm?.ok).toBe(true)
    // Kısa pencerede churn ölçülemez: tabloda olmamalı, notta söylenmeli
    expect(run.arms[0].metrics.find((m) => m.key === 'churn')).toBeUndefined()
    expect(run.notes.join(' ')).toContain('churn ölçülmedi')
    // Dünyanın gömülü etkisi: kişisel sıralama "bulma"yı kolaylaştırır → boş oturum payı düşer
    expect(metric(run, 'bos_oturum').diff).toBeLessThan(0)
  })

  it('olmayan deney adı anlaşılır hata verir', () => {
    expect(() => analyzeRealExperiment(lab, d, def, 'yok-boyle-deney', {})).toThrow(/adlı deney yok/)
  })

  it('güç tablosu: etki büyüdükçe gereken örneklem azalır, CUPED hiçbir zaman kötüleştirmez', () => {
    const t = powerTable(d, def, 'izleme_dk', { window: 14 })
    expect(t.eligible).toBeGreaterThan(100)
    expect(t.mde).toBeGreaterThan(0)
    expect(t.mdeCuped).toBeLessThanOrEqual(t.mde + 1e-12)
    for (let i = 1; i < t.rows.length; i++) expect(t.rows[i].perArm).toBeLessThan(t.rows[i - 1].perArm)
    for (const r of t.rows) expect(r.perArmCuped).toBeLessThanOrEqual(r.perArm)
    expect(t.durations.length).toBeGreaterThan(0)
    for (let i = 1; i < t.durations.length; i++)
      expect(t.durations[i].users).toBeGreaterThanOrEqual(t.durations[i - 1].users)
    // Trafik yarıya inerse görülebilen en küçük etki büyür (≈ √2 kat)
    const half = powerTable(d, def, 'izleme_dk', { window: 14, traffic: 0.5 })
    expect(half.mde / t.mde).toBeGreaterThan(1.3)
    expect(half.mde / t.mde).toBeLessThan(1.55)
    // churn: pencere churn süresinden kısa olamaz, süre tablosu yoktur
    const c = powerTable(d, def, 'churn', { window: 7 })
    expect(c.window).toBeGreaterThanOrEqual(def.n)
    expect(c.durations).toHaveLength(0)
    expect(() => powerTable(d, def, 'bos_oturum', {})).toThrow(/bölüm ölçüsü/)
    expect(() => powerTable(d, def, 'yok', {})).toThrow(/Bilinmeyen ölçü/)
  })
})

describe('HTML rapor', () => {
  it('tek dosyadır, dışarıdan hiçbir şey yüklemez ve eldeki sonuçları içerir', async () => {
    const run = await runSimExperiment(lab, d, def, hazard, null, spec('rapor', { env: { error: 0.5 } }))
    saveResult(lab, 'deney-rapor', run, { dataRev: d.meta.dataRev })
    const r = buildReport(lab)
    expect(r.sections).toEqual(['churn', 'deneyler'])
    const html = readFileSync(r.file, 'utf8')
    expect(r.bytes).toBe(Buffer.byteLength(html))
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('sentetik demo verisi')
    expect(html).toContain('Churn analizi')
    expect(html).toContain('deney-rapor'.replace('deney-', ''))
    // Kendi kendine yeter: betik, dış bağlantı, dış kaynak yok
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/<(img|link|iframe)\b/i)
    // Kullanıcı düzeyi veri yok: ham kimlik öneki ve takma kimlik sütun adları geçmez
    expect(html).not.toContain('sentetik-11-')
    expect(html).not.toMatch(/uid_(hi|lo)/)
  }, 120_000)
})
