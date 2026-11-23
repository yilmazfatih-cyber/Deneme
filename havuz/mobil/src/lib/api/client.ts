/**
 * API istemcisi: `shared`daki adresler (API_PATHS) ve şemalarla tipli `fetch`. Telefon uygulaması API'ye her zaman
 * BELİRTEÇ kipinde bağlanır: giriş/kayıt isteğine `X-Auth-Mode: token`, sonraki isteklere `Authorization: Bearer`.
 * (Telefonda çerez kavanozu yok; belirteç expo-secure-store'da saklanır: lib/session/secureToken.ts.)
 *
 *  - Başarılı yanıt şemayla doğrulanır; uymazsa `AppError('internal')`.
 *  - Hata gövdesi `{ error: { code, message, details } }` → `AppError` (kod, Türkçe ileti, ayrıntı).
 *  - Sunucuya ulaşılamazsa (çevrimdışı, zaman aşımı, 502/503/504) → `NetworkError`.
 *
 * Genişletme (yeni uç): şemayı ve adresi uygulama/shared/src/api.ts'e ekleyin (sonra `npm run shared:sync`), çağrıyı
 * aşağıya `// YENİ UÇ BURAYA` üstüne bir yöntem olarak yazın. Yöntem adı uç adıyla aynıdır (API_PATHS.login → api.login).
 */
import {
  API_PATHS,
  AppError,
  authResponseSchema,
  errorBodySchema,
  healthResponseSchema,
  HEADERS,
  meResponseSchema,
  syncResponseSchema,
  type ErrorCode,
  type LoginRequest,
  type RegisterRequest,
  type SyncRequest,
} from '@uygulama/shared'
import type { z } from 'zod'
import { NetworkError } from '../errors.ts'

export interface ApiClientOptions {
  /** API kökü, sonunda `/` olmadan: `https://api.ornek.com`. */
  readonly baseUrl: string
  /** Geçerli oturum belirteci (yoksa `null`). */
  readonly getToken?: () => string | null
  /** İstemci adı ve sürümü (`X-Client` başlığı; sunucu günlüğünde sorun ayıklamaya yarar). */
  readonly clientName?: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface RequestOptions<S extends z.ZodType | undefined> {
  readonly body?: unknown
  readonly schema?: S
  readonly signal?: AbortSignal
  /** Giriş/kayıt uçlarında sunucudan gövdede belirteç iste. */
  readonly wantToken?: boolean
}

type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  426: 'upgrade_required',
  429: 'rate_limited',
}

/** Zaman aşımı + dışarıdan iptali tek bir sinyalde birleştirir (React Native'de AbortSignal.any/timeout yok). */
function linkedSignal(timeoutMs: number | null, outer: AbortSignal | undefined) {
  const controller = new AbortController()
  let timedOut = false
  const timer =
    timeoutMs === null
      ? null
      : setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
  const onAbort = () => controller.abort()
  if (outer?.aborted) controller.abort()
  else outer?.addEventListener('abort', onAbort)
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      if (timer !== null) clearTimeout(timer)
      outer?.removeEventListener('abort', onAbort)
    },
  }
}

