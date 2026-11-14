/**
 * Modelin süreç içi durumu: kalıcı depo (createStore 'search-model') ve son yanıtların küçük LRU belleği
 * (geri bildirimde "tıklananın üstünde gösterilenler" zayıf olumsuz örnekleri buradan çıkar).
 * Servis kayıt defteri başına bir çalışma zamanı vardır (WeakMap); depo yapılandırması verilmemişse (birim testleri,
 * sahte servisler) durum yalnız bellekte tutulur.
 */
import type { AppConfig } from '../../../kernel/config'
import type { Services } from '../../../kernel/services'
import { createStore, type Store } from '../../../kernel/store'
import type { FeatureVector } from './features'
import { initialModelState, sanitizeModelState, type ModelState } from './model'

export const STORE_NAME = 'search-model'
export const RESPONSE_MEMO_SIZE = 200
export const RESPONSE_MEMO_TTL_MS = 30 * 60 * 1000

/** Bir yanıtta gösterilen, modelle puanlanmış bir varlık. */
export interface ServedEntity {
  entityId: string
  sectionId: string
  /** Bölüm içindeki sıra (0'dan) */
  pos: number
  /** Gösterildiği andaki öznitelikler (SGD bunlarla yapılır: "kaydedilmiş öznitelikler") */
  x: FeatureVector
}
export interface ServedResponse {
  term: string
  at: number
  entities: ServedEntity[]
}

export interface ModelRuntime {
  store: Store<ModelState>
  responses: Map<string, ServedResponse>
}

const runtimes = new WeakMap<Services, ModelRuntime>()

function memoryStore(): Store<ModelState> {
  const state = initialModelState()
  return { get: () => state, update: (fn) => fn(state), flush: () => undefined }
}

/**
 * Modelin çalışma zamanını döndürür; ilk çağrıda kurar. `config` verilirse durum diskten okunur ve oraya yazılır.
 * Önce yapılandırmasız (bellek) kurulmuşsa, yapılandırmalı ilk çağrı onu kalıcı depoyla değiştirmez — eklenti
 * açılışta (onReady'den önce) yapılandırmayla çağırır.
 */
export function searchModel(services: Services, config?: AppConfig | null): ModelRuntime {
  const hit = runtimes.get(services)
  if (hit) return hit
  let store: Store<ModelState>
  if (config) {
    const raw = createStore<unknown>(config, STORE_NAME, initialModelState)
    const clean = sanitizeModelState(raw.get())
    raw.update((s) => {
      // createStore durumu yerinde tutar: doğrulanmış alanları aynı nesneye yaz.
      Object.assign(s as object, clean)
    })
    store = raw as Store<ModelState>
  } else store = memoryStore()
  const rt: ModelRuntime = { store, responses: new Map() }
  runtimes.set(services, rt)
  return rt
}

/** Testler için: çalışma zamanını sıfırlar. */
export function resetSearchModel(services: Services): void {
  runtimes.delete(services)
}

export function rememberResponse(rt: ModelRuntime, requestId: string, r: ServedResponse): void {
  const m = rt.responses
  m.delete(requestId)
  m.set(requestId, r)
  for (const [id, v] of m) {
    if (m.size <= RESPONSE_MEMO_SIZE && r.at - v.at <= RESPONSE_MEMO_TTL_MS) break
    m.delete(id)
  }
}

export function recallResponse(rt: ModelRuntime, requestId: string, now: number): ServedResponse | null {
  const r = rt.responses.get(requestId)
  if (!r) return null
  if (now - r.at > RESPONSE_MEMO_TTL_MS) {
    rt.responses.delete(requestId)
    return null
  }
  return r
}
