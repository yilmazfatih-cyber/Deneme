/**
 * Tarayıcıdaki arka uç: içerik paketini ve kayıtlı durumu bellek içi dosya sistemine yükler, gerçek sunucu kodunu
 * (`server/src/app.ts → buildApp`) Fastify uyumlu ev sahibiyle kurar ve sayfalardan gelen istekleri yürütür.
 * Bir SharedWorker'da (tüm sekmeler ve çerçeveler tek arka uç) ya da lider sekmenin Worker'ında çalışır.
 */
import type { FastifyHost, HostExchange } from '../host/fastify'
import { setLogSink } from '../host/fastify'
import { flushPendingStores } from '../../server/src/kernel/store'
import { seedFile } from '../node/fs'
import { process } from '../node/process'
import { CONTENT_PACK_FILE, type BackendStatus, type ContentPack, type FromBackend, type ToBackend } from '../shared/protocol'
import { absorb, cookieHeader, loadCookies } from './cookies'
import { DATA_ROOT, flush, onPersistLog, restore, watch } from './persist'

export interface PortLike {
  postMessage(msg: FromBackend, transfer?: Transferable[]): void
}

const CONTENT_ROOT = '/content'

const ports = new Set<PortLike>()
const exchanges = new Map<string, { ex: HostExchange; port: PortLike }>()
const queued: { port: PortLike; msg: Extract<ToBackend, { t: 'req' }> }[] = []
const watchedClients = new Set<string>()

let app: FastifyHost | null = null
let status: BackendStatus = { phase: 'baslatiliyor', text: 'Sunucu tarayıcıda başlatılıyor…' }
let started = false

function broadcast(msg: FromBackend): void {
  for (const p of ports) {
    try {
      p.postMessage(msg)
    } catch {
      ports.delete(p)
    }
  }
}

function setStatus(s: BackendStatus): void {
  status = s
  broadcast({ t: 'status', status: s })
}

/** Yeni bir bağlantı noktası (sekme, lider sekme ya da Worker'ın kendisi). */
export function attach(port: PortLike): (msg: ToBackend) => void {
  ports.add(port)
  port.postMessage({ t: 'status', status })
  if (!started) {
    started = true
    void start()
  }
  return (msg) => onMessage(port, msg)
}

function onMessage(port: PortLike, msg: ToBackend): void {
  switch (msg.t) {
    case 'req':
      if (app) handle(port, msg)
      else if (status.phase === 'hata') port.postMessage({ t: 'fail', id: msg.req.id, message: status.text })
      else queued.push({ port, msg })
      return
    case 'abort': {
      const e = exchanges.get(msg.id)
      exchanges.delete(msg.id)
      e?.ex.abort()
      return
    }
    case 'flush':
      flushNow()
      return
    case 'bye':
      dropClient(msg.client)
      flushNow()
      return
    case 'hello':
      watchClient(msg.client, msg.lock)
      return
    case 'alive':
      return
  }
}

/** Sunucu depolarının gecikmeli yazımlarını ve IndexedDB kuyruğunu hemen boşaltır (sekme gizlendi/kapanıyor). */
function flushNow(): void {
  if (app) {
    try {
      flushPendingStores()
    } catch (err) {
      console.warn('[TV+ arka uç] bekleyen yazımlar boşaltılamadı', err)
    }
  }
  void flush()
}

/** İstemcinin tüm açık isteklerini kapatır (sekme kapandı ya da yenilendi). */
function dropClient(client: string): void {
  const prefix = `${client}:`
  for (const [id, e] of exchanges) {
    if (!id.startsWith(prefix)) continue
    exchanges.delete(id)
    e.ex.abort()
  }
}

/** Sekme canlılığı: sayfa ömrü boyunca tuttuğu Web Locks kilidi serbest kalınca sekme kapanmış demektir. */
function watchClient(client: string, lock: string | null): void {
  if (!lock || watchedClients.has(client)) return
  const locks = (globalThis.navigator as Navigator | undefined)?.locks
  if (!locks) return
  watchedClients.add(client)
  void locks
    .request(lock, async () => {
      watchedClients.delete(client)
      dropClient(client)
    })
    .catch(() => watchedClients.delete(client))
}

