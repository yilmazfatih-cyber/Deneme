/**
 * Sayfa taşıması: aynı kökendeki API yollarına (`/api`, `/graphql`, `/push` …) giden `fetch`, `EventSource`,
 * `navigator.sendBeacon` ve `XMLHttpRequest` çağrılarını ağ yerine tarayıcıdaki arka uca yönlendirir. Öteki her istek
 * (durağan dosyalar, yazı tipleri, uzak kaynaklar) olduğu gibi ağa gider. Uygulama kodu değişmeden çalışır.
 *
 * Alt yolda (GitHub Pages: /Deneme/) da çalışır: uygulama API'yi kökten (`/api/boot`) çağırır; yönlendirme yolun ham
 * hâline bakar, taban yolun altındaki durağan dosyalar (`/Deneme/img/...`) API sayılmaz.
 */
import { isApiPath, type WireRequest } from '../shared/protocol'
import { randomId, verbose, type Backend } from './backend'

const NULL_BODY = new Set([101, 103, 204, 205, 304])

function apiTarget(input: string | URL): URL | null {
  let u: URL
  try {
    u = new URL(String(input), location.href)
  } catch {
    return null
  }
  return u.origin === location.origin && isApiPath(u.pathname) ? u : null
}

function wireBase(u: URL, method: string, headers: Headers, body: ArrayBuffer | null): Omit<WireRequest, 'id'> {
  const list: [string, string][] = []
  headers.forEach((v, k) => list.push([k, v]))
  if (!headers.has('user-agent')) list.push(['user-agent', navigator.userAgent])
  if (!headers.has('accept-language')) list.push(['accept-language', navigator.language])
  return {
    method: method.toUpperCase(),
    url: u.pathname + u.search,
    headers: list,
    body,
    protocol: location.protocol === 'https:' ? 'https' : 'http',
    host: location.host,
  }
}

const abortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError')

export interface Transport {
  client: string
  /** Bu pencerenin uçuştaki tüm isteklerini keser (sayfa kapanıyor). */
  closeAll(): void
}

