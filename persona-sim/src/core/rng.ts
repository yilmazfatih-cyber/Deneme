/** Tohumlu (seeded) rastgele sayı üreteci — mulberry32. Aynı tohum aynı simülasyonu verir (tekrarlanabilirlik, 03 §10). */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Box–Muller */
  normal(mu = 0, sigma = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** medyan = exp(mu) */
  lognormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma));
  }

  exponential(rate: number): number {
    let u = 0;
    while (u === 0) u = this.next();
    return -Math.log(u) / rate;
  }

  pick<T>(arr: readonly T[]): T {
    const v = arr[this.int(arr.length)];
    if (v === undefined) throw new Error('boş diziden seçim');
    return v;
  }

  /** ağırlıklara göre indis */
  weighted(weights: readonly number[]): number {
    const toplam = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * toplam;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /** alt üreteç (modüller birbirinin akışını bozmasın) */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967295));
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
