import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MinHeap, PriorityQueue } from '../src/heap.js'

test('MinHeap her pop’ta en küçüğü verir', () => {
  const heap = new MinHeap()
  for (const value of [5, 3, 8, 1, 9, 2, 2]) heap.push(value)
  assert.equal(heap.peek(), 1)
  assert.deepEqual(heap.drain(), [1, 2, 2, 3, 5, 8, 9])
  assert.equal(heap.pop(), undefined)
})

test('heapify rastgele girdiyi sıralı boşaltır ve girdiyi değiştirmez', () => {
  let seed = 7
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const values = Array.from({ length: 500 }, () => Math.floor(random() * 1000))
  const copy = [...values]
  assert.deepEqual(
    MinHeap.heapify(values).drain(),
    [...values].sort((a, b) => a - b),
  )
  assert.deepEqual(values, copy)
})

test('özel karşılaştırma ile max-heap', () => {
  const maxHeap = MinHeap.heapify(['b', 'z', 'a'], (a, b) => (a < b ? 1 : a > b ? -1 : 0))
  assert.deepEqual(maxHeap.drain(), ['z', 'b', 'a'])
})

test('PriorityQueue: küçük öncelik önce, eşitlikte FIFO', () => {
  const queue = new PriorityQueue()
  queue.enqueue('rapor', 2).enqueue('acil-1', 0).enqueue('kahve', 5).enqueue('acil-2', 0).enqueue('toplantı', 2)
  assert.equal(queue.peek(), 'acil-1')
  const order = []
  while (!queue.isEmpty()) order.push(queue.dequeue())
  assert.deepEqual(order, ['acil-1', 'acil-2', 'rapor', 'toplantı', 'kahve'])
  assert.equal(queue.dequeue(), undefined)
  assert.throws(() => queue.enqueue('x', Number.NaN), TypeError)
})
