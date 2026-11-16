/**
 * Deney (A/B) ve özellik bayrağı servisi: atama dağılımı ve trafik genişlemesi, DRAFT deneyin atama yapmaması,
 * stüdyodan durum geçersiz kılma, sabitleme (pin), çakışan RUNNING → 409, maruziyetin günde bir kez yazılması ve
 * tekil sayaç, stüdyo erişim reddi, `x-tvplus-flags` kuralı, açılış bağlamındaki flags / experiments.
 */
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADERS, ROUTES } from '../../shared/constants'
import {
  assignVariant,
  DEFAULT_FLAGS,
  type ExperimentInput,
  type ExperimentState,
  type ExperimentsResponse,
} from '../../shared/experiments'
import type { BootContext } from '../../shared/types'
import { evaluatePaths } from '../src/falcor/engine'
import type { AppConfig } from '../src/kernel/config'
import type { FalcorRouteContext, Passport } from '../src/kernel/context'
import { flagOverridesOf, parseFlagsHeader } from '../src/services/experiments/overrides'
import type { ExperimentsServiceInternal } from '../src/services/experiments/service'
import { ADULT, createAlanApp, fakeRequest, FIXTURE_CONTENT_DIR, passport } from './fixtures/alan'
import { createTestApp } from './helpers'

const EXPERIMENTS: ExperimentInput[] = [
  {
    key: 'esit',
    name: 'Top 10 kapalı mı',
    status: 'RUNNING',
    variants: [
      { key: 'kontrol', name: 'Kontrol' },
      { key: 'kapali', name: 'Kapalı', flags: { 'home.top10': 'off' } },
    ],
  },
  {
    key: 'taslak',
    name: 'Üç satır',
    status: 'DRAFT',
    variants: [
      { key: 'kontrol', name: 'Kontrol' },
      { key: 'uc', name: 'Üç', flags: { 'home.becauseRows': '3' } },
    ],
  },
  {
    key: 'cihaz',
    name: 'Önizleme kendiliğinden',
    status: 'RUNNING',
    unit: 'DEVICE',
    variants: [
      { key: 'kontrol', name: 'Kontrol' },
      { key: 'kapali', name: 'Kapalı', flags: { 'preview.autoplay': 'off' } },
    ],
  },
  {
    key: 'cakisan',
    name: 'Top 10 aşağıda',
    status: 'DRAFT',
    variants: [
      { key: 'kontrol', name: 'Kontrol' },
      { key: 'asagi', name: 'Aşağı', flags: { 'home.top10': 'low' } },
    ],
  },
]

/** Örnek içeriğin kopyası + experiments.json */
function contentWith(experiments: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-exp-content-'))
  cpSync(FIXTURE_CONTENT_DIR, dir, { recursive: true })
  writeFileSync(
    join(dir, 'experiments.json'),
    typeof experiments === 'string' ? experiments : JSON.stringify(experiments),
  )
  return dir
}

const svc = (app: FastifyInstance) => app.services.experiments as ExperimentsServiceInternal
const exposureEvents = (app: FastifyInstance) => app.services.events.stats().byName['experiment.exposure'] ?? 0
const stateOf = (app: FastifyInstance, key: string) =>
  svc(app)
    .state()
    .find((s) => s.definition.key === key)!

let app: FastifyInstance | null = null
afterEach(async () => {
  await app?.close()
  app = null
})

