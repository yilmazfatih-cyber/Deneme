// Tohumlu rastgele sayı üreteci (mulberry32): aynı tohum → aynı dizi. Oyun mantığındaki tüm rastgelelik
// buradan gelir; böylece aynı girdi kaydı her makinede aynı oyunu yeniden üretir (belirlenimci tekrar).
// Durum tek bir 32 bit tamsayıdır: kaydedilip geri yüklenebilir (`state`).
// Genişletme: daha uzun periyot gerekirse xoshiro128** ile değiştirin; arayüz (next/range/int) aynı kalsın.

export class Rng {
  state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** [0, 1) aralığında sayı. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** [min, max] aralığında tamsayı. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Boş listeden seçim yapılamaz.')
    return items[this.int(0, items.length - 1)] as T
  }
}
