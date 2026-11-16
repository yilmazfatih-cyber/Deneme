import { describe, expect, it } from 'vitest'
import {
  clearHistory,
  createStore,
  jumpTo,
  produce,
  redo,
  timeline,
  undo,
  undoable,
  type Reducer,
} from '../../src/depo/index.ts'

describe('produce', () => {
  const base = {
    gorevler: [
      { id: 1, metin: 'a', bitti: false },
      { id: 2, metin: 'b', bitti: false },
    ],
    etiketler: { ev: true },
    sayac: 0,
  }

  it('dokunulan dalları kopyalar, dokunulmayanları paylaşır', () => {
    const next = produce(base, (d) => {
      d.gorevler[1]!.bitti = true
      d.sayac++
    })
    expect(next.gorevler[1]).toEqual({ id: 2, metin: 'b', bitti: true })
    expect(base.gorevler[1]!.bitti).toBe(false)
    expect(next.gorevler[0]).toBe(base.gorevler[0])
    expect(next.etiketler).toBe(base.etiketler)
    expect(next.sayac).toBe(1)
  })

  it('dizi yöntemleri ve silme çalışır; değişiklik yoksa aynı nesne döner', () => {
    const next = produce(base, (d) => {
      d.gorevler.push({ id: 3, metin: 'c', bitti: false })
      d.gorevler.splice(0, 1)
      delete (d.etiketler as Partial<typeof base.etiketler>).ev
    })
    expect(next.gorevler.map((g) => g.id)).toEqual([2, 3])
    expect(next.etiketler).toEqual({})
    expect(Array.isArray(next.gorevler)).toBe(true)
    expect(
      produce(base, (d) => {
        void d.gorevler[0]!.metin
        d.sayac = 0
      }),
    ).toBe(base)
  })

  it('dışarı sızan taslağa erişim hata verir; yeni değer döndürmek de desteklenir', () => {
    let leaked: typeof base | undefined
    produce(base, (d) => {
      leaked = d
    })
    expect(() => leaked!.sayac).toThrow(TypeError)
    expect(produce(base, () => ({ ...base, sayac: 9 })).sayac).toBe(9)
    expect(() =>
      produce(base, (d) => {
        d.sayac = 5
        return { ...base }
      }),
    ).toThrow(/hem taslağı değiştirdiniz/)
  })
})

describe('undoable', () => {
  const text: Reducer<string> = (state = '', action) =>
    action.type === 'yaz' ? state + String(action.payload) : action.type === 'sil' ? '' : state

  it('geri alır, yineler; yeni eylem geleceği siler', () => {
    const store = createStore(undoable(text))
    store.dispatch({ type: 'yaz', payload: 'a' })
    store.dispatch({ type: 'yaz', payload: 'b' })
    store.dispatch(undo())
    expect(store.getState().present).toBe('a')
    store.dispatch(redo())
    expect(store.getState().present).toBe('ab')
    store.dispatch(undo())
    store.dispatch({ type: 'yaz', payload: 'c' })
    expect(store.getState().future).toEqual([])
    store.dispatch(redo())
    expect(store.getState().present).toBe('ac')
  })

  it('gruplama, sınır ve süzgeç', () => {
    const store = createStore(
      undoable(text, {
        limit: 2,
        groupBy: (a) => (a.type === 'yaz' ? 'yazma' : undefined),
        filter: (a) => a.type !== 'gizli',
      }),
    )
    for (const ch of 'merhaba') store.dispatch({ type: 'yaz', payload: ch })
    expect(store.getState().past).toEqual([''])
    store.dispatch({ type: 'sil' })
    store.dispatch({ type: 'yaz', payload: 'x' })
    store.dispatch({ type: 'yaz', payload: 'y' })
    expect(store.getState().past).toEqual(['merhaba', ''])
    store.dispatch(undo())
    store.dispatch(undo())
    store.dispatch(undo())
    expect(store.getState().present).toBe('merhaba')
  })

  it('zaman yolculuğu: çizelgede herhangi bir ana gider ve geri döner', () => {
    const store = createStore(undoable(text))
    for (const ch of 'abc') store.dispatch({ type: 'yaz', payload: ch })
    expect(timeline(store.getState())).toEqual({ states: ['', 'a', 'ab', 'abc'], index: 3 })
    store.dispatch(jumpTo(1))
    expect(store.getState().present).toBe('a')
    store.dispatch(jumpTo(99))
    expect(store.getState().present).toBe('abc')
    store.dispatch(clearHistory())
    expect(timeline(store.getState())).toEqual({ states: ['abc'], index: 0 })
  })
})
