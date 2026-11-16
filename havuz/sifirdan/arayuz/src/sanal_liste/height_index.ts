// Yükseklik dizini (Fenwick / ikili dizinli ağaç): n öğenin yüksekliğini tutar; "i. öğe kaç pikselde başlar?"
// (önek toplamı) ve "şu piksel hangi öğeye düşer?" (önek toplamında arama) sorularını O(log n)'de yanıtlar;
// tek bir öğenin yüksekliği değişince güncelleme de O(log n)'dir. Düz dizide önek toplamı her değişiklikte O(n)
// olurdu: 100.000 satırlık bir listede her ölçümde tüm diziyi yeniden toplamak demek.
// Ölçülmemiş öğe için tahmini yükseklik kullanılır; ölçüldükçe gerçeği yazılır.
// Genişletme: yatay liste için aynı yapı genişliklerle kullanılabilir; ızgara için iki dizin (satır, sütun).

export class HeightIndex {
  private readonly tree: Float64Array
  private readonly heights: Float64Array
  private readonly measured: Uint8Array
  readonly count: number

  constructor(count: number, estimate: number) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError('Öğe sayısı negatif olmayan bir tamsayı olmalı.')
    if (!(estimate > 0)) throw new RangeError('Tahmini yükseklik pozitif olmalı.')
    this.count = count
    this.tree = new Float64Array(count + 1)
    this.heights = new Float64Array(count).fill(estimate)
    this.measured = new Uint8Array(count)
    // Doğrusal zamanlı kurulum: her düğüm kendi aralığının toplamını üst düğüme aktarır.
    for (let i = 1; i <= count; i++) {
      this.tree[i] = (this.tree[i] as number) + estimate
      const parent = i + (i & -i)
      if (parent <= count) this.tree[parent] = (this.tree[parent] as number) + (this.tree[i] as number)
    }
  }

  heightOf(index: number): number {
    return this.heights[index] as number
  }

  isMeasured(index: number): boolean {
    return this.measured[index] === 1
  }

  /** Öğenin ölçülen yüksekliğini yazar; farkı döndürür (kaydırma çapası için). */
  setHeight(index: number, height: number): number {
    if (index < 0 || index >= this.count) throw new RangeError(`Öğe ${index} yok (0–${this.count - 1}).`)
    const delta = height - (this.heights[index] as number)
    this.heights[index] = height
    this.measured[index] = 1
    if (delta !== 0)
      for (let i = index + 1; i <= this.count; i += i & -i) this.tree[i] = (this.tree[i] as number) + delta
    return delta
  }

  /** `index`'ten önceki öğelerin toplam yüksekliği = öğenin üst kenarı. */
  offsetOf(index: number): number {
    let sum = 0
    for (let i = Math.min(index, this.count); i > 0; i -= i & -i) sum += this.tree[i] as number
    return sum
  }

  total(): number {
    return this.offsetOf(this.count)
  }

  /** `offset` pikselini içeren öğe (üst kenarı ≤ offset olan son öğe). İkili basamak inişi: O(log n). */
  indexAt(offset: number): number {
    if (this.count === 0) return 0
    let position = 0
    let remaining = offset
    for (let step = 1 << Math.floor(Math.log2(this.count)); step > 0; step >>= 1) {
      const next = position + step
      if (next <= this.count && (this.tree[next] as number) <= remaining) {
        position = next
        remaining -= this.tree[next] as number
      }
    }
    return Math.min(position, this.count - 1)
  }
}
