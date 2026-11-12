/**
 * Ayrı zincirlemeli (separate chaining) hash tablosu.
 *
 * Fikir: Anahtar bir hash fonksiyonuyla sayıya, sayı da "kova" (bucket) indeksine çevrilir. Aynı kovaya
 * düşen anahtarlar (çakışma) o kovadaki küçük bir listede tutulur. Doluluk oranı (eleman / kova) 0.75'i
 * geçince kova sayısı ikiye katlanır ve her şey yeniden dağıtılır (rehash); böylece kovalar kısa kalır.
 *
 * Büyük-O (iyi dağıtan hash ile):
 *   set, get, has, delete .... ortalama O(1), en kötü O(n) (her şey aynı kovaya düşerse)
 *   büyüme (rehash) .......... O(n), ama seyrek olduğu için ekleme başına amortize O(1)
 *
 * Gerçek depodaki HashTable.js, anahtarın karakter kodlarını toplar; bu yüzden "abc" ile "cba" (anagramlar)
 * her zaman çakışır. Burada FNV-1a kullanıyoruz: her karakter sırayla XOR'lanıp asal bir sayıyla çarpılır,
 * böylece karakterlerin sırası da hash'e girer.
 *
 * Gerçek depoda karşılığı: src/data-structures/hash-table/HashTable.js
 */

const MAX_LOAD_FACTOR = 0.75

/**
 * 32 bitlik FNV-1a hash'i. Math.imul 32 bitlik tam sayı çarpımı yapar; `>>> 0` sonucu işaretsiz yapar.
 * @param {string} text
 * @returns {number}
 */
export function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Karşılaştırma için gerçek depodaki yaklaşım: karakter kodlarının toplamı.
 * @param {string} text
 */
export function charCodeSum(text) {
  let sum = 0
  for (let i = 0; i < text.length; i += 1) sum += text.charCodeAt(i)
  return sum
}

export class HashTable {
  /** @type {Array<Array<[string, *]>>} */
  #buckets
  #size = 0
  #hash

  /**
   * @param {number} [initialCapacity] Başlangıç kova sayısı.
   * @param {(key: string) => number} [hash] Hash fonksiyonu (testte çakışma üretmek için değiştirilebilir).
   */
  constructor(initialCapacity = 8, hash = fnv1a) {
    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError('kova sayısı pozitif tam sayı olmalı')
    }
    this.#buckets = Array.from({ length: initialCapacity }, () => [])
    this.#hash = hash
  }

  get size() {
    return this.#size
  }

  get capacity() {
    return this.#buckets.length
  }

  get loadFactor() {
    return this.#size / this.#buckets.length
  }

  set(key, value) {
    const bucket = this.#bucketFor(key)
    const entry = bucket.find(([storedKey]) => storedKey === key)
    if (entry) {
      entry[1] = value
      return this
    }
    bucket.push([key, value])
    this.#size += 1
    if (this.loadFactor > MAX_LOAD_FACTOR) this.#resize(this.#buckets.length * 2)
    return this
  }

  get(key) {
    const entry = this.#bucketFor(key).find(([storedKey]) => storedKey === key)
    return entry ? entry[1] : undefined
  }

  has(key) {
    return this.#bucketFor(key).some(([storedKey]) => storedKey === key)
  }

  delete(key) {
    const bucket = this.#bucketFor(key)
    const index = bucket.findIndex(([storedKey]) => storedKey === key)
    if (index === -1) return false
    bucket.splice(index, 1)
    this.#size -= 1
    return true
  }

  keys() {
    return this.#buckets.flatMap((bucket) => bucket.map(([key]) => key))
  }

  values() {
    return this.#buckets.flatMap((bucket) => bucket.map(([, value]) => value))
  }

  /** Her kovadaki eleman sayısı: çakışmaları gözlemlemek için. */
  bucketSizes() {
    return this.#buckets.map((bucket) => bucket.length)
  }

  #bucketFor(key) {
    if (typeof key !== 'string') throw new TypeError('bu tablo yalnızca metin (string) anahtar kabul eder')
    return this.#buckets[this.#hash(key) % this.#buckets.length]
  }

  #resize(capacity) {
    const entries = this.#buckets.flat()
    this.#buckets = Array.from({ length: capacity }, () => [])
    for (const [key, value] of entries) this.#buckets[this.#hash(key) % capacity].push([key, value])
  }
}
