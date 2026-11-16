// Kaynak haritası (Source Map v3), basit satır eşlemesi: paketteki her satır, geldiği dosyanın ilgili satırına
// (sütun 0) eşlenir; paketleyicinin kendi ürettiği satırlar eşlenmez. "mappings" alanı satırları ";" ile,
// bölütleri "," ile ayırır; her bölüt bir öncekine göre farkları Base64-VLQ ile yazar:
//   [üretilen sütun, kaynak sırası, kaynak satırı, kaynak sütunu]
// VLQ: işaret en düşük bite taşınır, 5 bitlik gruplar "devam" biti ile Base64 karakterlerine yazılır.
// Genişletme: sütun düzeyinde eşleme için belirteç konumlarından her belirtece bir bölüt üretin.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function encodeVlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1
  let out = ''
  do {
    let digit = rest & 31
    rest >>>= 5
    if (rest > 0) digit |= 32
    out += BASE64[digit]
  } while (rest > 0)
  return out
}

export function decodeVlq(text: string): number[] {
  const values: number[] = []
  let value = 0
  let shift = 0
  for (const ch of text) {
    const digit = BASE64.indexOf(ch)
    if (digit < 0) throw new Error(`Geçersiz VLQ karakteri: "${ch}"`)
    value += (digit & 31) << shift
    if (digit & 32) shift += 5
    else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1)
      value = 0
      shift = 0
    }
  }
  return values
}

export interface SourceMapV3 {
  version: 3
  file: string
  sources: string[]
  sourcesContent: string[]
  names: string[]
  mappings: string
}

/** `lines[i]`: paketin i. satırının kaynağı (yoksa null). */
export function buildSourceMap(
  file: string,
  sources: string[],
  contents: string[],
  lines: ({ source: number; line: number } | null)[],
): SourceMapV3 {
  let previousSource = 0
  let previousLine = 0
  const mappings = lines
    .map((entry) => {
      if (!entry) return ''
      const segment =
        encodeVlq(0) + encodeVlq(entry.source - previousSource) + encodeVlq(entry.line - previousLine) + encodeVlq(0)
      previousSource = entry.source
      previousLine = entry.line
      return segment
    })
    .join(';')
  return { version: 3, file, sources, sourcesContent: contents, names: [], mappings }
}

/** Haritayı çözer: her üretilen satır için { kaynak, satır } (0 tabanlı) ya da null. */
export function decodeLines(map: SourceMapV3): ({ source: string; line: number } | null)[] {
  let source = 0
  let line = 0
  return map.mappings.split(';').map((segment) => {
    if (segment === '') return null
    const [, s = 0, l = 0] = decodeVlq(segment.split(',')[0] as string)
    source += s
    line += l
    return { source: map.sources[source] as string, line }
  })
}

/** UTF-8 güvenli Base64 (btoa yalnız Latin-1 kabul eder). */
export function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function inlineComment(map: SourceMapV3): string {
  return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Utf8(JSON.stringify(map))}`
}
