/**
 * Afiş seçimi servisi (services/artwork/service.ts): yapışkanlık, deterministik keşif, öğrenmenin seçimi değiştirmesi,
 * sınırlı depolar, kapalı bayrak, profilsiz ve çocuk profilleri, üslup yakınlığının profil → topluluk → nötr sırası.
 * Katalog gerçek içerikten (content/titles, adaylar build-artwork-alternates ile yazılmış); saat ve kimlik sahte.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentTitle } from '../../shared/content-schema'
import type { AppConfig } from '../src/kernel/config'
import type { ProfileRecord } from '../src/kernel/context'
import type { AudienceService } from '../src/kernel/intelligence'
import type { IdentityService, Services } from '../src/kernel/services'
import {
  candidatesOf,
  clickRate,
  createArtworkService,
  exploreDraw,
  fnv1a,
  PART_CLICKS,
  PART_STYLE,
  STICKY_MS,
  styleAffinity,
  type ArtworkDeps,
} from '../src/services/artwork/service'
import { createTestApp } from './helpers'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

const T0 = Date.parse('2026-11-16T09:00:00.000Z')
const DAY = 86_400_000
/** Gerçek içerikte adayı olan başlıklar */
const SINTEL = 80010001
const TEARS = 80010002

const profileOf = (guid: string): ProfileRecord => ({
  guid,
  accountId: 'acc_test',
  name: guid,
  avatar: 'avatar-1.png',
  isKids: guid.startsWith('KID'),
  maturityLevel: guid.startsWith('KID') ? 40 : 110,
  language: 'tr',
})
/** Her guid geçerli bir profildir; 'KID' ile başlayanlar çocuk profili */
const anyIdentity: IdentityService = {
  getAccount: () => null,
  getProfile: (guid) => (guid.startsWith('YOK') ? null : profileOf(guid)),
  listProfiles: () => [],
  loginDevice: async () => {
    throw new Error('yok')
  },
  revokeDevice: () => {},
}

