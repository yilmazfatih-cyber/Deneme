/**
 * Laboratuvar sonuç uçları (salt okunur): dizin, tek sonuç, ad doğrulaması (sonuç klasörünün dışına çıkılamaz), eksik
 * dosya, deney koşularının sırası, eksik klasör ve bozuk dosyalara dayanıklılık, stüdyo erişim koruması.
 * Sonuç dosyaları testin yazdığı küçük zarflardır; lab klasörü TVP_LAB_DIR ile geçici bir klasöre yönlendirilir.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../shared/constants'
import type { ExperimentArm, ExperimentRun, LabDataStatus, LabEnvelope, LabIndex } from '../../shared/lab'
import type { ExperimentRunSummary } from '../../shared/types'
import { createTestApp } from './helpers'

const BASE = `${ROUTES.STUDIO}/lab`
const REV = 'rev-0001'

const STATUS: LabDataStatus = {
  ready: true,
  synthetic: true,
  sample: 1,
  users: 120,
  events: 4800,
  userDays: 900,
  sessions: 1500,
  titles: 40,
  from: '2026-07-01',
  to: '2026-09-28',
  days: 90,
  dataRev: REV,
  builtAt: '2026-10-01T08:00:00.000Z',
  dims: ['cihaz', 'plan'],
  kinds: { PLAY_START: 2000, APP_OPEN: 1500 },
}

const envelope = <T>(name: string, at: string, data: T, params: Record<string, unknown> = {}): LabEnvelope<T> => ({
  name,
  at,
  dataRev: REV,
  params,
  data,
})

function run(p: Partial<ExperimentRun> & Pick<ExperimentRun, 'key' | 'at'>): ExperimentRun {
  const arm: ExperimentArm = {
    key: 'varyant',
    name: 'Değişiklik',
    n: 300,
    changes: ['bayrak home.pageRanker = personal'],
    metrics: [],
    decision: 'etkisiz',
    summary: 'Birincil ölçüde anlamlı fark görülmedi.',
  }
  return {
    name: `Deney ${p.key}`,
    source: 'simülasyon',
    design: 'ikiz evren',
    synthetic: true,
    days: 28,
    control: { key: 'kontrol', name: 'Bugünkü davranış', n: 300 },
    arms: [arm],
    fidelity: 0.84,
    srm: null,
    notes: [],
    caveats: [],
    seconds: 1.5,
    ...p,
  }
}

const RUN_OLD = run({ key: 'eski', at: '2026-10-01T09:00:00.000Z' })
const RUN_NEW = run({
  key: 'yeni',
  at: '2026-10-03T09:00:00.000Z',
  arms: [
    { ...run({ key: 'x', at: '' }).arms[0]!, key: 'a', decision: 'aday', summary: 'Birincil ölçü iyileşti.' },
    { ...run({ key: 'x', at: '' }).arms[0]!, key: 'b', decision: 'riskli', summary: 'Bir koruma ölçüsü bozuldu.' },
  ],
})
const RUN_REAL = run({
  key: 'anasayfa',
  at: '2026-10-02T09:00:00.000Z',
  source: 'gerçek',
  design: 'klasik bölme',
  days: 40,
  fidelity: null,
  srm: { p: 0.4, ok: true },
})

const ENVELOPES = {
  durum: envelope('durum', '2026-10-03T10:00:00.000Z', STATUS),
  churn: envelope('churn', '2026-10-01T08:30:00.000Z', { findings: [], caveats: ['ilişki ≠ nedensellik'] }, { n: 30 }),
  'deney-eski': envelope('deney-eski', RUN_OLD.at, RUN_OLD, { days: 28 }),
  'deney-yeni': envelope('deney-yeni', RUN_NEW.at, RUN_NEW),
  'gercek-anasayfa': envelope('gercek-anasayfa', RUN_REAL.at, RUN_REAL),
} as const

/** Geçici lab klasörü: geçerli zarflar + yok sayılması gereken dosyalar + sonuç klasörünün dışında bir "gizli" dosya. */
function writeLab(labDir: string): void {
  const dir = join(labDir, 'sonuc')
  mkdirSync(dir, { recursive: true })
  for (const [name, env] of Object.entries(ENVELOPES)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(env))
  writeFileSync(join(dir, 'bozuk.json'), '{ "name": "bozuk", ')
  writeFileSync(join(dir, 'zarf-degil.json'), JSON.stringify({ users: 3, checks: [] }))
  writeFileSync(join(dir, 'deney-bozuk.json'), 'JSON değil')
  writeFileSync(
    join(dir, 'deney-kosu-degil.json'),
    JSON.stringify(envelope('deney-kosu-degil', RUN_NEW.at, { key: 1 })),
  )
  writeFileSync(join(dir, 'Buyuk_Harf.json'), JSON.stringify(envelope('Buyuk_Harf', RUN_NEW.at, {})))
  writeFileSync(join(dir, 'notlar.txt'), 'sonuç değil')
  mkdirSync(join(dir, 'klasor.json'))
  writeFileSync(join(labDir, 'anahtar'), 'gizli-anahtar')
  writeFileSync(join(labDir, 'gizli.json'), JSON.stringify(envelope('gizli', RUN_NEW.at, { sizinti: true })))
}

