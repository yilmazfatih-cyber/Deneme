/**
 * WebVTT okuyucu. Sunucu kipinde altyazılar OCA'dan TTML'e çevrilmiş gelir; durağan kipte (GitHub Pages) çeviren sunucu
 * yoktur ve belge kaynağın kendi VTT dosyasıdır. Sonuç TTML okuyucusuyla aynı biçimdedir (saniye cinsinden ipuçları).
 * Desteklenen: zaman damgaları (`00:01:02.500`, `01:02.500`), çok satır, <i>/<b> (iç içe), varlıklar; NOTE/STYLE/REGION
 * blokları ve ipucu ayarları yok sayılır, diğer etiketler (ses <v>, sınıf <c>, <u>, zaman) metinden ayıklanır.
 */
import { decodeEntities, type CueSpan, type TtmlCue, type TtmlDocument } from './ttml'

/** Belge VTT mi (BOM ve baştaki boşluk yok sayılır). */
export function isVtt(text: string): boolean {
  return /^\uFEFF?\s*WEBVTT(?:[ \t]|\r?\n|$)/.test(text)
}

function parseTimestamp(s: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(s.trim())
  if (!m) return null
  const ms = Number(m[4]!.padEnd(3, '0'))
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000
}

function spansOf(line: string, state: { italic: number; bold: number }): CueSpan[] {
  const out: CueSpan[] = []
  const re = /<(\/?)([a-z.]+)[^>]*>|([^<]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m[3] !== undefined) {
      const text = decodeEntities(m[3])
      if (text) {
        const span: CueSpan = { text, italic: state.italic > 0 }
        if (state.bold > 0) span.bold = true
        out.push(span)
      }
      continue
    }
    const tag = (m[2] ?? '').split('.')[0]!.toLowerCase()
    const delta = m[1] === '/' ? -1 : 1
    if (tag === 'i') state.italic = Math.max(0, state.italic + delta)
    else if (tag === 'b') state.bold = Math.max(0, state.bold + delta)
  }
  return out
}

export function parseVtt(input: string): TtmlDocument {
  const blocks = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
  const cues: TtmlCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((l, i) => i > 0 || l.trim() !== '')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const head = /^\s*(\S+)\s+-->\s+(\S+)/.exec(lines[ti]!)
    if (!head) continue
    const start = parseTimestamp(head[1]!)
    const end = parseTimestamp(head[2]!)
    if (start === null || end === null || end <= start) continue
    const state = { italic: 0, bold: 0 }
    const textLines = lines
      .slice(ti + 1)
      .map((l) => spansOf(l, state))
      .filter((l) => l.length > 0)
    if (textLines.length) cues.push({ start, end, lines: textLines })
  }
  cues.sort((a, b) => a.start - b.start || a.end - b.end)
  return { language: null, tickRate: 1000, cues }
}