describe('deneyler: atama', () => {
  it('kollar ~eşit dağılır; trafik %10 → %50 çıkınca ilk %10 kolunu korur', () => {
    const e = {
      key: 'dagilim',
      traffic: 1,
      variants: [
        { key: 'a', name: 'A', weight: 1, flags: {} },
        { key: 'b', name: 'B', weight: 1, flags: {} },
        { key: 'c', name: 'C', weight: 1, flags: {} },
      ],
    }
    const units = Array.from({ length: 6000 }, (_, i) => `birim-${i}`)
    const counts: Record<string, number> = {}
    for (const u of units) {
      const v = assignVariant(e, u)!
      counts[v] = (counts[v] ?? 0) + 1
    }
    for (const v of ['a', 'b', 'c']) expect(Math.abs(counts[v]! / units.length - 1 / 3)).toBeLessThan(0.03)

    const at10 = new Map(units.map((u) => [u, assignVariant({ ...e, traffic: 0.1 }, u)]))
    const inside = [...at10].filter(([, v]) => v !== null)
    expect(inside.length / units.length).toBeGreaterThan(0.07)
    expect(inside.length / units.length).toBeLessThan(0.13)
    for (const [u, v] of inside) expect(assignVariant({ ...e, traffic: 0.5 }, u)).toBe(v)
  })

  it('DRAFT deney atama yapmaz; RUNNING deneyler birim türüne göre (profil yoksa yalnız cihaz deneyi)', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const withProfile = svc(app).resolve({ profileGuid: ADULT.guid, deviceId: 'dev-1' })
    expect(withProfile.assignments.map((a) => a.experiment).sort()).toEqual(['cihaz', 'esit'])
    const anon = svc(app).resolve({ profileGuid: null, deviceId: 'dev-1' })
    expect(anon.assignments.map((a) => a.experiment)).toEqual(['cihaz'])
    // cihaz deneyinin kolu cihaz kimliğine bağlıdır, profile değil
    expect(anon.assignments[0]).toEqual(withProfile.assignments.find((a) => a.experiment === 'cihaz'))
    // bayraklar kolların bayraklarıdır; DRAFT deneyin bayrağı varsayılan kalır
    for (const r of [withProfile, anon]) {
      expect(r.flags['home.becauseRows']).toBe('1')
      const cihaz = r.assignments.find((a) => a.experiment === 'cihaz')!
      expect(r.flags['preview.autoplay']).toBe(cihaz.variant === 'kapali' ? 'off' : 'on')
    }
    // geçersiz kılma en son uygulanır; tanınmayanlar atlanır
    const over = svc(app).resolve(
      { profileGuid: ADULT.guid, deviceId: 'dev-1' },
      { overrides: { 'home.top10': 'low', 'home.yok': 'x', 'home.rowRanker': 'hepsi' } },
    )
    expect(over.flags['home.top10']).toBe('low')
    expect(over.flags['home.rowRanker']).toBe('model')
  })

  it('dosya yok ya da bozuksa deney yok: varsayılan bayraklar, çökme yok', async () => {
    app = await createAlanApp({ contentDir: contentWith('{ bozuk') })
    expect(svc(app).definitions()).toEqual([])
    expect(svc(app).resolve({ profileGuid: ADULT.guid, deviceId: 'd' })).toEqual({
      flags: DEFAULT_FLAGS,
      assignments: [],
    })
    await app.close()
    app = await createAlanApp()
    expect(svc(app).definitions()).toEqual([])
  })
})

