/**
 * Tek yönlü bağlı liste (singly linked list).
 *
 * Fikir: Dizinin aksine elemanlar bellekte yan yana durmaz; her düğüm değeri ve bir sonraki düğümün
 * adresini taşır. Bu yüzden başa ekleme/silme O(1)'dir, ama i. elemana erişmek için baştan yürümek
 * gerekir (O(n)). Kuyruk (tail) işaretçisi tuttuğumuz için sona ekleme de O(1)'dir.
 *
 * Büyük-O:
 *   prepend, append, deleteHead ........ O(1)
 *   insertAt, delete, find, indexOf .... O(n)
 *   reverse ............................ O(n) zaman, O(1) ek bellek
 *
 * Gerçek depoda karşılığı: src/data-structures/linked-list/LinkedList.js
 */

class ListNode {
  /**
   * @param {*} value
   * @param {ListNode | null} next
   */
  constructor(value, next = null) {
    this.value = value
    this.next = next
  }
}

export class LinkedList {
  /** @type {ListNode | null} */
  #head = null
  /** @type {ListNode | null} */
  #tail = null
  #size = 0
  #equals

  /**
   * @param {(a: *, b: *) => boolean} [equals] Eşitlik ölçütü (varsayılan: Object.is).
   */
  constructor(equals = Object.is) {
    this.#equals = equals
  }

  /** @param {Iterable<*>} values */
  static fromArray(values) {
    const list = new LinkedList()
    for (const value of values) list.append(value)
    return list
  }

  get size() {
    return this.#size
  }

  get head() {
    return this.#head ? this.#head.value : undefined
  }

  get tail() {
    return this.#tail ? this.#tail.value : undefined
  }

  /** Başa ekler: O(1). */
  prepend(value) {
    this.#head = new ListNode(value, this.#head)
    if (!this.#tail) this.#tail = this.#head
    this.#size += 1
    return this
  }

  /** Sona ekler: kuyruk işaretçisi sayesinde O(1). */
  append(value) {
    const node = new ListNode(value)
    if (this.#tail) this.#tail.next = node
    else this.#head = node
    this.#tail = node
    this.#size += 1
    return this
  }

  /**
   * Verilen indekse ekler (0 = baş, size = son). Geçersiz indekste RangeError fırlatır.
   * @param {number} index
   */
  insertAt(index, value) {
    if (!Number.isInteger(index) || index < 0 || index > this.#size) {
      throw new RangeError(`geçersiz indeks: ${index}`)
    }
    if (index === 0) return this.prepend(value)
    if (index === this.#size) return this.append(value)
    const previous = this.#nodeAt(index - 1)
    previous.next = new ListNode(value, previous.next)
    this.#size += 1
    return this
  }

  /** Baştaki değeri siler ve döndürür; liste boşsa undefined. */
  deleteHead() {
    if (!this.#head) return undefined
    const { value } = this.#head
    this.#head = this.#head.next
    if (!this.#head) this.#tail = null
    this.#size -= 1
    return value
  }

  /**
   * Değerin ilk geçtiği düğümü siler. Silindiyse true.
   * İpucu: tek yönlü listede silmek için silinecek düğümün ÖNCEKİNİ bilmek gerekir.
   */
  delete(value) {
    let previous = null
    let current = this.#head
    while (current && !this.#equals(current.value, value)) {
      previous = current
      current = current.next
    }
    if (!current) return false
    if (previous) previous.next = current.next
    else this.#head = current.next
    if (current === this.#tail) this.#tail = previous
    this.#size -= 1
    return true
  }

  /**
   * Koşulu sağlayan ilk değeri döndürür.
   * @param {(value: *) => boolean} predicate
   */
  find(predicate) {
    for (const value of this) if (predicate(value)) return value
    return undefined
  }

  indexOf(value) {
    let index = 0
    for (const item of this) {
      if (this.#equals(item, value)) return index
      index += 1
    }
    return -1
  }

  /** Listeyi yerinde ters çevirir: üç işaretçi (önceki, şimdiki, sonraki) yeterlidir. */
  reverse() {
    let previous = null
    let current = this.#head
    this.#tail = current
    while (current) {
      const next = current.next
      current.next = previous
      previous = current
      current = next
    }
    this.#head = previous
    return this
  }

  toArray() {
    return [...this]
  }

  *[Symbol.iterator]() {
    for (let node = this.#head; node; node = node.next) yield node.value
  }

  /** @param {number} index */
  #nodeAt(index) {
    let node = this.#head
    for (let i = 0; i < index; i += 1) node = node.next
    return node
  }
}
