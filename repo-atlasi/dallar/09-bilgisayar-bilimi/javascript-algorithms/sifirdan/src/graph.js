/**
 * Komşuluk listeli graf + BFS, DFS, ağırlıksız en kısa yol, Dijkstra ve topolojik sıralama.
 *
 * Temsil: Map<düğüm, Array<{ to, weight }>>. Komşuluk listesi seyrek graflarda (E << V^2) bellek dostudur;
 * komşuluk matrisi ise "u-v kenarı var mı?" sorusunu O(1) yanıtlar ama O(V^2) yer kaplar.
 *
 * Büyük-O (V = düğüm, E = kenar):
 *   bfs, dfs, shortestPathUnweighted, topologicalSort ... O(V + E)
 *   dijkstra (ikili heap ile) ........................... O((V + E) log V)
 *
 * Gerçek depoda karşılığı: src/data-structures/graph/Graph.js (+ GraphVertex, GraphEdge) ve
 * src/algorithms/graph/{breadth-first-search,depth-first-search,dijkstra,topological-sorting}
 */

import { PriorityQueue } from './heap.js'

export class Graph {
  /** @type {Map<*, Array<{ to: *, weight: number }>>} */
  #adjacency = new Map()
  #directed

  /** @param {{ directed?: boolean }} [options] */
  constructor({ directed = false } = {}) {
    this.#directed = directed
  }

  get directed() {
    return this.#directed
  }

  addVertex(vertex) {
    if (!this.#adjacency.has(vertex)) this.#adjacency.set(vertex, [])
    return this
  }

  /**
   * Kenar ekler; yönsüz grafta ters yönü de ekler. Uç düğümler yoksa oluşturulur.
   * @param {number} [weight]
   */
  addEdge(from, to, weight = 1) {
    if (!Number.isFinite(weight)) throw new TypeError('ağırlık sonlu bir sayı olmalı')
    this.addVertex(from).addVertex(to)
    this.#adjacency.get(from).push({ to, weight })
    if (!this.#directed && from !== to) this.#adjacency.get(to).push({ to: from, weight })
    return this
  }

  hasVertex(vertex) {
    return this.#adjacency.has(vertex)
  }

  vertices() {
    return [...this.#adjacency.keys()]
  }

  neighbors(vertex) {
    const edges = this.#adjacency.get(vertex)
    if (!edges) throw new RangeError(`düğüm yok: ${String(vertex)}`)
    return edges
  }
}

/**
 * Genişlik öncelikli arama: başlangıçtan uzaklık sırasına göre (katman katman) ziyaret sırası.
 * Ziyaret işareti kuyruğa EKLERKEN konur; böylece bir düğüm kuyruğa iki kez girmez.
 */
export function bfs(graph, start) {
  const visited = new Set([start])
  const order = []
  const queue = [start]
  // Dizi + okuma indeksi: shift() O(n) olduğu için kuyruğu böyle tutuyoruz.
  for (let head = 0; head < queue.length; head += 1) {
    const vertex = queue[head]
    order.push(vertex)
    for (const { to } of graph.neighbors(vertex)) {
      if (!visited.has(to)) {
        visited.add(to)
        queue.push(to)
      }
    }
  }
  return order
}

/**
 * Derinlik öncelikli arama (yinelemeli). Özyinelemeli sürümle aynı sırayı vermek için komşular
 * yığına TERS sırada konur. Açık yığın, derin graflarda çağrı yığını taşmasını (stack overflow) önler.
 */
export function dfs(graph, start) {
  const visited = new Set()
  const order = []
  const stack = [start]
  while (stack.length > 0) {
    const vertex = stack.pop()
    if (visited.has(vertex)) continue
    visited.add(vertex)
    order.push(vertex)
    const neighbors = graph.neighbors(vertex)
    for (let i = neighbors.length - 1; i >= 0; i -= 1) {
      if (!visited.has(neighbors[i].to)) stack.push(neighbors[i].to)
    }
  }
  return order
}

/** Ağırlıksız grafta en az kenarlı yol (BFS + ebeveyn tablosu); yol yoksa null. */
export function shortestPathUnweighted(graph, start, goal) {
  const previous = new Map([[start, undefined]])
  const queue = [start]
  for (let head = 0; head < queue.length; head += 1) {
    const vertex = queue[head]
    if (vertex === goal) return pathTo(previous, goal)
    for (const { to } of graph.neighbors(vertex)) {
      if (!previous.has(to)) {
        previous.set(to, vertex)
        queue.push(to)
      }
    }
  }
  return null
}

/**
 * Dijkstra: negatif olmayan ağırlıklarda tek kaynaktan tüm düğümlere en kısa mesafe.
 * Heap'te "anahtar azaltma" (decrease-key) yerine aynı düğümü yeni mesafeyle tekrar ekleyip, heap'ten
 * çıkan eski (daha büyük mesafeli) kayıtları atlıyoruz ("tembel silme"). Kod basitleşir; heap en fazla
 * E kayıt tutar.
 * @returns {{ distances: Map<*, number>, previous: Map<*, *> }}
 */
export function dijkstra(graph, start) {
  if (!graph.hasVertex(start)) throw new RangeError(`düğüm yok: ${String(start)}`)
  const distances = new Map(graph.vertices().map((vertex) => [vertex, Infinity]))
  const previous = new Map([[start, undefined]])
  const queue = new PriorityQueue()
  distances.set(start, 0)
  queue.enqueue(start, 0)
  while (!queue.isEmpty()) {
    const { value: vertex, priority: distance } = queue.dequeueEntry()
    if (distance > distances.get(vertex)) continue // eski kayıt
    for (const { to, weight } of graph.neighbors(vertex)) {
      if (weight < 0) throw new RangeError('Dijkstra negatif ağırlıkla çalışmaz (Bellman-Ford kullan)')
      const candidate = distance + weight
      if (candidate < distances.get(to)) {
        distances.set(to, candidate)
        previous.set(to, vertex)
        queue.enqueue(to, candidate)
      }
    }
  }
  return { distances, previous }
}

/** Ebeveyn tablosundan başlangıç→hedef yolunu kurar; hedefe ulaşılmadıysa null. */
export function pathTo(previous, goal) {
  if (!previous.has(goal)) return null
  const path = [goal]
  for (let vertex = previous.get(goal); vertex !== undefined; vertex = previous.get(vertex)) path.push(vertex)
  return path.reverse()
}

/**
 * Kahn algoritması: giriş derecesi 0 olan düğümleri sırayla çıkar. Tüm düğümler çıkmadıysa döngü vardır.
 * Önkoşul grafları (ders sıralaması, derleme sırası, iş akışı adımları) bu yolla sıralanır.
 */
export function topologicalSort(graph) {
  if (!graph.directed) throw new TypeError('topolojik sıralama yalnızca yönlü graflarda tanımlı')
  const inDegree = new Map(graph.vertices().map((vertex) => [vertex, 0]))
  for (const vertex of graph.vertices()) {
    for (const { to } of graph.neighbors(vertex)) inDegree.set(to, inDegree.get(to) + 1)
  }
  const ready = graph.vertices().filter((vertex) => inDegree.get(vertex) === 0)
  const order = []
  for (let head = 0; head < ready.length; head += 1) {
    const vertex = ready[head]
    order.push(vertex)
    for (const { to } of graph.neighbors(vertex)) {
      inDegree.set(to, inDegree.get(to) - 1)
      if (inDegree.get(to) === 0) ready.push(to)
    }
  }
  if (order.length !== inDegree.size) throw new Error('grafta döngü var; topolojik sıra yok')
  return order
}
