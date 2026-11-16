// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { domStats, Fragment, h, render, resetDomStats, unmountRoot, type VNode } from '../../src/sanal_dom/index.ts'

let container: HTMLElement
beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

const list = (keys: string[]): VNode =>
  h(
    'ul',
    null,
    keys.map((k) => h('li', { key: k }, k)),
  )
const items = () => [...container.querySelectorAll('li')]
const texts = () => items().map((li) => li.textContent)

describe('h()', () => {
  it('çocukları düzleştirir, boşları atlar, sayıları metne çevirir', () => {
    const v = h('p', { key: 1, id: 'x' }, ['a', null, [false, 2]], undefined, true)
    expect(v.key).toBe(1)
    expect(v.props).toEqual({ id: 'x' })
    expect(v.children.map((c) => c.text)).toEqual(['a', '2'])
  })
})

describe('anahtarlı uzlaştırma', () => {
  it('yeniden sıralamada DOM düğümlerini korur ve yalnız gerekeni taşır', () => {
    render(list(['A', 'B', 'C', 'D', 'E']), container)
    const before = items()
    resetDomStats()
    render(list(['E', 'A', 'B', 'C', 'D']), container)
    expect(texts()).toEqual(['E', 'A', 'B', 'C', 'D'])
    expect(items()).toEqual([before[4], before[0], before[1], before[2], before[3]])
    expect(domStats.inserts).toBe(1)
    expect(domStats.creations).toBe(0)
  })

  it('ters çevirmede n-1 taşıma yapar; eklemede ve silmede yalnız yeni düğüm kurulur', () => {
    render(list(['1', '2', '3', '4']), container)
    resetDomStats()
    render(list(['4', '3', '2', '1']), container)
    expect(texts()).toEqual(['4', '3', '2', '1'])
    expect(domStats.inserts).toBe(3)
    resetDomStats()
    render(list(['4', 'yeni', '2', '1']), container)
    expect(texts()).toEqual(['4', 'yeni', '2', '1'])
    expect(domStats.removals).toBe(1)
    expect(domStats.creations).toBe(2)
  })

  it('giriş alanının değeri ve odağı yer değiştirmede korunur', () => {
    const view = (order: string[]) =>
      h(
        'div',
        null,
        order.map((k) => h('input', { key: k, 'data-k': k })),
      )
    render(view(['a', 'b']), container)
    const input = container.querySelector<HTMLInputElement>('[data-k="b"]')!
    input.value = 'yazılmış'
    input.focus()
    render(view(['b', 'a']), container)
    expect(container.firstElementChild!.firstElementChild).toBe(input)
    expect(input.value).toBe('yazılmış')
    expect(document.activeElement).toBe(input)
  })

  it('aynı key iki kez kullanılırsa açıklayıcı hata verir', () => {
    expect(() => render(list(['x', 'x']), container)).toThrow(/Aynı key iki kez/)
  })

  it('anahtarsız çocuklar konuma göre yamalanır; tür değişince yeniden kurulur', () => {
    render(h('div', null, h('b', null, '1'), h('i', null, '2')), container)
    const bold = container.querySelector('b')
    render(h('div', null, h('b', null, 'bir'), h('span', null, 'iki')), container)
    expect(container.querySelector('b')).toBe(bold)
    expect(container.innerHTML).toBe('<div><b>bir</b><span>iki</span></div>')
  })

  it('parçaları (Fragment) çapalarıyla birlikte taşır', () => {
    const pair = (k: string) => h(Fragment, { key: k }, h('dt', null, k), h('dd', null, `${k}!`))
    const view = (keys: string[]) => h('dl', null, keys.map(pair))
    render(view(['x', 'y', 'z']), container)
    render(view(['z', 'x']), container)
    const dl = container.querySelector('dl')!
    expect([...dl.children].map((el) => el.textContent)).toEqual(['z', 'z!', 'x', 'x!'])
    render(view([]), container)
    expect(dl.children.length).toBe(0)
  })
})

describe('özellikler', () => {
  it('class, style nesnesi, mantıksal öznitelik ve value özelliğini yamalar', () => {
    render(h('input', { class: 'a', style: { color: 'red', marginTop: '4px' }, disabled: true, value: 'x' }), container)
    const input = container.querySelector('input')!
    expect(input.className).toBe('a')
    expect(input.style.color).toBe('red')
    expect(input.hasAttribute('disabled')).toBe(true)
    expect(input.value).toBe('x')
    input.value = 'kullanıcı yazdı'
    render(h('input', { style: { color: 'blue' }, disabled: false, value: 'x' }), container)
    expect(input.hasAttribute('class')).toBe(false)
    expect(input.style.marginTop).toBe('')
    expect(input.style.color).toBe('blue')
    expect(input.hasAttribute('disabled')).toBe(false)
    expect(input.value).toBe('x')
  })

  it('javascript: adreslerini yazmaz', () => {
    render(h('a', { href: ' java\tscript:alert(1)' }, 'tıkla'), container)
    expect(container.querySelector('a')!.hasAttribute('href')).toBe(false)
    render(h('a', { href: '/guvenli' }, 'tıkla'), container)
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/guvenli')
  })

  it('SVG öğelerini doğru ad alanında kurar', () => {
    render(h('svg', { viewBox: '0 0 10 10' }, h('circle', { r: 4 })), container)
    const circle = container.querySelector('circle')!
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 10 10')
  })
})

describe('olay yetkilendirme', () => {
  it('işleyiciler köke tek dinleyiciyle bağlanır; stopPropagation üst işleyiciyi durdurur', () => {
    const log: string[] = []
    let current: EventTarget | null = null
    const view = (stop: boolean) =>
      h(
        'div',
        { onClick: () => log.push('dış') },
        h(
          'button',
          {
            onClick: (e: Event) => {
              current = e.currentTarget
              log.push('iç')
              if (stop) e.stopPropagation()
            },
          },
          h('span', null, 'düğme'),
        ),
      )
    render(view(false), container)
    container.querySelector('span')!.click()
    expect(log).toEqual(['iç', 'dış'])
    expect(current).toBe(container.querySelector('button'))
    render(view(true), container)
    container.querySelector('span')!.click()
    expect(log).toEqual(['iç', 'dış', 'iç'])
  })

  it('onInput "input" olayına bağlanır (Türkçe küçük harf tuzağı yok)', () => {
    const values: string[] = []
    render(h('input', { onInput: (e: Event) => values.push((e.target as HTMLInputElement).value) }), container)
    const input = container.querySelector('input')!
    input.value = 'Iğdır'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(values).toEqual(['Iğdır'])
  })

  it('unmountRoot dinleyicileri kaldırır', () => {
    let clicks = 0
    render(h('button', { onClick: () => clicks++ }, 'x'), container)
    const button = container.querySelector('button')!
    unmountRoot(container)
    container.appendChild(button)
    button.click()
    expect(clicks).toBe(0)
  })
})
