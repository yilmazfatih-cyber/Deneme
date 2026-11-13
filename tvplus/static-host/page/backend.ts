/**
 * Sayfanın arka uç bağlantısı. Tarayıcı başına TEK arka uç:
 *  1. Aynı kökenden bir üst pencere (ör. /#/vitrin çerçeveleri) arka uç taşıyorsa onunki kullanılır.
 *  2. SharedWorker varsa: tüm sekmeler aynı worker'a bağlanır (TV sekmesi + telefon sekmesi eşleşebilir).
 *  3. Yoksa (ör. eski Android Chrome): Web Locks ile bir "lider" sekme seçilir, arka ucu o sekmenin Worker'ı çalıştırır;
 *     öteki sekmeler isteklerini BroadcastChannel üzerinden lidere iletir. Lider kapanınca sıradaki sekme devralır
 *     (durum IndexedDB'den geri yüklenir; açık istekler ağ hatası olarak düşer, akışlar yeniden bağlanır).
 *  4. Web Locks da yoksa: sekmenin kendi Worker'ı (sekmeler arası paylaşım yok).
 */
import type { BackendStatus, FromBackend, ToBackend, WireRequest } from '../shared/protocol'

export interface BackendSink {
  head(status: number, headers: [string, string][]): void
  data(chunk: ArrayBuffer): void
  end(): void
  fail(message: string): void
}

export interface Backend {
  /** Bağlantı türü (tanılama) */
  readonly kind: 'shared-worker' | 'lider-worker' | 'izleyici' | 'worker' | 'ust-pencere'
  request(req: Omit<WireRequest, 'id'>, client: string, sink: BackendSink): { abort(): void }
  /** Arka uç hazır olunca çözülür; açılış başarısızsa reddedilir. */
  ready(): Promise<BackendStatus>
  onStatus(fn: (s: BackendStatus) => void): () => void
  /** Yeni istemci (sekme ya da çerçeve) ve onun canlılık kilidi */
  hello(client: string, lock: string | null): void
  bye(client: string): void
  flush(): void
}

declare global {
  interface Window {
    /** Bu pencerenin arka ucu: aynı kökenden alt çerçeveler paylaşır. */
    __tvpArkaUc?: Backend
  }
}

const SHARED_NAME = 'tvplus-arka-uc'
const LEADER_LOCK = 'tvplus-arka-uc-lider'
const CHANNEL = 'tvplus-arka-uc'

type ChannelMsg =
  | { kind: 'to-leader'; msg: ToBackend }
  | { kind: 'from-leader'; msg: FromBackend }
  | { kind: 'leader'; id: string }
  | { kind: 'status?' }

export function randomId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 12)
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Ortak çekirdek: uçuştaki istekler, durum dinleyicileri, sıra numarası. */
class Core {
  inflight = new Map<string, BackendSink>()
  statusListeners = new Set<(s: BackendStatus) => void>()
  status: BackendStatus = { phase: 'baslatiliyor', text: 'Sunucu tarayıcıda başlatılıyor…' }
  seq = 0
  #readyWaiters: { resolve: (s: BackendStatus) => void; reject: (e: Error) => void }[] = []

  receive(msg: FromBackend): void {
    switch (msg.t) {
      case 'status':
        this.status = msg.status
        for (const fn of this.statusListeners) fn(msg.status)
        if (msg.status.phase === 'hazir' || msg.status.phase === 'hata') {
          const waiters = this.#readyWaiters.splice(0)
          for (const w of waiters)
            if (msg.status.phase === 'hazir') w.resolve(msg.status)
            else w.reject(new Error(msg.status.text))
        }
        return
      case 'head':
        this.inflight.get(msg.id)?.head(msg.status, msg.headers)
        return
      case 'data':
        this.inflight.get(msg.id)?.data(msg.chunk)
        return
      case 'end': {
        const s = this.inflight.get(msg.id)
        this.inflight.delete(msg.id)
        s?.end()
        return
      }
      case 'fail': {
        const s = this.inflight.get(msg.id)
        this.inflight.delete(msg.id)
        s?.fail(msg.message)
        return
      }
      case 'log':
        logLine(msg.level, msg.msg)
        return
    }
  }