describe('deneyler: stüdyo', () => {
  it('GET: bayrak sözlüğü ve deney durumları', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const res = await app.inject({ method: 'GET', url: `${ROUTES.STUDIO}/experiments` })
    expect(res.statusCode).toBe(200)
    const body = res.json<ExperimentsResponse>()
    expect(body.flags.find((f) => f.key === 'home.top10')).toEqual({
      key: 'home.top10',
      values: ['top', 'low', 'off'],
      side: 'server',
      defaultValue: 'top',
    })
    expect(body.experiments.map((e) => e.definition.key)).toEqual(['esit', 'taslak', 'cihaz', 'cakisan'])
    expect(body.experiments[0]).toMatchObject({
      statusOverridden: false,
      exposures: { kontrol: 0, kapali: 0 },
      firstExposureAt: null,
    })
  })

  it('durum geçersiz kılma: DRAFT → RUNNING atama başlar; dosyadaki duruma dönünce geçersiz kılma kalkar', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const rev = svc(app).revision()
    const post = (key: string, status: unknown) =>
      app!.inject({ method: 'POST', url: `${ROUTES.STUDIO}/experiments/${key}/status`, payload: { status } })
    const run = await post('taslak', 'RUNNING')
    expect(run.statusCode).toBe(200)
    expect(run.json<ExperimentState>()).toMatchObject({ statusOverridden: true, definition: { status: 'RUNNING' } })
    expect(svc(app).revision()).toBeGreaterThan(rev)
    const r = svc(app).resolve({ profileGuid: ADULT.guid, deviceId: 'd' })
    expect(r.assignments.map((a) => a.experiment)).toContain('taslak')
    const back = await post('taslak', 'DRAFT')
    expect(back.json<ExperimentState>()).toMatchObject({ statusOverridden: false, definition: { status: 'DRAFT' } })
    // dosyada RUNNING olan deney duraklatılınca atama durur
    expect((await post('esit', 'PAUSED')).statusCode).toBe(200)
    expect(
      svc(app)
        .resolve({ profileGuid: ADULT.guid, deviceId: 'd' })
        .assignments.map((a) => a.experiment),
    ).toEqual(['cihaz'])
    expect((await post('yok', 'RUNNING')).statusCode).toBe(404)
    expect((await post('esit', 'BASLADI')).statusCode).toBe(400)
  })

  it('aynı bayrağı yöneten başka RUNNING deney varken RUNNING → 409 ve Türkçe ileti', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const res = await app.inject({
      method: 'POST',
      url: `${ROUTES.STUDIO}/experiments/cakisan/status`,
      payload: { status: 'RUNNING' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('CONFLICT')
    expect(res.json().error.message).toContain("'home.top10' bayrağını şu an")
    expect(stateOf(app, 'cakisan').definition.status).toBe('DRAFT')
    // diğeri durunca geçer
    await app.inject({ method: 'POST', url: `${ROUTES.STUDIO}/experiments/esit/status`, payload: { status: 'ENDED' } })
    const ok = await app.inject({
      method: 'POST',
      url: `${ROUTES.STUDIO}/experiments/cakisan/status`,
      payload: { status: 'RUNNING' },
    })
    expect(ok.statusCode).toBe(200)
  })

  it('sabitleme: birim kola sabitlenir, kaldırılınca özet atamaya döner; geçersiz kol/deney reddedilir', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const unit = { profileGuid: ADULT.guid, deviceId: 'd' }
    const natural = svc(app)
      .resolve(unit)
      .assignments.find((a) => a.experiment === 'esit')!.variant
    const other = natural === 'kontrol' ? 'kapali' : 'kontrol'
    const put = (payload: Record<string, unknown>) =>
      app!.inject({ method: 'PUT', url: `${ROUTES.STUDIO}/experiments/pins`, payload })
    expect((await put({ unitId: ADULT.guid, experiment: 'esit', variant: other })).statusCode).toBe(204)
    const pinned = svc(app).resolve(unit)
    expect(pinned.assignments.find((a) => a.experiment === 'esit')!.variant).toBe(other)
    expect(pinned.flags['home.top10']).toBe(other === 'kapali' ? 'off' : 'top')
    expect((await put({ unitId: ADULT.guid, experiment: 'esit', variant: null })).statusCode).toBe(204)
    expect(
      svc(app)
        .resolve(unit)
        .assignments.find((a) => a.experiment === 'esit')!.variant,
    ).toBe(natural)
    expect((await put({ unitId: ADULT.guid, experiment: 'esit', variant: 'yok' })).statusCode).toBe(400)
    expect((await put({ unitId: ADULT.guid, experiment: 'yok', variant: 'kontrol' })).statusCode).toBe(404)
    expect((await put({ unitId: '', experiment: 'esit', variant: 'kontrol' })).statusCode).toBe(400)
  })

  it('erişim: oturumsuz ve anahtarsız 401; oturumlu ama authURL yoksa yazma 403; anahtarla yazılır', async () => {
    app = await createTestApp({
      contentDir: contentWith(EXPERIMENTS),
      studioAccess: 'member',
      studioKey: 'gizli-anahtar',
    })
    const url = `${ROUTES.STUDIO}/experiments`
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
    expect(
      (await app.inject({ method: 'POST', url: `${url}/taslak/status`, payload: { status: 'RUNNING' } })).statusCode,
    ).toBe(401)
    expect((await app.inject({ method: 'PUT', url: `${url}/pins`, payload: {} })).statusCode).toBe(401)
    // üye oturumu (giriş) ama CSRF belirteci yok
    const login = await app.inject({ method: 'POST', url: ROUTES.LOGIN })
    const cookies = cookiesOf(login)
    expect((await app.inject({ method: 'GET', url, cookies })).statusCode).toBe(200)
    const csrf = await app.inject({
      method: 'POST',
      url: `${url}/taslak/status`,
      cookies,
      payload: { status: 'RUNNING' },
    })
    expect(csrf.statusCode).toBe(403)
    expect(csrf.json().error.code).toBe('CSRF')
    const keyed = await app.inject({
      method: 'POST',
      url: `${url}/taslak/status`,
      headers: { [HEADERS.STUDIO_KEY]: 'gizli-anahtar' },
      payload: { status: 'RUNNING' },
    })
    expect(keyed.statusCode).toBe(200)
  })
})

