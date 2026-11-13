import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { convertToTtml, parseTtml, parseVtt, ttmlTimeToTicks, vttTimeToTicks } from '../src/services/subtitles/convert'
import { planeOf } from '../src/services/playback/plane'
import { createTestApp } from './helpers'

const VTT = `WEBVTT
Kind: captions

NOTE bu bir not
--> içinde ok olsa bile atlanır

1
01:47.250 --> 01:50.500 align:start position:10%
Bu bıçağın karanlık bir geçmişi var.

01:58.000 --> 02:01.450
Bu kadar hazırlıksız ve yalnız başına
<i>seyahat</i> etmekle &amp; aptallık ediyorsun.

1:00:00.001 --> 1:00:02.999
<v Konuşan>Saat biçimi</v> &lt;tamam&gt;

00:10.000 --> 00:09.000
geçersiz (bitiş başlangıçtan önce)
`

const TTML_CLOCK = `<?xml version="1.0" encoding="UTF-8"?>
<tt xml:lang="" xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling">
  <head>
    <styling><style xml:id="it" tts:fontStyle="italic"/></styling>
  </head>
  <body>
    <div>
      <p begin="00:00:23.000" end="00:00:24.500" >You're a jerk, Thom.<br /></p>
      <p begin="00:00:27.000" end="00:00:30.500" >...you have your robotics, and<br />I just want to be awesome in space.<br /></p>
      <p begin="00:00:30.8" end="00:00:34.0000001"><span style="it">italik</span> ve düz &amp; işaret</p>
      <p begin="41.035s" dur="965ms"><span tts:fontStyle="italic">ofset zamanı</span></p>
    </div>
  </body>
</tt>`

describe('zaman çevirimi (tik = 1/10 000 000 sn)', () => {
  it('VTT zamanları tamsayı olarak çevrilir', () => {
    expect(vttTimeToTicks('01:47.250')).toBe(1_072_500_000)
    expect(vttTimeToTicks('00:00:01.001')).toBe(10_010_000)
    expect(vttTimeToTicks('1:00:00.001')).toBe(36_000_010_000)
    expect(vttTimeToTicks('xx')).toBeNull()
  })
  it('TTML saat, kare ve ofset biçimleri', () => {
    expect(ttmlTimeToTicks('00:00:23.000')).toBe(230_000_000)
    expect(ttmlTimeToTicks('00:00:26.965')).toBe(269_650_000)
    expect(ttmlTimeToTicks('00:00:01.0000001')).toBe(10_000_001)
    expect(ttmlTimeToTicks('41.035s')).toBe(410_350_000)
    expect(ttmlTimeToTicks('965ms')).toBe(9_650_000)
    expect(ttmlTimeToTicks('1.5m')).toBe(900_000_000)
    expect(ttmlTimeToTicks('14612515t', { tickRate: 10_000_000, frameRate: 30, subFrameRate: 1 })).toBe(14_612_515)
    expect(ttmlTimeToTicks('00:00:01:12', { tickRate: 1, frameRate: 24, subFrameRate: 1 })).toBe(15_000_000)
  })
})

describe('WebVTT → TTML', () => {
  const cues = parseVtt(VTT)
  it('cue sayısı, zamanlar ve satırlar', () => {
    expect(cues).toHaveLength(3)
    expect(cues[0]).toEqual({
      begin: 1_072_500_000,
      end: 1_105_000_000,
      lines: [[{ text: 'Bu bıçağın karanlık bir geçmişi var.', italic: false, bold: false }]],
    })
    expect(cues[1]!.lines).toHaveLength(2)
    expect(cues[1]!.lines[0]![0]!.text).toBe('Bu kadar hazırlıksız ve yalnız başına') // sondaki boşluk kırpıldı
    expect(cues[1]!.lines[1]).toEqual([
      { text: 'seyahat', italic: true, bold: false },
      { text: ' etmekle & aptallık ediyorsun.', italic: false, bold: false },
    ])
    expect(cues[2]!.lines[0]![0]!.text).toBe('Saat biçimi <tamam>')
  })
  it('çıktı sözleşmedeki biçimde', () => {
    const { ttml, cues: n } = convertToTtml(VTT, 'vtt', { lang: 'tr' })
    expect(n).toBe(3)
    expect(ttml).toContain('xmlns="http://www.w3.org/ns/ttml"')
    expect(ttml).toContain('xmlns:ttp="http://www.w3.org/ns/ttml#parameter"')
    expect(ttml).toContain('xmlns:tvpm="urn:tvplus:ttml#metadata"')
    expect(ttml).toContain('ttp:tickRate="10000000"')
    expect(ttml).toContain('xml:lang="tr"')
    expect(ttml).toContain(
      '<p begin="1072500000t" end="1105000000t"><span>Bu bıçağın karanlık bir geçmişi var.</span></p>',
    )
    expect(ttml).toContain(
      '<p begin="1180000000t" end="1214500000t"><span>Bu kadar hazırlıksız ve yalnız başına</span><br/><span tts:fontStyle="italic">seyahat</span><span> etmekle &amp; aptallık ediyorsun.</span></p>',
    )
    expect(ttml).toContain('&lt;tamam&gt;')
    // geçerli XML
    const doc = new XMLParser({ ignoreAttributes: false }).parse(ttml) as { tt: { body: { div: { p: unknown[] } } } }
    expect(doc.tt.body.div.p).toHaveLength(3)
  })
  it('başlıksız dosya reddedilir', () => {
    expect(() => parseVtt('00:01.000 --> 00:02.000\nx')).toThrow()
  })
})

