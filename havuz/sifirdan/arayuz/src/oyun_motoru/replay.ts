// Belirlenimci tekrar oynatma: oyun mantığı yalnız (tohum, adım başına girdi maskesi) ile sürülürse, aynı kayıt
// her seferinde bit bit aynı oyunu üretir. Kayıt küçük ve taşınabilirdir (JSON). Durum özeti (FNV-1a), sayıların
// 64 bit ham baytları üzerinden hesaplanır: tek bir bitlik fark bile özeti değiştirir.
// Genişletme: kayıtları sıkıştırmak için art arda aynı maskeleri (çalışma uzunluğu) [maske, adet] olarak saklayın.

export interface Recording {
  seed: number
  frames: number[]
}

export class Recorder {
  private readonly frames: number[] = []
  readonly seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  record(mask: number): void {
    this.frames.push(mask)
  }

  get length(): number {
    return this.frames.length
  }

  toJSON(): Recording {
    return { seed: this.seed, frames: [...this.frames] }
  }
}

/** Kayıt dış veridir: biçimini doğrular. */
export function parseRecording(value: unknown): Recording {
  const r = value as Partial<Recording> | null
  if (
    !r ||
    !Number.isInteger(r.seed) ||
    !Array.isArray(r.frames) ||
    !r.frames.every((f) => Number.isInteger(f) && f >= 0)
  ) {
    throw new Error('Geçersiz kayıt: { seed: tamsayı, frames: negatif olmayan tamsayılar } bekleniyordu.')
  }
  return { seed: r.seed as number, frames: r.frames }
}

/** Sayı dizisinin FNV-1a (32 bit) özeti, 8 haneli onaltılık. */
export function hashNumbers(values: Iterable<number>): string {
  const view = new DataView(new ArrayBuffer(8))
  let hash = 0x811c9dc5
  for (const value of values) {
    view.setFloat64(0, value)
    for (let i = 0; i < 8; i++) {
      hash ^= view.getUint8(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }
  return hash.toString(16).padStart(8, '0')
}
