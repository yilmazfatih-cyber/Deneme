// Aşama 1 testleri: connect zorunluluğu, kimlik, rol, doğrulama, idempotency ve olay sırası.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ControlPlane, validate } from '../asama1_protokol.js'

function kur() {
  const plane = new ControlPlane({ token: 'gizli' })
  let calisma = 0
  plane.method('health', { roles: ['operator', 'node'] }, () => ({ ok: true }))
  plane.method(
    'send',
    { sideEffect: true, schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } },
    async (p) => ({ n: ++calisma, text: p.text }),
  )
  const istemci = async (role = 'operator', token = 'gizli') => {
    const olaylar = []
    const conn = plane.openConnection((f) => olaylar.push(f))
    const cevap = await plane.handleFrame(conn, {
      type: 'req',
      id: '0',
      method: 'connect',
      params: { auth: { token }, role },
    })
    return {
      conn,
      olaylar,
      cevap,
      req: (method, params, id = 'x') => plane.handleFrame(conn, { type: 'req', id, method, params }),
    }
  }
  return { plane, istemci }
}

test('ilk çerçeve connect değilse bağlantı kapanır', async () => {
  const { plane } = kur()
  const conn = plane.openConnection(() => {})
  const cevap = await plane.handleFrame(conn, { type: 'req', id: '1', method: 'health', params: {} })
  assert.equal(cevap.error.code, 'NOT_CONNECTED')
  assert.equal(conn.closed, true)
})

test('yanlış token reddedilir, doğru token yöntem listesini döner', async () => {
  const { istemci } = kur()
  assert.equal((await istemci('operator', 'yanlis')).cevap.error.code, 'UNAUTHORIZED')
  const { cevap } = await istemci()
  assert.equal(cevap.payload.type, 'hello-ok')
  assert.deepEqual(cevap.payload.features.methods, ['health', 'send'])
})

test('node rolü operatör yöntemlerini çağıramaz', async () => {
  const { istemci } = kur()
  const dugum = await istemci('node')
  assert.deepEqual(dugum.cevap.payload.features.methods, ['health'])
  assert.equal((await dugum.req('send', { text: 'x', idempotencyKey: 'k' })).error.code, 'FORBIDDEN')
})

test('parametreler şemaya göre doğrulanır', async () => {
  const { istemci } = kur()
  const op = await istemci()
  assert.equal((await op.req('send', { text: 5, idempotencyKey: 'k' })).error.code, 'INVALID_PARAMS')
  assert.equal((await op.req('yok', {})).error.code, 'UNKNOWN_METHOD')
  assert.match(validate({ type: 'object', required: ['a'] }, {}), /params\.a: zorunlu/)
  assert.equal(validate({ type: 'string', enum: ['a', 'b'] }, 'c'), 'params: a | b olmalı')
})

test('yan etkili yöntem idempotencyKey ister ve tekrar çalışmaz', async () => {
  const { istemci } = kur()
  const op = await istemci()
  assert.equal((await op.req('send', { text: 'merhaba' })).error.code, 'INVALID_PARAMS')
  const [a, b] = await Promise.all([
    op.req('send', { text: 'merhaba', idempotencyKey: 'k1' }, 'r1'),
    op.req('send', { text: 'merhaba', idempotencyKey: 'k1' }, 'r2'),
  ])
  assert.equal(a.payload.n, 1)
  assert.equal(b.payload.n, 1) // eşzamanlı tekrar aynı çalışmayı paylaştı
  assert.equal(b.id, 'r2') // ama cevap kendi istek kimliğiyle döner
  assert.equal(b.replayed, true)
  assert.equal((await op.req('send', { text: 'yeni', idempotencyKey: 'k2' })).payload.n, 2)
})

test('olaylar artan seq ile yalnızca bağlı istemcilere gider', async () => {
  const { plane, istemci } = kur()
  const op = await istemci()
  plane.openConnection(() => assert.fail('connect olmamış istemciye olay gitmemeli'))
  plane.broadcast('tick', {})
  plane.broadcast('presence', { n: 1 })
  assert.deepEqual(
    op.olaylar.map((o) => [o.event, o.seq]),
    [
      ['tick', 1],
      ['presence', 2],
    ],
  )
})
