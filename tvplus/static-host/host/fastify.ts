/**
 * Fastify uyumlu küçük ev sahibi (tarayıcıda `fastify` yerine takma adla yüklenir).
 *
 * Neden gerçek Fastify değil: Fastify; `http.ServerResponse`'tan türeyen light-my-request, pino, avvio, diagnostics_channel
 * gibi Node'a sıkı bağlı parçalar ister ve tarayıcıda bunların hepsini taklit etmek, sunucu kodunun kullandığı küçük
 * yüzeyi (≈ 15 örnek, 15 yanıt, 12 istek üyesi) yazmaktan daha büyük ve kırılgan olurdu. Burada aynı yaşam döngüsü
 * kurulur: onRequest → (yol düzeyi onRequest) → gövde ayrıştırma → preValidation → preHandler → işleyici → onSend →
 * yanıt → onResponse; hata işleyici, 404 işleyici, HEAD için GET yolu, statik > parametre öncelikli yönlendirme,
 * çerezler (@fastify/cookie), form gövdesi (@fastify/formbody), akış (SSE) için `reply.raw` ve `reply.hijack()`.
 */
import { EventEmitter } from '../node/events'
import { Buffer } from '../node/buffer'
import { Readable } from '../node/stream'

/* ───────────── dış sözleşme (worker ↔ ev sahibi) ───────────── */

export interface HostRequestInit {
  method: string
  /** Yol + sorgu (ör. `/api/boot?vd=tv`) */
  url: string
  /** Küçük harfli başlıklar */
  headers: Record<string, string>
  body: Uint8Array | null
  protocol: 'http' | 'https'
}

export interface HostResponseSink {
  head(status: number, headers: [string, string][]): void
  data(chunk: Uint8Array): void
  end(): void
}

export interface HostExchange {
  /** İstemci bağlantıyı kapattı (EventSource kapandı, istek iptal edildi). */
  abort(): void
}

/* ───────────── günlük ───────────── */

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
const LEVELS: Record<LogLevel | 'silent', number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 100,
}

export type LogSink = (level: LogLevel, msg: string, detail: unknown) => void
let logSink: LogSink = (level, msg, detail) => {
  const fn = level === 'error' || level === 'fatal' ? console.error : level === 'warn' ? console.warn : console.debug
  if (detail === undefined) fn(`[TV+ arka uç] ${msg}`)
  else fn(`[TV+ arka uç] ${msg}`, detail)
}
/** Günlük satırlarının nereye gideceğini belirler (worker sayfalara iletir). */
export function setLogSink(fn: LogSink): void {
  logSink = fn
}

export interface Logger {
  level: string
  fatal(...args: unknown[]): void
  error(...args: unknown[]): void
  warn(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  trace(...args: unknown[]): void
  child(bindings?: Record<string, unknown>): Logger
  silent(...args: unknown[]): void
}

function createLogger(level: LogLevel | 'silent'): Logger {
  const min = LEVELS[level]
  const at =
    (l: LogLevel) =>
    (...args: unknown[]): void => {
      if (LEVELS[l] < min) return
      let msg = ''
      let detail: unknown
      const [a, b] = args
      if (typeof a === 'string') msg = a
      else {
        detail = a
        msg = typeof b === 'string' ? b : ''
        const err = (a as { err?: unknown } | null)?.err
        if (err instanceof Error) detail = err
      }
      logSink(l, msg, detail)
    }
  const log: Logger = {
    level,
    fatal: at('fatal'),
    error: at('error'),
    warn: at('warn'),
    info: at('info'),
    debug: at('debug'),
    trace: at('trace'),
    silent: () => {},
    child: () => log,
  }
  return log
}

/* ───────────── Fastify hata nesneleri ───────────── */

interface FstError extends Error {
  code: string
  statusCode: number
}

function fstError(code: string, statusCode: number, message: string): FstError {
  const e = new Error(message) as FstError
  e.code = code
  e.statusCode = statusCode
  e.name = 'FastifyError'
  return e
}

/* ───────────── türler ───────────── */

type AnyFn = (...args: never[]) => unknown
type HookFn = (...args: unknown[]) => unknown
type Handler = (req: HostRequest, reply: HostReply) => unknown
type ParserDone = (err: Error | null, body?: unknown) => void
type ParserFn = (req: HostRequest, payload: unknown, done: ParserDone) => unknown

interface Parser {
  match: string | RegExp
  parseAs: 'string' | 'buffer' | 'stream'
  fn: ParserFn
}

interface RouteOptions {
  bodyLimit?: number
  onRequest?: HookFn | HookFn[]
  preValidation?: HookFn | HookFn[]
  preHandler?: HookFn | HookFn[]
  onSend?: HookFn | HookFn[]
  config?: unknown
  schema?: unknown
}

interface Route {
  method: string
  url: string
  segments: string[]
  handler: Handler
  opts: RouteOptions
  /** Yolun kaydedildiği bağlam (ayrıştırıcılar sonradan eklense de görülür) */
  ctx: Ctx
}

type HookName =
  | 'onRequest'
  | 'preParsing'
  | 'preValidation'
  | 'preHandler'
  | 'preSerialization'
  | 'onSend'
  | 'onResponse'
  | 'onError'
  | 'onTimeout'
  | 'onReady'
  | 'onListen'
  | 'preClose'
  | 'onClose'
  | 'onRoute'
  | 'onRegister'
  | 'onRequestAbort'

interface Core {
  routes: Route[]
  hooks: Map<HookName, HookFn[]>
  requestDecorations: Map<string, unknown>
  replyDecorations: Map<string, unknown>
  errorHandler: ((err: Error, req: HostRequest, reply: HostReply) => unknown) | null
  notFoundHandler: Handler | null
  bodyLimit: number
  log: Logger
  readyPromise: Promise<void> | null
  closed: boolean
  reqSeq: number
}

/* ───────────── çerezler ───────────── */

export interface CookieOptions {
  path?: string
  domain?: string
  httpOnly?: boolean
  secure?: boolean | 'auto'
  sameSite?: boolean | 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None'
  maxAge?: number
  expires?: Date
  encode?: (v: string) => string
  priority?: string
  partitioned?: boolean
  signed?: boolean
}

export function serializeCookie(name: string, value: string, o: CookieOptions = {}): string {
  const enc = o.encode ?? encodeURIComponent
  let s = `${name}=${enc(value)}`
  if (o.maxAge !== undefined && o.maxAge !== null) s += `; Max-Age=${Math.floor(o.maxAge)}`
  if (o.domain) s += `; Domain=${o.domain}`
  if (o.path) s += `; Path=${o.path}`
  if (o.expires) s += `; Expires=${o.expires.toUTCString()}`
  if (o.httpOnly) s += '; HttpOnly'
  if (o.secure === true) s += '; Secure'
  if (o.partitioned) s += '; Partitioned'
  if (o.sameSite) {
    const v = o.sameSite === true ? 'Strict' : String(o.sameSite)
    s += `; SameSite=${v.charAt(0).toUpperCase()}${v.slice(1).toLowerCase()}`
  }
  return s
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (!k || k in out) continue
    let v = part.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    try {
      out[k] = decodeURIComponent(v)
    } catch {
      out[k] = v
    }
  }
  return out
}

