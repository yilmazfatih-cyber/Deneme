// Bayt düzeyi BPE tokenizer (tarayıcı + Node, bağımlılıksız). Python karşılığı: dil_modeli/tokenizer.py
// ve dil_modeli/bytelevel.py. Aynı tokenizer.json dosyasını okur, aynı kimlikleri üretir
// (eşlik: tokenizer.test.js, Python'un ürettiği sinama/vektorler.json ile).
// Genişletme: Kodlama kuralını değiştirirseniz Python tarafını da aynı biçimde değiştirin.

import { LETTER, NUMBER, WHITESPACE } from './unicode_classes.js'

function buildByteToChar() {
  const table = new Array(256).fill('')
  const printable = []
  for (let b = 0x21; b < 0x7f; b++) printable.push(b)
  for (let b = 0xa1; b < 0xad; b++) printable.push(b)
  for (let b = 0xae; b < 0x100; b++) printable.push(b)
  for (const b of printable) table[b] = String.fromCharCode(b)
  let extra = 0
  for (let b = 0; b < 256; b++) {
    if (!table[b]) table[b] = String.fromCharCode(256 + extra++)
  }
  return table
}

export const BYTE_TO_CHAR = buildByteToChar()
const CHAR_TO_BYTE = new Map(BYTE_TO_CHAR.map((ch, b) => [ch, b]))
const ENCODER = new TextEncoder()

function classBody(table) {
  return table
    .split(' ')
    .filter(Boolean)
    .map((item) => {
      const [lo, hi] = item.split('-')
      return hi ? `\\u{${lo}}-\\u{${hi}}` : `\\u{${lo}}`
    })
    .join('')
}

const L = classBody(LETTER)
const N = classBody(NUMBER)
const S = classBody(WHITESPACE)
// GPT-2 ön-bölme kuralı; sınıflar tablodan gelir (tarayıcının Unicode sürümünden bağımsız).
const PRETOKENIZE = new RegExp(
  `'s|'t|'re|'ve|'m|'ll|'d| ?[${L}]+| ?[${N}]+| ?[^${S}${L}${N}]+|[${S}]+(?![^${S}])|[${S}]+`,
  'gu',
)

/** Eşsiz vekil kod noktalarını U+FFFD yapar (Python'daki sanitize ile aynı). */
export function sanitize(text) {
  if (typeof text.toWellFormed === 'function') return text.toWellFormed()
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
}

export function pretokenize(text) {
  return text.match(PRETOKENIZE) ?? []
}

export function toByteLevel(text) {
  let out = ''
  for (const byte of ENCODER.encode(text)) out += BYTE_TO_CHAR[byte]
  return out
}

/** (sıra, konum) çiftine göre en küçüğü veren ikili yığın; Python'daki heapq ile aynı sıra. */
class MinHeap {
  constructor() {
    this.items = []
  }
  get size() {
    return this.items.length
  }
  static less(a, b) {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
  }
  push(item) {
    const items = this.items
    items.push(item)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!MinHeap.less(items[i], items[parent])) break
      ;[items[i], items[parent]] = [items[parent], items[i]]
      i = parent
    }
  }
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < items.length && MinHeap.less(items[left], items[smallest])) smallest = left
        if (right < items.length && MinHeap.less(items[right], items[smallest])) smallest = right
        if (smallest === i) break
        ;[items[i], items[smallest]] = [items[smallest], items[i]]
        i = smallest
      }
    }
    return top
  }
}

export class Tokenizer {
  /** @param {object} data tokenizer.json içeriği (JSON.parse edilmiş) */
  constructor(data) {
    const model = data?.model
    if (!model || model.type !== 'BPE' || data.pre_tokenizer?.type !== 'ByteLevel') {
      throw new Error('Bu tokenizer.json desteklenmiyor: bayt düzeyi BPE (dil_modeli biçimi) bekleniyor.')
    }
    this.vocab = new Map(Object.entries(model.vocab))
    this.tokens = []
    for (const [token, id] of this.vocab) this.tokens[id] = token
    this.ranks = new Map()
    model.merges.forEach((merge, rank) => {
      const [a, b] = typeof merge === 'string' ? merge.split(' ') : merge
      // Bayt düzeyi simgelerde boşluk karakteri yoktur (boşluk 'Ġ' olur), anahtar güvenli.
      this.ranks.set(`${a} ${b}`, rank)
    })
    this.special = new Map((data.added_tokens ?? []).map((t) => [t.content, t.id]))
    this.specialIds = new Set(this.special.values())
    const names = [...this.special.keys()].sort((a, b) => b.length - a.length)
    this.specialRe = names.length ? new RegExp(names.map(escapeRegExp).join('|'), 'g') : null
    this.bytes = this.tokens.map((token) => this.tokenBytes(token))
    this.cache = new Map()
  }