describe('laboratuvar sonuç uçları', () => {
  const apps: FastifyInstance[] = []
  const temps: string[] = []
  const savedEnv = process.env.TVP_LAB_DIR
  let labDir = ''

  const tempDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'tvplus-lab-test-'))
    temps.push(d)
    return d
  }
  const createApp = async (overrides: Parameters<typeof createTestApp>[0] = {}): Promise<FastifyInstance> => {
    const app = await createTestApp(overrides)
    apps.push(app)
    return app
  }
  const get = (app: FastifyInstance, path: string) => app.inject({ method: 'GET', url: `${BASE}${path}` })

  beforeEach(() => {
    labDir = tempDir()
    writeLab(labDir)
    process.env.TVP_LAB_DIR = labDir
  })
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close()
    while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true })
    if (savedEnv === undefined) delete process.env.TVP_LAB_DIR
    else process.env.TVP_LAB_DIR = savedEnv
  })

  it('dizin: veri durumu ve ada göre sıralı sonuç listesi; bozuk ve zarf olmayan dosyalar yok sayılır', async () => {
    const res = await get(await createApp(), '')
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const index = res.json<LabIndex>()
    expect(index.ready).toBe(true)
    expect(index.status).toEqual(STATUS)
    expect(index.results).toEqual([
      { name: 'churn', at: ENVELOPES.churn.at, dataRev: REV },
      { name: 'deney-eski', at: RUN_OLD.at, dataRev: REV },
      { name: 'deney-kosu-degil', at: RUN_NEW.at, dataRev: REV },
      { name: 'deney-yeni', at: RUN_NEW.at, dataRev: REV },
      { name: 'durum', at: ENVELOPES.durum.at, dataRev: REV },
      { name: 'gercek-anasayfa', at: RUN_REAL.at, dataRev: REV },
    ])
  })

  it('dizin: durum.json yokken hazır değildir ama var olan sonuçlar listelenir; dataRev yoksa null', async () => {
    rmSync(join(labDir, 'sonuc', 'durum.json'))
    writeFileSync(join(labDir, 'sonuc', 'surumsuz.json'), JSON.stringify({ name: 'surumsuz', at: RUN_OLD.at, data: 1 }))
    const index = (await get(await createApp(), '')).json<LabIndex>()
    expect(index.ready).toBe(false)
    expect(index.status).toBeNull()
    expect(index.results.map((r) => r.name)).toContain('churn')
    expect(index.results.find((r) => r.name === 'surumsuz')).toEqual({
      name: 'surumsuz',
      at: RUN_OLD.at,
      dataRev: null,
    })
  })

  it('tek sonuç: zarf dosyadaki hâliyle döner', async () => {
    const app = await createApp()
    const res = await get(app, '/sonuc/churn')
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json()).toEqual(ENVELOPES.churn)
    expect((await get(app, '/sonuc/gercek-anasayfa')).json<LabEnvelope<ExperimentRun>>().data.srm).toEqual({
      p: 0.4,
      ok: true,
    })
  })

  it('tek sonuç: dosya değişince yeni içerik gelir (önbellek yok)', async () => {
    const app = await createApp()
    expect((await get(app, '/sonuc/churn')).json<LabEnvelope<unknown>>().at).toBe(ENVELOPES.churn.at)
    const next = { ...ENVELOPES.churn, at: '2026-10-05T00:00:00.000Z' }
    writeFileSync(join(labDir, 'sonuc', 'churn.json'), JSON.stringify(next))
    expect((await get(app, '/sonuc/churn')).json<LabEnvelope<unknown>>().at).toBe(next.at)
  })

  it('geçersiz ad 400 döner: klasör dışına çıkış, büyük harf, uzantı, baştaki tire, aşırı uzunluk', async () => {
    const app = await createApp()
    const bad = ['..%2Fanahtar', '..%2Fgizli', '%2E%2E%2Fgizli', 'Churn', 'churn.json', '-churn', 'a_b', 'a'.repeat(82)]
    for (const ad of bad) {
      const res = await get(app, `/sonuc/${ad}`)
      expect(res.statusCode, ad).toBe(400)
      expect(res.json().error.code, ad).toBe('VALIDATION_FAILED')
      expect(res.body, ad).not.toContain('sizinti')
      expect(res.body, ad).not.toContain('gizli-anahtar')
    }
    // Yol ayırıcı taşıyan adres uçla hiç eşleşmez (sonuç klasörünün dışı hiçbir biçimde okunmaz)
    const nested = await get(app, '/sonuc/../gizli')
    expect(nested.statusCode).toBeGreaterThanOrEqual(400)
    expect(nested.body).not.toContain('sizinti')
    // 81 karakter geçerlidir: dosya yoksa 404
    expect((await get(app, `/sonuc/${'a'.repeat(81)}`)).statusCode).toBe(404)
  })

  it('eksik ya da okunamayan dosya Türkçe iletiyle 404 döner', async () => {
    const app = await createApp()
    for (const ad of ['yok', 'bozuk', 'zarf-degil', 'klasor']) {
      const res = await get(app, `/sonuc/${ad}`)
      expect(res.statusCode, ad).toBe(404)
      expect(res.json().error.code, ad).toBe('LAB_RESULT_NOT_FOUND')
      expect(res.json().error.message, ad).toContain(`"${ad}" adlı bir laboratuvar sonucu yok`)
    }
  })

  it('deneyler: deney-* ve gercek-* koşularının özeti, en yeni önce; koşu olmayan dosyalar atlanır', async () => {
    const res = await get(await createApp(), '/deneyler')
    expect(res.statusCode).toBe(200)
    const runs = res.json<ExperimentRunSummary[]>()
    expect(runs.map((r) => r.name)).toEqual(['deney-yeni', 'gercek-anasayfa', 'deney-eski'])
    expect(runs[0]).toEqual({
      name: 'deney-yeni',
      key: 'yeni',
      title: 'Deney yeni',
      source: 'simülasyon',
      design: 'ikiz evren',
      at: RUN_NEW.at,
      days: 28,
      synthetic: true,
      fidelity: 0.84,
      arms: [
        { key: 'a', decision: 'aday', summary: 'Birincil ölçü iyileşti.' },
        { key: 'b', decision: 'riskli', summary: 'Bir koruma ölçüsü bozuldu.' },
      ],
    })
    expect(runs[1]).toMatchObject({
      key: 'anasayfa',
      source: 'gerçek',
      design: 'klasik bölme',
      days: 40,
      fidelity: null,
    })
  })

  it('lab klasörü yokken uçlar boş yanıt verir, hata fırlatmaz', async () => {
    process.env.TVP_LAB_DIR = join(tempDir(), 'hic-kurulmadi')
    const app = await createApp()
    expect((await get(app, '')).json<LabIndex>()).toEqual({ ready: false, status: null, results: [] })
    const runs = await get(app, '/deneyler')
    expect(runs.statusCode).toBe(200)
    expect(runs.json()).toEqual([])
    expect((await get(app, '/sonuc/churn')).statusCode).toBe(404)
  })

  it('TVP_LAB_DIR yokken lab klasörü <veri klasörü>/lab olur', async () => {
    delete process.env.TVP_LAB_DIR
    const dataDir = tempDir()
    const app = await createApp({ dataDir })
    expect((await get(app, '')).json<LabIndex>()).toEqual({ ready: false, status: null, results: [] })
    writeLab(join(dataDir, 'lab'))
    const index = (await get(app, '')).json<LabIndex>()
    expect(index.ready).toBe(true)
    expect(index.results).toHaveLength(6)
  })

  it('öteki stüdyo uçlarıyla aynı erişim kuralı: üye modunda oturumsuz istek 401 alır', async () => {
    const app = await createApp({ studioAccess: 'member' })
    for (const path of ['', '/deneyler', '/sonuc/churn']) {
      const res = await get(app, path)
      expect(res.statusCode, path).toBe(401)
      expect(res.json().error.code, path).toBe('UNAUTHENTICATED')
    }
  })
})
