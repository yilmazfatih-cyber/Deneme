import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { createApp } from '../server.mjs'
import { SYSTEM_PROMPT } from '../lib/prompts.mjs'
import { CANNED } from '../lib/mock.mjs'

/** @param {import('node:http').Server} server */
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}
const close = (server) =>
  new Promise((r) => {
    server.close(() => r())
    server.closeAllConnections?.()
  })

/** Ham SSE gövdesini olay listesine çevirir. */
function parseSse(text) {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith('data: '))
    .map((b) => JSON.parse(b.slice(6)))
}

const post = (port, body, headers = {}) =>
  fetch(`http://127.0.0.1:${port}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const SCRIPT =
  'Title: Deneme\n\n.İÇ. ÇAY OCAĞI - GECE\n\nŞevket bardak siler.\n\n@ŞEVKET\nGel.\n\n.DIŞ. SOKAK - GÜN\n\nYağmur.\n'

// --- Örnek kip -------------------------------------------------------------

let mockServer, mockPort
before(async () => {
  mockServer = createApp({ mock: true, mockDelayMs: 0 })
  mockPort = await listen(mockServer)
})
after(() => close(mockServer))

test('statik dosyalar sunulur; / → index.html; güvenlik başlıkları var', async () => {
  const r = await fetch(`http://127.0.0.1:${mockPort}/`)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type'), /text\/html/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/)
  assert.match(await r.text(), /<title>Perde/)
  const js = await fetch(`http://127.0.0.1:${mockPort}/senaryo.mjs`)
  assert.match(js.headers.get('content-type'), /javascript/)
})

test('yol geçişi (path traversal) engellenir', async () => {
  for (const p of ['/..%2fserver.mjs', '/%2e%2e/server.mjs', '/..%2f..%2fpackage.json', '/%00', '/%E0%A4%A']) {
    const r = await fetch(`http://127.0.0.1:${mockPort}${p}`)
    assert.ok([400, 403, 404].includes(r.status), `${p} → ${r.status}`)
    assert.doesNotMatch(await r.text(), /createApp|"name": "perde"/)
  }
  // ham istek: .. segmentleri istemci tarafından normalize edilmeden gönderilir
  const status = await new Promise((resolve) => {
    http
      .get({ host: '127.0.0.1', port: mockPort, path: '/../server.mjs' }, (res) => {
        res.resume()
        resolve(res.statusCode)
      })
      .on('error', () => resolve(0))
  })
  assert.ok([400, 403, 404].includes(status), `ham yol → ${status}`)
})

test('durum ucu örnek kipi bildirir; var olmayan dosya 404', async () => {
  const j = await (await fetch(`http://127.0.0.1:${mockPort}/api/durum`)).json()
  assert.equal(j.mock, true)
  assert.equal((await fetch(`http://127.0.0.1:${mockPort}/yok.js`)).status, 404)
})

test('örnek kipte SSE akışı: not + metin parçaları + done', async () => {
  const r = await post(mockPort, { action: 'continue', script: SCRIPT, sceneIndex: 0 })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type'), /text\/event-stream/)
  const events = parseSse(await r.text())
  assert.equal(events[0].type, 'notice')
  assert.equal(events[0].code, 'mock')
  assert.equal(events.at(-1).type, 'done')
  const text = events
    .filter((e) => e.type === 'text')
    .map((e) => e.text)
    .join('')
  assert.equal(text, CANNED.continue)
  assert.ok(events.filter((e) => e.type === 'text').length > 3, 'parça parça akar')
})

test('her eylem için örnek çıktı', async () => {
  for (const action of ['continue', 'rewrite', 'analyze', 'shots']) {
    const r = await post(mockPort, { action, script: SCRIPT, sceneIndex: 0, selection: '@ŞEVKET\nGel.' })
    const events = parseSse(await r.text())
    const text = events
      .filter((e) => e.type === 'text')
      .map((e) => e.text)
      .join('')
    assert.equal(text, CANNED[action], action)
  }
})

