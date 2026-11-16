// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createContext,
  ErrorBoundary,
  flush,
  h,
  render,
  unmountRoot,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Child,
} from '../../src/sanal_dom/index.ts'

let container: HTMLElement
beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

function Counter(props: { label: string }): Child {
  const [count, setCount] = useState(0)
  return h('button', { 'data-label': props.label, onClick: () => setCount((c) => c + 1) }, `${props.label}: ${count}`)
}

describe('durum', () => {
  it('her bileşen örneğinin durumu ayrıdır', () => {
    render(h('div', null, h(Counter, { label: 'a' }), h(Counter, { label: 'b' })), container)
    const [a, b] = [...container.querySelectorAll('button')]
    a!.click()
    a!.click()
    b!.click()
    flush()
    expect(a!.textContent).toBe('a: 2')
    expect(b!.textContent).toBe('b: 1')
  })

  it('aynı olaydaki çok sayıda setState tek çizimde birleşir (mikro görevde)', async () => {
    let renders = 0
    function Form(): Child {
      const [name, setName] = useState('')
      const [age, setAge] = useState(0)
      renders++
      return h('button', { onClick: () => (setName('Ayşe'), setAge(30), setAge((n) => n + 1)) }, `${name} ${age}`)
    }
    render(h(Form, null), container)
    container.querySelector('button')!.click()
    expect(renders).toBe(1)
    await Promise.resolve()
    expect(renders).toBe(2)
    expect(container.textContent).toBe('Ayşe 31')
  })

  it('useReducer ve useRef', () => {
    function Steps(): Child {
      const [n, dispatch] = useReducer((s: number, a: 'art' | 'azalt') => (a === 'art' ? s + 1 : s - 1), 5)
      const renders = useRef(0)
      renders.current++
      return h('p', { onClick: () => dispatch('art') }, `${n}/${renders.current}`)
    }
    render(h(Steps, null), container)
    container.querySelector('p')!.click()
    flush()
    expect(container.textContent).toBe('6/2')
  })
})

describe('etkiler', () => {
  it('sıra: önce çocuk etkileri; güncellemede tüm temizlikler yenilerden önce; sökmede temizlik', () => {
    const log: string[] = []
    function Child(props: { n: number }): Child {
      useEffect(() => {
        log.push(`çocuk etki ${props.n}`)
        return () => log.push(`çocuk temizlik ${props.n}`)
      })
      return h('i', null, String(props.n))
    }
    function Parent(props: { n: number }): Child {
      useEffect(() => {
        log.push(`üst etki ${props.n}`)
        return () => log.push(`üst temizlik ${props.n}`)
      }, [props.n])
      return h('div', null, h(Child, { n: props.n }))
    }
    render(h(Parent, { n: 1 }), container)
    expect(log).toEqual(['çocuk etki 1', 'üst etki 1'])
    log.length = 0
    render(h(Parent, { n: 2 }), container)
    expect(log).toEqual(['çocuk temizlik 1', 'üst temizlik 1', 'çocuk etki 2', 'üst etki 2'])
    log.length = 0
    render(h(Parent, { n: 2 }), container)
    expect(log).toEqual(['çocuk temizlik 2', 'çocuk etki 2'])
    log.length = 0
    unmountRoot(container)
    expect(log).toEqual(['çocuk temizlik 2', 'üst temizlik 2'])
  })

  it('useMemo ve useCallback yalnız bağımlılık değişince yenilenir', () => {
    let computeCount = 0
    const callbacks = new Set<unknown>()
    function View(props: { a: number; b: number }): Child {
      const square = useMemo(() => (computeCount++, props.a * props.a), [props.a])
      const onClick = useCallback(() => props.a, [props.a])
      callbacks.add(onClick)
      return h('p', null, String(square))
    }
    render(h(View, { a: 3, b: 1 }), container)
    render(h(View, { a: 3, b: 2 }), container)
    expect(computeCount).toBe(1)
    expect(callbacks.size).toBe(1)
    render(h(View, { a: 4, b: 2 }), container)
    expect(computeCount).toBe(2)
    expect(callbacks.size).toBe(2)
    expect(container.textContent).toBe('16')
  })

  it('etkiden yapılan durum değişikliği aynı boşaltmada çizilir', () => {
    function Loader(): Child {
      const [text, setText] = useState('yükleniyor')
      useEffect(() => setText('hazır'), [])
      return h('p', null, text)
    }
    render(h(Loader, null), container)
    expect(container.textContent).toBe('hazır')
  })
})

describe('bağlam (context)', () => {
  it('en yakın sağlayıcının değerini verir; sağlayıcı yoksa varsayılanı', () => {
    const Theme = createContext('açık')
    function Label(): Child {
      return h('span', null, useContext(Theme))
    }
    render(
      h('div', null, h(Label, null), h(Theme.Provider, { value: 'koyu' }, h('b', null, h(Label, null)))),
      container,
    )
    expect(container.textContent).toBe('açıkkoyu')
    render(
      h('div', null, h(Label, null), h(Theme.Provider, { value: 'mavi' }, h('b', null, h(Label, null)))),
      container,
    )
    expect(container.textContent).toBe('açıkmavi')
  })
})

describe('hata sınırı ve kanca kuralları', () => {
  function Bomb(props: { explode: boolean }): Child {
    if (props.explode) throw new Error('patladı')
    return h('span', null, 'sağlam')
  }

  it('çizim hatasında yedek görünümü çizer; reset yeniden dener', () => {
    let reset = () => {}
    const app = (explode: boolean) =>
      h(ErrorBoundary, {
        fallback: (error: unknown, retry: () => void) => {
          reset = retry
          return h('p', { role: 'alert' }, `Hata: ${(error as Error).message}`)
        },
        children: h(Bomb, { explode }),
      })
    render(app(true), container)
    expect(container.textContent).toBe('Hata: patladı')
    render(app(false), container)
    reset()
    flush()
    expect(container.textContent).toBe('sağlam')
  })

  it('etkideki hatayı da yakalar; sınır yoksa render hatayı atar', () => {
    function BadEffect(): Child {
      useEffect(() => {
        throw new Error('etki hatası')
      }, [])
      return h('span', null, 'x')
    }
    render(
      h(ErrorBoundary, { fallback: (e: unknown) => (e as Error).message, children: h(BadEffect, null) }),
      container,
    )
    expect(container.textContent).toBe('etki hatası')
    const other = document.createElement('div')
    expect(() => render(h(Bomb, { explode: true }), other)).toThrow('patladı')
  })

  it('koşullu kanca kullanımını açıklayıcı hatayla durdurur', () => {
    function Bad(props: { flag: boolean }): Child {
      if (props.flag) useState(1)
      useRef(0)
      return null
    }
    render(h(Bad, { flag: false }), container)
    expect(() => render(h(Bad, { flag: true }), container)).toThrow(/Kanca sırası değişti/)
    expect(() => useState(0)).toThrow(/yalnız bir bileşenin gövdesinde/)
  })
})
