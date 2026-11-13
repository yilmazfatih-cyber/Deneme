/**
 * Mixpanel bağdaştırıcısı ve veri kaynakları uçları (docs/MIXPANEL.md; tel sözleşmesi shared/intelligence.ts):
 *   GET    /api/studio/sources                      → SourcesResponse
 *   POST   /api/studio/sources/mixpanel/import      ham dışa aktarım gövdesi (JSONL / gzip, akış; ≤ 1 GB) → ImportReport
 *                                                   ?dryRun=1 → depoya yazmadan rapor
 *   POST   /api/studio/sources/mixpanel/pull        { from, to } → ImportReport (kimlik bilgileri ortamdan)
 *   GET    /api/studio/sources/mixpanel/mapping     → geçerli eşleme (başlık x-tvplus-mapping-origin: override|repo|builtin)
 *   PUT    /api/studio/sources/mixpanel/mapping     → doğrulanmış eşleme sunucu deposuna yazılır (depodaki dosyanın önüne geçer)
 *   POST   /api/studio/sources/synthetic/generate   { viewers?, days?, seed? } → ImportReport (SENTETİK kaynak yenilenir)
 *   DELETE /api/studio/sources/:source              → 204
 * İçe aktarmalar sıraya alınır (aynı anda bir tane). Depo boşsa ve `config.sampleViewing` açıksa açılıştan sonra
 * arka planda SENTETİK örnek üretilir (açılışı bekletmez).
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import type { Dispatcher } from 'undici'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import type { ImportReport, SourcesResponse, ViewingSource } from '../../../../shared/intelligence'
import { zMixpanelMapping, type MixpanelMapping } from '../../../../shared/mixpanel-mapping'
import { httpError } from '../../gateway/errors'
import { assertStudioWrite } from '../../kernel/intelligence'
import { viewingInternals } from '../viewing/plugin'
import { VIEWING_SOURCES } from '../viewing/store'
import {
  DEFAULT_MAX_IMPORT_BYTES,
  ImportAbortedError,
  ImportFormatError,
  ImportTooLargeError,
  importMixpanelExport,
} from './importer'
import { compileMapping, describeMappingError, loadEffectiveMapping, mappingPaths } from './mapping'
import { MixpanelPullError, pullExport, validateRange } from './pull'
import { generateSyntheticExport, istanbulToday, SYNTHETIC_LIMITS, SYNTHETIC_MAPPING } from './synthetic'

/** Testlerin değiştirebildiği iç bağımlılıklar. */
export interface MixpanelInternals {
  /** Dışa aktarım API'si adresi (testlerde yerel sahte sunucu); null → bölge adresi */
  exportBaseUrl: string | null
  dispatcher: Dispatcher | undefined
  backoffMs: number
  sleep: ((ms: number) => Promise<void>) | undefined
  /** İçe aktarma gövde sınırı (bayt) */
  maxImportBytes: number
  /** Açılıştaki örnek üretimi bitince çözülür (yoksa hemen) */
  bootSample: Promise<ImportReport | null>
}
const internalsByApp = new WeakMap<FastifyInstance, MixpanelInternals>()
export function mixpanelInternals(app: FastifyInstance): MixpanelInternals {
  const i = internalsByApp.get(app)
  if (!i) throw new Error('Mixpanel eklentisi bu uygulamada kurulmamış')
  return i
}

export const DEFAULT_SAMPLE = { viewers: 1500, days: 90, seed: 7 } as const

const zSyntheticBody = z
  .object({
    viewers: z.number().int().min(1).max(SYNTHETIC_LIMITS.maxViewers).optional(),
    days: z.number().int().min(1).max(SYNTHETIC_LIMITS.maxDays).optional(),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 31 - 1)
      .optional(),
  })
  .strict()

const P = `${ROUTES.STUDIO}/sources`

