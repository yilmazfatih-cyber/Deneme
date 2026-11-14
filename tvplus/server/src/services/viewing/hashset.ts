/**
 * Olay kimlikleri için yoğun bellekli küme: kimliğin kendisi değil 64 bitlik özeti tutulur (açık adresleme,
 * doğrusal yoklama). 1 milyon kimlik ≈ 16 MB; bir `Set<string>` bunun 5–8 katını tutardı.
 * 64 bitte çakışma olasılığı 1 milyon kimlikte ≈ 3·10⁻⁸'dir (yanlışlıkla "yinelenen" sayılma riski).
 */

/** cyrb53 türevi: iki bağımsız 32 bitlik karma → [yüksek, düşük]. Hiçbir zaman [0, 0] dönmez (boş yuva işareti). */
export function hash64(s: string): [number, number] {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hi = h1 >>> 0
  const lo = h2 >>> 0
  return hi === 0 && lo === 0 ? [0, 1] : [hi, lo]
}

export class IdSet {
  private slots: Uint32Array
  private mask: number
  private count = 0

  constructor(capacity = 1024) {
    let cap = 1024
    while (cap < capacity * 2) cap *= 2
    this.slots = new Uint32Array(cap * 2)
    this.mask = cap - 1
  }

  get size(): number {
    return this.count
  }

  /** Kimliği ekler; zaten varsa false. */
  add(id: string): boolean {
    const [hi, lo] = hash64(id)
    return this.addHash(hi, lo)
  }

  has(id: string): boolean {
    const [hi, lo] = hash64(id)
    let i = (lo ^ hi) & this.mask
    for (;;) {
      const a = this.slots[i * 2]!
      const b = this.slots[i * 2 + 1]!
      if (a === 0 && b === 0) return false
      if (a === hi && b === lo) return true
      i = (i + 1) & this.mask
    }
  }

  private addHash(hi: number, lo: number): boolean {
    if ((this.count + 1) * 2 > this.mask + 1) this.grow()
    let i = (lo ^ hi) & this.mask
    for (;;) {
      const a = this.slots[i * 2]!
      const b = this.slots[i * 2 + 1]!
      if (a === 0 && b === 0) {
        this.slots[i * 2] = hi
        this.slots[i * 2 + 1] = lo
        this.count++
        return true
      }
      if (a === hi && b === lo) return false
      i = (i + 1) & this.mask
    }
  }

  private grow(): void {
    const old = this.slots
    this.slots = new Uint32Array(old.length * 2)
    this.mask = old.length - 1
    this.count = 0
    for (let i = 0; i < old.length; i += 2) {
      const hi = old[i]!
      const lo = old[i + 1]!
      if (hi !== 0 || lo !== 0) this.addHash(hi, lo)
    }
  }

  /** Diske yazmak için: yalnız dolu yuvalar, [yüksek, düşük] çiftleri. */
  toBuffer(): Buffer {
    const out = new Uint32Array(this.count * 2)
    let j = 0
    for (let i = 0; i < this.slots.length; i += 2) {
      const hi = this.slots[i]!
      const lo = this.slots[i + 1]!
      if (hi !== 0 || lo !== 0) {
        out[j++] = hi
        out[j++] = lo
      }
    }
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
  }

  static fromBuffer(buf: Buffer): IdSet {
    const n = Math.floor(buf.byteLength / 8)
    const set = new IdSet(n + 1024)
    for (let k = 0; k < n; k++) set.addHash(buf.readUInt32LE(k * 8), buf.readUInt32LE(k * 8 + 4))
    return set
  }
}
