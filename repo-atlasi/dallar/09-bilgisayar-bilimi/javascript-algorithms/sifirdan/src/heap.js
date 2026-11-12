/**
 * İkili min-heap ve onun üstüne kurulu öncelik kuyruğu.
 *
 * Fikir: Heap, "her ebeveyn çocuklarından küçük ya da eşittir" kuralını koruyan tam bir ikili ağaçtır ve
 * dizide işaretçisiz tutulur: i. düğümün çocukları 2i+1 ve 2i+2, ebeveyni (i-1)>>1 indeksindedir.
 * Ekleme sona yapılıp yukarı "kabarcıklanır" (siftUp); en küçüğü almak için kök sonla değiştirilip aşağı
 * "batırılır" (siftDown). Ağacın yüksekliği log n olduğu için ikisi de O(log n)'dir.
 *
 * Büyük-O:
 *   push, pop ............ O(log n)
 *   peek ................. O(1)
 *   heapify (n elemandan)  O(n) — tek tek eklemekten (O(n log n)) hızlıdır
 *
 * Öncelik kuyruğu, eşit öncelikte FIFO sırasını korumak için her kayda artan bir sıra numarası ekler
 * (heap kendi başına kararlı değildir).
 *
 * Gerçek depoda karşılığı: src/data-structures/heap/Heap.js, MinHeap.js ve
 * src/data-structures/priority-queue/PriorityQueue.js
 */

/** Sayı ve metinler için varsayılan karşılaştırma. */
export const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export class MinHeap {
  #items = []
  #compare

  /** @param {(a: *, b: *) => number} [compare] Negatif: a önce gelir. */
  constructor(compare = defaultCompare) {
    this.#compare = compare
  }

  /**
   * Diziden O(n) sürede heap kurar: yaprak olmayan son düğümden köke doğru siftDown.
   * @param {Iterable<*>} values
   */
  static heapify(values, compare = defaultCompare) {
    const heap = new MinHeap(compare)
    heap.#items = [...values]
    for (let i = (heap.#items.length >> 1) - 1; i >= 0; i -= 1) heap.#siftDown(i)
    return heap
  }

  get size() {
    return this.#items.length
  }

  isEmpty() {
    return this.#items.length === 0
  }

  peek() {
    return this.#items[0]
  }

  push(value) {
    this.#items.push(value)
    this.#siftUp(this.#items.length - 1)
    return this
  }

  pop() {
    if (this.#items.length === 0) return undefined
    const top = this.#items[0]
    const last = this.#items.pop()
    if (this.#items.length > 0) {
      this.#items[0] = last
      this.#siftDown(0)
    }
    return top
  }

  /** Heap'i bozmadan küçükten büyüğe boşaltır (heap sort'un özü). */
  drain() {
    const result = []
    while (!this.isEmpty()) result.push(this.pop())
    return result
  }

  #siftUp(index) {
    let child = index
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (this.#compare(this.#items[child], this.#items[parent]) >= 0) break
      ;[this.#items[child], this.#items[parent]] = [this.#items[parent], this.#items[child]]
      child = parent
    }
  }

  #siftDown(index) {
    const items = this.#items
    let parent = index
    for (;;) {
      const left = 2 * parent + 1
      const right = left + 1
      let smallest = parent
      if (left < items.length && this.#compare(items[left], items[smallest]) < 0) smallest = left
      if (right < items.length && this.#compare(items[right], items[smallest]) < 0) smallest = right
      if (smallest === parent) return
      ;[items[parent], items[smallest]] = [items[smallest], items[parent]]
      parent = smallest
    }
  }
}

export class PriorityQueue {
  #heap = new MinHeap((a, b) => a.priority - b.priority || a.order - b.order)
  #order = 0

  get size() {
    return this.#heap.size
  }

  isEmpty() {
    return this.#heap.isEmpty()
  }

  /**
   * @param {*} value
   * @param {number} priority Küçük sayı = önce çıkar.
   */
  enqueue(value, priority) {
    if (!Number.isFinite(priority)) throw new TypeError('öncelik sonlu bir sayı olmalı')
    this.#heap.push({ value, priority, order: this.#order })
    this.#order += 1
    return this
  }

  /** En küçük öncelikli değeri çıkarır; eşitlikte önce ekleneni (FIFO). */
  dequeue() {
    const entry = this.#heap.pop()
    return entry ? entry.value : undefined
  }

  /** Değeri ve önceliğini birlikte çıkarır (Dijkstra eski kayıtları ayıklamak için kullanır). */
  dequeueEntry() {
    const entry = this.#heap.pop()
    return entry ? { value: entry.value, priority: entry.priority } : undefined
  }

  peek() {
    const entry = this.#heap.peek()
    return entry ? entry.value : undefined
  }
}
