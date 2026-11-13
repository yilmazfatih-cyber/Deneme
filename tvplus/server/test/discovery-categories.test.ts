/**
 * Keşif — ikinci tur: lolomoByCategory (home | shows | movies | newPopular), tür Top 10'ları, `videos[id].tags`,
 * türe göre `top10Rank`, açılış tohumunda `lolomoByCategory.home` ve etiketler.
 */
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BootContext, FalcorPath, JsonGraph } from '../../shared/types'
import { evaluatePaths } from '../src/falcor/engine'
import type { FalcorRouteContext, Passport } from '../src/kernel/context'
import { textEvidenceOf } from '../src/services/catalog/present'
import { buildLolomo, profileHash, type LolomoCategory } from '../src/services/discovery/lolomo'
import { top10ForType } from '../src/services/discovery/top10'
import { localDayNumber } from '../src/services/epg/time'
import {
  ADULT,
  createAlanApp,
  fakeRequest,
  FIXTURE_CONTENT_DIR,
  ID,
  KID,
  passport,
  TEEN,
  TEST_NOW,
} from './fixtures/alan'
import { installEmptyIntelligence } from './fixtures/intelligence'
import { createTestApp } from './helpers'

const FLAGS = { webp: 'true', isTop10Supported: 'true', materialize: 'true', falcor_server: '0.1.0' }
const EXTRA_MOVIES = [80090001, 80090002, 80090003]
const EXTRA_SHOWS = [80091000, 80092000, 80093000, 80094000, 80095000]

/** Örnek içeriğe 3 animasyon filmi ve 5 dizi ekler (tür satırları ve tür Top 10'ları dolsun diye). */
function extendedContent(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-kategori-'))
  cpSync(FIXTURE_CONTENT_DIR, dir, { recursive: true })
  const movie = (videoId: number, i: number) => ({
    videoId,
    slug: `ek-film-${i}`,
    type: 'MOVIE',
    title: `Ek Film ${i}`,
    year: 2020 + i,
    synopsis: 'Kısa bir animasyon filmi.',
    shortSynopsis: 'Kısa bir animasyon.',
    genres: ['animasyon'],
    moods: ['duygusal', 'sakin'],
    directors: [],
    creators: [],
    maturity: { rating: '7+' },
    runtimeSec: 600,
    sources: [{ type: 'DASH', manifest: `https://media.example.org/ek${i}/manifest.mpd`, timedText: [] }],
    artwork: { boxart: null, storyArt: null },
    license: { name: 'CC BY 3.0', attribution: 'Örnek' },
    availability: { addedAt: `2026-0${i + 2}-01` },
    popularity: 30 + i,
  })
  const show = (videoId: number, i: number) => ({
    videoId,
    slug: `ek-dizi-${i}`,
    type: 'SHOW',
    title: `Ek Dizi ${i}`,
    year: 2021,
    synopsis: 'Kısa bölümlü bir dizi.',
    shortSynopsis: 'Kısa bölümlü dizi.',
    genres: ['animasyon', 'komedi', 'cocuk-aile'],
    moods: ['eglenceli', 'aile-boyu'],
    directors: [],
    creators: [],
    maturity: { rating: 'GENEL' },
    kids: true,
    seasons: [
      {
        number: 1,
        episodes: [1, 2].map((n) => ({
          videoId: videoId + n,
          number: n,
          title: `Bölüm ${n}`,
          synopsis: 'Bölüm özeti.',
          runtimeSec: 300,
          sources: [{ type: 'YOUTUBE', videoId: `ek${i}x${n}abcdefg`.slice(0, 11) }],
        })),
      },
    ],
    artwork: { boxart: null, storyArt: null },
    license: { name: 'CC BY 3.0', attribution: 'Örnek' },
    availability: { addedAt: '2026-05-01' },
    popularity: 20 + i,
  })
  writeFileSync(
    join(dir, 'titles', 'ek.json'),
    JSON.stringify([...EXTRA_MOVIES.map((id, i) => movie(id, i + 1)), ...EXTRA_SHOWS.map((id, i) => show(id, i + 1))]),
  )
  return dir
}