export class ApiClient {
  readonly baseUrl: string
  private readonly getToken: () => string | null
  private readonly clientName: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.getToken = options.getToken ?? (() => null)
    this.clientName = options.clientName ?? 'mobil'
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  /** İsteğe eklenecek başlıklar. */
  headers(options: { json?: boolean; wantToken?: boolean; accept?: string } = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: options.accept ?? 'application/json',
      [HEADERS.client]: this.clientName,
    }
    if (options.json) headers['Content-Type'] = 'application/json'
    if (options.wantToken) headers[HEADERS.authMode] = 'token'
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  /**
   * Ham istek: ağ hatasını `NetworkError`'a çevirir; HTTP durumunu DEĞERLENDİRMEZ. `timeoutMs: null` uzun soluklu
   * akışlar içindir. Dönen `done` çağrılınca zaman aşımı sayacı temizlenir (gövde okunduktan sonra).
   */
  async raw(
    method: Method,
    path: string,
    init: {
      body?: unknown
      signal?: AbortSignal
      wantToken?: boolean
      timeoutMs?: number | null
      accept?: string
    } = {},
  ): Promise<{ response: Response; done: () => void }> {
    const linked = linkedSignal(init.timeoutMs === undefined ? this.timeoutMs : init.timeoutMs, init.signal)
    const json = init.body !== undefined
    try {
      const response = await this.fetchFn(this.url(path), {
        method,
        headers: this.headers({
          json,
          wantToken: init.wantToken === true,
          ...(init.accept ? { accept: init.accept } : {}),
        }),
        body: json ? JSON.stringify(init.body) : undefined,
        credentials: 'omit',
        signal: linked.signal,
      })
      return { response, done: linked.dispose }
    } catch (error) {
      linked.dispose()
      if (init.signal?.aborted) throw error // çağıran vazgeçti: olduğu gibi ilet
      throw new NetworkError(linked.timedOut() ? 'İstek zaman aşımına uğradı.' : 'Sunucuya ulaşılamadı.', {
        cause: error,
      })
    }
  }

  async request<S extends z.ZodType | undefined = undefined>(
    method: Method,
    path: string,
    options: RequestOptions<S> = {},
  ): Promise<Parsed<S>> {
    const { response, done } = await this.raw(method, path, options)
    try {
      if (!response.ok) throw await toError(response)
      if (!options.schema) return undefined as Parsed<S>
      const parsed = options.schema.safeParse(parseJson(response.status === 204 ? '' : await response.text()))
      if (!parsed.success) {
        console.error(`${method} ${path}: yanıt beklenen biçimde değil`, parsed.error.issues)
        throw new AppError('internal', 'Sunucu yanıtı beklenen biçimde değil. Uygulamayı güncelleyin.')
      }
      return parsed.data as Parsed<S>
    } catch (error) {
      if (error instanceof AppError || error instanceof NetworkError) throw error
      if (options.signal?.aborted) throw error
      throw new NetworkError('Sunucunun yanıtı yarıda kesildi.', { cause: error })
    } finally {
      done()
    }
  }

  // ── Sistem ve kimlik ─────────────────────────────────────────────────────────────────────────
  health = () => this.request('GET', API_PATHS.health, { schema: healthResponseSchema })
  register = (body: RegisterRequest) =>
    this.request('POST', API_PATHS.register, { body, schema: authResponseSchema, wantToken: true })
  login = (body: LoginRequest) =>
    this.request('POST', API_PATHS.login, { body, schema: authResponseSchema, wantToken: true })
  logout = () => this.request('POST', API_PATHS.logout)
  me = () => this.request('GET', API_PATHS.me, { schema: meResponseSchema })
  forgotPassword = (email: string) => this.request('POST', API_PATHS.forgotPassword, { body: { email } })
  deleteAccount = (password: string) => this.request('DELETE', API_PATHS.account, { body: { password } })

  // ── Eşitleme ─────────────────────────────────────────────────────────────────────────────────
  sync = (body: SyncRequest, signal?: AbortSignal) =>
    this.request('POST', API_PATHS.sync, { body, schema: syncResponseSchema, ...(signal ? { signal } : {}) })
  // YENİ UÇ BURAYA
}

/** Yanıt metnini JSON olarak okur; boş ya da bozuksa `null`. */
function parseJson(text: string): unknown {
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Hata yanıtını `AppError`'a (ağ geçidi hatalarını `NetworkError`'a) çevirir. */
export async function toError(response: Response): Promise<Error> {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return new NetworkError(`Sunucu şu an yanıt vermiyor (${response.status}).`)
  }
  const parsed = errorBodySchema.safeParse(parseJson(await response.text().catch(() => '')))
  if (parsed.success) {
    const { code, message, details } = parsed.data.error
    return new AppError(code, message, details)
  }
  return new AppError(STATUS_CODES[response.status] ?? 'internal')
}