async function setup(overrides: Partial<AppConfig> = {}) {
  const app = await createTestApp({ artworkPersonalization: true, artworkEpsilon: 0, ...overrides })
  apps.push(app)
  app.services.identity = anyIdentity
  let now = T0
  const clock = {
    get: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
  const extra: Partial<Services> = {}
  const make = (opts: Partial<ArtworkDeps> = {}) =>
    createArtworkService({
      config: app.config,
      services: () => ({ ...app.services, ...extra }),
      now: clock.get,
      ...opts,
    })
  const title = (id: number) => app.services.catalog.getTitle(id)!
  return { app, clock, make, extra, title }
}

describe('afiş seçimi: saf yardımcılar', () => {
  it('üslup yakınlığı 0–1, özdeşte 1, eksik veride nötr 0.5', () => {
    const v = { bright: 0.4, sat: 0.3, colorful: 0.2, edges: 0.5 }
    expect(styleAffinity(v, v)).toBe(1)
    expect(styleAffinity(null, v)).toBe(0.5)
    expect(styleAffinity(v, null)).toBe(0.5)
    const far = styleAffinity(
      { bright: 0, sat: 0, colorful: 0, edges: 0 },
      { bright: 1, sat: 1, colorful: 1, edges: 1 },
    )
    expect(far).toBe(0)
  })

  it('tıklanma: Beta sonsal ortalaması (1 + t) / (2 + g); tıklama gösterimi aşamaz', () => {
    expect(clickRate(0, 0)).toBe(0.5)
    expect(clickRate(8, 2)).toBeCloseTo(0.3)
    expect(clickRate(1, 5)).toBeCloseTo(2 / 3)
  })

  it('keşif kararı deterministik ve oranı ε civarında', () => {
    expect(exploreDraw('P1', SINTEL, T0, 0.15, 3)).toBe(exploreDraw('P1', SINTEL, T0, 0.15, 3))
    expect(exploreDraw('P1', SINTEL, T0, 0, 3)).toBeNull()
    expect(exploreDraw('P1', SINTEL, T0, 1, 3)).not.toBeNull()
    let hits = 0
    for (let i = 0; i < 4000; i++) if (exploreDraw(`P${i}`, SINTEL, T0, 0.15, 3) !== null) hits++
    expect(hits / 4000).toBeGreaterThan(0.12)
    expect(hits / 4000).toBeLessThan(0.18)
    expect(fnv1a('a')).not.toBe(fnv1a('b'))
  })
})

describe('afiş seçimi: servis', () => {
  it('içerikteki adaylar okunur: varsayılan önce, görüntü özellikleri dolu', async () => {
    const { title } = await setup()
    const c = candidatesOf(title(TEARS))
    expect(c[0]).toMatchObject({ key: '', label: 'Varsayılan' })
    expect(c.length).toBeGreaterThanOrEqual(3)
    for (const x of c) expect(x.visual).not.toBeNull()
  })

  it('yapışkan: aynı profil + başlık 7 gün aynı çeşidi alır; sonra yeniden seçilir', async () => {
    const { make, clock } = await setup({ artworkEpsilon: 1 })
    const svc = make()
    const first = svc.pick('P1', TEARS)
    expect(first.mode).toBe('EXPLORE')
    clock.advance(3 * DAY)
    expect(svc.pick('P1', TEARS)).toEqual(first)
    clock.advance(STICKY_MS)
    // Yeni gün → yeni keşif çekilişi; dört günlük pencerede en az bir kez farklı aday çıkar
    const later = new Set<string>()
    for (let i = 0; i < 6; i++) {
      later.add(svc.pick('P1', TEARS).key)
      clock.advance(STICKY_MS)
    }
    expect(later.size).toBeGreaterThan(1)
  })

  it('yapışkan: atama depoya yazılır, yeniden başlatmada aynı kalır', async () => {
    const { make, app } = await setup({ artworkEpsilon: 1 })
    const a = make()
    const picks = [SINTEL, TEARS].map((id) => a.pick('P1', id))
    a.flush()
    const b = make({ config: { ...app.config, artworkEpsilon: 0 } })
    // Başka ε ile bile (atama yapışkan) aynı çeşit
    expect([SINTEL, TEARS].map((id) => b.pick('P1', id))).toEqual(picks)
  })

  it('keşif deterministik: aynı profil + başlık + gün → aynı aday (bağımsız örneklerde)', async () => {
    const one = await setup({ artworkEpsilon: 1 })
    const two = await setup({ artworkEpsilon: 1 })
    for (const g of ['P1', 'P2', 'P3', 'P4']) {
      const x = one.make().pick(g, TEARS)
      const y = two.make().pick(g, TEARS)
      expect(x).toEqual(y)
      expect(x.mode).toBe('EXPLORE')
      expect(x.reason).toMatch(/^Keşif: /)
    }
  })

  it('veri yokken varsayılan (DEFAULT); öğrenilen tıklanma seçimi değiştirir (PERSONAL)', async () => {
    const { make, clock } = await setup()
    const svc = make()
    expect(svc.pick('YENI1', TEARS)).toMatchObject({
      key: '',
      mode: 'DEFAULT',
      reason: 'Henüz veri yok: varsayılan görsel',
    })
    // Başka profiller: varsayılan gösterildi ama tıklanmadı, k2 gösterildi ve çok tıklandı
    for (let i = 0; i < 20; i++) {
      svc.record(`D${i}`, TEARS, 'impression', '')
      svc.record(`K${i}`, TEARS, 'impression', 'k2')
      if (i < 12) svc.record(`K${i}`, TEARS, 'click', 'k2')
    }
    const s = svc.score('YENI2', TEARS)
    const k2 = s.candidates.find((c) => c.key === 'k2')!
    expect(k2).toMatchObject({ impressions: 20, clicks: 12 })
    expect(k2.rate).toBeCloseTo(13 / 22)
    const pick = svc.pick('YENI2', TEARS)
    expect(pick).toMatchObject({ key: 'k2', mode: 'PERSONAL' })
    expect(pick.reason).toContain('tıklanma 0,59')
    // Eski atama (YENI1 → varsayılan) yapışkan; süre dolunca öğrenilene döner
    expect(svc.pick('YENI1', TEARS).key).toBe('')
    clock.advance(STICKY_MS + 1)
    expect(svc.pick('YENI1', TEARS)).toMatchObject({ key: 'k2', mode: 'PERSONAL' })
  })

  it('gösterim saatte bir kez sayılır; tıklama gösterimsiz gelirse gösterim de sayılır', async () => {
    const { make, clock } = await setup()
    const svc = make()
    svc.record('P1', SINTEL, 'impression', 'k2')
    svc.record('P1', SINTEL, 'impression', 'k2')
    svc.record('P1', SINTEL, 'click', 'k3')
    let c = svc.score('P1', SINTEL).candidates
    expect(c.find((x) => x.key === 'k2')).toMatchObject({ impressions: 1, clicks: 0 })
    expect(c.find((x) => x.key === 'k3')).toMatchObject({ impressions: 1, clicks: 1 })
    clock.advance(3_600_001)
    svc.record('P1', SINTEL, 'impression', 'k2')
    c = svc.score('P1', SINTEL).candidates
    expect(c.find((x) => x.key === 'k2')!.impressions).toBe(2)
  })

  it('olay çeşit bildirmezse profilin o anki atamasına yazılır', async () => {
    const { make } = await setup({ artworkEpsilon: 1 })
    const svc = make()
    const k = svc.pick('P1', TEARS).key
    svc.record('P1', TEARS, 'click')
    const c = svc.score('P1', TEARS).candidates.find((x) => x.key === k)!
    expect(c).toMatchObject({ impressions: 1, clicks: 1 })
  })

  it('üslup: profilin ilgilendiği başlıkların görselleri, yoksa topluluğunki, yoksa nötr', async () => {
    const { make, app, extra, title } = await setup()
    const svc = make()
    expect(svc.score('P1', TEARS).style).toBe('NEUTRAL')
    // Topluluk yedeği: ofProfile → topTitles
    const fakeAudience = {
      ofProfile: () => ({ communityId: 'c1', similarity: 0.9 }),
      topTitles: () => [{ titleId: SINTEL, lift: 2, reach: 0.5 }],
    } as unknown as AudienceService
    extra.audience = fakeAudience
    const viaCommunity = make().score('P2', TEARS)
    expect(viaCommunity).toMatchObject({ style: 'COMMUNITY', segment: 'c1' })
    const sintelDefault = title(SINTEL).artwork.visual
    for (const c of viaCommunity.candidates) expect(c.affinity).toBeCloseTo(styleAffinity(sintelDefault, c.visual), 6)
    // Profilin kendi ilgisi (listesi) topluluktan önce gelir
    app.services.progress.addToMyList('P3', 80030001)
    const own = make().score('P3', TEARS)
    expect(own.style).toBe('PROFILE')
    const bbb = title(80030001).artwork.visual
    for (const c of own.candidates) {
      expect(c.affinity).toBeCloseTo(styleAffinity(bbb, c.visual), 6)
      expect(c.score).toBeCloseTo(c.affinity + c.rate, 9)
    }
    // Topluluk kesiminde sayılan olay 'all' kesimini etkilemez
    make().record('P2', TEARS, 'impression', 'k1')
    extra.audience = undefined
    expect(
      make()
        .score('P9', TEARS)
        .candidates.every((c) => c.impressions === 0),
    ).toBe(true)
  })

  it('sınırlı depolar: atama, sayaç ve "görüldü" belleği üst sınırı aşmaz', async () => {
    const { make, title, app } = await setup({ artworkEpsilon: 1 })
    const svc = make({ limits: { assignments: 20, counters: 15, seen: 10 } })
    const ids = app.services.catalog
      .allTitles()
      .filter((t: ContentTitle) => t.artwork.alternates.length > 0)
      .map((t) => t.videoId)
    expect(ids.length).toBeGreaterThan(20)
    expect(title(ids[0]!).artwork.alternates.length).toBeGreaterThan(0)
    for (let p = 0; p < 4; p++)
      for (const id of ids) {
        svc.pick(`P${p}`, id)
        svc.record(`P${p}`, id, 'impression')
        svc.record(`P${p}`, id, 'click')
      }
    const s = svc.sizes()
    expect(s.assignments).toBeLessThanOrEqual(20)
    expect(s.counters).toBeLessThanOrEqual(15)
    expect(s.seen).toBeLessThanOrEqual(10)
    // Kalanlar yine çalışır
    expect(svc.pick('P0', ids[0]!).mode).toBe('EXPLORE')
  })

  it('kapalı bayrak: hep varsayılan, olaylar sayılmaz', async () => {
    const { make } = await setup({ artworkPersonalization: false, artworkEpsilon: 1 })
    const svc = make()
    expect(svc.enabled()).toBe(false)
    expect(svc.pick('P1', TEARS)).toEqual({ key: '', mode: 'DEFAULT', reason: 'Afiş seçimi kapalı' })
    svc.record('P1', TEARS, 'click', 'k2')
    expect(svc.sizes()).toEqual({ assignments: 0, counters: 0, seen: 0 })
  })

  it('profilsiz istek, çocuk profili, bilinmeyen profil, bölüm ve adaysız başlık: varsayılan', async () => {
    const { make, app } = await setup({ artworkEpsilon: 1 })
    const svc = make()
    expect(svc.pick(null, TEARS)).toMatchObject({ key: '', mode: 'DEFAULT' })
    expect(svc.pick('KID1', TEARS)).toEqual({
      key: '',
      mode: 'DEFAULT',
      reason: 'Çocuk profili: görsel kişiselleştirilmez',
    })
    expect(svc.pick('YOK1', TEARS).mode).toBe('DEFAULT')
    svc.record('KID1', TEARS, 'click', 'k2')
    expect(svc.sizes().counters).toBe(0)
    const show = app.services.catalog.allTitles().find((t) => t.type === 'SHOW' && t.artwork.alternates.length > 0)!
    const ep = app.services.catalog.episodeIds(show.videoId)[0]!
    expect(svc.pick('P1', ep)).toMatchObject({ key: '', mode: 'DEFAULT' })
    const plain = app.services.catalog.allTitles().find((t) => t.artwork.alternates.length === 0)!
    expect(svc.pick('P1', plain.videoId)).toEqual({ key: '', mode: 'DEFAULT', reason: 'Bu başlığın tek görseli var' })
  })

  it('açıklama: tüm adaylar, bileşenler, sayaçlar ve tek seçilen', async () => {
    const { make } = await setup()
    const svc = make()
    svc.record('P5', SINTEL, 'impression', 'k3')
    svc.record('P5', SINTEL, 'click', 'k3')
    const x = svc.explain('P1', SINTEL)!
    expect(x).toMatchObject({ titleId: SINTEL, title: 'Sintel', type: 'MOVIE' })
    expect(x.candidates.map((c) => c.key)).toEqual(['', 'k2', 'k3'])
    expect(x.candidates.filter((c) => c.chosen)).toHaveLength(1)
    expect(x.candidates.find((c) => c.chosen)!.key).toBe(svc.pick('P1', SINTEL).key)
    for (const c of x.candidates) {
      expect(c.parts.map((p) => p.name)).toEqual([PART_STYLE, PART_CLICKS])
      expect(c.score).toBeCloseTo(c.parts[0]!.value + c.parts[1]!.value, 3)
      expect(c.url).toMatch(/^\/img\/v1\/story_art\/480x270\//)
    }
    expect(x.candidates[2]).toMatchObject({ impressions: 1, clicks: 1 })
    expect(x.candidates[2]!.url).toContain(encodeURIComponent(`Video:${SINTEL}`) + '~k3')
    expect(svc.explain('P1', 1)).toBeNull()
    expect(svc.summary('P1')).toEqual({ segment: 'all', impressions: 1, clicks: 1 })
  })
})