export function installTransport(backend: Backend): Transport {
  const client = randomId()
  const open = new Set<{ abort(): void }>()

  const track = (h: { abort(): void }) => {
    open.add(h)
    return h
  }

  /* ───────────── fetch ───────────── */

  const nativeFetch = window.fetch.bind(window)

  const backendFetch = async (request: Request, target: URL): Promise<Response> => {
    const signal = request.signal
    if (signal.aborted) throw abortError()
    const method = request.method.toUpperCase()
    const body = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer()
    const wire = wireBase(target, method, request.headers, body && body.byteLength ? body : null)

    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | null = null
      let settled = false
      let finished = false
      const pending: Uint8Array[] = []
      let ended = false

      const onAbort = () => {
        handle.abort()
        open.delete(handle)
        if (!settled) {
          settled = true
          reject(abortError())
        } else if (!finished) {
          finished = true
          try {
            controller?.error(abortError())
          } catch {
            /* zaten kapalı */
          }
        }
      }

      const handle = track(
        backend.request(wire, client, {
          head(status, headers) {
            if (settled) return
            settled = true
            if (verbose) console.debug(`[TV+ api] ${method} ${wire.url} → ${status}`)
            const h = new Headers()
            for (const [k, v] of headers) {
              if (k === 'set-cookie') continue
              try {
                h.append(k, v)
              } catch {
                /* tarayıcının yasakladığı başlık */
              }
            }
            const nullBody = NULL_BODY.has(status) || method === 'HEAD'
            const stream = nullBody
              ? null
              : new ReadableStream<Uint8Array>({
                  start(c) {
                    controller = c
                    for (const p of pending.splice(0)) c.enqueue(p)
                    if (ended) {
                      finished = true
                      c.close()
                    }
                  },
                  cancel() {
                    finished = true
                    handle.abort()
                    open.delete(handle)
                  },
                })
            const res = new Response(stream, { status, statusText: '', headers: h })
            Object.defineProperty(res, 'url', { value: target.href })
            resolve(res)
          },
          data(chunk) {
            const bytes = new Uint8Array(chunk)
            if (controller) controller.enqueue(bytes)
            else pending.push(bytes)
          },
          end() {
            open.delete(handle)
            signal.removeEventListener('abort', onAbort)
            ended = true
            if (controller && !finished) {
              finished = true
              controller.close()
            }
          },
          fail(message) {
            open.delete(handle)
            signal.removeEventListener('abort', onAbort)
            if (!settled) {
              settled = true
              reject(new TypeError(`Failed to fetch (tarayıcı arka ucu: ${message.split('\n')[0]})`))
            } else if (controller && !finished) {
              finished = true
              controller.error(new TypeError(message))
            }
          },
        }),
      )
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  window.fetch = function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : input
    const target = apiTarget(url)
    if (!target) return nativeFetch(input, init)
    let request: Request
    try {
      request = new Request(input, init)
    } catch (err) {
      return Promise.reject(err)
    }
    return backendFetch(request, target)
  }

  /* ───────────── EventSource ───────────── */

  const NativeEventSource = window.EventSource

  class BackendEventSource extends EventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSED = 2
    readonly url: string
    readonly withCredentials: boolean
    readyState = 0
    onopen: ((this: EventSource, ev: Event) => unknown) | null = null
    onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null
    #target: URL
    #handle: { abort(): void } | null = null
    #retryMs = 2000
    #lastId = ''
    #timer: ReturnType<typeof setTimeout> | null = null

    constructor(url: string | URL, init?: EventSourceInit) {
      super()
      this.#target = apiTarget(url)!
      this.url = this.#target.href
      this.withCredentials = Boolean(init?.withCredentials)
      queueMicrotask(() => this.#connect())
    }

    #fire(ev: Event): void {
      const handler = ev.type === 'open' ? this.onopen : ev.type === 'error' ? this.onerror : ev.type === 'message' ? this.onmessage : null
      this.dispatchEvent(ev)
      if (handler) (handler as (ev: Event) => unknown).call(this as unknown as EventSource, ev)
    }

    #connect(): void {
      if (this.readyState === 2) return
      this.readyState = 0
      const headers = new Headers({ accept: 'text/event-stream', 'cache-control': 'no-store' })
      if (this.#lastId) headers.set('last-event-id', this.#lastId)
      const dec = new TextDecoder()
      let buf = ''
      let data: string[] = []
      let event = ''
      let ok = false
      const dispatchLine = (line: string) => {
        if (line === '') {
          if (data.length) {
            const ev = new MessageEvent(event || 'message', {
              data: data.join('\n'),
              lastEventId: this.#lastId,
              origin: location.origin,
            })
            if (this.readyState === 1) this.#fire(ev)
          }
          data = []
          event = ''
          return
        }
        if (line.startsWith(':')) return
        const i = line.indexOf(':')
        const field = i < 0 ? line : line.slice(0, i)
        let value = i < 0 ? '' : line.slice(i + 1)
        if (value.startsWith(' ')) value = value.slice(1)
        if (field === 'data') data.push(value)
        else if (field === 'event') event = value
        else if (field === 'id' && !value.includes('\0')) this.#lastId = value
        else if (field === 'retry' && /^\d+$/.test(value)) this.#retryMs = Number(value)
      }
      const h = track(
        backend.request(wireBase(this.#target, 'GET', headers, null), client, {
          head: (status, hs) => {
            const ct = hs.find(([k]) => k === 'content-type')?.[1] ?? ''
            if (status !== 200 || !ct.startsWith('text/event-stream')) {
              // Yanlış yanıt: kalıcı hata (tarayıcıların davranışı), yeniden bağlanılmaz.
              this.#handle?.abort()
              this.readyState = 2
              this.#fire(new Event('error'))
              return
            }
            ok = true
            this.readyState = 1
            this.#fire(new Event('open'))
          },
          data: (chunk) => {
            if (!ok) return
            buf += dec.decode(new Uint8Array(chunk), { stream: true })
            let nl: number
            while ((nl = buf.search(/\r\n|\r|\n/)) >= 0) {
              const line = buf.slice(0, nl)
              buf = buf.slice(nl + (buf[nl] === '\r' && buf[nl + 1] === '\n' ? 2 : 1))
              dispatchLine(line)
            }
          },
          end: () => this.#reconnect(h),
          fail: () => this.#reconnect(h),
        }),
      )
      this.#handle = h
    }

    #reconnect(h: { abort(): void }): void {
      open.delete(h)
      if (this.#handle !== h || this.readyState === 2) return
      this.#handle = null
      this.readyState = 0
      this.#fire(new Event('error'))
      if (this.readyState === 2) return
      this.#timer = setTimeout(() => this.#connect(), this.#retryMs)
    }

    close(): void {
      this.readyState = 2
      if (this.#timer) clearTimeout(this.#timer)
      const h = this.#handle
      this.#handle = null
      if (h) {
        h.abort()
        open.delete(h)
      }
    }
  }

  const PatchedEventSource = function EventSource(url: string | URL, init?: EventSourceInit): EventSource {
    if (apiTarget(url)) return new BackendEventSource(url, init) as unknown as EventSource
    return new NativeEventSource(url, init)
  } as unknown as typeof EventSource
  Object.assign(PatchedEventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 })
  if (NativeEventSource) PatchedEventSource.prototype = NativeEventSource.prototype
  window.EventSource = PatchedEventSource

  /* ───────────── sendBeacon ───────────── */

  const nativeBeacon = navigator.sendBeacon?.bind(navigator)
  if (nativeBeacon) {
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      const target = apiTarget(url)
      if (!target) return nativeBeacon(url, data)
      const req = new Request(target, { method: 'POST', body: data ?? null })
      void req.arrayBuffer().then((body) => {
        backend.request(wireBase(target, 'POST', req.headers, body.byteLength ? body : null), client, {
          head() {},
          data() {},
          end() {},
          fail() {},
        })
      })
      return true
    }
  }

  /* ───────────── XMLHttpRequest (Stüdyo dosya yüklemesi) ───────────── */

  installXhr(backend, client, track, open)

  /* ───────────── sayfa kapanışı ───────────── */

  const closeAll = () => {
    for (const h of [...open]) h.abort()
    open.clear()
  }
  window.addEventListener('pagehide', () => {
    closeAll()
    backend.bye(client)
    backend.flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') backend.flush()
  })

  // Canlılık kilidi: sekme/çerçeve ölünce arka uç bu istemcinin akışlarını kapatır.
  let lock: string | null = null
  if (typeof navigator.locks?.request === 'function' && !location.search.includes('kilitsiz')) {
    lock = `tvplus-istemci-${client}`
    void navigator.locks.request(lock, () => new Promise<never>(() => {})).catch(() => {})
  }
  backend.hello(client, lock)

  return { client, closeAll }
}