/* ───────────── sorgu ───────────── */

function parseQuery(search: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = Object.create(null) as Record<string, string | string[]>
  if (!search) return out
  for (const [k, v] of new URLSearchParams(search)) {
    const prev = out[k]
    if (prev === undefined) out[k] = v
    else if (Array.isArray(prev)) prev.push(v)
    else out[k] = [prev, v]
  }
  return out
}

/* ───────────── ham yanıt (reply.raw) ───────────── */

/** `http.ServerResponse`'un sunucu kodunca kullanılan kısmı: SSE için writeHead/write/end ve 'close' olayı. */
export class RawResponse extends EventEmitter {
  statusCode = 200
  statusMessage = ''
  headersSent = false
  writableEnded = false
  finished = false
  destroyed = false
  #headers = new Map<string, string | string[]>()
  #sink: HostResponseSink

  constructor(sink: HostResponseSink) {
    super()
    this.#sink = sink
  }

  setHeader(name: string, value: string | number | string[]): this {
    this.#headers.set(name.toLowerCase(), Array.isArray(value) ? value : String(value))
    return this
  }
  getHeader(name: string): string | string[] | undefined {
    return this.#headers.get(name.toLowerCase())
  }
  getHeaders(): Record<string, string | string[]> {
    return Object.fromEntries(this.#headers)
  }
  hasHeader(name: string): boolean {
    return this.#headers.has(name.toLowerCase())
  }
  removeHeader(name: string): void {
    this.#headers.delete(name.toLowerCase())
  }

  writeHead(status: number, a?: unknown, b?: unknown): this {
    if (this.headersSent) return this
    this.statusCode = status
    const headers = (typeof a === 'object' && a !== null ? a : b) as Record<string, unknown> | undefined
    if (headers) for (const [k, v] of Object.entries(headers)) if (v !== undefined) this.setHeader(k, v as string)
    this.flushHeaders()
    return this
  }

  flushHeaders(): void {
    if (this.headersSent) return
    this.headersSent = true
    const list: [string, string][] = []
    for (const [k, v] of this.#headers) {
      if (Array.isArray(v)) for (const x of v) list.push([k, x])
      else list.push([k, v])
    }
    this.#sink.head(this.statusCode, list)
  }

  write(chunk: unknown, enc?: unknown, cb?: unknown): boolean {
    if (this.writableEnded || this.destroyed) return false
    this.flushHeaders()
    const bytes = toBytes(chunk, typeof enc === 'string' ? enc : undefined)
    if (bytes.length) this.#sink.data(bytes)
    const done = typeof enc === 'function' ? enc : cb
    if (typeof done === 'function') queueMicrotask(() => (done as () => void)())
    return true
  }

  end(chunk?: unknown, enc?: unknown, cb?: unknown): this {
    if (this.writableEnded) return this
    if (typeof chunk === 'function') {
      cb = chunk
      chunk = undefined
    }
    if (chunk !== undefined && chunk !== null && !this.destroyed) this.write(chunk, enc)
    this.flushHeaders()
    this.writableEnded = true
    this.finished = true
    if (!this.destroyed) this.#sink.end()
    const done = typeof enc === 'function' ? enc : cb
    if (typeof done === 'function') queueMicrotask(() => (done as () => void)())
    queueMicrotask(() => {
      this.emit('finish')
      this.emit('close')
    })
    return this
  }

  /** İstemci bağlantıyı kapattı. */
  destroy(): this {
    if (this.destroyed) return this
    this.destroyed = true
    queueMicrotask(() => this.emit('close'))
    return this
  }
}

const encoder = new TextEncoder()
function toBytes(chunk: unknown, enc?: string): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (typeof chunk === 'string')
    return enc && enc !== 'utf8' && enc !== 'utf-8' ? Buffer.from(chunk, enc as 'base64') : encoder.encode(chunk)
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  return encoder.encode(String(chunk))
}

