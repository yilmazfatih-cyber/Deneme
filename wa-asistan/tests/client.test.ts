import { describe, expect, it, vi } from 'vitest'
import { OpenAICompatClient, normalizeModels } from '../src/llm/client.js'
import { LlmError } from '../src/core/types.js'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function make(responses: Array<Response | Error>, provider: 'openrouter' | 'modelflare' | 'generic' = 'openrouter') {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const queue = [...responses]
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = queue.shift()
    if (!next) throw new Error('beklenmeyen istek')
    if (next instanceof Error) throw next
    return next
  }) as unknown as typeof fetch
  const sleep = vi.fn(async () => {})
  const client = new OpenAICompatClient({
    baseUrl: 'https://example.test/v1',
    apiKey: 'sk-test',
    provider,
    appName: 'Test Bot',
    timeoutMs: 5000,
    fetchImpl,
    sleep,
    extraHeaders: { 'X-Ek': 'evet' },
  })
  return { client, calls, sleep }
}

const OK = {
  model: 'openai/gpt-4o-mini',
  choices: [{ message: { role: 'assistant', content: ' Merhaba! ' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 5, cost: 0.00042 },
}

describe('OpenAICompatClient.chat', () => {
  it('sends a plain request, reads text, usage and provider cost', async () => {
    const { client, calls } = make([json(OK)])
    const r = await client.chat({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'selam' }],
      maxTokens: 100,
    })
    expect(r).toEqual({
      text: 'Merhaba!',
      model: 'openai/gpt-4o-mini',
      usage: { promptTokens: 12, completionTokens: 5, costUsd: 0.00042 },
      finishReason: 'stop',
    })
    const call = calls[0]!
    expect(call.url).toBe('https://example.test/v1/chat/completions')
    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>
    expect(body).toMatchObject({ model: 'openai/gpt-4o-mini', max_tokens: 100, stream: false })
    // deprecated OpenRouter knobs must not be sent
    expect(body).not.toHaveProperty('usage')
    expect(body).not.toHaveProperty('stream_options')
  })

  it('adds OpenRouter attribution headers, the custom headers and the bearer key', async () => {
    const { client, calls } = make([json(OK)])
    await client.chat({ model: 'm', messages: [] })
    const h = calls[0]!.init.headers as Record<string, string>
    expect(h.Authorization).toBe('Bearer sk-test')
    expect(h['X-OpenRouter-Title']).toBe('Test Bot')
    expect(h['HTTP-Referer']).toMatch(/^https:\/\/github\.com\//)
    expect(h['X-Ek']).toBe('evet')
  })

  it('adds the Modelflare skill header only for Modelflare', async () => {
    const mf = make([json(OK)], 'modelflare')
    await mf.client.chat({ model: 'm', messages: [] })
    expect((mf.calls[0]!.init.headers as Record<string, string>)['X-Modelflare-Skill']).toMatch(/^wa-asistan\//)
    const gen = make([json(OK)], 'generic')
    await gen.client.chat({ model: 'm', messages: [] })
    const h = gen.calls[0]!.init.headers as Record<string, string>
    expect(h['X-Modelflare-Skill']).toBeUndefined()
    expect(h['X-OpenRouter-Title']).toBeUndefined()
  })

  it('has no costUsd when the provider does not report one', async () => {
    const { client } = make([json({ ...OK, usage: { prompt_tokens: 3, completion_tokens: 1 } })])
    const r = await client.chat({ model: 'm', messages: [] })
    expect(r.usage).toEqual({ promptTokens: 3, completionTokens: 1 })
  })

  it('joins array content parts', async () => {
    const body = {
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'a' },
              { type: 'text', text: 'b' },
            ],
          },
        },
      ],
    }
    const { client } = make([json(body)])
    expect((await client.chat({ model: 'm', messages: [] })).text).toBe('ab')
  })

  it('does not retry client errors and reports the provider message', async () => {
    const { client, calls, sleep } = make([json({ error: { message: 'No auth credentials found' } }, 401)])
    const err = await client.chat({ model: 'm', messages: [] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LlmError)
    expect(err).toMatchObject({ status: 401, message: 'No auth credentials found' })
    expect(calls).toHaveLength(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries 429 and 5xx with 1 s and 3 s delays, then succeeds', async () => {
    const { client, calls, sleep } = make([json({ error: { message: 'limit' } }, 429), json({}, 503), json(OK)])
    const r = await client.chat({ model: 'm', messages: [] })
    expect(r.text).toBe('Merhaba!')
    expect(calls).toHaveLength(3)
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1000, 3000])
  })

  it('gives up after the retries and throws the last error', async () => {
    const { client, calls } = make([json({}, 500), json({}, 502), json({ error: { message: 'kapalı' } }, 503)])
    await expect(client.chat({ model: 'm', messages: [] })).rejects.toMatchObject({ status: 503, message: 'kapalı' })
    expect(calls).toHaveLength(3)
  })

  it('treats a 200 response that only contains an error as a failure (OpenRouter style)', async () => {
    const { client } = make([json({ error: { message: 'model yok', code: 404 } })])
    await expect(client.chat({ model: 'x', messages: [] })).rejects.toMatchObject({ status: 404, message: 'model yok' })
  })

  it('retries network failures', async () => {
    const { client, calls } = make([new TypeError('fetch failed'), json(OK)])
    expect((await client.chat({ model: 'm', messages: [] })).text).toBe('Merhaba!')
    expect(calls).toHaveLength(2)
  })

  it('rejects an unexpected body shape', async () => {
    const { client } = make([json({ hello: 'world' })])
    await expect(client.chat({ model: 'm', messages: [] })).rejects.toMatchObject({ status: 502 })
  })
})

