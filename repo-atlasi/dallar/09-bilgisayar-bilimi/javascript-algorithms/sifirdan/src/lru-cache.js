/**
 * LRU (en uzun süredir kullanılmayanı at) önbellek.
 *
 * Fikir: Hash tablosu "anahtar nerede?" sorusunu O(1) yanıtlar; çift yönlü bağlı liste "en eski hangisi?"
 * sorusunu O(1) yanıtlar ve bir düğümü listenin ortasından O(1) söküp başa taşımaya izin verir. İkisi
 * birlikte get/set'i O(1) yapar. Baş ve sonda "nöbetçi" (sentinel) düğümler tutmak, boş liste ve tek eleman
 * gibi sınır durumlarındaki if'leri ortadan kaldırır.
 *
 * Büyük-O: get, set, delete ... O(1);  bellek O(kapasite)
 *
 * MapLRUCache, JavaScript'in Map'inin ekleme sırasını korumasından yararlanan kısa sürümdür: bir anahtarı
 * silip yeniden eklemek onu "en yeni" yapar; Map'in ilk anahtarı da en eskisidir.
 *
 * Gerçek depoda karşılığı: src/data-structures/lru-cache/LRUCache.js ve LRUCacheOnMap.js
 */

class CacheNode {
  constructor(key, value) {
    this.key = key
    this.value = value
    this.prev = null
    this.next = null
  }
}

export class LRUCache {
  /** @type {Map<*, CacheNode>} */
  #nodes = new Map()
  #capacity
  #head = new CacheNode() // en yeni tarafındaki nöbetçi
  #tail = new CacheNode() // en eski tarafındaki nöbetçi

  /** @param {number} capacity */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('kapasite pozitif tam sayı olmalı')
    this.#capacity = capacity
    this.#head.next = this.#tail
    this.#tail.prev = this.#head
  }

  get size() {
    return this.#nodes.size
  }

  /** Değeri döndürür ve anahtarı "en yeni" yapar. */
  get(key) {
    const node = this.#nodes.get(key)
    if (!node) return undefined
    this.#unlink(node)
    this.#pushFront(node)
    return node.value
  }

  /** Kullanım sırasını değiştirmeden var mı diye bakar. */
  has(key) {
    return this.#nodes.has(key)
  }

  /**
   * Ekler ya da günceller; kapasite aşılırsa en eskiyi atar.
   * @returns {* | undefined} Atılan anahtar (varsa).
   */
  set(key, value) {
    const existing = this.#nodes.get(key)
    if (existing) {
      existing.value = value
      this.#unlink(existing)
      this.#pushFront(existing)
      return undefined
    }
    const node = new CacheNode(key, value)
    this.#nodes.set(key, node)
    this.#pushFront(node)
    if (this.#nodes.size <= this.#capacity) return undefined
    const oldest = this.#tail.prev
    this.#unlink(oldest)
    this.#nodes.delete(oldest.key)
    return oldest.key
  }

  delete(key) {
    const node = this.#nodes.get(key)
    if (!node) return false
    this.#unlink(node)
    return this.#nodes.delete(key)
  }

  /** Anahtarlar, en yeniden en eskiye. */
  keys() {
    const keys = []
    for (let node = this.#head.next; node !== this.#tail; node = node.next) keys.push(node.key)
    return keys
  }

  #unlink(node) {
    node.prev.next = node.next
    node.next.prev = node.prev
  }

  #pushFront(node) {
    node.prev = this.#head
    node.next = this.#head.next
    this.#head.next.prev = node
    this.#head.next = node
  }
}

export class MapLRUCache {
  #map = new Map()
  #capacity

  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('kapasite pozitif tam sayı olmalı')
    this.#capacity = capacity
  }

  get size() {
    return this.#map.size
  }

  get(key) {
    if (!this.#map.has(key)) return undefined
    const value = this.#map.get(key)
    this.#map.delete(key)
    this.#map.set(key, value)
    return value
  }

  set(key, value) {
    this.#map.delete(key)
    this.#map.set(key, value)
    if (this.#map.size <= this.#capacity) return undefined
    const oldest = this.#map.keys().next().value
    this.#map.delete(oldest)
    return oldest
  }

  /** Anahtarlar, en yeniden en eskiye (LRUCache.keys ile aynı sözleşme). */
  keys() {
    return [...this.#map.keys()].reverse()
  }
}
