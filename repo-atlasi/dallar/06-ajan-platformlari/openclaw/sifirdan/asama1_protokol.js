// Aşama 1 — Kontrol düzlemi protokolü: tipli istek/cevap/olay çerçeveleri.
//
// Gerçek karşılığı: openclaw/openclaw → src/gateway/server-methods.ts, src/gateway/server/ws-connection.ts,
// packages/gateway-protocol (TypeBox şemaları), docs/concepts/architecture.md.
// Gerçek Gateway bu çerçeveleri WebSocket üzerinden (varsayılan 127.0.0.1:18789) taşır; burada taşıma
// katmanından bağımsız tutuyoruz: handleFrame() bir çerçeve alır, bir çerçeve döndürür.
//
// Kurallar (gerçek protokolden):
//   * İlk çerçeve `connect` olmak zorunda; kimlik doğrulama (token) ve rol (operator | node) burada.
//   * İstek:  {type:"req", id, method, params}   → Cevap: {type:"res", id, ok, payload | error}
//   * Olay:   {type:"event", event, payload, seq}  (seq: kaçırılan olayı fark etmek için artan sayı)
//   * Yan etkili yöntemler (send, agent) idempotencyKey ister; aynı anahtarla tekrar gelen istek
//     yeniden çalıştırılmaz, ilk cevap tekrar döner.

import { timingSafeEqual } from 'node:crypto'

export class ProtocolError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * JSON Şemasının küçük bir alt kümesiyle parametre doğrulama (gerçekte TypeBox + derlenmiş doğrulayıcılar).
 * @param {any} schema @param {any} value @param {string} [path]
 * @returns {string|null} ilk hata ya da null
 */
export function validate(schema, value, path = 'params') {
  if (!schema) return null
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (schema.type && schema.type !== actual) return `${path}: ${schema.type} beklenirdi, ${actual} geldi`
  if (schema.enum && !schema.enum.includes(value)) return `${path}: ${schema.enum.join(' | ')} olmalı`
  if (schema.type === 'object') {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) return `${path}.${key}: zorunlu`
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined) {
        const error = validate(sub, value[key], `${path}.${key}`)
        if (error) return error
      }
    }
  }
  return null
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && timingSafeEqual(x, y) // zamanlama saldırısına karşı sabit süreli karşılaştırma
}

export class ControlPlane {
  /** @param {{token: string, idempotencyTtlMs?: number, now?: () => number}} options */
  constructor({ token, idempotencyTtlMs = 5 * 60_000, now = Date.now }) {
    this.token = token
    this.now = now
    this.idempotencyTtlMs = idempotencyTtlMs
    /** @type {Map<string, {schema?: any, roles: string[], sideEffect: boolean, handler: Function}>} */
    this.methods = new Map()
    this.connections = new Set()
    this.dedupe = new Map() // idempotencyKey → {at, response}
    this.seq = 0
  }

  /**
   * @param {string} name
   * @param {{schema?: any, roles?: string[], sideEffect?: boolean}} spec
   * @param {(params: any, conn: any) => any} handler
   */
  method(name, spec, handler) {
    this.methods.set(name, { roles: ['operator'], sideEffect: false, ...spec, handler })
  }

  /** @param {(frame: any) => void} send bağlantının dışarı çerçeve yazma fonksiyonu */
  openConnection(send) {
    const conn = { id: `c${this.connections.size + 1}`, role: null, client: null, send, closed: false }
    this.connections.add(conn)
    return conn
  }

  close(conn) {
    conn.closed = true
    this.connections.delete(conn)
  }

  /** Bağlı tüm (ya da filtreye uyan) istemcilere olay yayınla. */
  broadcast(event, payload, filter = () => true) {
    this.seq += 1
    const frame = { type: 'event', event, payload, seq: this.seq }
    for (const conn of this.connections) {
      if (conn.role && filter(conn)) conn.send(frame)
    }
    return frame
  }

  async handleFrame(conn, frame) {
    const id = frame?.id ?? null
    try {
      if (frame?.type !== 'req' || typeof frame.method !== 'string') {
        throw new ProtocolError('INVALID_REQUEST', 'çerçeve {type:"req", id, method, params} olmalı')
      }
      if (!conn.role) {
        if (frame.method !== 'connect') {
          this.close(conn)
          throw new ProtocolError('NOT_CONNECTED', 'ilk çerçeve connect olmalı')
        }
        return { type: 'res', id, ok: true, payload: this.#connect(conn, frame.params ?? {}) }
      }
      const spec = this.methods.get(frame.method)
      if (!spec) throw new ProtocolError('UNKNOWN_METHOD', `bilinmeyen yöntem: ${frame.method}`)
      if (!spec.roles.includes(conn.role)) {
        throw new ProtocolError('FORBIDDEN', `${conn.role} rolü ${frame.method} çağıramaz`)
      }
      const params = frame.params ?? {}
      const error = validate(spec.schema, params)
      if (error) throw new ProtocolError('INVALID_PARAMS', error)
      if (!spec.sideEffect) return { type: 'res', id, ok: true, payload: await spec.handler(params, conn) }
      const { payload, replayed } = await this.#idempotent(frame.method, params, () => spec.handler(params, conn))
      return replayed ? { type: 'res', id, ok: true, payload, replayed } : { type: 'res', id, ok: true, payload }
    } catch (err) {
      const code = err instanceof ProtocolError ? err.code : 'INTERNAL'
      return { type: 'res', id, ok: false, error: { code, message: err.message } }
    }
  }

  #connect(conn, params) {
    if (!sameSecret(params.auth?.token, this.token)) {
      this.close(conn)
      throw new ProtocolError('UNAUTHORIZED', 'geçersiz token')
    }
    const role = params.role ?? 'operator'
    if (!['operator', 'node'].includes(role)) throw new ProtocolError('INVALID_PARAMS', 'rol operator ya da node')
    conn.role = role
    conn.client = params.client ?? {}
    const methods = [...this.methods.entries()].filter(([, s]) => s.roles.includes(role)).map(([n]) => n)
    return { type: 'hello-ok', connectionId: conn.id, features: { methods: methods.sort() } }
  }

  async #idempotent(method, params, run) {
    const key = params.idempotencyKey
    if (typeof key !== 'string' || key.length === 0) {
      throw new ProtocolError('INVALID_PARAMS', `${method} yan etkili: idempotencyKey zorunlu`)
    }
    const now = this.now()
    for (const [k, v] of this.dedupe) if (now - v.at > this.idempotencyTtlMs) this.dedupe.delete(k)
    const cacheKey = `${method}:${key}`
    const hit = this.dedupe.get(cacheKey)
    if (hit) return { payload: await hit.response, replayed: true }
    // Sözü (promise) hemen sakla: eşzamanlı iki tekrar da tek çalıştırmayı paylaşır.
    const response = Promise.resolve().then(run)
    this.dedupe.set(cacheKey, { at: now, response })
    response.catch(() => this.dedupe.delete(cacheKey)) // başarısız istek yeniden denenebilsin
    return { payload: await response, replayed: false }
  }
}