const isStream = (p: unknown): p is AsyncIterable<unknown> =>
  typeof p === 'object' &&
  p !== null &&
  !(p instanceof Uint8Array) &&
  (p instanceof Readable || typeof (p as { pipe?: unknown }).pipe === 'function') &&
  typeof (p as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'

/* ───────────── istek ───────────── */

export class HostRequest {
  id: string
  method: string
  url: string
  originalUrl: string
  headers: Record<string, string>
  query: Record<string, string | string[]>
  params: Record<string, string> = {}
  body: unknown = undefined
  cookies: Record<string, string>
  ip = '127.0.0.1'
  ips: string[] = ['127.0.0.1']
  protocol: 'http' | 'https'
  host: string
  hostname: string
  port: number | null
  socket: { remoteAddress: string; remotePort: number; encrypted: boolean }
  raw: { url: string; method: string; headers: Record<string, string>; on: () => void }
  log: Logger
  server: FastifyHost
  routeOptions: { url: string | undefined; method: string; config: unknown; bodyLimit: number }
  /** İstemcinin kapattığı istek */
  aborted = false

  constructor(init: HostRequestInit, server: FastifyHost, seq: number) {
    this.id = `req-${seq.toString(36)}`
    this.method = init.method.toUpperCase()
    this.url = init.url
    this.originalUrl = init.url
    this.headers = init.headers
    const q = init.url.indexOf('?')
    this.query = parseQuery(q >= 0 ? init.url.slice(q + 1) : '')
    this.cookies = parseCookieHeader(init.headers.cookie)
    this.protocol = init.protocol
    this.host = init.headers.host ?? 'localhost'
    const m = /^(.*?)(?::(\d+))?$/.exec(this.host)
    this.hostname = m?.[1] ?? this.host
    this.port = m?.[2] ? Number(m[2]) : null
    this.socket = { remoteAddress: this.ip, remotePort: 0, encrypted: init.protocol === 'https' }
    this.raw = { url: init.url, method: this.method, headers: init.headers, on: () => {} }
    this.log = server.log
    this.server = server
    this.routeOptions = { url: undefined, method: this.method, config: {}, bodyLimit: 0 }
  }
}

/* ───────────── yanıt ───────────── */

export class HostReply {
  request: HostRequest
  server: FastifyHost
  log: Logger
  statusCode = 200
  sent = false
  hijacked = false
  /** Yanıt tamamen gönderilince çözülür. */
  done: Promise<void>
  #resolveDone!: () => void
  #headers = new Map<string, string | string[]>()
  #raw: RawResponse
  #run: Exchange

  constructor(req: HostRequest, run: Exchange, raw: RawResponse) {
    this.request = req
    this.server = req.server
    this.log = req.log
    this.#run = run
    this.#raw = raw
    this.done = new Promise((r) => (this.#resolveDone = r))
  }

  get raw(): RawResponse {
    return this.#raw
  }

  code(status: number): this {
    this.statusCode = status
    return this
  }
  status(status: number): this {
    return this.code(status)
  }

  header(name: string, value: unknown): this {
    const k = name.toLowerCase()
    if (value === undefined) return this
    if (k === 'set-cookie') {
      const prev = this.#headers.get(k)
      const add = Array.isArray(value) ? value.map(String) : [String(value)]
      this.#headers.set(k, prev === undefined ? add : [...(Array.isArray(prev) ? prev : [prev]), ...add])
    } else this.#headers.set(k, Array.isArray(value) ? value.map(String) : String(value))
    return this
  }
  headers(values: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(values)) this.header(k, v)
    return this
  }
  getHeader(name: string): string | string[] | undefined {
    return this.#headers.get(name.toLowerCase())
  }
  getHeaders(): Record<string, string | string[]> {
    return Object.fromEntries(this.#headers)
  }
  hasHeader(name: string): boolean {
    return this.#headers.has(name.toLowerCase())
  }
  removeHeader(name: string): this {
    this.#headers.delete(name.toLowerCase())
    return this
  }
  type(contentType: string): this {
    return this.header('content-type', contentType)
  }

  setCookie(name: string, value: string, opts: CookieOptions = {}): this {
    return this.header('set-cookie', serializeCookie(name, value, opts))
  }
  cookie(name: string, value: string, opts: CookieOptions = {}): this {
    return this.setCookie(name, value, opts)
  }
  clearCookie(name: string, opts: CookieOptions = {}): this {
    const { maxAge: _m, expires: _e, ...rest } = opts
    void _m
    void _e
    return this.setCookie(name, '', { path: '/', ...rest, expires: new Date(1), maxAge: 0 })
  }

  redirect(url: string, code?: number): this {
    this.header('location', url)
    this.code(code ?? 302)
    this.send()
    return this
  }

  hijack(): this {
    this.hijacked = true
    this.sent = true
    this.#markDone()
    return this
  }

  /** Yanıtı yollar. Fastify'daki gibi zincirlenebilir; asıl yazım arka planda sürer. */
  send(payload?: unknown): this {
    if (this.hijacked) return this
    if (this.sent) {
      this.log.warn(`Yanıt zaten gönderilmiş: ${this.request.method} ${this.request.url}`)
      return this
    }
    if (payload instanceof Error) {
      void this.#run.handleError(payload)
      return this
    }
    this.sent = true
    void this.#write(payload).finally(() => this.#markDone())
    return this
  }

  #markDone(): void {
    this.#resolveDone()
  }

  async #write(payload: unknown): Promise<void> {
    const ct = this.getHeader('content-type')
    let body: string | Uint8Array | AsyncIterable<unknown> | null = null
    if (payload === undefined || payload === null) body = null
    else if (typeof payload === 'string') {
      if (ct === undefined) this.type('text/plain; charset=utf-8')
      body = payload
    } else if (payload instanceof Uint8Array || payload instanceof ArrayBuffer) {
      if (ct === undefined) this.type('application/octet-stream')
      body = payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload
    } else if (isStream(payload)) {
      if (ct === undefined) this.type('application/octet-stream')
      body = payload
    } else {
      if (ct === undefined) this.type('application/json; charset=utf-8')
      body = JSON.stringify(payload)
    }

    try {
      body = (await this.#run.runOnSend(this, body)) as typeof body
    } catch (err) {
      this.log.error({ err }, 'onSend kancası hata verdi')
    }

    const raw = this.#raw
    const headless = this.request.method === 'HEAD' || this.statusCode === 204 || this.statusCode === 304
    if (body !== null && !isStream(body) && !this.hasHeader('content-length')) {
      const len = typeof body === 'string' ? encoder.encode(body).length : (body as Uint8Array).length
      if (this.statusCode !== 204 && this.statusCode !== 304) this.header('content-length', String(len))
    }
    for (const [k, v] of this.#headers) raw.setHeader(k, v)
    raw.statusCode = this.statusCode
    if (headless || body === null) {
      if (this.statusCode !== 204 && this.statusCode !== 304 && body === null && !this.hasHeader('content-length'))
        raw.setHeader('content-length', '0')
      raw.end()
      return
    }
    if (isStream(body)) {
      raw.flushHeaders()
      try {
        for await (const chunk of body) {
          if (raw.destroyed) break
          raw.write(chunk)
        }
      } catch (err) {
        this.log.warn({ err }, 'akış yanıtı yarıda kesildi')
      }
      raw.end()
      return
    }
    raw.end(body)
  }
}

/* ───────────── istek yürütücü ───────────── */

class Exchange {
  core: Core
  host: FastifyHost
  req: HostRequest
  reply: HostReply
  raw: RawResponse
  route: Route | null
  bodyBytes: Uint8Array | null

  constructor(host: FastifyHost, init: HostRequestInit, sink: HostResponseSink) {
    this.host = host
    this.core = host._core
    this.req = new HostRequest(init, host, ++this.core.reqSeq)
    for (const [k, v] of this.core.requestDecorations)
      (this.req as unknown as Record<string, unknown>)[k] = typeof v === 'function' ? v.bind(this.req) : v
    this.raw = new RawResponse(sink)
    this.reply = new HostReply(this.req, this, this.raw)
    for (const [k, v] of this.core.replyDecorations)
      (this.reply as unknown as Record<string, unknown>)[k] = typeof v === 'function' ? v.bind(this.reply) : v
    this.bodyBytes = init.body
    const match = this.host._match(this.req.method, this.req.url)
    this.route = match?.route ?? null
    if (match) {
      this.req.params = match.params
      this.req.routeOptions = {
        url: match.route.url,
        method: match.route.method,
        config: match.route.opts.config ?? {},
        bodyLimit: match.route.opts.bodyLimit ?? this.core.bodyLimit,
      }
    }
  }

  /** Kanca dizisini sırayla çalıştırır; yanıt gönderilirse ya da devralınırsa durur. */
  async runHooks(list: HookFn[]): Promise<boolean> {
    for (const fn of list) {
      await callHook(fn, [this.req, this.reply])
      if (this.reply.sent || this.reply.hijacked) return false
    }
    return true
  }

  async runOnSend(reply: HostReply, payload: unknown): Promise<unknown> {
    let p = payload
    const list = [...(this.core.hooks.get('onSend') ?? []), ...asList(this.route?.opts.onSend)]
    for (const fn of list) {
      const r = await callHook(fn, [this.req, reply, p], true)
      if (r !== undefined) p = r
    }
    return p
  }

  async handleError(err: unknown): Promise<void> {
    const error = err instanceof Error ? err : new Error(String(err))
    if (this.reply.hijacked) {
      this.req.log.error({ err: error }, 'devralınmış yanıtta hata')
      return
    }
    if (this.reply.sent) {
      this.req.log.error({ err: error }, 'yanıt gönderildikten sonra hata')
      return
    }
    for (const fn of this.core.hooks.get('onError') ?? []) {
      try {
        await callHook(fn, [this.req, this.reply, error])
      } catch {
        /* yok say */
      }
    }
    const handler = this.core.errorHandler
    if (!handler) {
      const status = (error as Partial<FstError>).statusCode ?? 500
      this.reply.code(status >= 400 ? status : 500).send({
        statusCode: status,
        code: (error as Partial<FstError>).code,
        error: 'Error',
        message: error.message,
      })
      return
    }
    try {
      const r = await handler.call(this.host, error, this.req, this.reply)
      if (!this.reply.sent && r !== undefined && r !== this.reply) this.reply.send(r)
    } catch (e) {
      this.req.log.error({ err: e }, 'hata işleyicisi hata verdi')
      if (!this.reply.sent)
        this.reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Beklenmeyen hata' })
    }
  }

  async parseBody(): Promise<void> {
    const m = this.req.method
    if (m === 'GET' || m === 'HEAD') return
    const bytes = this.bodyBytes
    const ctHeader = this.req.headers['content-type']
    const hasBody = (bytes !== null && bytes.length > 0) || this.req.headers['transfer-encoding'] !== undefined
    if (!hasBody && ctHeader === undefined) return
    const limit = this.route?.opts.bodyLimit ?? this.core.bodyLimit
    if (bytes && bytes.length > limit) throw fstError('FST_ERR_CTP_BODY_TOO_LARGE', 413, 'Request body is too large')
    const parsers = (this.route?.ctx ?? this.host._ctx).parsers
    const media = (ctHeader ?? '').split(';')[0]!.trim().toLowerCase()
    const parser =
      parsers.find((p) => (typeof p.match === 'string' ? p.match === media : p.match.test(media))) ??
      parsers.find((p) => p.match === '*')
    if (!parser) throw fstError('FST_ERR_CTP_INVALID_MEDIA_TYPE', 415, `Unsupported Media Type: ${media}`)
    const data = bytes ?? new Uint8Array(0)
    const payload =
      parser.parseAs === 'string'
        ? new TextDecoder().decode(data)
        : parser.parseAs === 'buffer'
          ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
          : Readable.from(data.length ? [Buffer.from(data.buffer, data.byteOffset, data.byteLength)] : [])
    this.req.body = await new Promise<unknown>((resolve, reject) => {
      let settled = false
      const done: ParserDone = (err, body) => {
        if (settled) return
        settled = true
        if (err) reject(err)
        else resolve(body)
      }
      try {
        const r = parser.fn.call(this.host, this.req, payload, done)
        if (r && typeof (r as Promise<unknown>).then === 'function')
          (r as Promise<unknown>).then(
            (body) => done(null, body),
            (err: unknown) => done(err instanceof Error ? err : new Error(String(err))),
          )
      } catch (err) {
        done(err as Error)
      }
    })
  }

  async run(): Promise<void> {
    try {
      if (!(await this.runHooks(this.core.hooks.get('onRequest') ?? []))) return
      if (this.route && !(await this.runHooks(asList(this.route.opts.onRequest)))) return
      if (!(await this.runHooks(this.core.hooks.get('preParsing') ?? []))) return
      await this.parseBody()
      if (!(await this.runHooks(this.core.hooks.get('preValidation') ?? []))) return
      if (this.route && !(await this.runHooks(asList(this.route.opts.preValidation)))) return
      if (!(await this.runHooks(this.core.hooks.get('preHandler') ?? []))) return
      if (this.route && !(await this.runHooks(asList(this.route.opts.preHandler)))) return

      const handler = this.route?.handler ?? this.core.notFoundHandler ?? defaultNotFound
      const result = await handler.call(this.host, this.req, this.reply)
      if (this.reply.hijacked) return
      if (result !== undefined && result !== this.reply && !this.reply.sent) this.reply.send(result)
      else if (result === undefined && !this.reply.sent && this.route === null) this.reply.code(404).send()
    } catch (err) {
      await this.handleError(err)
    }
  }
}

const defaultNotFound: Handler = (req, reply) =>
  reply.code(404).send({ message: `Route ${req.method}:${req.url} not found`, error: 'Not Found', statusCode: 404 })

const asList = (v: HookFn | HookFn[] | undefined): HookFn[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** Kancayı çağırır: eşzamansız (söz döndüren) ya da `done` geri çağırmalı biçim. */
function callHook(fn: HookFn, args: unknown[], withPayload = false): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (err?: Error | null, value?: unknown) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(value)
    }
    try {
      const expectsDone = fn.length > args.length
      const r = fn(...args, done)
      if (r && typeof (r as Promise<unknown>).then === 'function') {
        ;(r as Promise<unknown>).then(
          (v) => done(null, v),
          (e: unknown) => done(e instanceof Error ? e : new Error(String(e))),
        )
      } else if (!expectsDone) done(null, withPayload ? r : undefined)
    } catch (err) {
      done(err as Error)
    }
  })
}

