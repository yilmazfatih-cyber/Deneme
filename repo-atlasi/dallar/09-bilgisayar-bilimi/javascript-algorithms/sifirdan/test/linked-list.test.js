import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LinkedList } from '../src/linked-list.js'

test('append, prepend ve insertAt sırayı korur', () => {
  const list = new LinkedList()
  list.append(2).append(3).prepend(1).insertAt(3, 4).insertAt(1, 1.5)
  assert.deepEqual(list.toArray(), [1, 1.5, 2, 3, 4])
  assert.equal(list.size, 5)
  assert.equal(list.head, 1)
  assert.equal(list.tail, 4)
})

test('geçersiz indeks RangeError fırlatır', () => {
  const list = LinkedList.fromArray([1, 2])
  assert.throws(() => list.insertAt(3, 'x'), RangeError)
  assert.throws(() => list.insertAt(-1, 'x'), RangeError)
  assert.throws(() => list.insertAt(0.5, 'x'), RangeError)
})

test('delete baş, orta ve kuyruk düğümünü doğru günceller', () => {
  const list = LinkedList.fromArray(['a', 'b', 'c', 'b'])
  assert.equal(list.delete('b'), true)
  assert.deepEqual(list.toArray(), ['a', 'c', 'b'])
  assert.equal(list.delete('b'), true)
  assert.equal(list.tail, 'c', 'kuyruk silinince tail bir öncekine geçmeli')
  list.append('d')
  assert.deepEqual(list.toArray(), ['a', 'c', 'd'])
  assert.equal(list.delete('a'), true)
  assert.equal(list.delete('yok'), false)
  assert.deepEqual(list.toArray(), ['c', 'd'])
})

test('deleteHead boş listede undefined döner ve tail sıfırlanır', () => {
  const list = LinkedList.fromArray([1])
  assert.equal(list.deleteHead(), 1)
  assert.equal(list.deleteHead(), undefined)
  assert.equal(list.tail, undefined)
  list.append(9)
  assert.deepEqual(list.toArray(), [9])
})

test('find, indexOf ve özel eşitlik', () => {
  const people = new LinkedList((a, b) => a.id === b.id)
  people.append({ id: 1, name: 'Ayşe' }).append({ id: 2, name: 'Mert' })
  assert.equal(people.indexOf({ id: 2 }), 1)
  assert.equal(people.find((person) => person.name.startsWith('A')).id, 1)
  assert.equal(people.indexOf({ id: 3 }), -1)
})

test('reverse yerinde ters çevirir; boş ve tek elemanlı liste bozulmaz', () => {
  assert.deepEqual(LinkedList.fromArray([1, 2, 3]).reverse().toArray(), [3, 2, 1])
  assert.deepEqual(new LinkedList().reverse().toArray(), [])
  const reversed = LinkedList.fromArray([1, 2]).reverse()
  reversed.append(0)
  assert.deepEqual(reversed.toArray(), [2, 1, 0], 'reverse sonrası tail doğru düğümü göstermeli')
})
