import { describe, expect, it, vi } from 'vitest'
import {
  createStore,
  createTabSync,
  loadPersisted,
  persist,
  replaceable,
  type ChannelLike,
  type PersistOptions,
  type Reducer,
  type StorageLike,
} from '../../src/depo/index.ts'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  }
}

type Settings = { tema: 'açık' | 'koyu'; yaziBoyutu: number }
const isSettings = (v: unknown): v is Settings =>
  typeof v === 'object' &&
  v !== null &&
  ['açık', 'koyu'].includes((v as Settings).tema) &&
  typeof (v as Settings).yaziBoyutu === 'number'

const options = (storage: StorageLike, extra: Partial<PersistOptions<Settings>> = {}): PersistOptions<Settings> => ({
  key: 'ayarlar',
  version: 3,
  storage,
  validate: isSettings,
  migrations: {
    2: (old) => ({ tema: (old as { karanlik: boolean }).karanlik ? 'koyu' : 'açık' }),
    3: (old) => ({ ...(old as object), yaziBoyutu: 16 }),
  },
  ...extra,
})

describe('kalıcılık', () => {
  it('eski sürümü göç zinciriyle çevirir ve doğrular', () => {
    const storage = memoryStorage({ ayarlar: JSON.stringify({ v: 1, durum: { karanlik: true } }) })
    expect(loadPersisted(options(storage))).toEqual({
      ok: true,
      value: { tema: 'koyu', yaziBoyutu: 16 },
      migratedFrom: 1,
    })
  })

  it('bozuk, geçersiz, gelecek sürüm ve eksik göçte çökmez; sebebi söyler', () => {
    const reason = (raw: string, extra?: Partial<PersistOptions<Settings>>) => {
      const result = loadPersisted(options(memoryStorage({ ayarlar: raw }), extra))
      return result.ok ? 'ok' : result.reason
    }
    expect(reason('{bozuk')).toBe('bozuk')
    expect(reason(JSON.stringify({ durum: {} }))).toBe('bozuk')
    expect(reason(JSON.stringify({ v: 3, durum: { tema: 'mor', yaziBoyutu: 1 } }))).toBe('gecersiz')
    expect(reason(JSON.stringify({ v: 9, durum: {} }))).toBe('gelecek-surum')
    expect(reason(JSON.stringify({ v: 1, durum: {} }), { migrations: {} })).toBe('goc-eksik')
    expect(loadPersisted(options(memoryStorage())).ok).toBe(false)
  })

  it("değişiklikleri gecikmeli tek yazmada birleştirir; kota hatası onError'a gider", () => {
    const storage = memoryStorage()
    let pending: (() => void) | undefined
    const reducer: Reducer<Settings> = (s = { tema: 'açık', yaziBoyutu: 16 }, a) =>
      a.type === 'boyut' ? { ...s, yaziBoyutu: a.payload as number } : s
    const store = createStore(reducer)
    const errors: unknown[] = []
    const controller = persist(
      store,
      options(storage, {
        schedule: (fn) => ((pending = fn), () => (pending = undefined)),
        onError: (e) => errors.push(e),
      }),
    )
    store.dispatch({ type: 'boyut', payload: 18 })
    store.dispatch({ type: 'boyut', payload: 20 })
    expect(storage.data.ayarlar).toBeUndefined()
    pending?.()
    expect(JSON.parse(storage.data.ayarlar!)).toEqual({ v: 3, durum: { tema: 'açık', yaziBoyutu: 20 } })
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    store.dispatch({ type: 'boyut', payload: 22 })
    controller.flush()
    expect(errors).toHaveLength(1)
    controller.stop()
  })

  it('gelecek sürüm kaydının üstüne yazmaz', () => {
    const raw = JSON.stringify({ v: 7, durum: { yeni: 'biçim' } })
    const storage = memoryStorage({ ayarlar: raw })
    const store = createStore<Settings>((s = { tema: 'açık', yaziBoyutu: 1 }, a) =>
      a.type === 'x' ? { ...s, yaziBoyutu: 2 } : s,
    )
    const errors: unknown[] = []
    const controller = persist(store, options(storage, { onError: (e) => errors.push(e) }))
    store.dispatch({ type: 'x' })
    controller.flush()
    expect(storage.data.ayarlar).toBe(raw)
    expect(errors).toHaveLength(1)
  })
})

/** Eşzamanlı, bellekte çalışan sahte BroadcastChannel ağı (her kanal kendi iletisini almaz). */
function hub() {
  const members = new Set<{ listeners: Set<(e: MessageEvent) => void> }>()
  return (): ChannelLike => {
    const self = { listeners: new Set<(e: MessageEvent) => void>() }
    members.add(self)
    return {
      postMessage(message) {
        for (const m of members)
          if (m !== self) for (const l of m.listeners) l({ data: structuredClone(message) } as MessageEvent)
      },
      addEventListener: (_t, l) => void self.listeners.add(l),
      removeEventListener: (_t, l) => void self.listeners.delete(l),
      close: () => void members.delete(self),
    }
  }
}

const counter = replaceable<number>((s = 0, a) => (a.type === 'artir' ? s + 1 : s))

describe('sekmeler arası eşitleme', () => {
  it('eylemleri diğer sekmeye taşır, yankı yapmaz, yeni sekme açık sekmeden durumu alır', () => {
    const channel = hub()
    const syncA = createTabSync<number>({ name: 'sayac', channel: channel(), id: 'A' })
    const a = createStore(counter, undefined, { middleware: [syncA.middleware] })
    syncA.connect(a)
    a.dispatch({ type: 'artir' })
    a.dispatch({ type: 'artir' })
    const syncB = createTabSync<number>({ name: 'sayac', channel: channel(), id: 'B' })
    const b = createStore(counter, undefined, { middleware: [syncB.middleware] })
    syncB.connect(b)
    expect(b.getState()).toBe(2)
    b.dispatch({ type: 'artir' })
    expect([a.getState(), b.getState()]).toEqual([3, 3])
  })

  it('bozuk iletileri yok sayar; süzgeçten geçmeyen eylemi yaymaz', () => {
    const channel = hub()
    const raw = channel()
    const sync = createTabSync<number>({ name: 's', channel: channel(), id: 'A', filter: (a) => a.type !== 'yerel' })
    const store = createStore(counter, undefined, { middleware: [sync.middleware] })
    sync.connect(store)
    const seen: unknown[] = []
    raw.addEventListener('message', (e) => seen.push(e.data))
    raw.postMessage({ tur: 'eylem', kaynak: 'X', eylem: { tip: 'artir' } })
    raw.postMessage('çöp')
    store.dispatch({ type: 'yerel' })
    expect(store.getState()).toBe(0)
    expect(seen).toEqual([])
  })

  it('gerçek BroadcastChannel ile de çalışır', async () => {
    const a = createTabSync<number>({ name: 'gercek-kanal-testi', id: 'A' })
    const b = createTabSync<number>({ name: 'gercek-kanal-testi', id: 'B' })
    const storeA = createStore(counter, undefined, { middleware: [a.middleware] })
    const storeB = createStore(counter, undefined, { middleware: [b.middleware] })
    a.connect(storeA)
    b.connect(storeB)
    storeA.dispatch({ type: 'artir' })
    await vi.waitFor(() => expect(storeB.getState()).toBe(1))
    a.stop()
    b.stop()
  })
})