describe('kategori lolomoları', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createAlanApp({ contentDir: extendedContent() })
    installEmptyIntelligence(app) // bugünkü satırlar; içerik zekâsı satırları discovery-intelligence.test.ts'te
  })
  afterAll(async () => {
    await app.close()
  })
  const build = (category: LolomoCategory, profile = ADULT, top10Supported = true) =>
    buildLolomo(app.services, profile, { top10Supported, now: TEST_NOW, category })
  const typeOf = (id: number) => app.services.catalog.getTitle(id)?.type

  it('ek içerik yüklendi', () => {
    for (const id of [...EXTRA_MOVIES, ...EXTRA_SHOWS])
      expect(app.services.catalog.getTitle(id), String(id)).not.toBeNull()
  })

  it('Diziler: vitrin, Top 10 dizi, ≥ 4 başlıklı tür satırları, yeni gelenler — hepsi dizi', () => {
    const l = build('shows')
    expect(l.category).toBe('shows')
    expect(l.lists.map((x) => x.context)).toEqual(['billboard', 'top10Shows', 'genre', 'genre', 'genre', 'newReleases'])
    expect(l.lists[0]!.videoIds).toEqual([ID.caminandes]) // vitrin adaylarından tek dizi
    expect(l.lists.map((x) => x.displayName)).toEqual([
      'Öne çıkan',
      "Türkiye'de Bugünün Top 10 Dizi Listesi",
      'Animasyon',
      'Komedi',
      'Çocuk ve Aile',
      'Yeni Gelenler',
    ])
    for (const x of l.lists) for (const id of x.videoIds) expect(typeOf(id), `${x.context} ${id}`).toBe('SHOW')
    expect(l.lists[2]).toMatchObject({ genreId: 7424 })
    expect(l.lists[2]!.videoIds).toHaveLength(6)
    // Kimlikler profile özel, kategori önekli, benzersiz
    for (const x of l.lists) expect(x.listId.startsWith(`${profileHash(ADULT.guid)}_s.`)).toBe(true)
    expect(new Set(l.lists.map((x) => x.listId)).size).toBe(l.lists.length)
    expect(build('shows').lists.map((x) => [x.listId, x.trackId])).toEqual(l.lists.map((x) => [x.listId, x.trackId]))
  })

  it('Filmler: vitrin film adaylarından günlük dönüş, devam et yalnız film, tür satırı eşiği 4', () => {
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 120)
    app.services.progress.setBookmark(ADULT.guid, EXTRA_SHOWS[0]! + 1, 60)
    const l = build('movies')
    const byCtx = Object.fromEntries(l.lists.map((x) => [x.context, x]))
    const cands = [ID.sintel, ID.tears]
    expect(l.lists[0]).toMatchObject({ context: 'billboard', videoIds: [cands[localDayNumber(TEST_NOW) % 2]] })
    expect(byCtx.continueWatching!.videoIds).toEqual([ID.sintel])
    expect(byCtx.top10Movies!.displayName).toBe("Türkiye'de Bugünün Top 10 Film Listesi")
    expect(byCtx.top10Movies!.videoIds).toEqual(top10ForType(app.services, ADULT, TEST_NOW, 'MOVIE'))
    // Animasyon: 3 örnek + 3 ek film; fantastik yalnız 3 → satır yok
    expect(l.lists.filter((x) => x.context === 'genre').map((x) => x.displayName)).toEqual(['Animasyon'])
    for (const x of l.lists) for (const id of x.videoIds) expect(typeOf(id)).toBe('MOVIE')
    const shows = Object.fromEntries(build('shows').lists.map((x) => [x.context, x]))
    expect(shows.continueWatching!.videoIds).toEqual([EXTRA_SHOWS[0]])
    for (const x of l.lists) expect(x.listId.startsWith(`${profileHash(ADULT.guid)}_m.`)).toBe(true)
  })

  it('Yeni ve Popüler: satırlar, adlar; "Herkes Bunları İzliyor" iki Top 10 listesinin ilk üçünü dışlar', () => {
    const l = build('newPopular')
    const byCtx = Object.fromEntries(l.lists.map((x) => [x.context, x]))
    expect(l.lists.map((x) => [x.context, x.displayName])).toEqual([
      ['newReleases', 'Yeni Gelenler'],
      ['top10Shows', "Türkiye'de Bugünün Top 10 Dizi Listesi"],
      ['top10Movies', "Türkiye'de Bugünün Top 10 Film Listesi"],
      ['popular', 'Herkes Bunları İzliyor'],
    ])
    const excluded = [...byCtx.top10Shows!.videoIds.slice(0, 3), ...byCtx.top10Movies!.videoIds.slice(0, 3)]
    for (const id of excluded) expect(byCtx.popular!.videoIds).not.toContain(id)
    expect(byCtx.popular!.videoIds.length).toBeGreaterThanOrEqual(3)
    expect(byCtx.top10Shows!.videoIds.every((id) => typeOf(id) === 'SHOW')).toBe(true)
    expect(byCtx.top10Movies!.videoIds.every((id) => typeOf(id) === 'MOVIE')).toBe(true)
    // Top 10 yeteneği kapalı: tür listeleri yok
    expect(build('newPopular', ADULT, false).lists.map((x) => x.context)).toEqual(['newReleases', 'popular'])
  })

  it('ana sayfa: iki tür listesi de ≥ 5 ise karma Top 10 yerine dizi + film satırı; kişisel satır adı', () => {
    app.services.progress.setThumbRating(ADULT.guid, ID.spring, 'THUMBS_UP')
    const l = build('home')
    const ctxs = l.lists.map((x) => x.context)
    expect(ctxs).toContain('top10Shows')
    expect(ctxs).toContain('top10Movies')
    expect(ctxs).not.toContain('top10')
    expect(ctxs.indexOf('top10Movies')).toBe(ctxs.indexOf('top10Shows') + 1)
    expect(l.lists.find((x) => x.context === 'gems')?.displayName).toBe('Deniz için En İyi Seçimler')
    // ana sayfa kimlikleri eski biçimde (önek yok)
    expect(l.lists[0]!.listId).toBe(`${profileHash(ADULT.guid)}_billboard`)
  })
})

