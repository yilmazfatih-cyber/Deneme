// Aşama 1 — Sağlayıcı soyutlaması (provider abstraction)
//
// Ajan döngüsü tek bir iç mesaj biçimiyle konuşur; her sağlayıcı bu biçimi kendi "tel biçimine"
// (wire shape) çevirir. opencode'da bu iş packages/ai/src/protocols/*.ts (tel biçimleri) ve
// packages/ai/src/providers/*.ts (uç noktalar) arasında bölünmüştür. Burada üç biçim var:
// OpenAI uyumlu /chat/completions, Anthropic tarzı /v1/messages ve Ollama'nın /api/chat'i.
// Testler için bir de senaryolu sahte sağlayıcı (fake provider) var: internet ve gerçek model yok.

/**
 * İç mesaj biçimi.
 * @typedef {{ type: 'text', text: string }} TextPart
 * @typedef {{ type: 'tool-call', id: string, name: string, input: object }} ToolCallPart
 * @typedef {{ type: 'tool-result', id: string, name: string, output: string, isError: boolean }} ToolResultPart
 * @typedef {{ role: 'user' | 'assistant' | 'tool', parts: Array<TextPart | ToolCallPart | ToolResultPart> }} Message
 * @typedef {{ name: string, description: string, parameters: object }} ToolSchema
 * @typedef {{ system: string, messages: Message[], tools: ToolSchema[], toolChoice?: 'auto' | 'none', maxTokens?: number }} ModelRequest
 * @typedef {{ text: string, toolCalls: Array<{ id: string, name: string, input: object }>, finish: 'stop' | 'tool-calls' | 'length', usage: { input: number, output: number } }} ModelResponse
 */

/** Tek parçalı metin mesajı üretir. */
export function textMessage(role, text) {
  return { role, parts: [{ type: 'text', text }] }
}

/** Kaba token tahmini: ~4 karakter = 1 token. opencode da ilk tahmini metin uzunluğundan yapar. */
export function estimateTokens(messages) {
  let chars = 0
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'text') chars += part.text.length
      if (part.type === 'tool-call') chars += part.name.length + JSON.stringify(part.input).length
      if (part.type === 'tool-result') chars += part.output.length
    }
  }
  return Math.ceil(chars / 4)
}

/** Bir mesajın metin parçalarını birleştirir. */
export function messageText(message) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

// --- Tel biçimleri (wire shapes) -------------------------------------------------------------

/** Araç argümanı JSON değilse modele hata olarak dönebilmek için ham metni saklarız. */
function parseArguments(raw) {
  if (typeof raw !== 'string') return raw ?? {}
  try {
    return JSON.parse(raw)
  } catch {
    return { __invalidJson: raw }
  }
}

const openaiCompatible = {
  path: '/chat/completions',
  headers: (apiKey) => (apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  /** @param {ModelRequest} request */
  body(request, model) {
    const messages = [{ role: 'system', content: request.system }]
    for (const message of request.messages) {
      if (message.role === 'tool') {
        for (const part of message.parts) {
          messages.push({ role: 'tool', tool_call_id: part.id, content: part.output })
        }
        continue
      }
      const calls = message.parts.filter((part) => part.type === 'tool-call')
      messages.push({
        role: message.role,
        content: messageText(message) || null,
        ...(calls.length > 0 && {
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          })),
        }),
      })
    }
    return {
      model,
      messages,
      ...(request.tools.length > 0 && {
        tools: request.tools.map((tool) => ({ type: 'function', function: tool })),
        tool_choice: request.toolChoice ?? 'auto',
      }),
      ...(request.maxTokens && { max_tokens: request.maxTokens }),
    }
  },
  /** @returns {ModelResponse} */
  parse(json) {
    const choice = json.choices?.[0] ?? {}
    const toolCalls = (choice.message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    }))
    const reason = choice.finish_reason
    return {
      text: choice.message?.content ?? '',
      toolCalls,
      finish: reason === 'length' ? 'length' : toolCalls.length > 0 ? 'tool-calls' : 'stop',
      usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 },
    }
  },
}

