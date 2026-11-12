// @ts-check
// Perde sunucusu: public/ klasörünü sunar ve POST /api/ai ile Claude akışını SSE olarak iletir.
// Kimlik doğrulama YOK: varsayılan olarak yalnızca 127.0.0.1'e bağlanır; herkese açmadan önce README'ye bakın.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { parseFountain, sceneBounds, toFountain } from './public/senaryo.mjs'
import { buildParams, DEFAULT_MODEL, runClaude } from './lib/claude.mjs'
import { mockStream } from './lib/mock.mjs'
import { MAX_BODY_BYTES, validateAiRequest } from './lib/request.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.fountain': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
}

/** Bu kadar baytın ötesinde gövde okunmadan bağlantı kesilir (2 MB sınırının aşıldığını bildirmek için boşaltılan pay). */
const DRAIN_LIMIT = 32 * 1024 * 1024

/**
 * @typedef {object} AppOptions
 * @property {string} [publicDir]
 * @property {string} [host]  Bağlanılan adres; loopback ise Host başlığı da denetlenir
 * @property {boolean} [mock]  Örnek kip (yalnızca açıkça istenirse)
 * @property {number} [mockDelayMs]
 * @property {string} [model]
 * @property {Pick<Anthropic, 'beta'>} [client]  Test için enjekte edilen SDK istemcisi
 */

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [extra]
 */
function sendJson(res, status, body, extra = {}) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(data)),
    'cache-control': 'no-store',
    ...SECURITY_HEADERS,
    ...extra,
  })
  res.end(data)
}

/** @param {string} host */
function isLoopback(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

/**
 * Gövdeyi sınırla okur. Sınır aşılırsa gövde atılır (boşaltılır) ve `tooLarge` döner.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<{ tooLarge: false, text: string } | { tooLarge: true }>}
 */
async function readBody(req) {
  const declared = Number(req.headers['content-length'])
  /** @type {Uint8Array[]} */
  const chunks = []
  let size = 0
  let tooLarge = Number.isFinite(declared) && declared > MAX_BODY_BYTES
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) tooLarge = true
    if (size > DRAIN_LIMIT) {
      req.destroy()
      return { tooLarge: true }
    }
    if (!tooLarge) chunks.push(chunk)
  }
  if (tooLarge) return { tooLarge: true }
  return { tooLarge: false, text: Buffer.concat(chunks).toString('utf8') }
}

/**
 * @param {AppOptions} [options]
 */
