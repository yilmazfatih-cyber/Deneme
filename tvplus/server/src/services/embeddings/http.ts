/**
 * `http` sağlayıcısı — dış model sunucusu (config.embedding.url, TVP_EMBEDDING_URL). Protokol: ./PROTOKOL.md.
 *   GET  <url>  → model bilgisi { protocol, model: { id, version, dims } }
 *   POST <url>  gövde { protocol, input: EmbeddingInput } → { videoId, shots: number[][], pooled: number[] }
 * Yanıt denetlenir (boyut, sayı, sonlu değerler); vektörler sunucu tarafında birim uzunluğa getirilir.
 * Zaman aşımı ve yeniden deneme: ağ hatası, zaman aşımı, 429 ve 5xx yeniden denenir; 4xx ve geçersiz yanıt denenmez.
 */
import { EnvHttpProxyAgent, fetch } from 'undici'
import type { EmbeddingModality } from '../../../../shared/intelligence'
import {
  checkOutput,
  inputModalities,
  normalizeRows,
  type EmbeddingInput,
  type EmbeddingOutput,
  type EmbeddingProvider,
} from './provider'

export const EMBEDDING_PROTOCOL = 'tvplus-embedding/1'
export const HTTP_TIMEOUT_MS = 30_000
export const HTTP_RETRIES = 2
export const HTTP_BACKOFF_MS = 500
/** Model sunucusunun bildirebileceği en büyük boyut (yanlış yanıtın belleği şişirmesine karşı) */
export const MAX_DIMS = 4096

export class EmbeddingHttpError extends Error {
  retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'EmbeddingHttpError'
    this.retryable = retryable
  }
}

export interface HttpProviderOptions {
  url: string
  timeoutMs?: number
  retries?: number
  backoffMs?: number
}

let agent: EnvHttpProxyAgent | null = null
const dispatcher = () => (agent ??= new EnvHttpProxyAgent())

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function createHttpProvider(opts: HttpProviderOptions): EmbeddingProvider {
  const timeoutMs = opts.timeoutMs ?? HTTP_TIMEOUT_MS
  const retries = opts.retries ?? HTTP_RETRIES
  const backoffMs = opts.backoffMs ?? HTTP_BACKOFF_MS
  let ready = false

  async function once(method: 'GET' | 'POST', body: unknown): Promise<unknown> {
    let res
    try {
      res = await fetch(opts.url, {
        method,
        dispatcher: dispatcher(),
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      throw new EmbeddingHttpError(
        name === 'TimeoutError' || name === 'AbortError'
          ? `model sunucusu ${timeoutMs} ms içinde yanıt vermedi`
          : 'model sunucusuna bağlanılamadı',
        true,
      )
    }
    const text = await res.text()
    if (res.status === 429 || res.status >= 500)
      throw new EmbeddingHttpError(`model sunucusu HTTP ${res.status} döndü`, true)
    if (res.status !== 200) throw new EmbeddingHttpError(`model sunucusu HTTP ${res.status} döndü`, false)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new EmbeddingHttpError('model sunucusunun yanıtı JSON değil', false)
    }
  }

  async function call(method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)))
      try {
        return await once(method, body)
      } catch (e) {
        lastError = e
        if (!(e instanceof EmbeddingHttpError) || !e.retryable) throw e
      }
    }
    throw lastError
  }

  const provider: EmbeddingProvider = {
    id: 'http',
    version: 'http:bilinmiyor',
    dims: 0,
    modalities: (inputs: EmbeddingInput[]): EmbeddingModality[] => inputModalities(inputs),
    async init() {
      const info = await call('GET')
      const model = isObj(info) ? info.model : null
      if (!isObj(info) || info.protocol !== EMBEDDING_PROTOCOL || !isObj(model))
        throw new EmbeddingHttpError(`model bilgisi geçersiz (beklenen protokol ${EMBEDDING_PROTOCOL})`, false)
      const dims = model.dims
      if (typeof dims !== 'number' || !Number.isInteger(dims) || dims < 2 || dims > MAX_DIMS)
        throw new EmbeddingHttpError('model bilgisinde boyut (dims) geçersiz', false)
      if (typeof model.id !== 'string' || typeof model.version !== 'string' || !model.id || !model.version)
        throw new EmbeddingHttpError('model bilgisinde id/version eksik', false)
      provider.dims = dims
      provider.version = `http:${model.id}@${model.version}`
      ready = true
    },
    async embed(input: EmbeddingInput): Promise<EmbeddingOutput> {
      if (!ready) await provider.init()
      const res = await call('POST', { protocol: EMBEDDING_PROTOCOL, input })
      const dims = provider.dims
      if (!isObj(res)) throw new EmbeddingHttpError('yanıt nesne değil', false)
      if (res.videoId !== input.videoId) throw new EmbeddingHttpError('yanıttaki videoId istekle uyuşmuyor', false)
      const rows = res.shots
      const pooled = res.pooled
      if (!Array.isArray(rows) || !Array.isArray(pooled)) throw new EmbeddingHttpError('shots/pooled dizi değil', false)
      if (rows.length !== input.shots.length)
        throw new EmbeddingHttpError(`çekim vektörü sayısı ${rows.length}, beklenen ${input.shots.length}`, false)
      const shots = new Float32Array(rows.length * dims)
      rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== dims)
          throw new EmbeddingHttpError(
            `çekim ${i} vektörünün boyutu ${Array.isArray(r) ? r.length : '?'}, beklenen ${dims}`,
            false,
          )
        r.forEach((x, d) => {
          if (typeof x !== 'number' || !Number.isFinite(x))
            throw new EmbeddingHttpError(`çekim ${i} vektöründe sayı olmayan değer`, false)
          shots[i * dims + d] = x
        })
      })
      if (pooled.length !== dims || !pooled.every((x) => typeof x === 'number' && Number.isFinite(x)))
        throw new EmbeddingHttpError('havuz vektörü geçersiz', false)
      const out: EmbeddingOutput = {
        dims,
        shots: normalizeRows(shots, dims),
        pooled: normalizeRows(Float32Array.from(pooled as number[]), dims),
      }
      const problem = checkOutput(out, input, dims)
      if (problem) throw new EmbeddingHttpError(problem, false)
      return out
    },
  }
  return provider
}
