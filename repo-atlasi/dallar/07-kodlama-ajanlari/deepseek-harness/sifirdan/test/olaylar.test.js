import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventBus } from '../asama1_olaylar.js'

test('emit: sırayla çağırır, hatayı yutup bildirir, dönüşü beklemez', () => {
  const errors = []
  const bus = new EventBus({ onError: (error, name) => errors.push(`${name}:${error.message}`) })
  const seen = []
  bus.on('a', (x) => seen.push(`1:${x}`))
  bus.on('a', () => {
    throw new Error('patladı')
  })
  bus.on('a', (x) => seen.push(`3:${x}`))
  assert.equal(bus.emit('a', 'v'), undefined)
  assert.deepEqual(seen, ['1:v', '3:v'])
  assert.deepEqual(errors, ['a:patladı'])
})

test('parallel hepsini aynı anda başlatır ve bekler', async () => {
  const bus = new EventBus()
  const order = []
  bus.on('p', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    order.push('yavaş')
  })
  bus.on('p', async () => order.push('hızlı'))
  await bus.parallel('p')
  assert.deepEqual(order, ['hızlı', 'yavaş'])
})

test('parallel: bir dinleyici hata verse de diğerleri beklenir; hatalar toplu gelir', async () => {
  const bus = new EventBus()
  const done = []
  bus.on('p', async () => {
    throw new Error('bir')
  })
  bus.on('p', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    done.push('yavaş')
  })
  await assert.rejects(
    bus.parallel('p'),
    (error) => error instanceof AggregateError && error.errors[0].message === 'bir',
  )
  assert.deepEqual(done, ['yavaş'])
})

test('serial ve bail: ilk boş olmayan dönüş kazanır', async () => {
  const bus = new EventBus()
  const calls = []
  bus.on('s', async () => (calls.push(1), null))
  bus.on('s', async () => (calls.push(2), false))
  bus.on('s', async () => (calls.push(3), 'kazanan'))
  bus.on('s', async () => (calls.push(4), 'geç kaldı'))
  assert.equal(await bus.serial('s'), 'kazanan')
  assert.deepEqual(calls, [1, 2, 3])
  bus.on('b', () => undefined)
  bus.on('b', (x) => x * 2)
  assert.equal(bus.bail('b', 21), 42)
  assert.equal(bus.bail('yok'), undefined)
})

test('waterfall: dıştaki sonucu dönüştürür, içteki next() çağırmadan keser', async () => {
  const bus = new EventBus()
  // Türkçe büyük harf için yerel ayar şart: 'i'.toUpperCase() → 'I' olur, doğrusu 'İ'.
  bus.on('w', async (input, next) => (await next()).toLocaleUpperCase('tr-TR'))
  bus.on('w', async (input, next) => (input.includes('yasak') ? '** engellendi **' : next()))
  const fallback = async (input) => `işlendi: ${input}`
  assert.equal(await bus.waterfall('w', 'merhaba', fallback), 'İŞLENDİ: MERHABA')
  assert.equal(await bus.waterfall('w', 'yasak iş', fallback), '** ENGELLENDİ **')
  assert.equal(await bus.waterfall('bos', 1, async (x) => x + 1), 2)
})

test('prepend en dışa yerleşir; dönen fonksiyon dinleyiciyi kaldırır', async () => {
  const bus = new EventBus()
  const order = []
  bus.on('w', async (next) => (order.push('normal'), next()))
  const remove = bus.on('w', async (next) => (order.push('önde'), next()), { prepend: true })
  await bus.waterfall('w', async () => order.push('iç'))
  assert.deepEqual(order, ['önde', 'normal', 'iç'])
  remove()
  order.length = 0
  await bus.waterfall('w', async () => order.push('iç'))
  assert.deepEqual(order, ['normal', 'iç'])
  await assert.rejects(bus.waterfall('w'), TypeError)
})
