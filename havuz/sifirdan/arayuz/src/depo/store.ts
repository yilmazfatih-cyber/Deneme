// Öngörülebilir durum deposu (Redux fikri): durum yalnız `dispatch(eylem)` ile değişir; yeni durumu saf bir
// indirgeyici (reducer) hesaplar: (eskiDurum, eylem) → yeniDurum. Aynı eylem dizisi hep aynı durumu verir;
// bu sayede geri al, zaman yolculuğu, sekmeler arası eşitleme ve kalıcılık "eylemleri yeniden oynatarak" yapılır.
// Ara katmanlar (middleware) dispatch zincirine girer: günlük, eşzamansız işler (thunk), eşitleme.
// Genişletme: yeni bir ara katman middleware.ts'teki örneği kopyalayarak yazılır ve `createStore`'a verilir.
import { deepFreeze } from './immutable.ts'

export interface Action<T extends string = string> {
  type: T
  payload?: unknown
  meta?: { remote?: boolean; [key: string]: unknown }
}

export type Reducer<S, A extends Action = Action> = (state: S | undefined, action: A) => S
export type Dispatch = (action: unknown) => unknown

export interface MiddlewareApi<S> {
  getState(): S
  dispatch: Dispatch
}
export type Middleware<S> = (api: MiddlewareApi<S>) => (next: Dispatch) => Dispatch

export interface Store<S, A extends Action = Action> {
  getState(): S
  dispatch(action: A): unknown
  /** Her dispatch'ten sonra çağrılır; dönen işlev aboneliği bitirir. */
  subscribe(listener: () => void): () => void
  replaceReducer(next: Reducer<S, A>): void
}

export interface StoreOptions<S> {
  middleware?: Middleware<S>[]
  /** Geliştirmede açın: her yeni durum dondurulur; yanlışlıkla yerinde değiştirme hemen hata verir. */
  freeze?: boolean
}

export const INIT_ACTION = { type: '@@depo/BASLAT' } as const

export function isAction(value: unknown): value is Action {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

export function createStore<S, A extends Action = Action>(
  reducer: Reducer<S, A>,
  preloaded?: S,
  options: StoreOptions<S> = {},
): Store<S, A> {
  let currentReducer = reducer
  let reducing = false
  const listeners = new Set<() => void>()
  const settle = (next: S) => (options.freeze ? deepFreeze(next) : next)
  let state = settle(currentReducer(preloaded, INIT_ACTION as unknown as A))

  const baseDispatch: Dispatch = (action) => {
    if (!isAction(action)) {
      throw new Error(
        'Eylem `type` alanı olan düz bir nesne olmalı. İşlev göndermek için `thunk` ara katmanını ekleyin.',
      )
    }
    if (reducing) throw new Error('İndirgeyici çalışırken dispatch çağrılamaz: indirgeyiciler saf olmalı.')
    reducing = true
    try {
      state = settle(currentReducer(state, action as A))
    } finally {
      reducing = false
    }
    for (const listener of [...listeners]) listener()
    return action
  }

  let dispatch: Dispatch = () => {
    throw new Error('Ara katmanlar kurulurken dispatch çağrılamaz.')
  }
  const api: MiddlewareApi<S> = { getState: () => state, dispatch: (action) => dispatch(action) }
  dispatch = (options.middleware ?? []).map((m) => m(api)).reduceRight<Dispatch>((next, m) => m(next), baseDispatch)

  return {
    getState: () => state,
    dispatch: (action) => dispatch(action),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    replaceReducer(next) {
      currentReducer = next
      baseDispatch({ type: '@@depo/INDIRGEYICI_DEGISTI' })
    },
  }
}

/**
 * Dilim indirgeyicilerini tek indirgeyicide birleştirir. Hiçbir dilim değişmediyse aynı nesne döner
 * (yapısal paylaşım: abonelerin `===` ile "değişti mi?" sorusu ucuz kalır).
 */
export function combineReducers<S extends Record<string, unknown>, A extends Action = Action>(reducers: {
  [K in keyof S]: Reducer<S[K], A>
}): Reducer<S, A> {
  const keys = Object.keys(reducers) as (keyof S)[]
  return (state, action) => {
    let changed = state === undefined
    const next = {} as S
    for (const key of keys) {
      const previous = state?.[key]
      const value = reducers[key](previous, action)
      next[key] = value
      if (!Object.is(value, previous)) changed = true
    }
    return changed ? next : (state as S)
  }
}

/** Başka sekmeden gelen tam durum anlık görüntüsünü kabul edebilmek için kök indirgeyiciyi sarar. */
export const REPLACE_STATE = '@@depo/DURUMU_DEGISTIR'
export function replaceable<S, A extends Action = Action>(reducer: Reducer<S, A>): Reducer<S, A> {
  return (state, action) => (action.type === REPLACE_STATE ? (action.payload as S) : reducer(state, action))
}
