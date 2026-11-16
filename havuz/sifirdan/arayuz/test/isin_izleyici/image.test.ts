import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  adler32,
  crc32,
  encodePng,
  encodePngStored,
  encodePpm,
  exampleScene,
  linearToSrgb,
  pixelHash,
  render,
  renderTile,
  zlibStore,
  type RgbaImage,
} from '../../src/isin_izleyici/index.ts'

const bytes = (text: string) => new TextEncoder().encode(text)

/** Bağımsız PNG çözücü (yalnız testte): parçaları ve CRC'leri denetler, zlib ile açar, süzgeçleri geri alır. */
function decodePng(png: Uint8Array): RgbaImage {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []
  const types: string[] = []
  while (offset < png.length) {
    const length = view.getUint32(offset)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    const data = png.subarray(offset + 8, offset + 8 + length)
    expect(view.getUint32(offset + 8 + length)).toBe(crc32(png, offset + 4, offset + 8 + length))
    types.push(type)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      expect([...data.subarray(8)]).toEqual([8, 6, 0, 0, 0])
    }
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  expect(types).toEqual(['IHDR', 'IDAT', 'IEND'])
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = new Uint8ClampedArray(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[y * stride + i - 4]! : 0
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4]! : 0
      const p = a + b - c
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]!
      out[y * stride + i] = (raw[y * (stride + 1) + 1 + i]! + predictor) & 0xff
    }
  }
  return { width, height, data: out }
}

describe('sağlama toplamları ve zlib', () => {
  it('bilinen değerler: CRC-32("123456789") ve Adler-32("Wikipedia")', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(adler32(bytes('Wikipedia'))).toBe(0x11e60398)
  })

  it('sıkıştırmasız zlib akışını Node zlib açabilir (çok bloklu da)', () => {
    const data = new Uint8Array(140_000).map((_, i) => (i * 31) & 0xff)
    expect(Buffer.from(inflateSync(zlibStore(data))).equals(Buffer.from(data))).toBe(true)
    expect(inflateSync(zlibStore(new Uint8Array())).length).toBe(0)
  })
})

describe('görüntü', () => {
  it('sRGB gama eğrisi: uçlar, orta değer, kırpma', () => {
    expect(linearToSrgb(0)).toBe(0)
    expect(linearToSrgb(1)).toBeCloseTo(1, 12)
    expect(linearToSrgb(0.5)).toBeCloseTo(0.7353569830524495, 12)
    expect(linearToSrgb(2)).toBeCloseTo(1, 12)
    expect(linearToSrgb(-1)).toBe(0)
  })

  it('PPM başlığı ve boyutu', () => {
    const image = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) }
    const ppm = encodePpm(image)
    expect(new TextDecoder().decode(ppm.subarray(0, 11))).toBe('P6\n2 1\n255\n')
    expect([...ppm.subarray(11)]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('PNG gidiş-dönüş: sıkıştırmasız ve CompressionStream ile kodlananı bağımsız çözücü aynı piksellere açar', async () => {
    const image = render(exampleScene(), { width: 24, height: 16, samples: 1, seed: 3 })
    for (const png of [encodePngStored(image), await encodePng(image)]) {
      const decoded = decodePng(png)
      expect([decoded.width, decoded.height]).toEqual([24, 16])
      expect(Buffer.from(decoded.data).equals(Buffer.from(image.data))).toBe(true)
    }
    expect((await encodePng(image)).length).toBeLessThan(encodePngStored(image).length)
  })
})

describe('çizim', () => {
  it('küçük sahnenin piksel özeti sabittir (belirlenimci kenar yumuşatma)', () => {
    const image = render(exampleScene(), { width: 32, height: 24, samples: 2, seed: 1 })
    // Sahne, malzeme ya da gölgelendirme bilerek değiştirilirse bu özet de güncellenmelidir.
    expect(pixelHash(image.data)).toBe('6efd98d2')
  })

  it('karo karo çizim tüm görüntüyle aynı pikselleri verir', () => {
    const options = { width: 20, height: 12, samples: 2, seed: 5 }
    const scene = exampleScene()
    const full = render(scene, options)
    const tile = renderTile(scene, { x: 8, y: 4, w: 6, h: 5 }, options)
    for (let y = 0; y < 5; y++) {
      const row = full.data.subarray(((4 + y) * 20 + 8) * 4, ((4 + y) * 20 + 14) * 4)
      expect([...tile.subarray(y * 24, (y + 1) * 24)]).toEqual([...row])
    }
  })
})
