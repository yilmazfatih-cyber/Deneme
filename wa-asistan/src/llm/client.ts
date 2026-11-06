/**
 * OpenAI-compatible chat client (OpenRouter, Modelflare, Hermes API server, any /v1 endpoint).
 *
 * OpenRouter notes (verified against its SDK typings, Oct 2026): `usage.include` and
 * `stream_options.include_usage` are deprecated no-ops; every completion already carries `usage.cost` in USD.
 * So we send nothing special and simply read `usage.cost` when it is a number.
 */
import type { Provider } from '../config.js'
import {
  LlmError,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type LlmClient,
  type ModelInfo,
  type ModelPricing,
} from '../core/types.js'

export interface ClientOptions {
  baseUrl: string
  apiKey: string
  provider: Provider
  appName: string
  timeoutMs: number
  extraHeaders?: Record<string, string>
  fetchImpl?: typeof fetch
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>
  /** wait times between retries; default 1 s then 3 s */
  retryDelaysMs?: number[]
}

const REPO_URL = 'https://github.com/yilmazfatih-cyber/Deneme'
const APP_VERSION = '0.1.0'

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const finite = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** `choices[0].message.content` is a string, or (some providers) an array of parts. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (isObj(p) && p.type !== 'image_url' ? (str(p.text) ?? '') : ''))
      .filter(Boolean)
      .join('')
  }
  return ''
}

function errorMessage(body: unknown, fallback: string): string {
  if (isObj(body)) {
    const e = body.error
    if (isObj(e)) return str(e.message) ?? fallback
    if (typeof e === 'string') return e
    const m = str(body.message)
    if (m) return m
  }
  return fallback
}

export class OpenAICompatClient implements LlmClient {
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly delays: number[]

  constructor(private readonly o: ClientOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch
    this.sleep = o.sleep ?? defaultSleep
    this.delays = o.retryDelaysMs ?? [1000, 3000]
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.o.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (this.o.provider === 'openrouter') {
      h['HTTP-Referer'] = REPO_URL
      h['X-OpenRouter-Title'] = this.o.appName
      h['X-Title'] = this.o.appName
    } else if (this.o.provider === 'modelflare') {
      h['X-Modelflare-Skill'] = `wa-asistan/${APP_VERSION}`
    }
    return { ...h, ...this.o.extraHeaders }
  }

  private signal(extra?: AbortSignal): AbortSignal {
    const t = AbortSignal.timeout(this.o.timeoutMs)
    return extra ? AbortSignal.any([t, extra]) : t
  }

