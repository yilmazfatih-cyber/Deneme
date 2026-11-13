import { describe, expect, it } from 'vitest'
import type { DevCategory, DevEvent } from '../../lib/devbus'
import { activeRungIndex, initialPipeline, LANE_BLOCKS, reducePipelineAll } from './pipeline'

let seq = 0
const T0 = 1_760_000_000_000
function ev(
  cat: DevCategory,
  label: string,
  detail: Record<string, unknown>,
  at: number,
  opts: { ms?: number; ok?: boolean } = {},
): DevEvent {
  return { id: ++seq, at: T0 + at, cat, label, ok: opts.ok ?? true, ms: opts.ms, detail }
}

const ftlResults = (ix: number) => [
  { name: 'resolver', cdnId: 'c104-cloud', ok: true, ttfbMs: 60, totalMs: 120, kbps: 340 },
  { name: 'oc.anycast.proxy', cdnId: 'c103-anycast', ok: true, ttfbMs: 30, totalMs: 70, kbps: 590 },
  { name: 'oc.ix.proxy', cdnId: 'c101-ist001-ix', ok: true, ttfbMs: 12, totalMs: ix, kbps: 2900 },
  { name: 'cloud', cdnId: 'c102-ist002-isp', ok: false, ttfbMs: 0, totalMs: 0, kbps: 0 },
]

const ladder = [
  { bitrateKbps: 1127, height: 480, profile: 'vp9-webm', streamId: 'v-1127' },
  { bitrateKbps: 235, height: 240, profile: 'vp9-webm', streamId: 'v-235' },
  { bitrateKbps: 3000, height: 1080, profile: 'vp9-webm', streamId: 'v-3000' },
]

function streamsSequence(): DevEvent[] {
  const exp = Math.floor((T0 + 12 * 3600_000) / 1000)
  return [
    ev('ftl', 'darbe 1', { iter: 0, pulse: 0, results: ftlResults(20), winner: 'oc.ix.proxy' }, 0),
    ev('ftl', 'darbe 2', { iter: 0, pulse: 1, results: ftlResults(25), winner: 'c101-ist001-ix' }, 2100),
    ev(
      'msl',
      'aleProvision',
      { scheme: 'ECDH_P256_AESGCM', serialnumber: 42, renewalwindow: Math.floor(T0 / 1000) + 3600, expiration: exp },
      2500,
      { ms: 40 },
    ),
    ev(
      'manifest',
      'Video:80010009',
      { kind: 'STREAMS', prefetch: true, video: ladder, audio: [], text: [], cdns: [], expiration: exp },
      2600,
    ),
    ev('msl', 'zarf', { messageid: 7, bytes: 3200 }, 3000),
    ev(
      'manifest',
      'Video:80010001',
      {
        kind: 'STREAMS',
        prefetch: false,
        video: ladder,
        audio: [{ language: 'en', languageDescription: 'İngilizce [Özgün]', channels: '2.0' }],
        text: [{ language: 'tr', languageDescription: 'Türkçe', type: 'SUBTITLES' }, 'en'],
        cdns: [
          { id: 'c101-ist001-ix', rank: 1, type: 'IX', location: 'İstanbul' },
          { id: 'c103-anycast', rank: 2, type: 'ANYCAST', location: 'Frankfurt' },
        ],
        expiration: (T0 + 12 * 3600_000) / 1, // ms biçiminde de gelebilir
      },
      3100,
    ),
    ev('range', 'header 0-4095', { type: 'header', cdnId: 'c101-ist001-ix', start: 0, end: 4095, bytes: 4096 }, 3200),
    ev('abr', 'ilk: 235 kbps', { to: 235, reason: 'başlangıç', estimateKbps: 900 }, 3250),
    ...Array.from({ length: 14 }, (_, i) =>
      ev(
        'range',
        `video ${i}`,
        {
          type: 'video',
          cdnId: 'c101-ist001-ix',
          start: i * 1000,
          end: i * 1000 + 999,
          bytes: 1000,
          ttfbMs: 10,
          kbps: 1500 + i * 100,
          streamId: 'v-235',
          segment: i,
        },
        3300 + i * 100,
        { ms: 30 },
      ),
    ),
    ev(
      'range',
      'audio 2935-27888',
      { type: 'audio', cdnId: 'c101-ist001-ix', start: 2935, end: 27888, kbps: 900, streamId: 'a-128' },
      3400,
      { ms: 20 },
    ),
    ev(
      'abr',
      '↑ 1127 kbps',
      { from: 235, to: 1127, reason: 'bant genişliği yeterli', estimateKbps: 2400, bufferSec: 12 },
      5000,
    ),
    ev('buffer', 'tampon', { videoSec: 14.5, audioSec: 20, state: 'oynuyor' }, 5100),
    ev('cdn', 'yük devri c101→c103', { from: 'c101-ist001-ix', to: 'c103-anycast', reason: 'zaman aşımı' }, 5200),
    ev(
      'range',
      'video x',
      { type: 'video', cdnId: 'c103-anycast', start: 50000, end: 59999, kbps: 1300, streamId: 'v-1127' },
      5300,
      { ms: 80 },
    ),
    ev('ttml', 'tr yüklendi', { language: 'tr', cues: 812, tickRate: 10_000_000 }, 5400),
    ev('player', 'durum: oynuyor', { viewableId: 'Video:80010001', state: 'oynuyor', positionSec: 3 }, 5500),
  ]
}

