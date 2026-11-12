import assert from 'node:assert/strict'
import { test } from 'node:test'
import { App, Service, State } from '../asama2_baglam.js'

class Greeter extends Service {
  constructor(ctx, config) {
    super(ctx, 'greeter')
    this.prefix = config.prefix ?? 'Merhaba'
  }

  greet(who) {
    return `${this.prefix}, ${who}!`
  }
}

test('inject: servis gelene kadar PENDING; sıra önemli değil', () => {
  const app = new App()
  const said = []
  const consumer = app.ctx.plugin({
    name: 'consumer',
    inject: ['greeter'],
    apply: (ctx) => said.push(ctx.greeter.greet('dünya')),
  })
  assert.equal(consumer.state, State.PENDING)
  assert.deepEqual(app.report(), [{ name: 'consumer', state: 'pending', missing: ['greeter'] }])
  app.ctx.plugin(Greeter)
  assert.equal(consumer.state, State.ACTIVE)
  assert.deepEqual(said, ['Merhaba, dünya!'])
})

test('servis kaybolunca bağımlı eklenti boşaltılır, dönünce yeniden yüklenir', async () => {
  const app = new App()
  const log = []
  const consumer = app.ctx.plugin({
    name: 'consumer',
    inject: ['greeter'],
    apply(ctx) {
      log.push(`yüklendi: ${ctx.greeter.greet('x')}`)
      ctx.effect(() => () => log.push('temizlendi'))
    },
  })
  const provider = app.ctx.plugin(Greeter, { prefix: 'Selam' })
  await provider.dispose()
  assert.equal(consumer.state, State.PENDING)
  assert.equal(app.ctx.greeter, undefined)
  app.ctx.plugin(Greeter, { prefix: 'Hey' })
  assert.equal(consumer.state, State.ACTIVE)
  assert.deepEqual(log, ['yüklendi: Selam, x!', 'temizlendi', 'yüklendi: Hey, x!'])
})

test('etkiler ters sırada geri sarılır; async temizlik beklenir; çocuk eklenti de gider', async () => {
  const app = new App()
  const log = []
  const parent = app.ctx.plugin(function parent(ctx) {
    ctx.effect(() => () => log.push('birinci'))
    ctx.effect(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      log.push('ikinci (async)')
    })
    ctx.plugin(function child(childCtx) {
      childCtx.effect(() => () => log.push('çocuk'))
    })
  })
  assert.equal(app.fibers.size, 2)
  await parent.dispose()
  assert.deepEqual(log, ['çocuk', 'birinci', 'ikinci (async)'])
  assert.equal(app.fibers.size, 0)
  assert.equal(parent.state, State.DISPOSED)
  assert.throws(() => parent.ctx.effect(() => {}), /yeni etki eklenemez/)
})

test('yapılandırma hatası FAILED yapar ve o ana kadarki etkileri geri sarar', () => {
  const errors = []
  const app = new App({ onError: (error) => errors.push(error.message) })
  const log = []
  function strict(ctx, config) {
    ctx.effect(() => () => log.push('geri alındı'))
    if (!config.token) throw new Error('token gerekli')
  }
  const fiber = app.ctx.plugin(strict, {})
  assert.equal(fiber.state, State.FAILED)
  assert.deepEqual(log, ['geri alındı'])
  assert.deepEqual(errors, ['token gerekli'])
  const typed = app.ctx.plugin(Object.assign(() => {}, { schema: () => assert.fail('şema hatası') }))
  assert.equal(typed.state, State.FAILED)
})

test('dinleyiciler eklentiyle birlikte kalkar; aynı servis iki kez sağlanamaz', async () => {
  const errors = []
  const app = new App({ onError: (error) => errors.push(error.message) })
  const heard = []
  const listener = app.ctx.plugin((ctx) => ctx.on('ping', (x) => heard.push(x)))
  app.ctx.emit('ping', 1)
  await listener.dispose()
  app.ctx.emit('ping', 2)
  assert.deepEqual(heard, [1])

  app.ctx.plugin(Greeter)
  const second = app.ctx.plugin(Greeter)
  assert.equal(second.state, State.FAILED)
  assert.match(errors[0], /zaten sağlanıyor/)
  assert.throws(() => {
    app.ctx.greeter = 1
  }, /doğrudan yazılamaz/)
})
