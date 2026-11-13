/**
 * TTML altyazı ayrıştırıcı (Netflix'in tik tabanlı TTML'i). Tarayıcıya ve Node'a bağımlı olmayan küçük bir XML
 * okuyucuyla çalışır: `ttp:tickRate`, `ttp:frameRate`, `begin`/`end`/`dur` (tik `14612515t`, ofset `1.5s`/`200ms`,
 * saat `00:01:02.500` ya da `00:01:02:12` kare), `<br/>`, italik (`tts:fontStyle="italic"`, stil başvurusu ya da `<i>`).
 */

export interface CueSpan {
  text: string
  italic: boolean
}
export interface TtmlCue {
  start: number
  end: number
  /** satırlar → parçalar */
  lines: CueSpan[][]
}
export interface TtmlDocument {
  language: string | null
  tickRate: number
  cues: TtmlCue[]
}

/* ───────────── küçük XML okuyucu ───────────── */

interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: (XmlNode | string)[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e] ?? m
  })
}

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [] }
  const stack: XmlNode[] = [root]
  let last = 0
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(xml))) {
    const top = stack[stack.length - 1]!
    if (m.index > last) top.children.push(decodeEntities(xml.slice(last, m.index)))
    last = TOKEN.lastIndex
    if (m[1] !== undefined) {
      top.children.push(m[1])
      continue
    }
    const name = m[3]
    if (!name) continue // yorum, işlem talimatı, DOCTYPE
    if (m[2] === '/') {
      // kapanış etiketi: eşleşen açılışa kadar yığından çık
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.name === name) {
          stack.length = i
          break
        }
      }
      continue
    }
    const attrs: Record<string, string> = {}
    ATTR.lastIndex = 0
    let a: RegExpExecArray | null
    const attrText = m[4] ?? ''
    while ((a = ATTR.exec(attrText))) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '')
    const node: XmlNode = { name, attrs, children: [] }
    top.children.push(node)
    if (m[5] !== '/') stack.push(node)
  }
  if (last < xml.length) stack[stack.length - 1]!.children.push(decodeEntities(xml.slice(last)))
  return root
}

/** Ad alanı önekini atar: 'tt:p' → 'p'. */
function local(name: string): string {
  const i = name.indexOf(':')
  return i >= 0 ? name.slice(i + 1) : name
}

function attr(n: XmlNode, localName: string): string | undefined {
  for (const [k, v] of Object.entries(n.attrs)) if (local(k) === localName) return v
  return undefined
}

function find(n: XmlNode, localName: string): XmlNode | null {
  for (const c of n.children) {
    if (typeof c === 'string') continue
    if (local(c.name) === localName) return c
    const r = find(c, localName)
    if (r) return r
  }
  return null
}

/* ───────────── zaman ifadeleri ───────────── */

export interface TimeContext {
  tickRate: number
  frameRate: number
}

/** TTML zaman ifadesi → saniye. Geçersizse null. */
export function parseTimeExpression(v: string, ctx: TimeContext): number | null {
  const s = v.trim()
  const offset = /^(\d+(?:\.\d+)?)(h|m|s|ms|f|t)$/.exec(s)
  if (offset) {
    const n = parseFloat(offset[1]!)
    switch (offset[2]) {
      case 'h':
        return n * 3600
      case 'm':
        return n * 60
      case 's':
        return n
      case 'ms':
        return n / 1000
      case 'f':
        return n / ctx.frameRate
      case 't':
        return n / ctx.tickRate
    }
  }
  const clock = /^(\d+):(\d{2}):(\d{2})(?:(\.\d+)|:(\d+(?:\.\d+)?))?$/.exec(s)
  if (clock) {
    const h = parseInt(clock[1]!, 10)
    const m = parseInt(clock[2]!, 10)
    const sec = parseInt(clock[3]!, 10)
    const frac = clock[4] ? parseFloat(clock[4]) : 0
    const frames = clock[5] ? parseFloat(clock[5]) / ctx.frameRate : 0
    return h * 3600 + m * 60 + sec + frac + frames
  }
  return null
}

/* ───────────── belge → ipuçları ───────────── */

function isItalicStyle(n: XmlNode, italicStyles: Set<string>): boolean | null {
  const fs = attr(n, 'fontStyle')
  if (fs) return fs === 'italic' || fs === 'oblique'
  const style = attr(n, 'style')
  if (style) {
    for (const id of style.split(/\s+/)) if (italicStyles.has(id)) return true
  }
  return null
}