describe('deneyler: maruziyet', () => {
  it('aynı birim + deney + kol için İstanbul gününde bir olay; tekil sayaç kalıcı ve ham kimlik saklanmaz', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const s = svc(app)
    const unit = { profileGuid: ADULT.guid, deviceId: 'dev-1' }
    const { assignments } = s.resolve(unit)
    const esit = assignments.find((a) => a.experiment === 'esit')!
    const day1 = new Date('2026-11-13T09:00:00.000Z') // 12:00 İstanbul
    const day1Late = new Date('2026-11-13T20:59:00.000Z') // 23:59 İstanbul
    const day2 = new Date('2026-11-13T21:01:00.000Z') // ertesi gün 00:01 İstanbul

    s.expose(unit, [esit], day1)
    s.expose(unit, [esit], day1Late)
    expect(exposureEvents(app)).toBe(1)
    expect(stateOf(app, 'esit').exposures[esit.variant]).toBe(1)
    expect(stateOf(app, 'esit').firstExposureAt).toBe(day1.toISOString())

    s.expose(unit, [esit], day2)
    expect(exposureEvents(app)).toBe(2)
    // tekil birim: ertesi gün de aynı birim
    expect(stateOf(app, 'esit').exposures[esit.variant]).toBe(1)
    expect(stateOf(app, 'esit').lastExposureAt).toBe(day2.toISOString())

    // başka birim → sayaç artar
    const other = { profileGuid: 'PBASKA0000000000000X', deviceId: 'dev-2' }
    const otherEsit = s.resolve(other).assignments.find((a) => a.experiment === 'esit')!
    s.expose(other, [otherEsit], day2)
    const total = Object.values(stateOf(app, 'esit').exposures).reduce((a, b) => a + b, 0)
    expect(total).toBe(2)

    // olay gövdesi
    const ev = (app.services.events as unknown as { recent(n: number): { name: string; data: unknown }[] })
      .recent(10)
      .find((e) => e.name === 'experiment.exposure')!
    expect(ev.data).toEqual({ experiment: 'esit', variant: expect.any(String) })

    // RUNNING olmayan deney, bilinmeyen kol ve profilsiz PROFILE deneyi yazılmaz
    s.expose(unit, [{ experiment: 'taslak', variant: 'uc' }], day2)
    s.expose(unit, [{ experiment: 'esit', variant: 'yok' }], day2)
    s.expose({ profileGuid: null, deviceId: 'dev-3' }, [esit], day2)
    expect(exposureEvents(app)).toBe(3)

    // depo ham birim kimliği taşımaz
    const raw = JSON.stringify((s as unknown as { state(): unknown }).state())
    expect(raw).not.toContain(ADULT.guid)
  })

  it('Falcor: lolomo kurulunca istek başına bir kez yalnız sunucu bayrağı deneyleri; sabitlenmiş birim sayılmaz', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const run = (headers: Record<string, string> = {}, pp: Passport = passport(ADULT)) =>
      evaluatePaths(falcorCtx(app!, pp, headers), [
        ['lolomo', 'summary'],
        ['lolomo', { from: 0, to: 3 }, 'summary'],
        ['lolomoByCategory', 'shows', 'summary'],
      ])
    await run()
    expect(exposureEvents(app)).toBe(1) // 'esit' (sunucu); 'cihaz' istemci bayrağı → sunucu yazmaz
    expect(Object.values(stateOf(app, 'esit').exposures).reduce((a, b) => a + b, 0)).toBe(1)
    expect(Object.values(stateOf(app, 'cihaz').exposures).reduce((a, b) => a + b, 0)).toBe(0)
    // aynı gün yeniden → olay yok
    await run()
    expect(exposureEvents(app)).toBe(1)
    // başlıkla geçersiz kılınmış istek maruziyet yazmaz (yeni birim)
    const teen = { ...ADULT, guid: 'PYENI000000000000009' }
    await run({ [HEADERS.FLAGS]: 'home.top10=off' }, passport(teen))
    expect(exposureEvents(app)).toBe(1)
    // sabitlenmiş birim ölçüme girmez
    svc(app).setPin(teen.guid, 'esit', 'kapali')
    await run({}, passport(teen))
    expect(exposureEvents(app)).toBe(1)
  })

  it('Falcor: bayraklar lolomoya uygulanır (sabitleme ile Top 10 kapalı)', async () => {
    app = await createAlanApp({ contentDir: contentWith(EXPERIMENTS) })
    const contexts = async (headers: Record<string, string> = {}) => {
      const g = (
        await evaluatePaths(falcorCtx(app!, passport(ADULT), headers), [['lolomo', { from: 0, to: 20 }, 'summary']])
      ).jsonGraph
      const lists = g.lists as unknown as Record<string, { summary: { value?: { context: string } } }>
      return Object.values(lists).map((l) => l.summary.value?.context)
    }
    svc(app).setPin(ADULT.guid, 'esit', 'kontrol')
    expect((await contexts()).some((c) => c?.startsWith('top10'))).toBe(true)
    svc(app).setPin(ADULT.guid, 'esit', 'kapali')
    expect((await contexts()).some((c) => c?.startsWith('top10'))).toBe(false)
    // hata ayıklama başlığı kolun üstüne yazar
    expect((await contexts({ [HEADERS.FLAGS]: 'home.top10=top' })).some((c) => c?.startsWith('top10'))).toBe(true)
  })
})

