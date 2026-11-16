// Görüntü: doğrusal (linear) renk → ekran rengi. Işık hesabı doğrusal uzayda yapılır (ışık enerjisi toplanır);
// ekranlar ise sRGB eğrisiyle kodlanmış değer bekler. Düzeltme yapılmazsa görüntü karanlık ve sert görünür.
// sRGB: c ≤ 0,0031308 ise 12,92·c, değilse 1,055·c^(1/2,4) − 0,055. Sonra [0,1] kırpılıp 0..255'e yuvarlanır.
// PPM (P6): en basit resim biçimi — "P6\n<en> <boy>\n255\n" başlığı + ham RGB baytları.
// Genişletme: ton eşleme (ör. ACES) parlak sahnelerde kırpılmayı önler; `toSrgb8`'den önce uygulayın.

export interface RgbaImage {
  width: number
  height: number
  /** Satır satır RGBA, 8 bit. */
  data: Uint8ClampedArray
}

export function linearToSrgb(c: number): number {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

export function toByte(linear: number): number {
  return Math.round(linearToSrgb(linear) * 255)
}

export function encodePpm(image: RgbaImage): Uint8Array {
  const header = new TextEncoder().encode(`P6\n${image.width} ${image.height}\n255\n`)
  const out = new Uint8Array(header.length + image.width * image.height * 3)
  out.set(header)
  for (let i = 0, j = header.length; i < image.width * image.height; i++) {
    out[j++] = image.data[i * 4] as number
    out[j++] = image.data[i * 4 + 1] as number
    out[j++] = image.data[i * 4 + 2] as number
  }
  return out
}

/** Piksel verisinin FNV-1a özeti (testlerde "görüntü değişmedi mi?" sorusu için). */
export function pixelHash(data: Uint8ClampedArray | Uint8Array): string {
  let hash = 0x811c9dc5
  for (const byte of data) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