const anthropic = {
  path: '/v1/messages',
  headers: (apiKey) => ({ 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' }),
  body(request, model) {
    // Anthropic'te araç sonuçları "user" rolünde gider ve art arda aynı rol birleştirilmelidir.
    const messages = []
    for (const message of request.messages) {
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      const content = message.parts.map((part) => {
        if (part.type === 'text') return { type: 'text', text: part.text }
        if (part.type === 'tool-call') return { type: 'tool_use', id: part.id, name: part.name, input: part.input }
        return { type: 'tool_result', tool_use_id: part.id, content: part.output, is_error: part.isError }
      })
      const last = messages.at(-1)
      if (last && last.role === role) last.content.push(...content)
      else messages.push({ role, content })
    }
    return {
      model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.system,
      messages,
      ...(request.tools.length > 0 && {
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
        tool_choice: { type: request.toolChoice === 'none' ? 'none' : 'auto' },
      }),
    }
  },
  parse(json) {
    const blocks = json.content ?? []
    const toolCalls = blocks
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({ id: block.id, name: block.name, input: block.input ?? {} }))
    const text = blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    const finish = json.stop_reason === 'max_tokens' ? 'length' : toolCalls.length > 0 ? 'tool-calls' : 'stop'
    return {
      text,
      toolCalls,
      finish,
      usage: { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 },
    }
  },
}

const ollama = {
  // Not: opencode Ollama'yı /api/tags ile keşfedip OpenAI uyumlu rotadan konuşur
  // (packages/core/src/plugin/provider/ollama.ts + local.ts). Burada öğretmek için yerel /api/chat biçimi var.
  path: '/api/chat',
  headers: () => ({}),
  body(request, model) {
    const messages = [{ role: 'system', content: request.system }]
    for (const message of request.messages) {
      if (message.role === 'tool') {
        for (const part of message.parts) messages.push({ role: 'tool', content: part.output, tool_name: part.name })
        continue
      }
      const calls = message.parts.filter((part) => part.type === 'tool-call')
      messages.push({
        role: message.role,
        content: messageText(message),
        ...(calls.length > 0 && {
          tool_calls: calls.map((call) => ({ function: { name: call.name, arguments: call.input } })),
        }),
      })
    }
    return {
      model,
      stream: false,
      messages,
      ...(request.tools.length > 0 &&
        request.toolChoice !== 'none' && {
          tools: request.tools.map((tool) => ({ type: 'function', function: tool })),
        }),
    }
  },
  parse(json) {
    // Ollama çağrı kimliği döndürmeyebilir; sırayla kimlik üretiriz.
    const toolCalls = (json.message?.tool_calls ?? []).map((call, index) => ({
      id: call.id ?? `call_${index}`,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    }))
    return {
      text: json.message?.content ?? '',
      toolCalls,
      finish: json.done_reason === 'length' ? 'length' : toolCalls.length > 0 ? 'tool-calls' : 'stop',
      usage: { input: json.prompt_eval_count ?? 0, output: json.eval_count ?? 0 },
    }
  },
}

export const shapes = { 'openai-compatible': openaiCompatible, anthropic, ollama }

/** Sağlayıcı hatası: durum kodu ve gövde saklanır ki döngü yeniden denemeye karar verebilsin. */
export class ProviderError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.body = body
  }
}

/**
 * HTTP üzerinden konuşan sağlayıcı. `fetchImpl` testte değiştirilebilir.
 * @param {{ shape: keyof typeof shapes, baseURL: string, model: string, apiKey?: string, fetchImpl?: typeof fetch }} options
 */
export function createHttpProvider(options) {
  const shape = shapes[options.shape]
  if (!shape) throw new Error(`Bilinmeyen tel biçimi: ${options.shape}`)
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    id: options.shape,
    model: options.model,
    /** @param {ModelRequest} request @returns {Promise<ModelResponse>} */
    async complete(request) {
      const response = await fetchImpl(options.baseURL.replace(/\/$/, '') + shape.path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...shape.headers(options.apiKey) },
        body: JSON.stringify(shape.body(request, options.model)),
      })
      const text = await response.text()
      if (!response.ok) throw new ProviderError(`Sağlayıcı ${response.status} döndü`, response.status, text)
      return shape.parse(JSON.parse(text))
    },
  }
}

/**
 * Senaryolu sahte sağlayıcı. `script` ya yanıt dizisidir ya da (istek, sıra) => yanıt fonksiyonu.
 * Yanıtta eksik alanlar doldurulur; gelen her istek `calls` dizisine kopyalanır.
 */
export function createFakeProvider(script) {
  const calls = []
  return {
    id: 'fake',
    model: 'fake-model',
    calls,
    async complete(request) {
      calls.push(structuredClone(request))
      const index = calls.length - 1
      const raw = typeof script === 'function' ? script(request, index) : script[index]
      if (!raw) throw new ProviderError(`Senaryoda ${index}. yanıt yok`, 500, '')
      if (raw instanceof Error) throw raw
      const toolCalls = raw.toolCalls ?? []
      return {
        text: raw.text ?? '',
        toolCalls,
        finish: raw.finish ?? (toolCalls.length > 0 ? 'tool-calls' : 'stop'),
        usage: raw.usage ?? { input: estimateTokens(request.messages), output: Math.ceil((raw.text ?? '').length / 4) },
      }
    },
  }
}
