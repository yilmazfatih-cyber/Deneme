import { describe, expect, it } from 'vitest'
import { pickUpcoming, SOON_MAX, SOON_WINDOW_MS, type UpcomingAiring, type UpcomingChannel } from './ComingSoon'

const NOW = Date.parse('2026-11-14T18:00:00.000Z')
const MIN = 60_000

function airing(id: string, kind: string, inMin: number, state = 'PLAYABLE'): UpcomingAiring {
  return {
    airingId: id,
    unifiedEntityId: `Airing:${id}`,
    title: `Yayın ${id}`,
    kind,
    startAt: new Date(NOW + inMin * MIN).toISOString(),
    endAt: new Date(NOW + (inMin + 60) * MIN).toISOString(),
    liveState: 'UPCOMING',
    startOver: false,
    catchup: { available: false, until: null },
    access: { state, reasonText: null, requiredProduct: null } as UpcomingAiring['access'],
    synopsis: '',
    hasReminder: false,
    artwork: null,
  }
}
function channel(n: number, next: UpcomingAiring | null, sample = false): UpcomingChannel {
  return { channelId: n, name: `Kanal ${n}`, number: n, isKids: false, isSampleSchedule: sample, logo: null, next }
}

describe('pickUpcoming', () => {
  it('yalnız önümüzdeki pencerede başlayan, izlenebilir yayınlar; başlama saatine göre sıralı', () => {
    const items = pickUpcoming(
      [
        channel(1, airing('a', 'film', 90)),
        channel(2, airing('b', 'dizi', 30)),
        channel(3, airing('gecmis', 'film', -5)),
        channel(4, airing('uzak', 'film', SOON_WINDOW_MS / MIN + 1)),
        channel(5, airing('kilitli', 'film', 20, 'UPSELL')),
        channel(6, null),
      ],
      NOW,
    )
    expect(items.map((x) => x.airing.airingId)).toEqual(['b', 'a'])
    expect(items[0]).toMatchObject({ channelId: 2, channelName: 'Kanal 2', sample: false })
  })

  it('yer azsa film, dizi, spor, belgesel ve müzik öne geçer; seçilenler yine saate göre dizilir', () => {
    const news = Array.from({ length: SOON_MAX }, (_, i) => channel(i + 1, airing(`h${i}`, 'haber', 10 + i)))
    const items = pickUpcoming(
      [...news, channel(20, airing('film', 'film', 200)), channel(21, airing('spor', 'spor', 100))],
      NOW,
    )
    expect(items).toHaveLength(SOON_MAX)
    const ids = items.map((x) => x.airing.airingId)
    expect(ids).toContain('film')
    expect(ids).toContain('spor')
    expect(ids.slice(-2)).toEqual(['spor', 'film'])
    expect(ids.slice(0, SOON_MAX - 2)).toEqual(['h0', 'h1', 'h2', 'h3'])
  })

  it('örnek yayın akışı işareti taşınır; aynı anda başlayanlar kanal numarasına göre', () => {
    const items = pickUpcoming([channel(9, airing('x', 'film', 15), true), channel(3, airing('y', 'film', 15))], NOW)
    expect(items.map((x) => [x.channelNumber, x.sample])).toEqual([
      [3, false],
      [9, true],
    ])
  })
})
