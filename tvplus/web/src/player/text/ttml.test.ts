import { describe, expect, it } from 'vitest'
import { activeCues, parseTimeExpression, parseTtml } from './ttml'

const ctx = { tickRate: 10_000_000, frameRate: 25 }

describe('TTML zaman ifadeleri', () => {
  it('tik, ofset ve saat biçimlerini okur', () => {
    expect(parseTimeExpression('14612515t', ctx)).toBeCloseTo(1.4612515, 7)
    expect(parseTimeExpression('1.5s', ctx)).toBe(1.5)
    expect(parseTimeExpression('250ms', ctx)).toBe(0.25)
    expect(parseTimeExpression('2m', ctx)).toBe(120)
    expect(parseTimeExpression('1h', ctx)).toBe(3600)
    expect(parseTimeExpression('50f', ctx)).toBe(2)
    expect(parseTimeExpression('00:01:02.500', ctx)).toBeCloseTo(62.5)
    expect(parseTimeExpression('01:00:00:12', ctx)).toBeCloseTo(3600.48)
    expect(parseTimeExpression('saçma', ctx)).toBeNull()
  })
})

describe('TTML ayrıştırıcı', () => {
  it('Netflix biçimi: tickRate, <br/>, span, italik stil, varlıklar', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling"
    xmlns:tvpm="urn:tvplus:ttml#metadata" ttp:tickRate="10000000" xml:lang="tr">
  <head><styling><style xml:id="it" tts:fontStyle="italic"/></styling></head>
  <body><div>
    <p begin="14612515t" end="32565033t"><span>Bir şey mi arıyorsun?</span><br/><span style="it">İkinci  satır</span></p>
    <p begin="40000000t" end="50000000t">Çağrı &amp; yanıt — &quot;ılık&quot;</p>
    <!-- yorum -->
    <p begin="00:00:06.000" end="00:00:07.250"><span tts:fontStyle="italic">Fısıltı</span> ve normal</p>
  </div></body>
</tt>`
    const doc = parseTtml(xml)
    expect(doc.tickRate).toBe(10_000_000)
    expect(doc.language).toBe('tr')
    expect(doc.cues).toHaveLength(3)
    const [a, b, c] = doc.cues
    expect(a!.start).toBeCloseTo(1.4612515)
    expect(a!.end).toBeCloseTo(3.2565033)
    expect(a!.lines).toEqual([
      [{ text: 'Bir şey mi arıyorsun?', italic: false }],
      [{ text: 'İkinci satır', italic: true }],
    ])
    expect(b!.lines).toEqual([[{ text: 'Çağrı & yanıt — "ılık"', italic: false }]])
    expect(c!.start).toBe(6)
    expect(c!.end).toBe(7.25)
    expect(c!.lines).toEqual([
      [
        { text: 'Fısıltı', italic: true },
        { text: ' ve normal', italic: false },
      ],
    ])
  })

  it('kalın (tts:fontWeight) ve italik parçalar', () => {
    const xml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000">
      <body><div><p begin="0t" end="10000000t"><span tts:fontWeight="bold">KADIN:</span> Gel <span tts:fontStyle="italic">buraya</span></p></div></body></tt>`
    expect(parseTtml(xml).cues[0]!.lines).toEqual([
      [
        { text: 'KADIN:', italic: false, bold: true },
        { text: ' Gel ', italic: false },
        { text: 'buraya', italic: true },
      ],
    ])
  })

  it('dur özniteliği ve ad alanı önekli öğeler; tickRate yoksa 1', () => {
    const xml = `<tt:tt xmlns:tt="http://www.w3.org/ns/ttml"><tt:body><tt:div begin="10s">
      <tt:p begin="1s" dur="2s">Önekli<tt:br/>öğe</tt:p></tt:div></tt:body></tt:tt>`
    const doc = parseTtml(xml)
    expect(doc.tickRate).toBe(1)
    expect(doc.cues).toEqual([
      { start: 11, end: 13, lines: [[{ text: 'Önekli', italic: false }], [{ text: 'öğe', italic: false }]] },
    ])
  })

  it('etkin ipuçlarını zamana göre seçer, sıralar', () => {
    const xml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="1000">
      <body><div><p begin="3000t" end="4000t">ikinci</p><p begin="1000t" end="3500t">birinci</p></div></body></tt>`
    const doc = parseTtml(xml)
    expect(doc.cues.map((c) => c.lines[0]![0]!.text)).toEqual(['birinci', 'ikinci'])
    expect(activeCues(doc.cues, 0.5)).toEqual([])
    expect(activeCues(doc.cues, 3.2).length).toBe(2)
    expect(activeCues(doc.cues, 4).length).toBe(0)
  })
})