  ready(): Promise<BackendStatus> {
    if (this.status.phase === 'hazir') return Promise.resolve(this.status)
    if (this.status.phase === 'hata') return Promise.reject(new Error(this.status.text))
    return new Promise((resolve, reject) => this.#readyWaiters.push({ resolve, reject }))
  }

  /** Arka uç değişti (lider sekme kapandı): uçuştaki istekler ağ hatasıyla düşer. */
  failAll(message: string): void {
    const all = [...this.inflight.values()]
    this.inflight.clear()
    for (const s of all) s.fail(message)
  }
}

/** `?gunluk` ya da localStorage `tvp.gunluk=1`: arka uç günlükleri ve API istekleri konsola yazılır. */
export const verbose = ((): boolean => {
  try {
    return new URLSearchParams(location.search).has('gunluk') || localStorage.getItem('tvp.gunluk') === '1'
  } catch {
    return false
  }
})()

function logLine(level: string, msg: string): void {
  if (level === 'error' || level === 'fatal') console.warn(`[TV+ arka uç] ${msg}`)
  else if (verbose || level === 'warn') console.info(`[TV+ arka uç] ${msg}`)
}

function makeBackend(
  kind: Backend['kind'],
  core: Core,
  send: (msg: ToBackend, transfer?: Transferable[]) => void,
): Backend {
  return {
    kind,
    request(req, client, sink) {
      const id = `${client}:${++core.seq}`
      core.inflight.set(id, sink)
      const transfer = req.body ? [req.body] : undefined
      send({ t: 'req', req: { ...req, id } }, transfer)
      return {
        abort() {
          if (!core.inflight.delete(id)) return
          send({ t: 'abort', id })
        },
      }
    },
    ready: () => core.ready(),
    onStatus(fn) {
      core.statusListeners.add(fn)
      fn(core.status)
      return () => core.statusListeners.delete(fn)
    },
    hello: (client, lock) => send({ t: 'hello', client, lock }),
    bye: (client) => send({ t: 'bye', client }),
    flush: () => send({ t: 'flush' }),
  }
}

/** Üst pencerenin arka ucunu döndürür (aynı köken ve arka uç taşıyorsa). */
function parentBackend(): Backend | null {
  try {
    if (window.parent === window) return null
    return window.parent.__tvpArkaUc ?? null
  } catch {
    return null
  }
}

function sharedWorkerBackend(url: string): Backend {
  const core = new Core()
  const sw = new SharedWorker(url, { name: SHARED_NAME })
  const port = sw.port
  port.onmessage = (e: MessageEvent<FromBackend>) => core.receive(e.data)
  port.start()
  sw.onerror = () => core.receive({ t: 'status', status: { phase: 'hata', text: 'Arka uç (SharedWorker) yüklenemedi.' } })
  return makeBackend('shared-worker', core, (msg, transfer) => port.postMessage(msg, transfer ?? []))
}

function startWorker(url: string, core: Core, onMessage: (msg: FromBackend) => void): Worker {
  const w = new Worker(url, { name: SHARED_NAME })
  w.onmessage = (e: MessageEvent<FromBackend>) => onMessage(e.data)
  w.onerror = (e) => {
    e.preventDefault()
    core.receive({ t: 'status', status: { phase: 'hata', text: `Arka uç (Worker) yüklenemedi: ${e.message}` } })
  }
  return w
}

function leaderBackend(url: string): Backend {
  const core = new Core()
  const channel = new BroadcastChannel(CHANNEL)
  const me = randomId()
  let worker: Worker | null = null
  let leader = false
  let kind: Backend['kind'] = 'izleyici'
  /** Lider olmadan önce gönderilen hello'lar; liderlik alınınca yeni worker'a yeniden yollanır. */
  const hellos: Extract<ToBackend, { t: 'hello' }>[] = []

  const send = (msg: ToBackend, transfer?: Transferable[]): void => {
    if (msg.t === 'hello') hellos.push(msg)
    if (leader && worker) worker.postMessage(msg, transfer ?? [])
    else channel.postMessage({ kind: 'to-leader', msg } satisfies ChannelMsg)
  }

  channel.onmessage = (e: MessageEvent<ChannelMsg>) => {
    const d = e.data
    if (d.kind === 'to-leader') {
      if (leader && worker) worker.postMessage(d.msg)
    } else if (d.kind === 'from-leader') {
      if (!leader) core.receive(d.msg)
    } else if (d.kind === 'leader') {
      if (d.id !== me) {
        core.failAll('Arka uç başka bir sekmeye geçti; istek yeniden denenmeli.')
        for (const h of hellos) channel.postMessage({ kind: 'to-leader', msg: h } satisfies ChannelMsg)
      }
    } else if (d.kind === 'status?') {
      if (leader) channel.postMessage({ kind: 'from-leader', msg: { t: 'status', status: core.status } } satisfies ChannelMsg)
    }
  }
  channel.postMessage({ kind: 'status?' } satisfies ChannelMsg)

  void navigator.locks.request(LEADER_LOCK, () => {
    leader = true
    kind = 'lider-worker'
    core.failAll('Arka uç bu sekmede yeniden başlatıldı; istek yeniden denenmeli.')
    worker = startWorker(url, core, (msg) => {
      // Önce izleyicilere (yapılandırılmış kopya), sonra bu sekmeye.
      channel.postMessage({ kind: 'from-leader', msg } satisfies ChannelMsg)
      core.receive(msg)
    })
    for (const h of hellos) worker.postMessage(h)
    channel.postMessage({ kind: 'leader', id: me } satisfies ChannelMsg)
    // Kilit sekme ömrü boyunca tutulur.
    return new Promise<never>(() => {})
  })

  const b = makeBackend('izleyici', core, send)
  return Object.defineProperty(b, 'kind', { get: () => kind })
}

function ownWorkerBackend(url: string): Backend {
  const core = new Core()
  const w = startWorker(url, core, (msg) => core.receive(msg))
  return makeBackend('worker', core, (msg, transfer) => w.postMessage(msg, transfer ?? []))
}

/** Bu pencerenin arka ucunu kurar (ya da üst pencereninkini paylaşır). */
export function connectBackend(workerUrl: string): Backend {
  const inherited = parentBackend()
  if (inherited) {
    window.__tvpArkaUc = inherited
    return inherited
  }
  let b: Backend
  if (typeof SharedWorker === 'function') {
    try {
      b = sharedWorkerBackend(workerUrl)
    } catch {
      b = typeof navigator.locks?.request === 'function' ? leaderBackend(workerUrl) : ownWorkerBackend(workerUrl)
    }
  } else if (typeof navigator.locks?.request === 'function' && typeof BroadcastChannel === 'function') {
    b = leaderBackend(workerUrl)
  } else b = ownWorkerBackend(workerUrl)
  window.__tvpArkaUc = b
  return b
}