describe('oynatma hattı modeli', () => {
  it('FTL darbelerini toplar, kazananı işaretler, sonraki darbeyi hesaplar', () => {
    const s = reducePipelineAll(initialPipeline(), streamsSequence())
    expect(s.ftl?.pulses.map((p) => p.index)).toEqual([0, 1])
    const p2 = s.ftl!.pulses[1]!
    expect(p2.winnerCdnId).toBe('c101-ist001-ix')
    expect(p2.targets.filter((t) => t.winner).map((t) => t.name)).toEqual(['oc.ix.proxy'])
    // 2. darbe (2000 ms) → 3. darbe (70000 ms): 68 sn sonra
    expect(s.ftl!.nextPulseAt).toBe(T0 + 2100 + 68_000)
    expect(s.ftl!.totalPulses).toBe(3)
  })

  it('kazanan bildirilmezse en hızlı başarılı hedefi seçer; yeni tur eski darbeleri siler', () => {
    const s = reducePipelineAll(initialPipeline(), [
      ev('ftl', 'darbe 1', { iter: 0, pulse: 0, results: ftlResults(20) }, 0),
      ev('ftl', 'darbe 1', { iter: 1, pulse: 0, results: ftlResults(200) }, 100_000),
    ])
    expect(s.ftl?.iter).toBe(1)
    expect(s.ftl?.pulses).toHaveLength(1)
    expect(s.ftl?.pulses[0]?.winnerCdnId).toBe('c103-anycast') // 70 ms < 200 ms; başarısız hedef sayılmaz
  })

  it('MSL: sağlama + zarf alanlarını birleştirir, saniyeyi ms yapar', () => {
    const s = reducePipelineAll(initialPipeline(), streamsSequence())
    expect(s.msl).toMatchObject({ scheme: 'ECDH_P256_AESGCM', serial: 42, lastMessageId: 7, messages: 1 })
    expect(s.msl!.renewalAt).toBe(T0 + 3600_000)
    expect(s.msl!.provisionedAt).toBe(T0 + 2500)
  })

  it('manifest: gerçek olan ön hazırlığın yerini alır; basamaklar sıralı, parçalar etiketli', () => {
    const s = reducePipelineAll(initialPipeline(), streamsSequence())
    expect(s.prefetchCount).toBe(1)
    expect(s.lastPrefetch?.viewableId).toBe('Video:80010009')
    expect(s.manifest).toMatchObject({ viewableId: 'Video:80010001', kind: 'STREAMS', prefetch: false })
    expect(s.manifest!.video.map((r) => r.bitrateKbps)).toEqual([235, 1127, 3000])
    expect(s.manifest!.audio).toEqual(['İngilizce [Özgün] · 2.0'])
    expect(s.manifest!.text).toEqual(['Türkçe', 'en'])
    expect(s.manifest!.cdns.map((c) => c.id)).toEqual(['c101-ist001-ix', 'c103-anycast'])
    expect(s.manifest!.expiresAt).toBe(T0 + 12 * 3600_000)
    expect(s.source).toBe('streams')
  })

  it('ön hazırlık manifesti oynatma sürerken ekrandakini değiştirmez', () => {
    const seq2 = [
      ...streamsSequence(),
      ev('manifest', 'Video:999', { kind: 'STREAMS', prefetch: true, video: [] }, 9000),
    ]
    const s = reducePipelineAll(initialPipeline(), seq2)
    expect(s.manifest?.viewableId).toBe('Video:80010001')
    expect(s.prefetchCount).toBe(2)
    expect(s.streaming.requests).toBeGreaterThan(0)
  })

  it('aralıklar: şeritler 12 blokla sınırlı, başlık ayrı sayılır, bayt yoksa aralıktan hesaplanır', () => {
    const s = reducePipelineAll(initialPipeline(), streamsSequence())
    const st = s.streaming
    expect(st.video).toHaveLength(LANE_BLOCKS)
    expect(st.video[st.video.length - 1]?.cdnId).toBe('c103-anycast')
    expect(st.audio).toHaveLength(1)
    expect(st.audio[0]?.bytes).toBe(27888 - 2935 + 1)
    expect(st.headerRequests).toBe(1)
    expect(st.requests).toBe(1 + 14 + 1 + 1)
    expect(st.samples).toHaveLength(15)
  })

  it('ABR geçişi, tampon ve yük devri işaretleri; etkin basamak', () => {
    const s = reducePipelineAll(initialPipeline(), streamsSequence())
    const st = s.streaming
    expect(st.currentKbps).toBe(1127)
    expect(st.currentHeight).toBe(480)
    expect(st.estimates.map((x) => x.kbps)).toEqual([900, 2400])
    expect(st.markers.map((m) => [m.kind, m.dir])).toEqual([
      ['abr', 'up'],
      ['cdn', null],
    ])
    expect(st.activeCdn).toBe('c103-anycast')
    expect(st.buffer).toMatchObject({ videoSec: 14.5, audioSec: 20, state: 'oynuyor' })
    expect(activeRungIndex(s.manifest, st)).toBe(1)
    expect(s.ttml).toMatchObject({ language: 'tr', cues: 812, tickRate: 10_000_000 })
    expect(s.player).toMatchObject({ state: 'oynuyor', positionSec: 3 })
  })

  it('yeni gerçek manifest akışı ve altyazıyı sıfırlar', () => {
    const s = reducePipelineAll(initialPipeline(), [
      ...streamsSequence(),
      ev(
        'manifest',
        'Video:80010002',
        { kind: 'STREAMS', prefetch: false, video: ladder, cdns: ['c102-ist002-isp'] },
        10_000,
      ),
    ])
    expect(s.streaming.requests).toBe(0)
    expect(s.streaming.activeCdn).toBe('c102-ist002-isp')
    expect(s.ttml).toBeNull()
  })

  it('YouTube gömmesi: durum zaman çizgisi, sayısal durumlar, tekrarlar birleşir', () => {
    const s = reducePipelineAll(initialPipeline(), [
      ev('manifest', 'Video:80020001', { kind: 'EXTERNAL_EMBED', prefetch: false }, 0),
      ev('embed', 'YouTube: UNSTARTED', { videoId: 'abc', state: 'UNSTARTED' }, 10),
      ev('embed', 'YouTube: BUFFERING', { videoId: 'abc', state: 3 }, 20),
      ev('embed', 'YouTube: BUFFERING', { videoId: 'abc', state: 'BUFFERING' }, 25),
      ev('embed', 'YouTube: PLAYING', { videoId: 'abc' }, 30),
      ev('embed', 'YouTube hata', { videoId: 'abc', state: 'ERROR', error: 150 }, 40, { ok: false }),
    ])
    expect(s.source).toBe('embed')
    expect(s.embed?.videoId).toBe('abc')
    expect(s.embed?.states.map((x) => x.state)).toEqual(['UNSTARTED', 'BUFFERING', 'PLAYING', 'ERROR'])
    expect(s.embed?.error).toBe('150')
  })
})