describe('saat-zamanlı TTML → tik TTML', () => {
  it('br, italik biçem, dur ve ofsetler korunur', () => {
    const cues = parseTtml(TTML_CLOCK)
    expect(cues).toHaveLength(4)
    expect(cues[0]).toEqual({
      begin: 230_000_000,
      end: 245_000_000,
      lines: [[{ text: "You're a jerk, Thom.", italic: false, bold: false }]],
    })
    expect(cues[1]!.lines.map((l) => l[0]!.text)).toEqual([
      '...you have your robotics, and',
      'I just want to be awesome in space.',
    ])
    expect(cues[2]!.begin).toBe(308_000_000)
    expect(cues[2]!.end).toBe(340_000_001)
    expect(cues[2]!.lines[0]).toEqual([
      { text: 'italik', italic: true, bold: false },
      { text: ' ve düz & işaret', italic: false, bold: false },
    ])
    expect(cues[3]).toEqual({
      begin: 410_350_000,
      end: 420_000_000,
      lines: [[{ text: 'ofset zamanı', italic: true, bold: false }]],
    })
    const { ttml } = convertToTtml(TTML_CLOCK, 'ttml', { lang: 'en' })
    expect(ttml).toContain(
      '<p begin="270000000t" end="305000000t"><span>...you have your robotics, and</span><br/><span>I just want to be awesome in space.</span></p>',
    )
    expect(ttml).toContain('<tvpm:source>ttml</tvpm:source>')
  })
  it('çıktı yeniden okunduğunda aynı zamanlar (gidiş-dönüş)', () => {
    const first = convertToTtml(TTML_CLOCK, 'ttml', { lang: 'en' }).ttml
    const again = parseTtml(first)
    expect(again.map((c) => [c.begin, c.end])).toEqual(parseTtml(TTML_CLOCK).map((c) => [c.begin, c.end]))
    expect(again[2]!.lines[0]![0]!.italic).toBe(true)
  })
})

describe('OCA altyazı ucu', () => {
  it('yerel VTT dosyasını imzalı adresle TTML olarak verir', async () => {
    const app = await createTestApp()
    try {
      const dir = mkdtempSync(join(tmpdir(), 'tvplus-alt-'))
      const file = join(dir, 'ornek.tr.vtt')
      writeFileSync(file, VTT)
      const plane = planeOf(app)
      const rec = plane.objects.register({ kind: 'text', path: file, format: 'vtt', lang: 'tr' })
      const q = plane.signer.query('c102-ist001-ix', rec.o, rec.v)
      const res = await app.inject({ method: 'GET', url: `/oca/c102-ist001-ix/timedtext/T-tr?${q}` })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('application/ttml+xml')
      expect(res.headers['x-tvplus-oca']).toBe('c102-ist001-ix')
      expect(res.body).toContain('ttp:tickRate="10000000"')
      expect(res.body).toContain('begin="1072500000t"')
      // imzasız / başka düğümün imzası → 403
      const bad = await app.inject({ method: 'GET', url: `/oca/c101-ist001-ix/timedtext/T-tr?${q}` })
      expect(bad.statusCode).toBe(403)
      // uzak kaynak çevrimdışıyken önbellekte değilse 502
      const remote = plane.objects.register({
        kind: 'text',
        url: 'https://example.invalid/x.vtt',
        format: 'vtt',
        lang: 'en',
      })
      const r2 = await app.inject({
        method: 'GET',
        url: `/oca/c101-ist001-ix/timedtext/T-en?${plane.signer.query('c101-ist001-ix', remote.o, remote.v)}`,
      })
      expect(r2.statusCode).toBe(502)
    } finally {
      await app.close()
    }
  })
})