/* ───────────── yönlendirici ───────────── */

const splitPath = (path: string): string[] => path.split('/').filter((s, i) => i > 0 || s !== '')

function segmentsOf(url: string): string[] {
  const s = splitPath(url)
  return s.length && s[0] === '' ? s.slice(1) : s
}

/** Yol eşleme puanı: her bölümde statik > parametre > joker. */
function matchRoute(route: Route, parts: string[]): { params: Record<string, string>; score: number[] } | null {
  const params: Record<string, string> = {}
  const score: number[] = []
  const segs = route.segments
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    if (seg === '*') {
      params['*'] = parts.slice(i).map(safeDecode).join('/')
      score.push(0)
      return { params, score }
    }
    const part = parts[i]
    if (part === undefined) return null
    if (seg.startsWith(':')) {
      if (part === '') return null
      params[seg.slice(1)] = safeDecode(part)
      score.push(1)
    } else if (seg === part) score.push(2)
    else return null
  }
  return parts.length === segs.length ? { params, score } : null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const better = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1
    const y = b[i] ?? -1
    if (x !== y) return x > y
  }
  return false
}

/* ───────────── örnek ───────────── */

interface Ctx {
  parsers: Parser[]
}

export class FastifyHost {
  /** Paylaşılan çekirdek (alt bağlamlar prototipten devralır). */
  _core: Core
  /** Bağlama özgü ayarlar (içerik türü ayrıştırıcıları); `register` alt bağlamı kopyasını alır. */
  _ctx: Ctx;
  [key: string]: unknown