/* ───────────── XHR ───────────── */

function installXhr(
  backend: Backend,
  client: string,
  track: (h: { abort(): void }) => { abort(): void },
  open: Set<{ abort(): void }>,
): void {
  const Native = window.XMLHttpRequest
  if (!Native) return

  interface Emu {
    method: string
    target: URL
    headers: Headers
    status: number
    statusText: string
    responseHeaders: [string, string][]
    body: Uint8Array
    readyState: number
    handle: { abort(): void } | null
  }

  class BackendXhr extends Native {
    #emu: Emu | null = null

    override open(method: string, url: string | URL, async?: boolean, user?: string | null, pass?: string | null): void {
      const target = apiTarget(url)
      if (!target) {
        this.#emu = null
        super.open(method, url, async ?? true, user, pass)
        return
      }
      this.#emu = {
        method: method.toUpperCase(),
        target,
        headers: new Headers(),
        status: 0,
        statusText: '',
        responseHeaders: [],
        body: new Uint8Array(0),
        readyState: 1,
        handle: null,
      }
      this.dispatchEvent(new Event('readystatechange'))
    }

    override setRequestHeader(name: string, value: string): void {
      if (this.#emu) this.#emu.headers.append(name, value)
      else super.setRequestHeader(name, value)
    }

    override send(body?: Document | XMLHttpRequestBodyInit | null): void {
      const emu = this.#emu
      if (!emu) return super.send(body)
      const req = new Request(emu.target, {
        method: emu.method,
        headers: emu.headers,
        body: emu.method === 'GET' || emu.method === 'HEAD' ? null : ((body as BodyInit | null | undefined) ?? null),
      })
      void req.arrayBuffer().then((buf) => {
        const total = buf.byteLength
        this.upload.dispatchEvent(new ProgressEvent('loadstart', { lengthComputable: true, loaded: 0, total }))
        this.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: total, total }))
        this.upload.dispatchEvent(new ProgressEvent('load', { lengthComputable: true, loaded: total, total }))
        const chunks: Uint8Array[] = []
        const h = track(
          backend.request(wireBase(emu.target, emu.method, req.headers, total ? buf : null), client, {
            head: (status, headers) => {
              emu.status = status
              emu.responseHeaders = headers
              emu.readyState = 2
              this.dispatchEvent(new Event('readystatechange'))
            },
            data: (chunk) => chunks.push(new Uint8Array(chunk)),
            end: () => {
              open.delete(h)
              const len = chunks.reduce((n, c) => n + c.length, 0)
              emu.body = new Uint8Array(len)
              let off = 0
              for (const c of chunks) {
                emu.body.set(c, off)
                off += c.length
              }
              emu.readyState = 4
              this.dispatchEvent(new Event('readystatechange'))
              this.dispatchEvent(new ProgressEvent('load', { lengthComputable: true, loaded: len, total: len }))
              this.dispatchEvent(new ProgressEvent('loadend'))
            },
            fail: () => {
              open.delete(h)
              emu.readyState = 4
              this.dispatchEvent(new Event('readystatechange'))
              this.dispatchEvent(new ProgressEvent('error'))
              this.dispatchEvent(new ProgressEvent('loadend'))
            },
          }),
        )
        emu.handle = h
      })
    }

    override abort(): void {
      const emu = this.#emu
      if (!emu) return super.abort()
      if (emu.handle) {
        emu.handle.abort()
        open.delete(emu.handle)
        emu.handle = null
      }
      emu.readyState = 4
      this.dispatchEvent(new ProgressEvent('abort'))
      this.dispatchEvent(new ProgressEvent('loadend'))
    }

    override getResponseHeader(name: string): string | null {
      const emu = this.#emu
      if (!emu) return super.getResponseHeader(name)
      const n = name.toLowerCase()
      const found = emu.responseHeaders.filter(([k]) => k === n).map(([, v]) => v)
      return found.length ? found.join(', ') : null
    }

    override getAllResponseHeaders(): string {
      const emu = this.#emu
      if (!emu) return super.getAllResponseHeaders()
      return emu.responseHeaders.map(([k, v]) => `${k}: ${v}\r\n`).join('')
    }

    override get readyState(): number {
      return this.#emu ? this.#emu.readyState : super.readyState
    }
    override get status(): number {
      return this.#emu ? this.#emu.status : super.status
    }
    override get statusText(): string {
      return this.#emu ? this.#emu.statusText : super.statusText
    }
    override get responseText(): string {
      return this.#emu ? new TextDecoder().decode(this.#emu.body) : super.responseText
    }
    override get response(): unknown {
      const emu = this.#emu
      if (!emu) return super.response
      const t = this.responseType
      if (t === 'arraybuffer') return emu.body.slice().buffer
      if (t === 'json') {
        try {
          return JSON.parse(new TextDecoder().decode(emu.body))
        } catch {
          return null
        }
      }
      if (t === 'blob') return new Blob([emu.body.slice()])
      return new TextDecoder().decode(emu.body)
    }
    override get responseURL(): string {
      return this.#emu ? this.#emu.target.href : super.responseURL
    }
  }

  window.XMLHttpRequest = BackendXhr
}
