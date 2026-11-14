import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { catchupOf, LINEAR_ANCHOR, liveStateOf } from '../src/services/epg/epg'
import { dayKey, localParts } from '../src/services/epg/time'
import { createAlanApp, ID, TEST_NOW } from './fixtures/alan'

const H = 3_600_000
const D = 24 * H

describe('yayın akışı (EPG)', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createAlanApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('İstanbul saati yardımcıları sabit UTC+3', () => {
    expect(dayKey(new Date('2026-11-13T20:59:00Z'))).toBe('2026-11-13')
    expect(dayKey(new Date('2026-11-13T21:00:00Z'))).toBe('2026-11-14')
    expect(localParts(TEST_NOW)).toMatchObject({ hh: 12, mm: 0 })
    expect(LINEAR_ANCHOR.toISOString()).toBe('2025-12-31T21:00:00.000Z')
  })

  it('şablonu günlere açar: kimlik biçimi, yerel saat, sıralama', () => {
    const epg = app.services.epg
    const dayStart = new Date('2026-11-12T21:00:00Z') // 13 Kasım 00:00
    const list = epg.airings(1, dayStart, new Date(dayStart.getTime() + D))
    expect(list.map((a) => a.airingId)).toEqual([
      '1-20261112-2200', // önceki günden taşan film (00:30'a kadar)
      '1-20261113-0030',
      '1-20261113-0600',
      '1-20261113-0900',
      '1-20261113-1300',
      '1-20261113-1900',
      '1-20261113-2000',
      '1-20261113-2200',
    ])
    const anaHaber = epg.getAiring('1-20261113-1900')!
    expect(anaHaber.startAt.toISOString()).toBe('2026-11-13T16:00:00.000Z')
    expect(anaHaber.endAt.toISOString()).toBe('2026-11-13T17:00:00.000Z')
    expect(anaHaber).toMatchObject({ channelId: 1, title: 'Ana Haber', kind: 'haber', videoId: null, isSample: true })
    expect(epg.getAiring('1-20261113-2200')?.videoId).toBe(ID.nosferatu)
    expect(epg.getAiring('5-20261113-2000')?.isSample).toBe(false)
  })

  it('gece yarısını aşan program; şimdiki yayın', () => {
    const epg = app.services.epg
    expect(epg.currentAiring(1)?.airingId).toBe('1-20261113-0900') // 12:00
    const at = new Date('2026-11-14T00:00:00Z') // 14 Kasım 03:00
    const a = epg.currentAiring(2, at)!
    expect(a.airingId).toBe('2-20261113-2200')
    expect(a.endAt.toISOString()).toBe('2026-11-14T04:00:00.000Z') // 07:00 yerel
    expect(epg.currentAiring(2, new Date('2026-11-14T04:00:00Z'))?.airingId).toBe('2-20261114-0700')
    expect(epg.currentAiring(99)).toBeNull()
  })

  it('akış penceresi: 7 gün geri, 2 gün ileri', () => {
    const epg = app.services.epg
    expect(epg.getAiring('1-20261106-1900')).not.toBeNull()
    expect(epg.getAiring('1-20261105-1900')).toBeNull()
    expect(epg.getAiring('1-20261115-1900')).not.toBeNull()
    expect(epg.getAiring('1-20261116-1900')).toBeNull()
    expect(epg.getAiring('1-20261113-1901')).toBeNull()
    expect(epg.getAiring('bozuk')).toBeNull()
    const far = epg.airings(1, new Date('2026-12-01T00:00:00Z'), new Date('2026-12-02T00:00:00Z'))
    expect(far).toEqual([])
  })

  it('LINEAR kanal: çalma listesi çapadan kesintisiz döner; linearPosition', () => {
    const epg = app.services.epg
    expect(epg.isLinear(3)).toBe(true)
    expect(epg.isLinear(1)).toBe(false)
    const runtimes = [
      [ID.sintel, 888],
      [ID.bbb, 596],
      [ID.spring, 464],
    ] as const
    const cycle = 888 + 596 + 464
    const elapsed = (TEST_NOW.getTime() - LINEAR_ANCHOR.getTime()) / 1000
    let into = elapsed % cycle
    let expected: (typeof runtimes)[number] = runtimes[0]
    for (const r of runtimes) {
      if (into < r[1]) {
        expected = r
        break
      }
      into -= r[1]
    }
    const pos = epg.linearPosition(3, TEST_NOW)!
    expect(pos.videoId).toBe(expected[0])
    expect(pos.offsetSec).toBe(Math.floor(into))
    expect(pos.airing).toMatchObject({ channelId: 3, kind: 'film', isSample: false, videoId: expected[0] })
    expect(pos.airing.endAt.getTime() - pos.airing.startAt.getTime()).toBe(expected[1] * 1000)
    expect(pos.airing.airingId).toMatch(/^3-20261113-\d{4}(-\d+)?$/)

    // Kesintisiz: her yayın bir öncekinin bittiği anda başlar; başlık video başlığıdır
    const list = epg.airings(3, new Date(TEST_NOW.getTime() - 3 * H), new Date(TEST_NOW.getTime() + 3 * H))
    expect(list.length).toBeGreaterThan(5)
    for (let i = 1; i < list.length; i++) expect(list[i]!.startAt.getTime()).toBe(list[i - 1]!.endAt.getTime())
    expect(new Set(list.map((a) => a.title))).toEqual(new Set(['Sintel', 'Big Buck Bunny', 'Spring']))
    // aynı kimlikle geri bulunur
    expect(epg.getAiring(pos.airing.airingId)?.videoId).toBe(pos.videoId)
    expect(epg.linearPosition(1)).toBeNull()
  })

  it('canlı durumu ve geri al penceresi', () => {
    const epg = app.services.epg
    const live = epg.getAiring('1-20261113-0900')!
    expect(liveStateOf(live, TEST_NOW)).toBe('LIVE')
    expect(liveStateOf(epg.getAiring('1-20261113-1900')!, TEST_NOW)).toBe('UPCOMING')
    expect(liveStateOf(epg.getAiring('1-20261113-0600')!, TEST_NOW)).toBe('ENDED')

    const yesterdayFilm = epg.getAiring('1-20261112-2200')!
    const c = catchupOf(yesterdayFilm, TEST_NOW, false)
    expect(c.available).toBe(true)
    expect(c.until?.toISOString()).toBe(new Date(yesterdayFilm.endAt.getTime() + 7 * D).toISOString())
    // videosu olmayan yayın geri izlenemez
    expect(catchupOf(epg.getAiring('1-20261112-1900')!, TEST_NOW, false)).toEqual({ available: false, until: null })
    // henüz bitmemiş
    expect(catchupOf(epg.getAiring('1-20261113-2200')!, TEST_NOW, false).available).toBe(false)
    // 7 günden eski
    const old = epg.getAiring('1-20261106-0030')!
    expect(catchupOf(old, TEST_NOW, false).available).toBe(false)
    // LINEAR yayınlar her zaman geri alınabilir (bitmişse)
    const linearPast = epg.airings(
      3,
      new Date(TEST_NOW.getTime() - 2 * D),
      new Date(TEST_NOW.getTime() - 2 * D + 1),
    )[0]!
    expect(catchupOf(linearPast, TEST_NOW, true).available).toBe(true)
  })
})