function handle(port: PortLike, msg: Extract<ToBackend, { t: 'req' }>): void {
  const r = msg.req
  const headers: Record<string, string> = {}
  for (const [k, v] of r.headers) headers[k.toLowerCase()] = v
  headers.host = r.host
  const cookie = cookieHeader()
  if (cookie) headers.cookie = cookie
  else delete headers.cookie
  const body = r.body && r.body.byteLength ? new Uint8Array(r.body) : null
  if (body) headers['content-length'] = String(body.length)
  else if (r.method !== 'GET' && r.method !== 'HEAD') headers['content-length'] = '0'

  let ended = false
  const ex = app!.dispatch(
    { method: r.method, url: r.url, headers, body, protocol: r.protocol },
    {
      head: (statusCode, hs) => {
        if (exchanges.get(r.id)?.port !== port) return
        port.postMessage({ t: 'head', id: r.id, status: statusCode, headers: absorb(hs) })
      },
      data: (chunk) => {
        if (exchanges.get(r.id)?.port !== port) return
        // Parça paylaşılan bir arabelleğin görünümü olabilir: kopyalanıp aktarılır.
        const copy = chunk.slice().buffer
        port.postMessage({ t: 'data', id: r.id, chunk: copy }, [copy])
      },
      end: () => {
        if (ended) return
        ended = true
        if (exchanges.get(r.id)?.port === port) port.postMessage({ t: 'end', id: r.id })
        exchanges.delete(r.id)
      },
    },
  )
  if (!ended) exchanges.set(r.id, { ex, port })
}

async function loadContent(): Promise<number> {
  const url = new URL(`../${CONTENT_PACK_FILE}`, globalThis.location.href)
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`İçerik paketi indirilemedi (${res.status}): ${url.pathname}`)
  const pack = (await res.json()) as ContentPack
  const enc = new TextEncoder()
  let n = 0
  for (const [abs, text] of Object.entries(pack.files)) {
    seedFile(abs, enc.encode(text))
    n++
  }
  return n
}

async function start(): Promise<void> {
  const t0 = performance.now()
  setLogSink((level, msg, detail) => {
    const extra = detail instanceof Error ? ` — ${detail.message}` : ''
    broadcast({ t: 'log', level, msg: `${msg}${extra}` })
    if (level === 'error' || level === 'fatal') console.error(`[TV+ arka uç] ${msg}`, detail ?? '')
  })
  try {
    setStatus({ phase: 'icerik', text: 'Katalog yükleniyor…' })
    const [files, saved] = await Promise.all([loadContent(), restore()])
    broadcast({
      t: 'log',
      level: 'info',
      msg: `içerik: ${files} dosya · kayıtlı durum: ${saved.files} dosya (${(saved.bytes / 1048576).toFixed(1)} MB)${saved.available ? '' : ' — tarayıcı depolaması kapalı, kalıcılık yok'}`,
    })
    watch()
    onPersistLog((m) => broadcast({ t: 'log', level: 'debug', msg: m }))
    loadCookies()

    setStatus({ phase: 'sunucu', text: 'Sunucu kuruluyor…' })
    const basePath = new URL('..', globalThis.location.href).pathname.replace(/\/+$/, '')
    process.env.TVP_BASE_PATH = basePath
    process.env.TVP_STATIC_HOST = '1'
    const { buildApp } = await import('../../server/src/app')
    const built = (await buildApp({
      rootDir: '/app',
      contentDir: CONTENT_ROOT,
      dataDir: DATA_ROOT,
      mediaDir: '/app/media',
      webDistDir: '/app/web/dist',
      publicDir: '/app/web/public',
      staticHost: true,
      logLevel: 'info',
      buildId: 'pages',
    })) as unknown as FastifyHost
    await built.ready()
    app = built
    const ms = Math.round(performance.now() - t0)
    setStatus({ phase: 'hazir', text: 'Hazır', ms })
    // Tanılama: olay döngüsünü 250 ms'den uzun bloke eden işler günlüğe yazılır.
    let last = performance.now()
    setInterval(() => {
      const now = performance.now()
      if (now - last > 350) broadcast({ t: 'log', level: 'debug', msg: `olay döngüsü ${Math.round(now - last - 100)} ms bloke` })
      last = now
    }, 100)
    for (const q of queued.splice(0)) handle(q.port, q.msg)
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    console.error('[TV+ arka uç] açılış başarısız', err)
    setStatus({ phase: 'hata', text: `Arka uç başlatılamadı: ${message}` })
    for (const q of queued.splice(0)) q.port.postMessage({ t: 'fail', id: q.msg.req.id, message })
  }
}
