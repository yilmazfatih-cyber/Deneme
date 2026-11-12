import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Graph, bfs, dfs, dijkstra, pathTo, shortestPathUnweighted, topologicalSort } from '../src/graph.js'

function sampleGraph() {
  //   A — B — D
  //   |   |
  //   C — E    F (yalnız)
  const graph = new Graph()
  graph.addEdge('A', 'B').addEdge('A', 'C').addEdge('B', 'D').addEdge('B', 'E').addEdge('C', 'E').addVertex('F')
  return graph
}

test('BFS katman sırası, DFS derinlik sırası', () => {
  const graph = sampleGraph()
  assert.deepEqual(bfs(graph, 'A'), ['A', 'B', 'C', 'D', 'E'])
  assert.deepEqual(dfs(graph, 'A'), ['A', 'B', 'D', 'E', 'C'])
  assert.deepEqual(bfs(graph, 'F'), ['F'])
  assert.throws(() => bfs(graph, 'Z'), RangeError)
})

test('ağırlıksız en kısa yol', () => {
  const graph = sampleGraph()
  assert.deepEqual(shortestPathUnweighted(graph, 'D', 'C'), ['D', 'B', 'A', 'C'])
  assert.equal(shortestPathUnweighted(graph, 'A', 'F'), null)
})

test('Dijkstra ağırlıkları dikkate alır', () => {
  const roads = new Graph()
  roads
    .addEdge('İstanbul', 'Bursa', 155)
    .addEdge('İstanbul', 'Kocaeli', 110)
    .addEdge('Kocaeli', 'Eskişehir', 215)
    .addEdge('Bursa', 'Eskişehir', 150)
    .addEdge('Eskişehir', 'Ankara', 235)
    .addEdge('Kocaeli', 'Ankara', 345)
  const { distances, previous } = dijkstra(roads, 'İstanbul')
  assert.equal(distances.get('Ankara'), 455)
  assert.deepEqual(pathTo(previous, 'Ankara'), ['İstanbul', 'Kocaeli', 'Ankara'])
  assert.equal(distances.get('Eskişehir'), 305)
  assert.deepEqual(pathTo(previous, 'Eskişehir'), ['İstanbul', 'Bursa', 'Eskişehir'])
})

test('Dijkstra: ulaşılamayan düğüm Infinity, negatif ağırlık hata', () => {
  const graph = new Graph({ directed: true })
  graph.addEdge('a', 'b', 2).addVertex('c')
  const { distances, previous } = dijkstra(graph, 'a')
  assert.equal(distances.get('c'), Infinity)
  assert.equal(pathTo(previous, 'c'), null)
  graph.addEdge('b', 'c', -1)
  assert.throws(() => dijkstra(graph, 'a'), RangeError)
})

test('topolojik sıralama önkoşulları korur, döngüyü yakalar', () => {
  const courses = new Graph({ directed: true })
  courses
    .addEdge('python', 'veri-yapilari')
    .addEdge('veri-yapilari', 'algoritmalar')
    .addEdge('matematik', 'algoritmalar')
    .addEdge('algoritmalar', 'sistem-tasarimi')
  const order = topologicalSort(courses)
  for (const [before, after] of [
    ['python', 'veri-yapilari'],
    ['veri-yapilari', 'algoritmalar'],
    ['matematik', 'algoritmalar'],
  ]) {
    assert.ok(order.indexOf(before) < order.indexOf(after), `${before} önce gelmeli`)
  }
  courses.addEdge('sistem-tasarimi', 'python')
  assert.throws(() => topologicalSort(courses), /döngü/)
  assert.throws(() => topologicalSort(sampleGraph()), TypeError)
})
