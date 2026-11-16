// Sekmeler arası eşitleme (BroadcastChannel): bir sekmede gönderilen eylem diğer sekmelere yayınlanır ve
// orada da indirgeyiciden geçer (indirgeyiciler saf olduğu için aynı sonuç çıkar). Uzaktan gelen eylem
// `meta.remote = true` taşır; ara katman onu yeniden yayınlamaz (yankı yok). Yeni açılan sekme bir "durum
// isteği" yollar; açık sekmelerden ilk gelen tam durum `REPLACE_STATE` ile alınır (kök indirgeyici
// `replaceable` ile sarılmalı). Gelen her ileti dış veridir: biçimi doğrulanır, bozuksa yok sayılır.
// Genişletme: yalnız bazı eylemleri eşitlemek için `filter` verin (ör. arayüz durumunu eşitlemeyin).
import { isAction, REPLACE_STATE, type Action, type Middleware, type Store } from './store.ts'

export interface ChannelLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  close(): void
}

type Message =
  | { tur: 'eylem'; kaynak: string; eylem: Action }
  | { tur: 'durum-iste'; kaynak: string }
  | { tur: 'durum'; kaynak: string; hedef: string; durum: unknown }

function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  if (typeof m.kaynak !== 'string') return false
  if (m.tur === 'eylem') return isAction(m.eylem)
  if (m.tur === 'durum') return typeof m.hedef === 'string' && 'durum' in m
  return m.tur === 'durum-iste'
}

export interface SyncOptions {
  name: string
  filter?: (action: Action) => boolean
  channel?: ChannelLike
  /** Bu sekmenin kimliği (varsayılan: rastgele). */
  id?: string
}

export interface TabSync<S> {
  middleware: Middleware<S>
  /** Depo kurulduktan sonra çağrılır: dinlemeye başlar ve açık sekmelerden durum ister. */
  connect(store: Store<S>): void
  stop(): void
}

export function createTabSync<S>(options: SyncOptions): TabSync<S> {
  const channel = options.channel ?? new BroadcastChannel(options.name)
  const id = options.id ?? Math.random().toString(36).slice(2)
  let store: Store<S> | undefined
  let waitingForSnapshot = false

  const onMessage = (event: MessageEvent) => {
    const message: unknown = event.data
    if (!store || !isMessage(message) || message.kaynak === id) return
    if (message.tur === 'eylem') store.dispatch({ ...message.eylem, meta: { ...message.eylem.meta, remote: true } })
    else if (message.tur === 'durum-iste') {
      channel.postMessage({ tur: 'durum', kaynak: id, hedef: message.kaynak, durum: store.getState() })
    } else if (message.hedef === id && waitingForSnapshot) {
      waitingForSnapshot = false
      store.dispatch({ type: REPLACE_STATE, payload: message.durum, meta: { remote: true } })
    }
  }

  const middleware: Middleware<S> = () => (next) => (action) => {
    const result = next(action)
    if (isAction(action) && !action.meta?.remote && action.type !== REPLACE_STATE) {
      if (!options.filter || options.filter(action)) channel.postMessage({ tur: 'eylem', kaynak: id, eylem: action })
    }
    return result
  }

  return {
    middleware,
    connect(target) {
      store = target
      channel.addEventListener('message', onMessage)
      waitingForSnapshot = true
      channel.postMessage({ tur: 'durum-iste', kaynak: id })
    },
    stop() {
      channel.removeEventListener('message', onMessage)
      channel.close()
      store = undefined
    },
  }
}
