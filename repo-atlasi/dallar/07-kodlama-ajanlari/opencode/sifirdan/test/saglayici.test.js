import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import {
  createFakeProvider,
  createHttpProvider,
  estimateTokens,
  ProviderError,
  shapes,
  textMessage,
} from '../asama1_saglayici.js'

const conversation = {
  system: 'sistem',
  messages: [
    textMessage('user', 'dosyayı oku'),
    { role: 'assistant', parts: [{ type: 'tool-call', id: 'c1', name: 'read', input: { path: 'a.txt' } }] },
    { role: 'tool', parts: [{ type: 'tool-result', id: 'c1', name: 'read', output: '1: merhaba', isError: false }] },
  ],
  tools: [{ name: 'read', description: 'oku', parameters: { type: 'object', properties: {} } }],
}

test('OpenAI uyumlu gövde: tool_calls ve tool rolü doğru eşlenir', () => {
  const body = shapes['openai-compatible'].body({ ...conversation, toolChoice: 'none' }, 'm')
  assert.equal(body.messages[0].role, 'system')
  assert.equal(body.messages[2].tool_calls[0].function.arguments, '{"path":"a.txt"}')
  assert.deepEqual(body.messages[3], { role: 'tool', tool_call_id: 'c1', content: '1: merhaba' })
  assert.equal(body.tools[0].type, 'function')
  assert.equal(body.tool_choice, 'none')
})

test('Anthropic gövdesi: araç sonucu user rolünde, sistem ayrı alanda', () => {
  const body = shapes.anthropic.body(
    { ...conversation, messages: [...conversation.messages, textMessage('user', 'devam')] },
    'm',
  )
  assert.equal(body.system, 'sistem')
  assert.equal(body.messages.length, 3) // tool sonucu ile "devam" tek user mesajında birleşti
  assert.equal(body.messages[1].content[0].type, 'tool_use')
  assert.equal(body.messages[2].content[0].type, 'tool_result')
  assert.equal(body.messages[2].content[1].text, 'devam')
  assert.equal(body.tools[0].input_schema.type, 'object')
})

test('Ollama gövdesi: argümanlar nesne, toolChoice none iken araç listesi yok', () => {
  const body = shapes.ollama.body({ ...conversation, toolChoice: 'none' }, 'qwen3')
  assert.equal(body.stream, false)
  assert.deepEqual(body.messages[2].tool_calls[0].function.arguments, { path: 'a.txt' })
  assert.equal(body.messages[3].tool_name, 'read')
  assert.equal(body.tools, undefined)
})

test('yanıt çözümleme: bitiş nedeni, kullanım ve bozuk JSON argümanı', () => {
  const openai = shapes['openai-compatible'].parse({
    choices: [
      {
        finish_reason: 'tool_calls',
        message: { content: null, tool_calls: [{ id: 'x', function: { name: 'read', arguments: '{bozuk' } }] },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 3 },
  })
  assert.equal(openai.finish, 'tool-calls')
  assert.deepEqual(openai.toolCalls[0].input, { __invalidJson: '{bozuk' })
  assert.deepEqual(openai.usage, { input: 10, output: 3 })

  const claude = shapes.anthropic.parse({
    content: [{ type: 'text', text: 'tamam' }],
    stop_reason: 'max_tokens',
    usage: { input_tokens: 5, output_tokens: 7 },
  })
  assert.equal(claude.finish, 'length')
  assert.equal(claude.text, 'tamam')

  const local = shapes.ollama.parse({
    message: { content: '', tool_calls: [{ function: { name: 'glob', arguments: { pattern: '*' } } }] },
  })
  assert.equal(local.toolCalls[0].id, 'call_0')
})

test('HTTP sağlayıcı yerel sahte sunucuyla konuşur (internet yok)', async () => {
  let seen
  const server = http.createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    seen = { url: request.url, auth: request.headers.authorization, body: JSON.parse(raw) }
    if (seen.body.model === 'hata') {
      response.writeHead(503)
      response.end('meşgul')
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'selam' } }] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`
  try {
    const provider = createHttpProvider({ shape: 'openai-compatible', baseURL, model: 'yerel', apiKey: 'anahtar' })
    const response = await provider.complete({ system: 's', messages: [textMessage('user', 'hi')], tools: [] })
    assert.equal(response.text, 'selam')
    assert.equal(seen.url, '/v1/chat/completions')
    assert.equal(seen.auth, 'Bearer anahtar')
    assert.equal(seen.body.tools, undefined)

    const failing = createHttpProvider({ shape: 'openai-compatible', baseURL, model: 'hata' })
    await assert.rejects(failing.complete({ system: 's', messages: [], tools: [] }), (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.status, 503)
      return true
    })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('sahte sağlayıcı istekleri kaydeder, senaryo bitince hata verir', async () => {
  const provider = createFakeProvider([{ text: 'bir' }])
  const first = await provider.complete({ system: '', messages: [textMessage('user', 'x')], tools: [] })
  assert.equal(first.finish, 'stop')
  assert.equal(provider.calls.length, 1)
  await assert.rejects(provider.complete({ system: '', messages: [], tools: [] }), ProviderError)
  assert.equal(estimateTokens([textMessage('user', '12345678')]), 2)
})