  get vocabSize() {
    return this.tokens.length
  }

  specialId(name) {
    const id = this.special.get(name)
    if (id === undefined) throw new Error(`Bu tokenizer'da ${name} özel belirteci yok.`)
    return id
  }

  tokenBytes(token) {
    if (this.special.has(token)) return ENCODER.encode(token)
    const out = new Uint8Array(token.length)
    for (let i = 0; i < token.length; i++) {
      const byte = CHAR_TO_BYTE.get(token[i])
      if (byte === undefined) return ENCODER.encode(token)
      out[i] = byte
    }
    return out
  }

  /** Metni kimliklere çevirir. allowSpecial: "<|son|>" gibi yazılar özel kimlik olsun mu. */
  encode(text, { allowSpecial = false } = {}) {
    const clean = sanitize(text)
    if (!allowSpecial || !this.specialRe) return this.encodePlain(clean)
    const ids = []
    let pos = 0
    for (const match of clean.matchAll(this.specialRe)) {
      if (match.index > pos) ids.push(...this.encodePlain(clean.slice(pos, match.index)))
      ids.push(this.special.get(match[0]))
      pos = match.index + match[0].length
    }
    if (pos < clean.length) ids.push(...this.encodePlain(clean.slice(pos)))
    return ids
  }

  encodePlain(text) {
    const ids = []
    for (const word of pretokenize(text)) {
      let cached = this.cache.get(word)
      if (cached === undefined) {
        cached = this.bpe(word)
        if (this.cache.size > 100000) this.cache.clear()
        this.cache.set(word, cached)
      }
      ids.push(...cached)
    }
    return ids
  }

  bpe(word) {
    const symbols = Array.from(toByteLevel(word))
    const n = symbols.length
    const ranks = this.ranks
    if (n > 1 && ranks.size) {
      const next = new Int32Array(n)
      const prev = new Int32Array(n)
      for (let i = 0; i < n; i++) {
        next[i] = i + 1 < n ? i + 1 : -1
        prev[i] = i - 1
      }
      const heap = new MinHeap()
      for (let i = 0; i < n - 1; i++) {
        const rank = ranks.get(`${symbols[i]} ${symbols[i + 1]}`)
        if (rank !== undefined) heap.push([rank, i, symbols[i] + symbols[i + 1]])
      }
      while (heap.size) {
        const [, i, merged] = heap.pop()
        const j = next[i]
        if (!symbols[i] || j < 0) continue
        if (!ranks.has(`${symbols[i]} ${symbols[j]}`) || symbols[i] + symbols[j] !== merged) continue
        symbols[i] = merged
        symbols[j] = ''
        const k = next[j]
        next[i] = k
        if (k >= 0) {
          prev[k] = i
          const rank = ranks.get(`${merged} ${symbols[k]}`)
          if (rank !== undefined) heap.push([rank, i, merged + symbols[k]])
        }
        const p = prev[i]
        if (p >= 0) {
          const rank = ranks.get(`${symbols[p]} ${merged}`)
          if (rank !== undefined) heap.push([rank, p, symbols[p] + merged])
        }
      }
    }
    return symbols.filter(Boolean).map((s) => this.vocab.get(s))
  }

  decodeBytes(ids, { skipSpecial = true } = {}) {
    const parts = []
    let size = 0
    for (const id of ids) {
      if (!Number.isInteger(id) || id < 0 || id >= this.bytes.length) {
        throw new Error(`Belirteç kimliği sözlük dışında: ${id}`)
      }
      if (skipSpecial && this.specialIds.has(id)) continue
      parts.push(this.bytes[id])
      size += this.bytes[id].length
    }
    const out = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      out.set(part, offset)
      offset += part.length
    }
    return out
  }

  decode(ids, options = {}) {
    return new TextDecoder('utf-8').decode(this.decodeBytes(ids, options))
  }
}

/** Belirteçleri tek tek alıp tamamlanan metni verir (yarım UTF-8 karakterini bekletir). */
export class StreamDecoder {
  constructor(tokenizer, { skipSpecial = true } = {}) {
    this.tokenizer = tokenizer
    this.skipSpecial = skipSpecial
    this.decoder = new TextDecoder('utf-8')
  }
  push(id) {
    return this.decoder.decode(this.tokenizer.decodeBytes([id], { skipSpecial: this.skipSpecial }), { stream: true })
  }
  flush() {
    return this.decoder.decode()
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
