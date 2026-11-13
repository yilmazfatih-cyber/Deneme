/**
 * Altyazı dönüştürücü: WebVTT ya da saat-zamanlı TTML kaynağını Netflix tarzı tik tabanlı TTML'e çevirir
 * (shared/playback.ts §5): ttp:tickRate="10000000", begin/end tik cinsinden ("14612515t"),
 * `tvpm:` üstveri ad alanı, satır sonları <br/>, italik korunur.
 * Zamanlar tamsayı aritmetiğiyle çevrilir: "00:01:47.250" → 1072500000t (yuvarlama hatası yok).
 */
import { XMLParser } from 'fast-xml-parser'
import { TTML_TICK_RATE } from '../../../../shared/playback'

export interface CueRun {
  text: string
  italic: boolean
  bold: boolean
}
export interface Cue {
  /** tik (1 sn = 10 000 000) */
  begin: number
  end: number
  lines: CueRun[][]
}

const TICKS = TTML_TICK_RATE

/** Kesirli saniye basamaklarını (en çok 7) tike çevirir: "25" → 2 500 000. */
function fractionTicks(frac: string | undefined): number {
  if (!frac) return 0
  const digits = (frac + '0000000').slice(0, 7)
  return Number(digits)
}

/* ───────────── WebVTT ───────────── */

const VTT_TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/

export function vttTimeToTicks(s: string): number | null {
  const m = VTT_TIME.exec(s.trim())
  if (!m) return null
  const h = Number(m[1] ?? 0)
  const min = Number(m[2])
  const sec = Number(m[3])
  return (h * 3600 + min * 60 + sec) * TICKS + fractionTicks(m[4]!.padEnd(3, '0'))
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lrm: '‎',
  rlm: '‏',
}
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : all
    }
    return ENTITIES[name.toLowerCase()] ?? all
  })
}

/** VTT cue metnini satırlara ve biçimli parçalara ayırır (<i>, <b> korunur; <c>, <v>, <u>, zaman damgaları atılır). */
function parseVttText(text: string): CueRun[][] {
  const lines: CueRun[][] = []
  let italic = 0
  let bold = 0
  for (const rawLine of text.split('\n')) {
    const runs: CueRun[] = []
    const re = /<([^>]*)>/g
    let last = 0
    let m: RegExpExecArray | null
    const push = (t: string) => {
      const s = decodeEntities(t)
      if (s) runs.push({ text: s, italic: italic > 0, bold: bold > 0 })
    }
    while ((m = re.exec(rawLine))) {
      push(rawLine.slice(last, m.index))
      last = m.index + m[0].length
      const tag = m[1]!.trim()
      const closing = tag.startsWith('/')
      const name = (closing ? tag.slice(1) : tag).split(/[\s.]/)[0]!.toLowerCase()
      if (name === 'i') italic = Math.max(0, italic + (closing ? -1 : 1))
      else if (name === 'b') bold = Math.max(0, bold + (closing ? -1 : 1))
    }
    push(rawLine.slice(last))
    lines.push(normalizeRuns(runs))
  }
  return trimEmptyLines(lines)
}

export function parseVtt(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  if (!/^WEBVTT/.test(text)) throw new Error('WebVTT başlığı yok')
  const cues: Cue[] = []
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n')
    const timingIdx = lines.findIndex((l) => l.includes('-->'))
    if (timingIdx < 0) continue // WEBVTT başlığı, NOTE, STYLE, REGION
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0] ?? '')) continue
    const [left, rightWithSettings] = lines[timingIdx]!.split('-->')
    const right = (rightWithSettings ?? '').trim().split(/\s+/)[0] ?? ''
    const begin = vttTimeToTicks(left ?? '')
    const end = vttTimeToTicks(right)
    if (begin === null || end === null || end <= begin) continue
    const body = parseVttText(lines.slice(timingIdx + 1).join('\n'))
    if (body.length === 0) continue
    cues.push({ begin, end, lines: body })
  }
  return sortCues(cues)
}

/* ───────────── TTML (giriş) ───────────── */

interface TimeCtx {
  tickRate: number
  frameRate: number
  subFrameRate: number
}