export default async function mixpanelPlugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const overrideMappingFile = mappingPaths(config.dataDir, config.contentDir).override
  const internals: MixpanelInternals = {
    exportBaseUrl: null,
    dispatcher: undefined,
    backoffMs: 2000,
    sleep: undefined,
    maxImportBytes: DEFAULT_MAX_IMPORT_BYTES,
    bootSample: Promise.resolve(null),
  }
  internalsByApp.set(app, internals)

  /** Geçerli eşleme: sunucu deposundaki → depodaki dosya → yerleşik (sentetikle aynı); her istekte okunur */
  const effectiveMapping = () =>
    loadEffectiveMapping(mappingPaths(config.dataDir, config.contentDir), SYNTHETIC_MAPPING, (m) => app.log.warn(m))

  // İçe aktarmalar sırayla
  let chain: Promise<unknown> = Promise.resolve()
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }
  let stopping = false
  const abort = new AbortController()

  function baseContext(source: ViewingSource, mapping: MixpanelMapping) {
    const vi = viewingInternals(app)
    return {
      source,
      mapping: compileMapping(mapping),
      resolver: vi.resolver(),
      viewerKey: vi.viewerKey,
      eventKey: vi.eventKey,
      sink: vi.store,
      signal: abort.signal,
    }
  }

  async function generateSynthetic(opts: { viewers: number; days: number; seed: number }): Promise<ImportReport> {
    const vi = viewingInternals(app)
    vi.store.clear('SYNTHETIC')
    const lines = generateSyntheticExport(
      app.services.catalog.allTitles(),
      { ...opts, end: istanbulToday() },
      () => stopping,
    )
    const report = await importMixpanelExport(lines, baseContext('SYNTHETIC', SYNTHETIC_MAPPING))
    vi.store.recordImport(report)
    return report
  }

  /** Bilinen hataları API hatasına çevirir */
  function rethrow(err: unknown): never {
    if (err instanceof ImportTooLargeError) throw httpError(413, 'PAYLOAD_TOO_LARGE', err.message)
    if (err instanceof ImportFormatError) throw httpError(400, 'INVALID_EXPORT', err.message)
    if (err instanceof ImportAbortedError) throw httpError(503, 'SHUTTING_DOWN', err.message)
    if (err instanceof MixpanelPullError) throw httpError(err.status, err.code, err.message)
    throw err
  }

  /* ───────── uçlar ───────── */

  app.get(P, async (): Promise<SourcesResponse> => {
    const vi = viewingInternals(app)
    const mp = config.mixpanel
    return {
      sources: vi.store.sources(),
      mixpanel: {
        configured: Boolean(mp.serviceAccountUsername && mp.serviceAccountSecret && mp.projectId),
        region: mp.region,
        mappedEvents: Object.keys(effectiveMapping().mapping.events),
      },
    }
  })

  // Ham gövde akış olarak okunur: bu alt bağlamda gövde ayrıştırıcıları kaldırılır, her tür akış olarak gelir.
  await app.register(async (sub) => {
    sub.removeAllContentTypeParsers()
    sub.addContentTypeParser('*', (_req, payload, done) => done(null, payload))
    sub.post(
      `${P}/mixpanel/import`,
      { bodyLimit: DEFAULT_MAX_IMPORT_BYTES },
      async (req, reply): Promise<ImportReport> => {
        assertStudioWrite(req, config)
        const body = req.body as Readable | undefined
        const q = (req.query ?? {}) as Record<string, unknown>
        const dryRun = q.dryRun === '1' || q.dryRun === 'true'
        const input: AsyncIterable<Buffer> = body ?? (async function* () {})()
        try {
          const report = await exclusive(() =>
            importMixpanelExport(input, {
              ...baseContext('MIXPANEL', effectiveMapping().mapping),
              dryRun,
              maxBytes: internals.maxImportBytes,
            }),
          )
          if (!dryRun) viewingInternals(app).store.recordImport(report)
          app.log.info(
            `Mixpanel içe aktarımı${dryRun ? ' (deneme)' : ''}: ${report.lines} satır, ${report.accepted} kabul, ${report.duplicates} yinelenen, ${report.rejected} reddedilen`,
          )
          return report
        } catch (err) {
          // Okunmayan gövde atılır; yanıttan sonra bağlantı kapanır (yarım kalmış büyük yüklemeyi beklemeyiz)
          reply.header('connection', 'close')
          body?.resume()
          return rethrow(err)
        }
      },
    )
  })

  app.post(`${P}/mixpanel/pull`, async (req): Promise<ImportReport> => {
    assertStudioWrite(req, config)
    const b = (req.body ?? {}) as Record<string, unknown>
    const bad = validateRange(b.from, b.to)
    if (bad) throw httpError(400, 'INVALID_RANGE', bad)
    const from = b.from as string
    const to = b.to as string
    const mp = config.mixpanel
    if (!mp.serviceAccountUsername || !mp.serviceAccountSecret || !mp.projectId)
      throw httpError(
        501,
        'MIXPANEL_NOT_CONFIGURED',
        'Mixpanel servis hesabı sunucuda tanımlı değil: MIXPANEL_SERVICE_ACCOUNT_USERNAME, MIXPANEL_SERVICE_ACCOUNT_SECRET ve MIXPANEL_PROJECT_ID ortam değişkenlerini ayarlayın.',
      )
    if (config.offline && !internals.exportBaseUrl)
      throw httpError(503, 'OFFLINE', 'Sunucu çevrimdışı kipte (TVP_OFFLINE=1); Mixpanel çekilemez.')
    try {
      const report = await exclusive(() =>
        importMixpanelExport(
          pullExport({
            from,
            to,
            region: mp.region,
            username: mp.serviceAccountUsername!,
            secret: mp.serviceAccountSecret!,
            projectId: mp.projectId!,
            baseUrl: internals.exportBaseUrl,
            dispatcher: internals.dispatcher,
            backoffMs: internals.backoffMs,
            sleep: internals.sleep,
            signal: abort.signal,
          }),
          { ...baseContext('MIXPANEL', effectiveMapping().mapping), range: { from, to } },
        ),
      )
      viewingInternals(app).store.recordImport(report)
      app.log.info(`Mixpanel çekimi ${from}…${to}: ${report.accepted} kabul, ${report.duplicates} yinelenen`)
      return report
    } catch (err) {
      return rethrow(err)
    }
  })

  app.get(`${P}/mixpanel/mapping`, async (_req, reply) => {
    const m = effectiveMapping()
    reply.header('x-tvplus-mapping-origin', m.origin)
    return m.mapping
  })

  app.put(`${P}/mixpanel/mapping`, async (req) => {
    assertStudioWrite(req, config)
    const r = zMixpanelMapping.safeParse(req.body)
    if (!r.success) throw httpError(400, 'INVALID_MAPPING', `Eşleme geçersiz: ${describeMappingError(r.error)}`)
    mkdirSync(join(config.dataDir, 'viewing'), { recursive: true })
    const tmp = `${overrideMappingFile}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify(r.data, null, 2)}\n`)
    renameSync(tmp, overrideMappingFile)
    app.log.info(`Mixpanel eşlemesi güncellendi (${Object.keys(r.data.events).length} olay)`)
    return r.data
  })

  app.post(`${P}/synthetic/generate`, async (req): Promise<ImportReport> => {
    assertStudioWrite(req, config)
    const r = zSyntheticBody.safeParse(req.body ?? {})
    if (!r.success) throw httpError(400, 'INVALID_BODY', `Geçersiz istek: ${describeMappingError(r.error)}`)
    try {
      return await exclusive(() =>
        generateSynthetic({
          viewers: r.data.viewers ?? DEFAULT_SAMPLE.viewers,
          days: r.data.days ?? DEFAULT_SAMPLE.days,
          seed: r.data.seed ?? DEFAULT_SAMPLE.seed,
        }),
      )
    } catch (err) {
      return rethrow(err)
    }
  })

  app.delete(`${P}/:source`, async (req, reply) => {
    assertStudioWrite(req, config)
    const source = String((req.params as Record<string, unknown>).source ?? '').toUpperCase()
    if (!VIEWING_SOURCES.includes(source as ViewingSource))
      throw httpError(404, 'NOT_FOUND', `Bilinmeyen kaynak: ${source.slice(0, 20)}`)
    await exclusive(async () => viewingInternals(app).store.clear(source as ViewingSource))
    app.log.info(`İzleme verisi kaynağı silindi: ${source}`)
    return reply.code(204).send()
  })

  /* ───────── açılışta sentetik örnek ───────── */
  app.addHook('onReady', async () => {
    if (!config.sampleViewing || !viewingInternals(app).store.isEmpty()) return
    // Açılışı bekletmemek için arka planda; sonuç internals.bootSample'da
    internals.bootSample = new Promise<ImportReport | null>((resolve) => {
      setImmediate(() => {
        if (stopping) return resolve(null)
        const t0 = Date.now()
        app.log.info(
          `İzleme deposu boş: SENTETİK örnek üretiliyor (${DEFAULT_SAMPLE.viewers} izleyici, ${DEFAULT_SAMPLE.days} gün, tohum ${DEFAULT_SAMPLE.seed})…`,
        )
        exclusive(() => generateSynthetic({ ...DEFAULT_SAMPLE }))
          .then((report) => {
            app.log.info(
              `SENTETİK örnek hazır: ${report.accepted} olay, ${Date.now() - t0} ms (gerçek veri gelince analiz dışı kalır)`,
            )
            resolve(report)
          })
          .catch((err: unknown) => {
            if (!(err instanceof ImportAbortedError)) app.log.warn({ err }, 'SENTETİK örnek üretilemedi')
            resolve(null)
          })
      })
    })
  })

  app.addHook('onClose', async () => {
    stopping = true
    abort.abort()
    await internals.bootSample
    await chain
  })
}