  constructor(opts: { logger?: boolean | { level?: string }; bodyLimit?: number } = {}) {
    const level =
      opts.logger === false || opts.logger === undefined
        ? 'silent'
        : opts.logger === true
          ? 'info'
          : (opts.logger.level ?? 'info')
    this._core = {
      routes: [],
      hooks: new Map(),
      requestDecorations: new Map(),
      replyDecorations: new Map(),
      errorHandler: null,
      notFoundHandler: null,
      bodyLimit: opts.bodyLimit ?? 1024 * 1024,
      log: createLogger(level as LogLevel | 'silent'),
      readyPromise: null,
      closed: false,
      reqSeq: 0,
    }
    this._ctx = { parsers: defaultParsers() }
  }

  get log(): Logger {
    return this._core.log
  }

  get prefix(): string {
    return ''
  }

  decorate(name: string, value: unknown): this {
    ;(this as Record<string, unknown>)[name] = value
    return this
  }
  hasDecorator(name: string): boolean {
    return name in this
  }
  decorateRequest(name: string, value: unknown): this {
    this._core.requestDecorations.set(name, value)
    return this
  }
  hasRequestDecorator(name: string): boolean {
    return this._core.requestDecorations.has(name)
  }
  decorateReply(name: string, value: unknown): this {
    this._core.replyDecorations.set(name, value)
    return this
  }
  hasReplyDecorator(name: string): boolean {
    return this._core.replyDecorations.has(name)
  }

