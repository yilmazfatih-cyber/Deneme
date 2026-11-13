import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { isWatched } from '../src/services/progress/progress'
import { ADULT, createAlanApp, ID, setClock, TEEN, TEST_NOW } from './fixtures/alan'

describe('üye durumu (progress)', () => {
  let app: FastifyInstance
  let t = 0
  /** Her yazmadan önce saati bir dakika ilerlet */
  const tick = () => setClock(app, new Date(TEST_NOW.getTime() + ++t * 60_000))
  const g = ADULT.guid

  beforeEach(async () => {
    app = await createAlanApp()
    t = 0
  })
  afterEach(async () => {
    await app.close()
  })

  it('izlendi eşiği: %95 ya da (uzun videoda) son 60 sn', () => {
    expect(isWatched(845, 888)).toBe(true) // %95.2
    expect(isWatched(830, 888)).toBe(true) // son 58 sn
    expect(isWatched(800, 888)).toBe(false)
    expect(isWatched(40, 90)).toBe(false) // kısa videoda 60 sn kuralı yok
    expect(isWatched(86, 90)).toBe(true)
    expect(isWatched(1000, null)).toBe(false)
  })

  it('watchStatus film: hiç → başladı → izlendi', () => {
    const p = app.services.progress
    expect(p.watchStatus(g, ID.sintel)).toBe('NEVER_WATCHED')
    tick()
    expect(p.setBookmark(g, ID.sintel, 300)).toMatchObject({ positionSec: 300, runtimeSec: 888 })
    expect(p.watchStatus(g, ID.sintel)).toBe('STARTED')
    tick()
    p.setBookmark(g, ID.sintel, 870)
    expect(p.watchStatus(g, ID.sintel)).toBe('WATCHED')
    // başka profil etkilenmez
    expect(p.watchStatus(TEEN.guid, ID.sintel)).toBe('NEVER_WATCHED')
  })

  it('süresi bilinmeyen video için öğrenilen süre', () => {
    const p = app.services.progress
    expect(p.learnedRuntime(ID.anadolu)).toBeNull()
    tick()
    const bm = p.setBookmark(g, ID.anadolu, 100, 3000)
    expect(bm.runtimeSec).toBe(3000)
    expect(p.learnedRuntime(ID.anadolu)).toBe(3000)
    // içerikte süresi olan videoda öğrenilmez
    p.setBookmark(g, ID.sintel, 10, 999)
    expect(p.learnedRuntime(ID.sintel)).toBeNull()
    expect(p.watchStatus(g, ID.anadolu)).toBe('STARTED')
  })

  it('dizi: watchStatus bölümlerden, currentEpisode kuralları', () => {
    const p = app.services.progress
    expect(p.watchStatus(g, ID.caminandes)).toBe('NEVER_WATCHED')
    expect(p.currentEpisode(g, ID.caminandes)).toBe(ID.cam_s1e1)
    expect(p.currentEpisode(g, ID.sintel)).toBeNull()

    tick()
    p.setBookmark(g, ID.cam_s1e1, 30)
    expect(p.watchStatus(g, ID.caminandes)).toBe('STARTED')
    expect(p.currentEpisode(g, ID.caminandes)).toBe(ID.cam_s1e1) // yarım kalan bölüm

    tick()
    p.setBookmark(g, ID.cam_s1e1, 89)
    expect(p.currentEpisode(g, ID.caminandes)).toBe(ID.cam_s1e2) // izlenenin ardından gelen

    tick()
    p.setBookmark(g, ID.cam_s1e2, 145)
    expect(p.currentEpisode(g, ID.caminandes)).toBe(ID.cam_s2e1) // sezon geçişi

    tick()
    p.setBookmark(g, ID.cam_s2e1, 20)
    expect(p.currentEpisode(g, ID.caminandes)).toBe(ID.cam_s2e1)

    // son bölüm (süresi bilinmiyor) oynatıcı süreyi bildirince bitebilir
    tick()
    p.setBookmark(g, ID.cam_s2e1, 150)
    tick()
    p.setBookmark(g, ID.cam_s2e2, 118, 120)
    expect(p.watchStatus(g, ID.cam_s2e2)).toBe('WATCHED')
    expect(p.watchStatus(g, ID.caminandes)).toBe('WATCHED')
    expect(p.currentEpisode(g, ID.caminandes)).toBe(ID.cam_s1e1) // hepsi bitti → baştan
  })

  it('izlemeye devam: yarım kalanlar, en yeni önce, dizi başına tek kayıt', () => {
    const p = app.services.progress
    tick()
    p.setBookmark(g, ID.sintel, 300)
    tick()
    p.setBookmark(g, ID.cam_s1e1, 89) // izlendi → sıradaki bölüm
    tick()
    p.setBookmark(g, ID.bbb, 590) // izlendi → listede yok
    tick()
    p.setBookmark(g, ID.sintelTrailer, 10) // ek video → listede yok
    tick()
    p.setBookmark(g, ID.nosferatu, 600)
    expect(p.continueWatching(g)).toEqual([
      { titleId: ID.nosferatu, videoId: ID.nosferatu },
      { titleId: ID.caminandes, videoId: ID.cam_s1e2 },
      { titleId: ID.sintel, videoId: ID.sintel },
    ])
    expect(p.recentTitles(g)).toEqual([ID.nosferatu, ID.sintel, ID.bbb, ID.caminandes])
    tick()
    p.setBookmark(g, ID.cam_s1e2, 10)
    expect(p.continueWatching(g)[0]).toEqual({ titleId: ID.caminandes, videoId: ID.cam_s1e2 })
  })

  it('Listem: en yeni önce, bölüm üst başlığa eşlenir; puanlar', () => {
    const p = app.services.progress
    tick()
    p.addToMyList(g, ID.sintel)
    tick()
    p.addToMyList(g, ID.cam_s1e2)
    tick()
    p.addToMyList(g, ID.sintel) // yinelenmez
    expect(p.myList(g)).toEqual([ID.caminandes, ID.sintel])
    expect(p.isInMyList(g, ID.caminandes)).toBe(true)
    p.removeFromMyList(g, ID.caminandes)
    expect(p.myList(g)).toEqual([ID.sintel])

    expect(p.thumbRating(g, ID.bbb)).toBe('THUMBS_UNRATED')
    tick()
    p.setThumbRating(g, ID.bbb, 'THUMBS_UP')
    tick()
    p.setThumbRating(g, ID.spring, 'THUMBS_WAY_UP')
    tick()
    p.setThumbRating(g, ID.nosferatu, 'THUMBS_DOWN')
    expect(p.liked(g)).toEqual([ID.spring, ID.bbb])
    expect(p.disliked(g)).toEqual([ID.nosferatu])
    p.setThumbRating(g, ID.bbb, 'THUMBS_UNRATED')
    expect(p.liked(g)).toEqual([ID.spring])
  })

  it('kanallar: son kanal, Kanallarım varsayılanı ve değiştirme', () => {
    const p = app.services.progress
    expect(p.lastChannel(g)).toBeNull()
    p.setLastChannel(g, 3)
    expect(p.lastChannel(g)).toBe(3)
    expect(p.favoriteChannels(g)).toEqual([1, 3]) // içerikte favorite:true
    expect(p.toggleFavoriteChannel(g, 2)).toBe(true)
    expect(p.favoriteChannels(g)).toEqual([1, 3, 2])
    expect(p.toggleFavoriteChannel(g, 1)).toBe(false)
    expect(p.favoriteChannels(g)).toEqual([3, 2])
    expect(p.favoriteChannels(TEEN.guid)).toEqual([1, 3])
  })

  it('son aramalar: en çok 8, norm() ile tekil, en yeni önce; duyuru kapatma', () => {
    const p = app.services.progress
    for (const term of ['sintel', 'SİNTEL', 'Çizgi', 'cizgi film', 'a', 'b', 'c', 'd', 'e', 'f']) p.recordSearch(g, term)
    p.recordSearch(g, '   ')
    expect(p.recentSearches(g)).toEqual(['f', 'e', 'd', 'c', 'b', 'a', 'cizgi film', 'Çizgi'])
    p.recordSearch(g, 'çizgi')
    expect(p.recentSearches(g)[0]).toBe('çizgi')
    expect(p.recentSearches(g).filter((s) => s.toLowerCase().includes('izgi')).length).toBe(2)
    p.clearRecentSearches(g)
    expect(p.recentSearches(g)).toEqual([])

    p.dismissInterstitial(g, 'canli-tanitim')
    p.dismissInterstitial(g, 'canli-tanitim')
    expect(p.dismissedInterstitials(g)).toEqual(['canli-tanitim'])
  })
})