test('girdi doğrulama', async () => {
  const bad = [
    ['geçersiz eylem', { action: 'hack', script: SCRIPT }, 400],
    ['eylem yok', { script: SCRIPT }, 400],
    ['boş senaryo', { action: 'continue', script: '  ' }, 400],
    ['negatif sahne', { action: 'continue', script: SCRIPT, sceneIndex: -2 }, 400],
    ['seçimsiz yeniden yaz', { action: 'rewrite', script: SCRIPT }, 400],
    ['sahnesiz çekim listesi', { action: 'shots', script: 'Sadece aksiyon.' }, 400],
    ['aralık dışı sahne', { action: 'shots', script: SCRIPT, sceneIndex: 9 }, 400],
    ['bozuk JSON', '{not json', 400],
  ]
  for (const [name, body, status] of bad) {
    const r = await post(mockPort, body)
    assert.equal(r.status, status, name)
    assert.equal(typeof (await r.json()).error, 'string', name)
  }
  const wrongType = await fetch(`http://127.0.0.1:${mockPort}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ action: 'continue', script: SCRIPT }),
  })
  assert.equal(wrongType.status, 415)
  assert.equal((await fetch(`http://127.0.0.1:${mockPort}/api/ai`)).status, 405)
})

test('2 MB üstü gövde hata verir, kırpılmaz', async () => {
  const big = JSON.stringify({ action: 'analyze', script: 'a'.repeat(2 * 1024 * 1024 + 10) })
  const r = await post(mockPort, big)
  assert.equal(r.status, 413)
  assert.match((await r.json()).error, /2 MB/)
  // sınırın hemen altı kabul edilir
  const ok = JSON.stringify({ action: 'analyze', script: 'a'.repeat(2 * 1024 * 1024 - 200) })
  assert.equal((await post(mockPort, ok)).status, 200)
})

test('çapraz kaynaklı ve yanlış Host istekleri reddedilir', async () => {
  const r = await post(mockPort, { action: 'continue', script: SCRIPT }, { origin: 'https://kotu.example' })
  assert.equal(r.status, 403)
  const same = await post(mockPort, { action: 'continue', script: SCRIPT }, { origin: `http://127.0.0.1:${mockPort}` })
  assert.equal(same.status, 200)
  await same.text()
  const status = await new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: mockPort, path: '/', headers: { host: 'kotu.example' } },
      (res) => {
        res.resume()
        resolve(res.statusCode)
      },
    )
    req.end()
  })
  assert.equal(status, 403, 'DNS rebinding')
})