export function ttmlTimeToTicks(s: string, ctx: TimeCtx = { tickRate: 1, frameRate: 30, subFrameRate: 1 }): number | null {
  const v = s.trim()
  let m = /^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(v)
  if (m) return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * TICKS + fractionTicks(m[4])
  m = /^(\d+):(\d{2}):(\d{2}):(\d+)(?:\.(\d+))?$/.exec(v)
  if (m) {
    const base = (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * TICKS
    const frames = Number(m[4]) + (m[5] ? Number(m[5]) / ctx.subFrameRate : 0)
    return base + Math.round((frames * TICKS) / ctx.frameRate)
  }
  m = /^(\d+)(?:\.(\d+))?(h|ms|m|s|f|t)$/.exec(v)
  if (m) {
    const whole = Number(m[1])
    const fracStr = m[2] ?? ''
    const frac = fracStr ? Number(`0.${fracStr}`) : 0
    switch (m[3]) {
      case 'h':
        return whole * 3600 * TICKS + Math.round(frac * 3600 * TICKS)
      case 'm':
        return whole * 60 * TICKS + Math.round(frac * 60 * TICKS)
      case 's':
        return whole * TICKS + fractionTicks(fracStr)
      case 'ms':
        return whole * (TICKS / 1000) + Math.round(frac * (TICKS / 1000))
      case 'f':
        return Math.round(((whole + frac) * TICKS) / ctx.frameRate)
      case 't':
        return Math.round(((whole + frac) * TICKS) / ctx.tickRate)
    }
  }
  return null
}

type XNode = Record<string, unknown>
const ATTRS = ':@'

const localName = (tag: string) => tag.slice(tag.indexOf(':') + 1)
function tagOf(node: XNode): string | null {
  for (const k of Object.keys(node)) if (k !== ATTRS) return k
  return null
}
function childrenOf(node: XNode): XNode[] {
  const tag = tagOf(node)
  const c = tag ? node[tag] : undefined
  return Array.isArray(c) ? (c as XNode[]) : []
}
function attrsOf(node: XNode): Record<string, string> {
  const a = node[ATTRS]
  const out: Record<string, string> = {}
  if (a && typeof a === 'object') {
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) out[k.replace(/^@_/, '')] = String(v)
  }
  return out
}
/** Ad alanı önekinden bağımsız öznitelik okuma: 'tts:fontStyle' ya da 'fontStyle'. */
function attr(attrs: Record<string, string>, local: string): string | undefined {
  for (const [k, v] of Object.entries(attrs)) if (localName(k) === local) return v
  return undefined
}

interface Style {
  italic?: boolean
  bold?: boolean
}

export function parseTtml(xml: string): Cue[] {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
  })
  const doc = parser.parse(xml) as XNode[]
  const tt = doc.find((n) => {
    const t = tagOf(n)
    return t !== null && localName(t) === 'tt'
  })
  if (!tt) throw new Error('TTML kök öğesi (tt) yok')
  const ttAttrs = attrsOf(tt)
  const ctx: TimeCtx = {
    tickRate: Number(attr(ttAttrs, 'tickRate') ?? 0) || 1,
    frameRate: (Number(attr(ttAttrs, 'frameRate') ?? 30) || 30) * frameRateMultiplier(attr(ttAttrs, 'frameRateMultiplier')),
    subFrameRate: Number(attr(ttAttrs, 'subFrameRate') ?? 1) || 1,
  }

  // Biçemler (styling/style xml:id)
  const styles = new Map<string, Style>()
  const collectStyles = (n: XNode) => {
    const t = tagOf(n)
    if (t && localName(t) === 'style') {
      const a = attrsOf(n)
      const id = attr(a, 'id')
      if (id) {
        const inherited = resolveStyleRefs(attr(a, 'style'), styles)
        styles.set(id, { ...inherited, ...styleFromAttrs(a) })
      }
    }
    for (const c of childrenOf(n)) collectStyles(c)
  }
  const cues: Cue[] = []

  const walk = (n: XNode, offset: number) => {
    const t = tagOf(n)
    if (!t) return
    const name = localName(t)
    if (name === 'head') {
      collectStyles(n)
      return
    }
    const a = attrsOf(n)
    if (name === 'p') {
      const b = attr(a, 'begin')
      const e = attr(a, 'end')
      const d = attr(a, 'dur')
      const begin = b !== undefined ? ttmlTimeToTicks(b, ctx) : 0
      if (begin === null) return
      let end: number | null = null
      if (e !== undefined) end = ttmlTimeToTicks(e, ctx)
      else if (d !== undefined) {
        const dur = ttmlTimeToTicks(d, ctx)
        end = dur === null ? null : begin + dur
      }
      if (end === null || end <= begin) return
      const base = { ...resolveStyleRefs(attr(a, 'style'), styles), ...styleFromAttrs(a) }
      const lines = ttmlInline(n, base, styles)
      if (lines.length) cues.push({ begin: offset + begin, end: offset + end, lines })
      return
    }
    let childOffset = offset
    if (name === 'body' || name === 'div') {
      const b = attr(a, 'begin')
      const bt = b !== undefined ? ttmlTimeToTicks(b, ctx) : null
      if (bt !== null) childOffset += bt
    }
    for (const c of childrenOf(n)) walk(c, childOffset)
  }
  for (const c of childrenOf(tt)) {
    const tn = tagOf(c)
    if (tn && localName(tn) === 'head') collectStyles(c)
  }
  for (const c of childrenOf(tt)) walk(c, 0)
  return sortCues(cues)
}

