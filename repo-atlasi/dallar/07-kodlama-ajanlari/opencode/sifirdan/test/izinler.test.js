import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  agents,
  createPermissionService,
  DEFAULT_RULES,
  evaluate,
  isWhollyDenied,
  PermissionCorrectedError,
  PermissionDeniedError,
  PermissionRejectedError,
  wildcardMatch,
} from '../asama3_izinler.js'

test('joker eşleme', () => {
  assert.ok(wildcardMatch('rm -rf build', 'rm *'))
  assert.ok(wildcardMatch('config/.env', '*.env'))
  assert.ok(!wildcardMatch('a.env.example', '*.env'))
  assert.ok(wildcardMatch('a1', 'a?'))
  assert.ok(!wildcardMatch('a.b', 'a?b?'))
  assert.ok(wildcardMatch('', '*'))
  assert.ok(wildcardMatch('a*b', 'a*')) // değerdeki `*` sıradan bir karakterdir
  assert.ok(wildcardMatch('x.env.y.env', '*.env')) // geri izleme: ilk `.env` değil, sondaki eşleşir
  assert.ok(!wildcardMatch('x', ''))
})

test('son eşleşen kural kazanır, eşleşme yoksa "ask"', () => {
  // Kurallar opencode'un varsayılan ajanındakilerle aynı: * izin, .env ve .env.* sor, .env.example izin.
  assert.equal(evaluate('read', 'src/a.js', DEFAULT_RULES).effect, 'allow')
  assert.equal(evaluate('read', '.env', DEFAULT_RULES).effect, 'ask')
  // .env.local hem `*` hem `*.env.*` kuralına uyar; sonuncusu kazanır. İlk eşleşen kazansaydı "allow" olurdu.
  assert.equal(evaluate('read', '.env.local', DEFAULT_RULES).effect, 'ask')
  assert.equal(evaluate('read', '.env.example', DEFAULT_RULES).effect, 'allow')
  assert.equal(evaluate('bash', 'ls', []).effect, 'ask')
})

test('yapılandırılmış deny, kaydedilmiş onaydan önce gelir', async () => {
  const service = createPermissionService({
    rules: [{ action: 'bash', resource: 'rm *', effect: 'deny' }],
    saved: [{ action: 'bash', resource: '*', effect: 'allow' }],
    ask: async () => 'once',
  })
  await assert.rejects(service.assert({ action: 'bash', resources: ['ls', 'rm -rf /'] }), PermissionDeniedError)
  assert.equal(await service.assert({ action: 'bash', resources: ['ls'] }), 'allow')
})

test('"always" yanıtı kaydedilir ve aynı istek bir daha sorulmaz', async () => {
  let questions = 0
  const service = createPermissionService({
    rules: [],
    ask: async () => {
      questions++
      return 'always'
    },
  })
  await service.assert({ action: 'edit', resources: ['src/a.js'] })
  await service.assert({ action: 'edit', resources: ['src/a.js'] })
  assert.equal(questions, 1)
  assert.deepEqual(service.saved, [{ action: 'edit', resource: 'src/a.js', effect: 'allow' }])
})

test('ret: açıklamasız → Rejected, açıklamalı → Corrected; soracak kimse yoksa reddet', async () => {
  const reject = createPermissionService({ rules: [], ask: async () => ({ reply: 'reject' }) })
  await assert.rejects(reject.assert({ action: 'bash', resources: ['ls'] }), PermissionRejectedError)
  const correct = createPermissionService({
    rules: [],
    ask: async () => ({ reply: 'reject', message: 'npm test çalıştır' }),
  })
  await assert.rejects(correct.assert({ action: 'bash', resources: ['ls'] }), (error) => {
    assert.ok(error instanceof PermissionCorrectedError)
    assert.match(error.message, /npm test/)
    return true
  })
  const nobody = createPermissionService({ rules: [] })
  await assert.rejects(nobody.assert({ action: 'bash', resources: ['ls'] }), PermissionDeniedError)
})

test('yerleşik ajanlar: plan düzenleyemez; explore yazamaz ama kabuğu açıktır', async () => {
  const plan = createPermissionService({ rules: agents.plan.rules, ask: async () => 'once' })
  await assert.rejects(plan.assert({ action: 'edit', resources: ['a.js'] }), PermissionDeniedError)
  assert.equal(await plan.assert({ action: 'read', resources: ['a.js'] }), 'allow')
  assert.ok(isWhollyDenied('edit', agents.plan.rules))

  assert.ok(isWhollyDenied('edit', agents.explore.rules))
  assert.ok(!isWhollyDenied('grep', agents.explore.rules))
  // opencode'daki gibi: explore'da kabuk açıktır; "salt okunur kabuk" kuralı istemde yazar, izinde değil.
  assert.ok(!isWhollyDenied('bash', agents.explore.rules))
  const explore = createPermissionService({ rules: agents.explore.rules })
  assert.equal(await explore.assert({ action: 'bash', resources: ['git log'] }), 'allow')
  // .env okuması sorulur; soracak kimse yoksa reddedilir.
  await assert.rejects(explore.assert({ action: 'read', resources: ['.env'] }), PermissionDeniedError)
})