describe('normalizeModels', () => {
  const openrouter = {
    data: [
      {
        id: 'openai/gpt-4o-mini',
        name: 'OpenAI: GPT-4o mini',
        context_length: 128000,
        architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
        pricing: { prompt: '0.00000015', completion: '0.0000006', image: '0.0001', request: '0' },
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        name: 'Llama 3.3 70B (free)',
        context_length: 65536,
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        pricing: { prompt: '0', completion: '0' },
      },
      {
        id: 'openrouter/auto',
        name: 'Auto',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '-1', completion: '-1' },
      },
      {
        id: 'black-forest-labs/flux',
        name: 'Flux',
        architecture: { output_modalities: ['image'] },
        pricing: { prompt: '0', completion: '0' },
      },
    ],
  }

  it('normalizes the OpenRouter shape', () => {
    const models = normalizeModels(openrouter)
    expect(models.map((m) => m.id)).toEqual([
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct:free',
      'openrouter/auto',
    ])
    const [mini, free, auto] = models
    expect(mini).toMatchObject({
      contextLength: 128000,
      inputModalities: ['text', 'image'],
      pricing: { promptUsdPerToken: 0.00000015, completionUsdPerToken: 0.0000006, imageUsd: 0.0001 },
    })
    expect(mini?.pricing).not.toHaveProperty('requestUsd')
    expect(free).toMatchObject({ free: true, pricing: { promptUsdPerToken: 0 } })
    // negative price = variable pricing → unknown
    expect(auto?.pricing).toBeUndefined()
    expect(auto?.inputModalities).toEqual(['text'])
  })

  it('handles bare OpenAI lists and Modelflare kind', () => {
    const models = normalizeModels({
      data: [{ id: 'a' }, { id: 'b', kind: 'text' }, { id: 'c', kind: 'image' }, { nope: 1 }],
    })
    expect(models.map((m) => m.id)).toEqual(['a', 'b'])
    expect(models[0]).toEqual({ id: 'a', name: 'a', inputModalities: ['text'] })
  })

  it('returns [] for garbage', () => {
    expect(normalizeModels(null)).toEqual([])
    expect(normalizeModels({ data: 'x' })).toEqual([])
  })
})