  addHook(name: HookName, fn: AnyFn): this {
    const list = this._core.hooks.get(name)
    if (list) list.push(fn as HookFn)
    else this._core.hooks.set(name, [fn as HookFn])
    return this
  }

  /** Eklenti kaydı: alt bağlam ayrıştırıcıların kopyasını alır; yollar, kancalar ve süslemeler paylaşılır. */
  async register(plugin: AnyFn | { default: AnyFn }, opts: Record<string, unknown> = {}): Promise<void> {
    const fn = (typeof plugin === 'function' ? plugin : plugin.default) as (
      instance: FastifyHost,
      opts: Record<string, unknown>,
      done?: (err?: Error) => void,
    ) => unknown
    // fastify-plugin ile sarılmış eklentiler (skip-override) kapsüllenmez: doğrudan bu bağlama eklenir.
    const skip = (fn as unknown as Record<symbol, unknown>)[Symbol.for('skip-override')] === true
    const child = skip ? this : (Object.create(this) as FastifyHost)
    if (!skip) child._ctx = { parsers: [...this._ctx.parsers] }
    await new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => (err ? reject(err) : resolve())
      try {
        const r = fn(child, opts, done)
        if (r && typeof (r as Promise<unknown>).then === 'function')
          (r as Promise<unknown>).then(() => resolve(), reject)
        else if (fn.length < 3) resolve()
      } catch (err) {
        reject(err as Error)
      }
    })
  }

  after(): Promise<void> {
    return Promise.resolve()
  }

  route(opts: { method: string | string[]; url: string; handler: Handler } & RouteOptions): this {
    const methods = Array.isArray(opts.method) ? opts.method : [opts.method]
    for (const m of methods) this._add(m, opts.url, opts, opts.handler)
    return this
  }

  _add(method: string, url: string, opts: RouteOptions, handler: Handler): void {
    this._core.routes.push({
      method: method.toUpperCase(),
      url,
      segments: segmentsOf(url),
      handler,
      opts,
      ctx: this._ctx,
    })
  }

  _verb(method: string, url: string, a: unknown, b?: unknown): this {
    const handler = (typeof a === 'function' ? a : b) as Handler
    const opts = (typeof a === 'object' && a !== null ? a : {}) as RouteOptions & { handler?: Handler }
    this._add(method, url, opts, handler ?? opts.handler!)
    return this
  }

  get(url: string, a: unknown, b?: unknown): this {
    return this._verb('GET', url, a, b)
  }
  head(url: string, a: unknown, b?: unknown): this {
    return this._verb('HEAD', url, a, b)
  }
  post(url: string, a: unknown, b?: unknown): this {
    return this._verb('POST', url, a, b)
  }
  put(url: string, a: unknown, b?: unknown): this {
    return this._verb('PUT', url, a, b)
  }
  patch(url: string, a: unknown, b?: unknown): this {
    return this._verb('PATCH', url, a, b)
  }
  delete(url: string, a: unknown, b?: unknown): this {
    return this._verb('DELETE', url, a, b)
  }
  options(url: string, a: unknown, b?: unknown): this {
    return this._verb('OPTIONS', url, a, b)
  }
  all(url: string, a: unknown, b?: unknown): this {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) this._verb(m, url, a, b)
    return this
  }

  hasRoute(opts: { method: string; url: string }): boolean {
    return this._core.routes.some((r) => r.method === opts.method.toUpperCase() && r.url === opts.url)
  }

  printRoutes(): string {
    return this._core.routes.map((r) => `${r.method} ${r.url}`).join('\n')
  }

  /** İstek yöntemine ve yoluna uyan en özgül yol (HEAD için GET yedeği). */
  _match(method: string, url: string): { route: Route; params: Record<string, string> } | null {
    const path = url.split('?')[0] ?? '/'
    const parts = segmentsOf(path)
    const pick = (m: string) => {
      let best: { route: Route; params: Record<string, string>; score: number[] } | null = null
      for (const route of this._core.routes) {
        if (route.method !== m) continue
        const r = matchRoute(route, parts)
        if (r && (!best || better(r.score, best.score))) best = { route, ...r }
      }
      return best
    }
    return pick(method) ?? (method === 'HEAD' ? pick('GET') : null)
  }

  setErrorHandler(fn: (err: Error, req: HostRequest, reply: HostReply) => unknown): this {
    this._core.errorHandler = fn
    return this
  }
  setNotFoundHandler(a: unknown, b?: unknown): this {
    this._core.notFoundHandler = (typeof a === 'function' ? a : b) as Handler
    return this
  }

  addContentTypeParser(
    type: string | string[] | RegExp,
    a: ParserFn | { parseAs?: 'string' | 'buffer'; bodyLimit?: number },
    b?: ParserFn,
  ): this {
    const fn = (typeof a === 'function' ? a : b) as ParserFn
    const parseAs = typeof a === 'object' ? (a.parseAs ?? 'stream') : 'stream'
    const types = Array.isArray(type) ? type : [type]
    for (const t of types) {
      const match = typeof t === 'string' ? t.toLowerCase() : t
      this._ctx.parsers = this._ctx.parsers.filter((p) => String(p.match) !== String(match))
      this._ctx.parsers.unshift({ match, parseAs, fn })
    }
    return this
  }
  hasContentTypeParser(type: string): boolean {
    return this._ctx.parsers.some((p) => p.match === type.toLowerCase())
  }
  removeContentTypeParser(type: string | string[]): this {
    const types = (Array.isArray(type) ? type : [type]).map((t) => t.toLowerCase())
    this._ctx.parsers = this._ctx.parsers.filter((p) => !types.includes(String(p.match)))
    return this
  }
  removeAllContentTypeParsers(): this {
    this._ctx.parsers = []
    return this
  }

  /** onReady kancalarını bir kez çalıştırır. */
  ready(): Promise<void> {
    this._core.readyPromise ??= (async () => {
      for (const fn of this._core.hooks.get('onReady') ?? []) await callHook(fn, [])
    })()
    return this._core.readyPromise
  }

  async listen(): Promise<string> {
    await this.ready()
    return 'tarayici://tvplus'
  }

  async close(): Promise<void> {
    if (this._core.closed) return
    this._core.closed = true
    for (const name of ['preClose', 'onClose'] as const) {
      for (const fn of this._core.hooks.get(name) ?? []) {
        try {
          await callHook(fn, name === 'onClose' ? [this] : [])
        } catch (err) {
          this.log.warn({ err }, `${name} kancası hata verdi`)
        }
      }
    }
  }

  /** Worker'dan gelen isteği yürütür. Dönen nesneyle istemcinin bağlantıyı kapattığı bildirilir. */
  dispatch(init: HostRequestInit, sink: HostResponseSink): HostExchange {
    const ex = new Exchange(this, init, sink)
    const started = performance.now()
    void ex
      .run()
      .then(() => ex.reply.done)
      .then(async () => {
        const list = this._core.hooks.get('onResponse') ?? []
        if (!list.length) return
        await new Promise<void>((r) =>
          ex.raw.writableEnded || ex.raw.destroyed ? r() : ex.raw.once('close', () => r()),
        )
        for (const fn of list) await callHook(fn, [ex.req, ex.reply]).catch(() => {})
      })
      .catch((err: unknown) => this.log.error({ err }, `istek yürütülemedi (${performance.now() - started} ms)`))
    return {
      abort: () => {
        ex.req.aborted = true
        ex.raw.destroy()
      },
    }
  }

  /** Sınama kolaylığı: isteği yürütüp tüm yanıtı toplar (Fastify `inject` benzeri). */
  inject(opts: {
    method?: string
    url: string
    headers?: Record<string, string>
    payload?: unknown
  }): Promise<{ statusCode: number; headers: Record<string, string | string[]>; body: string; json: <T>() => T }> {
    return new Promise((resolve) => {
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v
      let body: Uint8Array | null = null
      if (opts.payload !== undefined) {
        if (typeof opts.payload === 'string') body = encoder.encode(opts.payload)
        else if (opts.payload instanceof Uint8Array) body = opts.payload
        else {
          body = encoder.encode(JSON.stringify(opts.payload))
          headers['content-type'] ??= 'application/json'
        }
        headers['content-length'] = String(body.length)
      }
      let status = 0
      const out: Record<string, string | string[]> = {}
      const chunks: Uint8Array[] = []
      this.dispatch(
        { method: opts.method ?? 'GET', url: opts.url, headers, body, protocol: 'http' },
        {
          head: (s, hs) => {
            status = s
            for (const [k, v] of hs) {
              const prev = out[k]
              out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
            }
          },
          data: (c) => chunks.push(c),
          end: () => {
            const text = new TextDecoder().decode(Buffer.concat(chunks))
            resolve({ statusCode: status, headers: out, body: text, json: <T>() => JSON.parse(text) as T })
          },
        },
      )
    })
  }
}