describe('deneyler: x-tvplus-flags', () => {
  const member = passport(ADULT)
  const anon = passport(null, null)
  const cfg = (debugAccess: AppConfig['debugAccess']) => ({ debugAccess })
  const h = { [HEADERS.FLAGS]: 'home.top10=off;home.rowRanker=popularity; home.yok=1 ;preview.autoplay=belki' }

  it('ayrıştırma: geçerli çiftler, tanınmayanlar atlanır', () => {
    expect(parseFlagsHeader(h[HEADERS.FLAGS])).toEqual({ 'home.top10': 'off', 'home.rowRanker': 'popularity' })
    expect(parseFlagsHeader('')).toBeNull()
    expect(parseFlagsHeader('home.yok=1')).toBeNull()
    expect(parseFlagsHeader(undefined)).toBeNull()
  })

  it("yalnız debugAccess 'open' ya da 'member' + üye oturumunda", () => {
    expect(flagOverridesOf(h, cfg('open'), anon)).toEqual({ 'home.top10': 'off', 'home.rowRanker': 'popularity' })
    expect(flagOverridesOf(h, cfg('member'), member)).not.toBeNull()
    expect(flagOverridesOf(h, cfg('member'), anon)).toBeNull()
    expect(flagOverridesOf(h, cfg('off'), member)).toBeNull()
    expect(flagOverridesOf({}, cfg('open'), member)).toBeNull()
  })

  it('açılış bağlamı: üye modunda oturumsuz başlık yok sayılır, açık modda uygulanır', async () => {
    app = await createTestApp({ contentDir: contentWith(EXPERIMENTS), debugAccess: 'member' })
    const boot = (await app.inject({ method: 'GET', url: ROUTES.BOOT, headers: h })).json<BootContext>()
    expect(boot.flags['home.top10']).toBe('top')
    await app.close()
    app = await createTestApp({ contentDir: contentWith(EXPERIMENTS), debugAccess: 'open' })
    const open = (await app.inject({ method: 'GET', url: ROUTES.BOOT, headers: h })).json<BootContext>()
    expect(open.flags).toMatchObject({ 'home.top10': 'off', 'home.rowRanker': 'popularity' })
  })
})