export function createApp(options = {}) {
  const publicDir = path.resolve(options.publicDir ?? path.join(here, 'public'))
  const host = options.host ?? '127.0.0.1'
  const mock = options.mock ?? process.env.PERDE_MOCK === '1'
  const mockDelayMs = options.mockDelayMs ?? Number(process.env.PERDE_MOCK_DELAY_MS ?? 20)
  const model = options.model ?? (process.env.PERDE_MODEL || DEFAULT_MODEL)
  /** @type {Pick<Anthropic, 'beta'> | undefined} */
  let client = options.client

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   */
  async function serveStatic(req, res, pathname) {
    let rel
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      return sendJson(res, 400, { error: 'Geçersiz adres.' })
    }
    if (rel.includes('\0')) return sendJson(res, 400, { error: 'Geçersiz adres.' })
    if (rel.endsWith('/')) rel += 'index.html'
    const file = path.resolve(publicDir, '.' + path.sep + rel.replace(/^\/+/, ''))
    if (file !== publicDir && !file.startsWith(publicDir + path.sep)) {
      return sendJson(res, 403, { error: 'Erişim reddedildi.' })
    }
    let data
    try {
      data = await readFile(file)
    } catch {
      return sendJson(res, 404, { error: 'Bulunamadı.' })
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(data.length),
      'cache-control': 'no-cache',
      ...SECURITY_HEADERS,
    })
    res.end(req.method === 'HEAD' ? undefined : data)
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handleAi(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Yalnızca POST.' }, { allow: 'POST' })
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) {
      return sendJson(res, 415, { error: 'İçerik türü application/json olmalı.' })
    }
    const body = await readBody(req)
    if (body.tooLarge) {
      return sendJson(
        res,
        413,
        { error: 'Senaryo çok büyük (en fazla 2 MB). Kırpılmadan gönderilemez.' },
        { connection: 'close' },
      )
    }
    /** @type {unknown} */
    let json
    try {
      json = JSON.parse(body.text)
    } catch {
      return sendJson(res, 400, { error: 'Geçersiz JSON.' })
    }
    const v = validateAiRequest(json)
    if (!v.ok) return sendJson(res, 400, { error: v.error })
    const { action, script, sceneIndex, selection, instruction } = v.value

    const parsed = parseFountain(script)
    const bounds = sceneIndex === undefined ? null : sceneBounds(parsed.elements, sceneIndex)
    const first = bounds ? parsed.elements[bounds.start] : null
    const scene = bounds && first ? { number: (sceneIndex ?? 0) + 1, heading: first.text } : null
    if (action === 'shots' && !scene) {
      return sendJson(res, 400, {
        error: 'Çekim listesi için imleci bir sahnenin içine koyun (önce sahne başlığı ekleyin).',
      })
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...SECURITY_HEADERS,
    })
    res.flushHeaders()

    const ac = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) ac.abort()
    })
    /** @param {Record<string, unknown>} event */
    const emit = (event) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    try {
      if (mock) {
        emit({
          type: 'notice',
          code: 'mock',
          message: 'Örnek kip (PERDE_MOCK=1): çıktı sabit metindir, yapay zekâ çağrılmadı.',
        })
        for await (const text of mockStream(action, { delayMs: mockDelayMs, signal: ac.signal })) {
          emit({ type: 'text', text })
        }
        if (!ac.signal.aborted) emit({ type: 'done', stopReason: 'end_turn' })
      } else {
        client ??= new Anthropic()
        const params = buildParams(model, {
          action,
          script: toFountain(parsed.elements, parsed.meta),
          scene,
          selection,
          instruction,
        })
        await runClaude({ client, params, signal: ac.signal, emit })
      }
    } catch (err) {
      if (!ac.signal.aborted) emit({ type: 'error', message: 'Beklenmeyen bir hata oluştu. Yeniden deneyin.' })
    } finally {
      res.end()
    }
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://perde.local')
      // DNS yeniden bağlama (rebinding) ve çapraz kaynaklı çağrılara karşı: kimlik doğrulaması olmayan bir yerel sunucu.
      const hostHeader = String(req.headers.host ?? '')
        .replace(/:\d+$/, '')
        .replace(/^\[|\]$/g, '')
      if (isLoopback(host) && !isLoopback(hostHeader)) return sendJson(res, 403, { error: 'Geçersiz Host.' })
      const origin = req.headers.origin
      if (typeof origin === 'string' && origin !== 'null') {
        let originHost = ''
        try {
          originHost = new URL(origin).host
        } catch {}
        if (originHost !== req.headers.host) return sendJson(res, 403, { error: 'Çapraz kaynaklı istek reddedildi.' })
      }

      if (url.pathname === '/api/ai') return await handleAi(req, res)
      if (url.pathname === '/api/durum') {
        return sendJson(res, 200, { mock, model: mock ? null : model })
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJson(res, 405, { error: 'Yöntem desteklenmiyor.' }, { allow: 'GET, HEAD' })
      }
      return await serveStatic(req, res, url.pathname)
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: 'Sunucu hatası.' })
      else res.end()
    }
  })
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
if (isMain) {
  const host = process.env.HOST || '127.0.0.1'
  const port = Number(process.env.PORT || 3000)
  const mock = process.env.PERDE_MOCK === '1'
  const server = createApp({ host, mock })
  server.on('error', (err) => {
    process.stderr.write(`Sunucu başlatılamadı: ${err.message}\n`)
    process.exit(1)
  })
  server.listen(port, host, () => {
    const addr = server.address()
    const shown = typeof addr === 'object' && addr ? addr.port : port
    process.stdout.write(`Perde http://${host}:${shown} adresinde${mock ? ' (örnek kip: yapay zekâ çağrılmaz)' : ''}\n`)
    if (!isLoopback(host)) {
      process.stderr.write('UYARI: Kimlik doğrulama ve istek sınırı yok; bu adres API anahtarınızı herkese açar.\n')
    }
    if (!mock && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      process.stderr.write(
        'Not: ANTHROPIC_API_KEY ayarlı değil; yapay zekâ eylemleri anahtar hatası verecek (PERDE_MOCK=1 ile deneyebilirsiniz).\n',
      )
    }
  })
}