describe('Falcor: lolomoByCategory, tags, top10Rank', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createAlanApp({ contentDir: extendedContent() })
    installEmptyIntelligence(app) // bugünkü satırlar; içerik zekâsı satırları discovery-intelligence.test.ts'te
  })
  afterAll(async () => {
    await app.close()
  })
  const ctxFor = (pp: Passport = passport(ADULT), flags: Record<string, string> = FLAGS): FalcorRouteContext => ({
    req: fakeRequest(),
    passport: pp,
    services: app.services,
    config: app.config,
    flags,
  })
  const at = (g: JsonGraph, ...path: (string | number)[]): unknown =>
    path.reduce<unknown>(
      (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[String(k)] : undefined),
      g,
    )
  const follow = (g: JsonGraph, path: (string | number)[]): unknown => {
    let node: unknown = g
    for (let i = 0; i < path.length; i++) {
      const r = node as { $type?: string; value?: (string | number)[] }
      if (r && r.$type === 'ref') return follow(g, [...r.value!, ...path.slice(i)])
      node = (node as Record<string, unknown> | undefined)?.[String(path[i])]
    }
    const r = node as { $type?: string; value?: (string | number)[] }
    return r && r.$type === 'ref' ? follow(g, r.value!) : node
  }

  it('home aynı nesne; diğer kategoriler <guid>:<kategori>; satır özetleri', async () => {
    const paths: FalcorPath[] = [
      ['lolomo', 'summary'],
      ['lolomoByCategory', ['home', 'shows', 'movies', 'newPopular', 'bilinmeyen'], 'summary'],
      ['lolomoByCategory', ['shows', 'movies', 'newPopular'], { from: 0, to: 7 }, 'summary'],
      ['lolomoByCategory', 'shows', 2, { from: 0, to: 1 }, ['title', 'tags', 'top10Rank']],
    ]
    const g = (await evaluatePaths(ctxFor(), paths)).jsonGraph
    expect(at(g, 'lolomo')).toEqual({ $type: 'ref', value: ['lolomos', ADULT.guid] })
    expect(at(g, 'lolomoByCategory', 'home')).toEqual(at(g, 'lolomo'))
    expect(at(g, 'lolomoByCategory', 'shows')).toEqual({ $type: 'ref', value: ['lolomos', `${ADULT.guid}:shows`] })
    expect(at(g, 'lolomoByCategory', 'newPopular')).toEqual({
      $type: 'ref',
      value: ['lolomos', `${ADULT.guid}:newPopular`],
    })
    expect(at(g, 'lolomoByCategory', 'bilinmeyen')).toEqual({ $type: 'atom' })
    const contexts = (cat: string) =>
      Array.from({ length: 8 }, (_, i) => follow(g, ['lolomoByCategory', cat, i, 'summary']))
        .map((s) => (s as { value?: { context: string } } | undefined)?.value?.context)
        .filter(Boolean)
    expect(contexts('shows')).toEqual(build('shows').lists.map((x) => x.context))
    expect(contexts('movies')).toEqual(build('movies').lists.map((x) => x.context))
    expect(contexts('newPopular')).toEqual(['newReleases', 'top10Shows', 'top10Movies', 'popular'])
    const sum = follow(g, ['lolomoByCategory', 'shows', 'summary']) as { value: { length: number } }
    expect(sum.value.length).toBe(build('shows').lists.length)
    // Diziler 3. satır (Animasyon): etiketler ve dizi listesindeki sıra
    const v0 = follow(g, ['lolomoByCategory', 'shows', 2, 0]) as Record<string, { value?: unknown }>
    expect(Array.isArray(v0.tags!.value)).toBe(true)
    expect((v0.tags!.value as string[]).length).toBeLessThanOrEqual(3)
    expect((v0.tags!.value as string[]).length).toBeGreaterThan(0)
  })

  function build(category: LolomoCategory) {
    return buildLolomo(app.services, ADULT, { top10Supported: true, now: TEST_NOW, category })
  }

  it('başka profilin kategori lolomosu ve listesi FORBIDDEN; profilsiz PROFILE_REQUIRED', async () => {
    const shows = build('shows')
    const g = (
      await evaluatePaths(ctxFor(passport(TEEN)), [
        ['lolomos', `${ADULT.guid}:shows`, 'summary'],
        ['lists', shows.lists[1]!.listId, 'summary'],
      ])
    ).jsonGraph
    expect(at(g, 'lolomos', `${ADULT.guid}:shows`, 'summary')).toMatchObject({
      $type: 'error',
      value: { code: 'FORBIDDEN' },
    })
    expect(at(g, 'lists', shows.lists[1]!.listId, 'summary')).toMatchObject({ $type: 'error' })
    const anon = (await evaluatePaths(ctxFor(passport(null)), [['lolomoByCategory', 'shows']])).jsonGraph
    expect(at(anon, 'lolomoByCategory', 'shows')).toMatchObject({ $type: 'error', value: { code: 'PROFILE_REQUIRED' } })
    // lolomos["<guid>:home"] de ana sayfayı verir
    const home = (await evaluatePaths(ctxFor(), [['lolomos', `${ADULT.guid}:home`, 'summary']])).jsonGraph
    expect(at(home, 'lolomos', `${ADULT.guid}:home`, 'summary')).toMatchObject({
      value: { length: build('home').lists.length },
    })
  })

  it('videos[id].tags = BOB etiketleri; top10Rank kendi türünün listesindeki sıra', async () => {
    const showTop = top10ForType(app.services, ADULT, TEST_NOW, 'SHOW')
    const movieTop = top10ForType(app.services, ADULT, TEST_NOW, 'MOVIE')
    const show = showTop[1]!
    const movie = movieTop[2]!
    const g = (
      await evaluatePaths(ctxFor(), [
        ['videos', [show, movie, ID.sintel], ['tags', 'top10Rank']],
        ['videos', ID.cam_s1e1, ['tags', 'top10Rank']],
      ])
    ).jsonGraph
    expect(at(g, 'videos', show, 'top10Rank')).toEqual({ $type: 'atom', value: 2 })
    expect(at(g, 'videos', movie, 'top10Rank')).toEqual({ $type: 'atom', value: 3 })
    const bob = textEvidenceOf(app.services.catalog.getTitle(ID.sintel)!, 'BOB').map((t) => t.text)
    expect(bob).toHaveLength(3)
    expect(bob[0]).toBe('Duygusal') // önce duygu etiketi
    expect(at(g, 'videos', ID.sintel, 'tags')).toEqual({ $type: 'atom', value: bob })
    expect(at(g, 'videos', ID.cam_s1e1, 'top10Rank')).toEqual({ $type: 'atom', value: null })
    // bölüm etiketleri üst diziden
    expect((at(g, 'videos', ID.cam_s1e1, 'tags') as { value: string[] }).value.length).toBeGreaterThan(0)
    // çocuk profili: yalnız görebildiği başlıklarla sıralanır
    const kid = (await evaluatePaths(ctxFor(passport(KID)), [['videos', ID.bbb, 'top10Rank']])).jsonGraph
    const kidList = top10ForType(app.services, KID, TEST_NOW, 'MOVIE')
    expect(at(kid, 'videos', ID.bbb, 'top10Rank')).toEqual({ $type: 'atom', value: kidList.indexOf(ID.bbb) + 1 })
  })
})