/* ───────────── varsayılan ayrıştırıcılar ───────────── */

function parseJsonSafe(text: string): unknown {
  if (text === '')
    throw fstError(
      'FST_ERR_CTP_EMPTY_JSON_BODY',
      400,
      "Body cannot be empty when content-type is set to 'application/json'",
    )
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    throw Object.assign(fstError('FST_ERR_CTP_INVALID_JSON_BODY', 400, (err as Error).message), {})
  }
  // secure-json-parse karşılığı: __proto__ / constructor.prototype taşıyan gövde reddedilir.
  if (/"(?:__proto__|constructor)"\s*:/.test(text)) {
    const bad = (v: unknown): boolean => {
      if (typeof v !== 'object' || v === null) return false
      if (Object.prototype.hasOwnProperty.call(v, '__proto__')) return true
      const c = (v as Record<string, unknown>).constructor
      if (
        Object.prototype.hasOwnProperty.call(v, 'constructor') &&
        typeof c === 'object' &&
        c !== null &&
        'prototype' in c
      )
        return true
      return Object.values(v).some(bad)
    }
    if (bad(value)) throw fstError('FST_ERR_CTP_INVALID_JSON_BODY', 400, 'Object contains forbidden prototype property')
  }
  return value
}

function defaultParsers(): Parser[] {
  return [
    {
      match: 'application/json',
      parseAs: 'string',
      fn: (_req, payload, done) => {
        try {
          done(null, parseJsonSafe(payload as string))
        } catch (err) {
          done(err as Error)
        }
      },
    },
    { match: 'text/plain', parseAs: 'string', fn: (_req, payload, done) => done(null, payload) },
  ]
}

/** Fastify fabrikası (`import Fastify from 'fastify'`). */
export default function Fastify(opts: { logger?: boolean | { level?: string }; bodyLimit?: number } = {}): FastifyHost {
  return new FastifyHost(opts)
}

export { Fastify as fastify }
