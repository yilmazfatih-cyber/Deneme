import { describe, expect, it } from 'vitest'
import {
  combineReducers,
  createSelector,
  createStore,
  getIn,
  logger,
  removeIn,
  setIn,
  thunk,
  updateIn,
  type Action,
  type Reducer,
} from '../../src/depo/index.ts'

type Todo = { id: number; text: string; done: boolean }
const todos: Reducer<Todo[]> = (state = [], action) => {
  switch (action.type) {
    case 'ekle':
      return [...state, action.payload as Todo]
    case 'tamamla':
      return state.map((t) => (t.id === action.payload ? { ...t, done: true } : t))
    default:
      return state
  }
}
const filter: Reducer<string> = (state = 'hepsi', action) => (action.type === 'filtre' ? String(action.payload) : state)
const root = combineReducers({ todos, filter })

describe('createStore', () => {
  it('indirgeyiciyle durumu günceller ve aboneleri çağırır; abonelik bitirilebilir', () => {
    const store = createStore(root)
    expect(store.getState()).toEqual({ todos: [], filter: 'hepsi' })
    let calls = 0
    const stop = store.subscribe(() => calls++)
    store.dispatch({ type: 'ekle', payload: { id: 1, text: 'süt al', done: false } })
    stop()
    store.dispatch({ type: 'filtre', payload: 'yapılacak' })
    expect(calls).toBe(1)
    expect(store.getState().filter).toBe('yapılacak')
  })

  it('combineReducers değişmeyen dilimin ve kökün referansını korur', () => {
    const store = createStore(root)
    const before = store.getState()
    store.dispatch({ type: 'bilinmeyen' })
    expect(store.getState()).toBe(before)
    store.dispatch({ type: 'filtre', payload: 'biten' })
    expect(store.getState()).not.toBe(before)
    expect(store.getState().todos).toBe(before.todos)
  })

  it("geçersiz eylemi ve indirgeyici içinden dispatch'i açıklayıcı hatayla reddeder", () => {
    const store = createStore(root)
    expect(() => store.dispatch('ekle' as unknown as Action)).toThrow(/`type` alanı olan düz bir nesne/)
    const bad = createStore<number>((state = 0, action) => {
      if (action.type === 'kötü') bad.dispatch({ type: 'iç' })
      return state
    })
    expect(() => bad.dispatch({ type: 'kötü' })).toThrow(/İndirgeyici çalışırken dispatch/)
  })

  it('freeze seçeneği yerinde değiştirmeyi hemen yakalar', () => {
    const store = createStore(root, undefined, { freeze: true })
    store.dispatch({ type: 'ekle', payload: { id: 1, text: 'x', done: false } })
    expect(() => {
      ;(store.getState().todos[0] as Todo).done = true
    }).toThrow(TypeError)
  })
})

describe('ara katmanlar', () => {
  it('thunk eşzamansız akışı, logger önce/sonra durumunu verir; sıra korunur', async () => {
    const log: string[] = []
    const store = createStore(root, undefined, {
      middleware: [
        thunk(),
        logger(({ action, before, after }) =>
          log.push(`${(action as Action).type}:${before.todos.length}→${after.todos.length}`),
        ),
      ],
    })
    const addLater = (text: string) => async (dispatch: (a: Action) => void) => {
      await Promise.resolve()
      dispatch({ type: 'ekle', payload: { id: 2, text, done: false } })
    }
    await store.dispatch(addLater('ekmek') as unknown as Action)
    expect(log).toEqual(['ekle:0→1'])
  })
})

describe('seçiciler', () => {
  it('yalnız girdi değişince yeniden hesaplar', () => {
    const store = createStore(root)
    const remaining = createSelector(
      [(s: ReturnType<typeof root>) => s.todos],
      (list) => list.filter((t) => !t.done).length,
    )
    store.dispatch({ type: 'ekle', payload: { id: 1, text: 'a', done: false } })
    expect(remaining(store.getState())).toBe(1)
    store.dispatch({ type: 'filtre', payload: 'biten' })
    expect(remaining(store.getState())).toBe(1)
    expect(remaining.recomputations()).toBe(1)
    store.dispatch({ type: 'tamamla', payload: 1 })
    expect(remaining(store.getState())).toBe(0)
    expect(remaining.recomputations()).toBe(2)
  })
})

describe('değişmezlik yardımcıları', () => {
  const state = { kullanici: { ad: 'Ayşe', adres: { il: 'İzmir' } }, ayarlar: { tema: 'koyu' }, liste: [1, 2, 3] }

  it('setIn yalnız yol üzerindekileri kopyalar; aynı değer aynı nesneyi döndürür', () => {
    const next = setIn(state, ['kullanici', 'adres', 'il'], 'Iğdır')
    expect(next.kullanici.adres.il).toBe('Iğdır')
    expect(state.kullanici.adres.il).toBe('İzmir')
    expect(next.ayarlar).toBe(state.ayarlar)
    expect(next.liste).toBe(state.liste)
    expect(setIn(state, ['ayarlar', 'tema'], 'koyu')).toBe(state)
    expect(setIn({}, ['a', 0, 'b'], 1)).toEqual({ a: [{ b: 1 }] })
  })

  it('updateIn, removeIn, getIn', () => {
    expect(updateIn(state, ['liste', 1], (n) => (n as number) * 10).liste).toEqual([1, 20, 3])
    const removed = removeIn(state, ['kullanici', 'adres'])
    expect(removed.kullanici).toEqual({ ad: 'Ayşe' })
    expect(removeIn(state, ['liste', 0]).liste).toEqual([2, 3])
    expect(removeIn(state, ['yok', 'alan'])).toBe(state)
    expect(getIn(state, ['kullanici', 'adres', 'il'])).toBe('İzmir')
  })
})