describe('açılış tohumu (gerçek içerik)', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('lolomoByCategory.home ref + tohumlanan videolarda tags', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    const cookies = Object.fromEntries(login.cookies.map((c) => [c.name, c.value]))
    const guid = login.json<BootContext>().profiles[0]!.guid
    const sw = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } })
    for (const c of sw.cookies) cookies[c.name] = c.value
    const res = await app.inject({ url: '/api/boot', cookies })
    const g = res.json<BootContext>().falcorCache!
    expect(g).not.toBeNull()
    expect(at(g, 'lolomoByCategory', 'home')).toEqual({ $type: 'ref', value: ['lolomos', guid] })
    expect(at(g, 'lolomoByCategory', 'home')).toEqual(at(g, 'lolomo'))
    const videos = at(g, 'videos') as Record<string, Record<string, unknown>>
    const withTitle = Object.values(videos).filter((v) => v.title && v.summary)
    expect(withTitle.length).toBeGreaterThan(10)
    for (const v of withTitle) expect(v.tags, JSON.stringify(v.title)).toMatchObject({ $type: 'atom' })
    // Gerçek içerikte ana sayfa dizi + film Top 10 satırlarını taşır
    const rows = Object.values(at(g, 'lists') as Record<string, { summary?: { value?: { context: string } } }>).map(
      (l) => l.summary?.value?.context,
    )
    expect(rows).toEqual(expect.arrayContaining(['billboard']))
    const size = Buffer.byteLength(res.body)
    expect(size).toBeLessThan(400_000)
  })

  const at = (g: JsonGraph, ...path: (string | number)[]): unknown =>
    path.reduce<unknown>(
      (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[String(k)] : undefined),
      g,
    )
})
