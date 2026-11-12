/**
 * Trie (önek ağacı).
 *
 * Fikir: Kelimeler harf harf bir ağaçta saklanır; ortak önekler ortak düğümleri paylaşır. "kitap",
 * "kitaplık" ve "kira" aynı "ki" yolundan ayrılır. Bir düğümün "kelime sonu" işareti, oraya kadar olan
 * yolun tam bir kelime olduğunu söyler. Otomatik tamamlama, yazım denetimi ve yönlendirme tabloları
 * (en uzun önek eşleşmesi) bu yapıyla yapılır.
 *
 * Büyük-O (L = kelime/önek uzunluğu, k = döndürülen kelime sayısı):
 *   insert, has, startsWith, delete ... O(L)
 *   wordsWithPrefix ................... O(L + alt ağacın boyutu)
 *
 * Harfleri `for...of` ile geziyoruz; böylece emoji gibi iki UTF-16 birimlik karakterler de tek harf sayılır.
 * Büyük/küçük harf eşitlemesini çağırana bırakıyoruz: Türkçe için toLocaleLowerCase('tr-TR') kullan
 * ("I".toLowerCase() === "i" olur, Türkçede doğrusu "ı").
 *
 * Gerçek depoda karşılığı: src/data-structures/trie/Trie.js ve TrieNode.js
 */

class TrieNode {
  /** @type {Map<string, TrieNode>} */
  children = new Map()
  isWord = false
}

export class Trie {
  #root = new TrieNode()
  #size = 0

  /** Kayıtlı kelime sayısı. */
  get size() {
    return this.#size
  }

  /** @param {string} word */
  insert(word) {
    if (typeof word !== 'string' || word.length === 0) throw new TypeError('boş olmayan bir metin bekleniyordu')
    let node = this.#root
    for (const letter of word) {
      if (!node.children.has(letter)) node.children.set(letter, new TrieNode())
      node = node.children.get(letter)
    }
    if (!node.isWord) {
      node.isWord = true
      this.#size += 1
    }
    return this
  }

  has(word) {
    const node = this.#find(word)
    return Boolean(node && node.isWord)
  }

  startsWith(prefix) {
    return this.#find(prefix) !== undefined
  }

  /**
   * Kelimeyi siler ve artık hiçbir kelimeye hizmet etmeyen düğümleri budar.
   * @returns {boolean} silindiyse true
   */
  delete(word) {
    const path = [this.#root]
    for (const letter of word) {
      const next = path[path.length - 1].children.get(letter)
      if (!next) return false
      path.push(next)
    }
    const last = path[path.length - 1]
    if (!last.isWord) return false
    last.isWord = false
    this.#size -= 1
    // Sondan başa: çocuğu olmayan ve kelime sonu olmayan düğümü ebeveyninden kopar.
    const letters = [...word]
    for (let i = path.length - 1; i > 0; i -= 1) {
      const node = path[i]
      if (node.isWord || node.children.size > 0) break
      path[i - 1].children.delete(letters[i - 1])
    }
    return true
  }

  /**
   * Öneki taşıyan kelimeleri alfabetik (kod noktası) sırayla döndürür.
   * @param {string} prefix
   * @param {number} [limit]
   */
  wordsWithPrefix(prefix, limit = Infinity) {
    const start = this.#find(prefix)
    const words = []
    if (!start) return words
    const walk = (node, soFar) => {
      if (words.length >= limit) return
      if (node.isWord) words.push(soFar)
      const letters = [...node.children.keys()].sort()
      for (const letter of letters) walk(node.children.get(letter), soFar + letter)
    }
    walk(start, prefix)
    return words
  }

  #find(text) {
    let node = this.#root
    for (const letter of text) {
      node = node.children.get(letter)
      if (!node) return undefined
    }
    return node
  }
}