describe('deneyler: açılış bağlamı', () => {
  it('profil yokken cihaz deneyleri; profil seçilince profilin atamaları ve bayrakları', async () => {
    app = await createTestApp({ contentDir: contentWith(EXPERIMENTS) })
    const login = await app.inject({ method: 'POST', url: ROUTES.LOGIN })
    expect(login.statusCode).toBe(200)
    const first = login.json<BootContext>()
    let cookies = cookiesOf(login)
    expect(first.flags).toBeDefined()
    if (!first.activeProfile) {
      expect(first.experiments.map((e) => e.experiment)).toEqual(['cihaz'])
      const sw = await app.inject({
        method: 'POST',
        url: ROUTES.PROFILE_SWITCH,
        cookies,
        payload: { guid: first.profiles[0]!.guid },
      })
      expect(sw.statusCode).toBe(200)
      cookies = { ...cookies, ...cookiesOf(sw) }
    }
    const boot = (await app.inject({ method: 'GET', url: ROUTES.BOOT, cookies })).json<BootContext>()
    expect(boot.activeProfile).not.toBeNull()
    const byKey = Object.fromEntries(boot.experiments.map((e) => [e.experiment, e]))
    expect(Object.keys(byKey).sort()).toEqual(['cihaz', 'esit'])
    expect(byKey.esit!.flags).toEqual(['home.top10'])
    expect(byKey.cihaz!.flags).toEqual(['preview.autoplay'])
    expect(boot.flags['home.top10']).toBe(byKey.esit!.variant === 'kapali' ? 'off' : 'top')
    expect(boot.flags['preview.autoplay']).toBe(byKey.cihaz!.variant === 'kapali' ? 'off' : 'on')
  })

  it('servis yoksa varsayılan bayraklar ve boş atama', async () => {
    app = await createTestApp({ contentDir: contentWith(EXPERIMENTS) })
    delete (app.services as Partial<typeof app.services>).experiments
    const boot = (await app.inject({ method: 'GET', url: ROUTES.BOOT })).json<BootContext>()
    expect(boot.flags).toEqual(DEFAULT_FLAGS)
    expect(boot.experiments).toEqual([])
  })
})

function cookiesOf(res: InjectResponse): Record<string, string> {
  return Object.fromEntries(res.cookies.filter((c) => c.value !== '').map((c) => [c.name, c.value]))
}

function falcorCtx(app: FastifyInstance, pp: Passport, headers: Record<string, string>): FalcorRouteContext {
  const req = { ...fakeRequest(), headers } as unknown as FastifyRequest
  return {
    req,
    passport: pp,
    services: app.services,
    config: app.config,
    flags: { webp: 'true', isTop10Supported: 'true', materialize: 'true', falcor_server: '0.1.0' },
  }
}
