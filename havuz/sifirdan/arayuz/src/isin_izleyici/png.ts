// Sıfırdan PNG kodlayıcı. PNG = 8 baytlık imza + parçalar (chunk). Her parça: uzunluk (4 bayt, büyük uçlu),
// tür ("IHDR", "IDAT", "IEND"), veri ve CRC-32 (tür + veri üzerinden).
// - IHDR: en, boy, bit derinliği 8, renk türü 6 (RGBA), sıkıştırma/süzgeç/geçmeli = 0.
// - IDAT: her satırın başına bir süzgeç baytı eklenmiş piksel verisi, zlib biçiminde sıkıştırılmış.
// Süzgeç: her satır için 5 süzgeçten (Yok, Sol, Üst, Ortalama, Paeth) "mutlak değer toplamı en küçük" olanı
// seçilir (libpng'nin önerdiği sezgi). Sıkıştırma: platformun `CompressionStream('deflate')`'i (zlib biçimi)
// ya da sıkıştırmasız "stored" bloklar (tamamen elle: zlib başlığı + bloklar + Adler-32).
// Genişletme: renk paleti (tür 3) ya da 16 bit derinlik için IHDR alanlarını ve satır baytlarını değiştirin.
import type { RgbaImage } from './image.ts'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff
  for (let i = start; i < end; i++) crc = (CRC_TABLE[(crc ^ (bytes[i] as number)) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** Sıkıştırmasız zlib akışı: başlık 0x78 0x01, en çok 65535 baytlık "stored" bloklar, Adler-32. */
export function zlibStore(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535))
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4)
  out[0] = 0x78
  out[1] = 0x01
  let o = 2
  for (let b = 0; b < blocks; b++) {
    const chunk = data.subarray(b * 65535, Math.min(data.length, (b + 1) * 65535))
    out[o++] = b === blocks - 1 ? 1 : 0
    out[o++] = chunk.length & 0xff
    out[o++] = chunk.length >>> 8
    out[o++] = ~chunk.length & 0xff
    out[o++] = (~chunk.length >>> 8) & 0xff
    out.set(chunk, o)
    o += chunk.length
  }
  new DataView(out.buffer).setUint32(o, adler32(data))
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Her satırı en uygun süzgeçle kodlar; çıktı satır başına (1 + en·4) bayttır. */
export function filterRows(image: RgbaImage, adaptive = true): Uint8Array<ArrayBuffer> {
  const stride = image.width * 4
  const out = new Uint8Array((stride + 1) * image.height)
  const candidate = new Uint8Array(stride)
  for (let y = 0; y < image.height; y++) {
    const row = image.data.subarray(y * stride, (y + 1) * stride)
    const up = y > 0 ? image.data.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride)
    let bestScore = Infinity
    for (let type = 0; type <= (adaptive ? 4 : 0); type++) {
      let score = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? (row[i - 4] as number) : 0
        const b = up[i] as number
        const c = i >= 4 ? (up[i - 4] as number) : 0
        const predictor = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c)
        const value = ((row[i] as number) - predictor) & 0xff
        candidate[i] = value
        score += value < 128 ? value : 256 - value
      }
      if (score < bestScore) {
        bestScore = score
        out[y * (stride + 1)] = type
        out.set(candidate, y * (stride + 1) + 1)
      }
    }
  }
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

function assemble(image: RgbaImage, idat: Uint8Array): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, image.width)
  view.setUint32(4, image.height)
  header.set([8, 6, 0, 0, 0], 8)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const part of parts) {
    out.set(part, o)
    o += part.length
  }
  return out
}

/** Sıkıştırmasız (ama tamamen geçerli) PNG; eşzamanlı. */
export function encodePngStored(image: RgbaImage): Uint8Array {
  return assemble(image, zlibStore(filterRows(image)))
}

/** Sıkıştırılmış PNG (CompressionStream: tarayıcı ve Node 18+). */
export async function encodePng(image: RgbaImage): Promise<Uint8Array> {
  const stream = new Blob([filterRows(image)]).stream().pipeThrough(new CompressionStream('deflate'))
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
  return assemble(image, compressed)
}