test('istemci kopunca akış durur', async () => {
  const slow = createApp({ mock: true, mockDelayMs: 15 })
  const port = await listen(slow)
  const ac = new AbortController()
  const res = await fetch(`http://127.0.0.1:${port}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', script: SCRIPT }),
    signal: ac.signal,
  })
  const reader = res.body.getReader()
  await reader.read()
  ac.abort()
  await new Promise((r) => setTimeout(r, 100))
  await close(slow)
})

// --- Sahte SDK istemcisiyle gerçek yol ---------------------------------------

/** İstek parametrelerini kaydeden, olay akıtan sahte istemci. */
function fakeClient({ chunks = ['Merhaba ', 'dünya'], stopReason = 'end_turn', fail = null, content = null } = {}) {
  const calls = []
  return {
    calls,
    beta: {
      messages: {
        stream(params, options) {
          calls.push({ params, options })
          const text = chunks.join('')
          const events = (async function* () {
            if (fail) throw fail
            for (const c of chunks)
              yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } }
          })()
          return Object.assign(events, {
            finalMessage: async () => ({
              stop_reason: stopReason,
              content: content ?? [{ type: 'text', text }],
            }),
          })
        },
      },
    },
  }
}

async function runWith(client, body) {
  const server = createApp({ client, model: 'claude-opus-5-5' })
  const port = await listen(server)
  try {
    const r = await post(port, body)
    return { status: r.status, events: parseSse(await r.text()) }
  } finally {
    await close(server)
  }
}

test('SDK çağrısı: model, beta, fallbacks, effort, max_tokens ve yasaklı alanların yokluğu', async () => {
  const cases = { continue: 'low', rewrite: 'low', analyze: 'medium', shots: 'medium' }
  for (const [action, effort] of Object.entries(cases)) {
    const client = fakeClient()
    const { status, events } = await runWith(client, {
      action,
      script: SCRIPT,
      sceneIndex: 0,
      selection: '@ŞEVKET\nGel.',
      instruction: 'daha kısa',
    })
    assert.equal(status, 200)
    assert.equal(client.calls.length, 1)
    const { params, options } = client.calls[0]
    assert.equal(params.model, 'claude-opus-5-5')
    assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01'])
    assert.equal(params.fallbacks, 'default')
    assert.deepEqual(params.output_config, { effort })
    assert.equal(params.max_tokens, 32000)
    for (const k of ['thinking', 'temperature', 'top_p', 'top_k', 'stream'])
      assert.ok(!(k in params), `${k} gönderilmemeli`)
    // sistem istemi: tek donmuş önbellekli blok
    assert.deepEqual(params.system, [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }])
    // kullanıcı içeriği: senaryo (önbellekli) + talimat; asistan ön doldurması yok
    assert.equal(params.messages.length, 1)
    assert.equal(params.messages[0].role, 'user')
    const [b1, b2] = params.messages[0].content
    assert.deepEqual(b1.cache_control, { type: 'ephemeral' })
    assert.match(b1.text, /ÇAY OCAĞI/)
    assert.equal(b2.cache_control, undefined)
    assert.ok(options.signal instanceof AbortSignal, 'iptal sinyali geçirilir')
    assert.equal(events.at(-1).type, 'done')
    assert.equal(
      events
        .filter((e) => e.type === 'text')
        .map((e) => e.text)
        .join(''),
      'Merhaba dünya',
    )
  }
})

test('SDK çağrısı: sahne bilgisi talimata girer', async () => {
  const client = fakeClient()
  await runWith(client, { action: 'shots', script: SCRIPT, sceneIndex: 1 })
  const b2 = client.calls[0].params.messages[0].content[1].text
  assert.match(b2, /2\. sahne \(DIŞ\. SOKAK - GÜN\)/)
})

test('varsayılan model claude-opus-5-5, PERDE_MODEL ile değişir', async () => {
  const client = fakeClient()
  const server = createApp({ client })
  const port = await listen(server)
  await (await post(port, { action: 'analyze', script: SCRIPT })).text()
  await close(server)
  assert.equal(client.calls[0].params.model, process.env.PERDE_MODEL || 'claude-opus-5-5')
})

test('stop_reason: refusal ve max_tokens tarafsız Türkçe bildirim üretir', async () => {
  const refusal = await runWith(fakeClient({ stopReason: 'refusal' }), { action: 'continue', script: SCRIPT })
  const n1 = refusal.events.find((e) => e.type === 'notice')
  assert.equal(n1.code, 'refusal')
  assert.match(n1.message, /çıktı üretmedi/)
  assert.doesNotMatch(n1.message, /yasak|suç|ihlal|hata/i)
  const maxed = await runWith(fakeClient({ stopReason: 'max_tokens' }), { action: 'continue', script: SCRIPT })
  assert.equal(maxed.events.find((e) => e.type === 'notice').code, 'max_tokens')
  assert.equal(maxed.events.at(-1).stopReason, 'max_tokens')
})

test('hata zinciri: en özelinden en geneline', async () => {
  const h = new Headers()
  const mk = (Cls, status, msg) => new Cls(status, { type: 'error', error: { type: 'x', message: msg } }, msg, h)
  const cases = [
    [mk(Anthropic.AuthenticationError, 401, 'bad key'), /API anahtarı yok veya geçersiz/],
    [mk(Anthropic.RateLimitError, 429, 'slow'), /İstek sınırı/],
    [new Anthropic.APIConnectionError({ message: 'net' }), /bağlanılamadı/],
    [mk(Anthropic.InternalServerError, 500, 'boom'), /hata döndürdü \(500\)/],
    [new Anthropic.AnthropicError('no creds'), /istemcisi başlatılamadı/],
    [new Error('beklenmedik'), /Beklenmeyen/],
  ]
  for (const [err, re] of cases) {
    const { events } = await runWith(fakeClient({ fail: err }), { action: 'analyze', script: SCRIPT })
    const e = events.find((x) => x.type === 'error')
    assert.ok(e, String(err))
    assert.match(e.message, re)
    assert.doesNotMatch(e.message, /bad key|boom|net$/, 'ham sağlayıcı iletisi sızmaz')
  }
})

test('yedek model devreye girerse nihai metin replace olarak gönderilir', async () => {
  const content = [
    { type: 'text', text: 'yarım' },
    { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
    { type: 'text', text: 'tam yedek çıktı' },
  ]
  const { events } = await runWith(fakeClient({ chunks: ['yarım', 'tam yedek çıktı'], content }), {
    action: 'analyze',
    script: SCRIPT,
  })
  assert.deepEqual(
    events.find((e) => e.type === 'replace'),
    { type: 'replace', text: 'tam yedek çıktı' },
  )
})

test('istemci kopunca üst akış iptal edilir (AbortSignal)', async () => {
  let seenSignal
  const client = {
    beta: {
      messages: {
        stream(_params, options) {
          seenSignal = options.signal
          const it = (async function* () {
            yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ilk' } }
            await new Promise((resolve, reject) => {
              options.signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError()))
              setTimeout(resolve, 5000)
            })
          })()
          return Object.assign(it, { finalMessage: async () => ({ stop_reason: 'end_turn', content: [] }) })
        },
      },
    },
  }
  const server = createApp({ client })
  const port = await listen(server)
  const ac = new AbortController()
  const res = await fetch(`http://127.0.0.1:${port}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', script: SCRIPT }),
    signal: ac.signal,
  })
  await res.body.getReader().read()
  ac.abort()
  for (let i = 0; i < 50 && !seenSignal?.aborted; i++) await new Promise((r) => setTimeout(r, 20))
  assert.equal(seenSignal.aborted, true)
  await close(server)
})

test('örnek kip yalnızca açıkça istenirse: anahtar yokken sessizce sahteye düşmez', async () => {
  const saved = process.env.PERDE_MOCK
  delete process.env.PERDE_MOCK
  const h = new Headers()
  const auth = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'a', message: 'x' } }, 'x', h)
  const client = fakeClient({ fail: auth })
  const { events } = await runWith(client, { action: 'continue', script: SCRIPT })
  assert.equal(client.calls.length, 1, 'gerçek yol denendi')
  assert.ok(events.some((e) => e.type === 'error'))
  assert.ok(!events.some((e) => e.code === 'mock'))
  if (saved !== undefined) process.env.PERDE_MOCK = saved
})