function collectLines(p: XmlNode, italicStyles: Set<string>, inheritedItalic: boolean): CueSpan[][] {
  const lines: CueSpan[][] = [[]]
  const walk = (n: XmlNode, italic: boolean) => {
    for (const c of n.children) {
      if (typeof c === 'string') {
        const text = c.replace(/\s+/g, ' ')
        if (text) lines[lines.length - 1]!.push({ text, italic })
        continue
      }
      const name = local(c.name)
      if (name === 'br') {
        lines.push([])
        continue
      }
      const own = isItalicStyle(c, italicStyles)
      walk(c, name === 'i' ? true : own ?? italic)
    }
  }
  walk(p, inheritedItalic)
  // satır başı/sonu boşluklarını kırp, boş parçaları at, bitişik aynı biçimli parçaları birleştir
  const out: CueSpan[][] = []
  for (const line of lines) {
    const merged: CueSpan[] = []
    for (const s of line) {
      const prev = merged[merged.length - 1]
      if (prev && prev.italic === s.italic) prev.text += s.text
      else merged.push({ ...s })
    }
    if (merged.length) {
      merged[0]!.text = merged[0]!.text.replace(/^\s+/, '')
      const lastSpan = merged[merged.length - 1]!
      lastSpan.text = lastSpan.text.replace(/\s+$/, '')
    }
    const clean = merged.filter((s) => s.text.length > 0)
    if (clean.length) out.push(clean)
  }
  return out
}

export function parseTtml(xml: string): TtmlDocument {
  const root = parseXml(xml)
  const tt = find(root, 'tt')
  if (!tt) throw new Error('TTML: <tt> kök öğesi yok')
  const tickRateAttr = attr(tt, 'tickRate')
  const frameRateAttr = attr(tt, 'frameRate')
  const frameRate = frameRateAttr ? parseFloat(frameRateAttr) || 30 : 30
  // Belirtilmemişse TTML kuralı: tickRate = frameRate (yoksa 1); Netflix her zaman 10 000 000 yazar
  const tickRate = tickRateAttr ? parseFloat(tickRateAttr) || 1 : frameRateAttr ? frameRate : 1
  const ctx: TimeContext = { tickRate, frameRate }
  const language = tt.attrs['xml:lang'] ?? null

  const italicStyles = new Set<string>()
  const head = find(tt, 'head')
  if (head) {
    const walkStyles = (n: XmlNode) => {
      for (const c of n.children) {
        if (typeof c === 'string') continue
        if (local(c.name) === 'style') {
          const id = c.attrs['xml:id'] ?? attr(c, 'id')
          const fs = attr(c, 'fontStyle')
          if (id && (fs === 'italic' || fs === 'oblique')) italicStyles.add(id)
        }
        walkStyles(c)
      }
    }
    walkStyles(head)
  }

  const cues: TtmlCue[] = []
  const body = find(tt, 'body')
  const visit = (n: XmlNode, parentBegin: number, parentItalic: boolean) => {
    const begin = attr(n, 'begin')
    const offset = begin !== undefined ? (parseTimeExpression(begin, ctx) ?? 0) : 0
    const myBegin = parentBegin + offset
    const italic = isItalicStyle(n, italicStyles) ?? parentItalic
    if (local(n.name) === 'p') {
      const endAttr = attr(n, 'end')
      const durAttr = attr(n, 'dur')
      let end: number | null = null
      if (endAttr !== undefined) {
        const e = parseTimeExpression(endAttr, ctx)
        if (e !== null) end = parentBegin + e
      } else if (durAttr !== undefined) {
        const d = parseTimeExpression(durAttr, ctx)
        if (d !== null) end = myBegin + d
      }
      if (begin === undefined || end === null || end <= myBegin) return
      const lines = collectLines(n, italicStyles, italic)
      if (lines.length) cues.push({ start: myBegin, end, lines })
      return
    }
    for (const c of n.children) if (typeof c !== 'string') visit(c, myBegin, italic)
  }
  if (body) visit(body, 0, false)
  cues.sort((a, b) => a.start - b.start || a.end - b.end)
  return { language, tickRate, cues }
}

/** `t` anında görünen ipuçları (çakışanlar dahil). */
export function activeCues(cues: TtmlCue[], t: number): TtmlCue[] {
  const out: TtmlCue[] = []
  for (const c of cues) {
    if (c.start > t) break
    if (t < c.end) out.push(c)
  }
  return out
}
