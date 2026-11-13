import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Cue } from '../server/src/services/subtitles/convert'
import type { ContentTitle } from '../shared/content-schema'
import {
  chooseCuts,
  frameIndicesOf,
  methodOf,
  parseArgs,
  parseSceneScores,
  parseSubtitleText,
  playablesOf,
  removeFromKeyframes,
  srtToVtt,
  subtitleLangOf,
  spansOf,
  textForSpans,
} from './analyze-shots'
import { exportLines, parseArgs as parseExportArgs } from './embed-catalog'

const T = 10_000_000
const cue = (b: number, e: number, text: string): Cue => ({
  begin: b * T,
  end: e * T,
  lines: [[{ text, italic: false, bold: false }]],
})

describe('analyze-shots: sahne puanı ve kesimler', () => {
  it('metadata=print çıktısını çözer', () => {
    const out = [
      'frame:0    pts:0       pts_time:0',
      'lavfi.scene_score=0.000000',
      'frame:1    pts:1001    pts_time:0.0417',
      'lavfi.scene_score=0.512000',
      'frame:2    pts:2002    pts_time:0.0834',
    ].join('\n')
    expect(parseSceneScores(out)).toEqual([
      { t: 0, score: 0 },
      { t: 0.0417, score: 0.512 },
    ])
  })

  it('eşik, en kısa çekim (yakın kesimlerde güçlü olan kalır) ve üst sınır', () => {
    const scores = [
      { t: 0.5, score: 0.9 }, // baştan 1 sn'den yakın → aday değil
      { t: 3, score: 0.2 },
      { t: 3.4, score: 0.6 }, // 3'e yakın, daha güçlü → onun yerine geçer
      { t: 6, score: 0.05 }, // eşik altı
      { t: 8, score: 0.3 },
      { t: 9.5, score: 0.9 }, // sona 1 sn'den yakın
    ]
    const opts = { threshold: 0.12, minShotSec: 1, maxShots: 100 }
    expect(chooseCuts(scores, 10, opts)).toEqual({ cuts: [3.4, 8], capped: false })
    expect(chooseCuts(scores, 10, { ...opts, maxShots: 2 })).toEqual({ cuts: [3.4], capped: true })
    expect(spansOf([3.4, 8], 10)).toEqual([
      [0, 3.4],
      [3.4, 8],
      [8, 10],
    ])
    expect(spansOf([], 5)).toEqual([[0, 5]])
  })

  it('altyazı satırları orta noktasına göre çekime dağılır', () => {
    const spans: [number, number][] = [
      [0, 5],
      [5, 10],
    ]
    const texts = textForSpans([cue(1, 2, 'Merhaba.'), cue(4, 7, 'Nereye?'), cue(8, 9, '<b>Eve</b>')], spans)
    expect(texts).toEqual(['Merhaba.', 'Nereye? <b>Eve</b>'])
    expect(textForSpans([cue(1, 2, 'x'.repeat(500))], [[0, 5]])[0]!.length).toBe(400)
  })

  it('kare sıraları: ilk, son ve orta noktalar çekimin içinde', () => {
    const r = frameIndicesOf([10, 12], 8)
    expect(r.first).toBe(81)
    expect(r.last).toBe(94)
    expect(r.mids.every((m) => m >= r.first && m <= r.last)).toBe(true)
    const tiny = frameIndicesOf([0, 0.1], 8)
    expect(tiny.last).toBeGreaterThanOrEqual(tiny.first)
  })

  it('yapraklar ve yöntem', () => {
    const base = { promo: null, supplementals: [], runtimeSec: null } as unknown as ContentTitle
    const movie = {
      ...base,
      videoId: 1,
      type: 'MOVIE',
      title: 'Film',
      seasons: [],
      sources: [{ type: 'DASH', manifest: 'https://x/m.mpd', timedText: [] }],
    } as unknown as ContentTitle
    const show = {
      ...base,
      videoId: 2,
      type: 'SHOW',
      title: 'Dizi',
      sources: [],
      seasons: [
        {
          number: 1,
          episodes: [
            { videoId: 21, number: 1, runtimeSec: 60, sources: [{ type: 'YOUTUBE', videoId: 'aaaaaaaaaaa' }] },
          ],
        },
      ],
    } as unknown as ContentTitle
    const [m] = playablesOf(movie)
    const [e] = playablesOf(show)
    expect(m).toMatchObject({ videoId: 1, titleId: 1 })
    expect(e).toMatchObject({ videoId: 21, titleId: 2, displayTitle: 'Dizi · S1 B1', runtimeSec: 60 })
    expect(methodOf(m!)).toBe('SCENE_DETECT')
    expect(methodOf(e!)).toBe('KEYFRAMES')
  })

  it('komut satırı', () => {
    expect(parseArgs([])).toMatchObject({ target: 'all', force: false, cache: null })
    expect(parseArgs(['80010001', '--force', '--cache', '/tmp/x', '--threshold', '0.2'])).toEqual({
      target: '80010001',
      force: true,
      cache: '/tmp/x',
      threshold: 0.2,
      media: null,
    })
    expect(() => parseArgs(['--threshold', '2'])).toThrow()
    expect(
      parseArgs(['80030001', '--media', '/m/bbb.webm', '--subs', '/m/bbb.tr.srt', '--note', 'CC-BY']),
    ).toMatchObject({
      target: '80030001',
      media: { file: '/m/bbb.webm', subs: '/m/bbb.tr.srt', note: 'CC-BY' },
    })
    expect(parseArgs([]).media).toBeNull()
    expect(() => parseArgs(['all', '--media', '/m/a.webm'])).toThrow(/tek bir yaprak/)
    expect(() => parseArgs(['1', '--subs', 'a.srt'])).toThrow(/yalnız --media/)
  })

  it('yerel altyazı: SRT, VTT ve dosya adından dil', () => {
    const srt =
      '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\nMerhaba <i>dünya</i>.\r\n\r\n2\r\n00:01:00,000 --> 00:01:01,000\r\nİkinci.\r\n'
    expect(srtToVtt('x').startsWith('WEBVTT')).toBe(true)
    const cues = parseSubtitleText(srt, '/a/film.tr.srt')
    expect(cues).toHaveLength(2)
    expect(cues[0]!.begin).toBe(10_000_000)
    expect(cues[1]!.end).toBe(610_000_000)
    expect(textForSpans(cues, [[0, 100]])).toEqual(['Merhaba dünya. İkinci.'])
    expect(parseSubtitleText('WEBVTT\n\n00:00.500 --> 00:01.000\nSelam', 'x.vtt')).toHaveLength(1)
    expect(subtitleLangOf('/a/film.tr.srt')).toBe('tr')
    expect(subtitleLangOf('/a/film.ENG.vtt')).toBe('eng')
    expect(subtitleLangOf('/a/film.srt')).toBe('und')
  })

  it('yerel medyayla çözümlenen yaprak birleşik KEYFRAMES dosyasından çıkarılır', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tvplus-kf-'))
    const entry = (videoId: number) => ({
      videoId,
      titleId: videoId,
      youtubeId: null,
      durationSec: 10,
      tried: 0,
      fetched: 0,
      flags: ['NO_IMAGE'],
      shots: [{ i: 0, s: 0, e: 10, v: null, a: null, t: '', k: null }],
    })
    const file = join(dir, 'keyframes.json')
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        method: 'KEYFRAMES',
        generatedAt: 'x',
        textSource: 'SYNOPSIS',
        sprite: null,
        videos: [entry(1), entry(2)],
      }),
    )
    expect(await removeFromKeyframes(dir, 2)).toBe(true)
    expect(
      (JSON.parse(readFileSync(file, 'utf8')) as { videos: { videoId: number }[] }).videos.map((v) => v.videoId),
    ).toEqual([1])
    expect(await removeFromKeyframes(dir, 2)).toBe(false)
    expect(await removeFromKeyframes(mkdtempSync(join(tmpdir(), 'tvplus-kf-')), 1)).toBe(false)
  })
})

describe('embed-catalog: dışa aktarma biçimi', () => {
  it('model satırı + yaprak satırları; dosya sağlayıcısının okuduğu biçim', () => {
    const lines = [
      ...exportLines({ id: 'taban', version: 'v1', dims: 2 }, [
        {
          videoId: 5,
          titleId: 4,
          count: 2,
          shots: Float32Array.from([1, 0, 0.1234567, 0.5]),
          pooled: Float32Array.from([0.6, 0.8]),
        },
      ]),
    ]
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'model', id: 'taban', version: 'v1', dims: 2 })
    const v = JSON.parse(lines[1]!) as { kind: string; videoId: number; shots: number[][]; pooled: number[] }
    expect(v.kind).toBe('video')
    expect(v.videoId).toBe(5)
    expect(v.shots).toEqual([
      [1, 0],
      [0.123457, 0.5],
    ])
    expect(v.pooled.map((x) => Math.round(x * 10) / 10)).toEqual([0.6, 0.8])
    expect(parseExportArgs(['--out', 'a.jsonl'])).toEqual({ out: 'a.jsonl' })
    expect(parseExportArgs(['--out=b.jsonl'])).toEqual({ out: 'b.jsonl' })
  })
})