  /** One request with retry on 429, 5xx and network errors. Returns parsed JSON. */
  private async request(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const url = `${this.o.baseUrl}${path}`
    let lastError: LlmError | undefined
    for (let attempt = 0; attempt <= this.delays.length; attempt++) {
      if (attempt > 0) await this.sleep(this.delays[attempt - 1] ?? 1000)
      let res: Response
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: this.headers(),
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: this.signal(signal),
        })
      } catch (err) {
        if (signal?.aborted) throw new LlmError('İstek iptal edildi', 0)
        const name = err instanceof Error ? err.name : ''
        lastError = new LlmError(name === 'TimeoutError' ? 'Zaman aşımı' : 'Ağ hatası', 0, String(err))
        continue
      }
      const text = await res.text().catch(() => '')
      let json: unknown
      try {
        json = text ? JSON.parse(text) : undefined
      } catch {
        json = undefined
      }
      if (res.ok) {
        // OpenRouter can answer 200 with an error object in the body.
        if (isObj(json) && isObj(json.error) && !Array.isArray(json.choices)) {
          const status = finite(json.error.code) ?? 502
          const err = new LlmError(errorMessage(json, 'Sağlayıcı hata döndürdü'), status, text.slice(0, 500))
          if (status === 429 || status >= 500) {
            lastError = err
            continue
          }
          throw err
        }
        return json
      }
      const err = new LlmError(errorMessage(json, `HTTP ${res.status}`), res.status, text.slice(0, 500))
      if (res.status === 429 || res.status >= 500) {
        lastError = err
        continue
      }
      throw err
    }
    throw lastError ?? new LlmError('Bilinmeyen hata', 0)
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const body: Json = {
      model: req.model,
      messages: req.messages satisfies ChatMessage[],
      stream: false,
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    }
    const json = await this.request('POST', '/chat/completions', body, req.signal)
    if (!isObj(json) || !Array.isArray(json.choices) || json.choices.length === 0) {
      throw new LlmError('Sağlayıcıdan beklenmeyen yanıt', 502, JSON.stringify(json)?.slice(0, 300) ?? '')
    }
    const choice = json.choices[0]
    const message = isObj(choice) && isObj(choice.message) ? choice.message : {}
    const usageRaw = isObj(json.usage) ? json.usage : undefined
    const prompt = finite(usageRaw?.prompt_tokens)
    const completion = finite(usageRaw?.completion_tokens)
    const cost = finite(usageRaw?.cost)
    return {
      text: contentText(message.content).trim(),
      model: str(json.model) ?? req.model,
      ...(usageRaw
        ? {
            usage: {
              promptTokens: prompt ?? 0,
              completionTokens: completion ?? 0,
              ...(cost !== undefined && cost >= 0 ? { costUsd: cost } : {}),
            },
          }
        : {}),
      ...(isObj(choice) && str(choice.finish_reason) ? { finishReason: str(choice.finish_reason) as string } : {}),
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const json = await this.request('GET', '/models')
    return normalizeModels(json)
  }
}

/**
 * `GET /models` → ModelInfo[]. Handles the OpenRouter shape (prices as USD-per-token strings, `architecture`)
 * and the bare OpenAI shape (`{id}` only). Non-text models are dropped when the provider says so
 * (OpenRouter `output_modalities`, Modelflare `kind`).
 */
export function normalizeModels(json: unknown): ModelInfo[] {
  const list = isObj(json) && Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []
  const out: ModelInfo[] = []
  for (const m of list) {
    if (!isObj(m)) continue
    const id = str(m.id)
    if (!id) continue
    if (str(m.kind) && m.kind !== 'text') continue
    const arch = isObj(m.architecture) ? m.architecture : undefined
    const outputs = Array.isArray(arch?.output_modalities) ? (arch.output_modalities as unknown[]) : undefined
    if (outputs && !outputs.includes('text')) continue
    const inputsRaw = Array.isArray(arch?.input_modalities) ? (arch.input_modalities as unknown[]) : undefined
    const inputModalities = inputsRaw ? inputsRaw.filter((x): x is string => typeof x === 'string') : ['text']
    const pr = isObj(m.pricing) ? m.pricing : undefined
    const prompt = finite(pr?.prompt)
    const completion = finite(pr?.completion)
    let pricing: ModelPricing | undefined
    // OpenRouter uses "-1" for routers with variable pricing → treat as unknown.
    if (prompt !== undefined && completion !== undefined && prompt >= 0 && completion >= 0) {
      const image = finite(pr?.image)
      const request = finite(pr?.request)
      pricing = {
        promptUsdPerToken: prompt,
        completionUsdPerToken: completion,
        ...(image !== undefined && image > 0 ? { imageUsd: image } : {}),
        ...(request !== undefined && request > 0 ? { requestUsd: request } : {}),
      }
    }
    const free =
      id.endsWith(':free') ||
      (pricing !== undefined && pricing.promptUsdPerToken === 0 && pricing.completionUsdPerToken === 0)
    const context = finite(m.context_length) ?? finite(m.context_window)
    out.push({
      id,
      name: str(m.name) ?? id,
      ...(context !== undefined ? { contextLength: context } : {}),
      inputModalities: inputModalities.length ? inputModalities : ['text'],
      ...(pricing ? { pricing } : {}),
      ...(free ? { free: true } : {}),
    })
  }
  return out
}