function frameRateMultiplier(s: string | undefined): number {
  if (!s) return 1
  const [a, b] = s.trim().split(/\s+/).map(Number)
  return a && b ? a / b : 1
}
function styleFromAttrs(a: Record<string, string>): Style {
  const s: Style = {}
  const fs = attr(a, 'fontStyle')
  if (fs !== undefined) s.italic = fs === 'italic' || fs === 'oblique'
  const fw = attr(a, 'fontWeight')
  if (fw !== undefined) s.bold = fw === 'bold'
  return s
}
function resolveStyleRefs(ref: string | undefined, styles: Map<string, Style>): Style {
  const out: Style = {}
  for (const id of (ref ?? '').split(/\s+/).filter(Boolean)) Object.assign(out, styles.get(id) ?? {})
  return out
}

/** <p> içeriğini satırlara böler: <br/> yeni satır, <span> biçemi devralır; boşluklar XML kuralıyla daraltılır. */
function ttmlInline(p: XNode, base: Style, styles: Map<string, Style>): CueRun[][] {
  const lines: CueRun[][] = [[]]
  const visit = (n: XNode, style: Style) => {
    if ('#text' in n) {
      const text = String(n['#text']).replace(/\s+/g, ' ')
      if (text) lines[lines.length - 1]!.push({ text, italic: !!style.italic, bold: !!style.bold })
      return
    }
    const t = tagOf(n)
    if (!t) return
    const name = localName(t)
    if (name === 'br') {
      lines.push([])
      return
    }
    const a = attrsOf(n)
    const s = name === 'span' ? { ...style, ...resolveStyleRefs(attr(a, 'style'), styles), ...styleFromAttrs(a) } : style
    for (const c of childrenOf(n)) visit(c, s)
  }
  for (const c of childrenOf(p)) visit(c, base)
  return trimEmptyLines(lines.map(normalizeRuns))
}

/* ───────────── ortak ───────────── */

/** Bitişik aynı biçimli parçaları birleştirir, satır başı/sonu boşluklarını kırpar. */
function normalizeRuns(runs: CueRun[]): CueRun[] {
  const merged: CueRun[] = []
  for (const r of runs) {
    const prev = merged[merged.length - 1]
    if (prev && prev.italic === r.italic && prev.bold === r.bold) prev.text += r.text
    else merged.push({ ...r })
  }
  if (merged.length) {
    merged[0]!.text = merged[0]!.text.replace(/^[ \t]+/, '')
    const lastRun = merged[merged.length - 1]!
    lastRun.text = lastRun.text.replace(/[ \t]+$/, '')
  }
  return merged.filter((r) => r.text.length > 0)
}
function trimEmptyLines(lines: CueRun[][]): CueRun[][] {
  return lines.filter((l) => l.length > 0)
}
function sortCues(cues: Cue[]): Cue[] {
  return cues.sort((a, b) => a.begin - b.begin || a.end - b.end)
}

/* ───────────── TTML (çıkış) ───────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface TtmlMeta {
  lang: string
  sourceFormat: 'vtt' | 'ttml'
  trackId?: string
}

export function cuesToTtml(cues: Cue[], meta: TtmlMeta): string {
  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>')
  out.push(
    `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter"` +
      ` xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:tvpm="urn:tvplus:ttml#metadata"` +
      ` ttp:tickRate="${TICKS}" xml:lang="${esc(meta.lang)}">`,
  )
  out.push('<head>')
  out.push('<metadata>')
  if (meta.trackId) out.push(`<tvpm:track>${esc(meta.trackId)}</tvpm:track>`)
  out.push(`<tvpm:source>${meta.sourceFormat}</tvpm:source>`)
  out.push(`<tvpm:cueCount>${cues.length}</tvpm:cueCount>`)
  out.push('</metadata>')
  out.push('</head>')
  out.push('<body>')
  out.push('<div>')
  for (const c of cues) {
    const lines = c.lines.map((line) =>
      line
        .map((r) => {
          const a = `${r.italic ? ' tts:fontStyle="italic"' : ''}${r.bold ? ' tts:fontWeight="bold"' : ''}`
          return `<span${a}>${esc(r.text)}</span>`
        })
        .join(''),
    )
    out.push(`<p begin="${c.begin}t" end="${c.end}t">${lines.join('<br/>')}</p>`)
  }
  out.push('</div>')
  out.push('</body>')
  out.push('</tt>')
  return out.join('\n') + '\n'
}

/** Kaynağı biçimine göre çözer ve TTML üretir. */
export function convertToTtml(source: string, format: 'vtt' | 'ttml', meta: Omit<TtmlMeta, 'sourceFormat'>): { ttml: string; cues: number } {
  const cues = format === 'vtt' ? parseVtt(source) : parseTtml(source)
  return { ttml: cuesToTtml(cues, { ...meta, sourceFormat: format }), cues: cues.length }
}
