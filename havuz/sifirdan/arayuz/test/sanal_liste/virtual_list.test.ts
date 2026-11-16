// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { VirtualList } from '../../src/sanal_liste/index.ts'

describe('VirtualList (DOM)', () => {
  it("10.000 öğeden yalnız birkaç düzinesini DOM'a koyar; konum bilgisi erişilebilir", () => {
    const container = document.createElement('div')
    document.body.append(container)
    const list = new VirtualList(container, {
      count: 10_000,
      estimate: 40,
      label: 'Mesajlar',
      render: (i) => Object.assign(document.createElement('div'), { textContent: `Mesaj ${i + 1}` }),
    })
    expect(list.renderedCount).toBeLessThan(40)
    expect(container.getAttribute('role')).toBe('region')
    expect(container.tabIndex).toBe(0)
    list.scrollToIndex(4999)
    const items = [...container.querySelectorAll('[role="listitem"]')]
    expect(items.some((el) => el.textContent === 'Mesaj 5000')).toBe(true)
    const item = items.find((el) => el.textContent === 'Mesaj 5000')!
    expect([item.getAttribute('aria-posinset'), item.getAttribute('aria-setsize')]).toEqual(['5000', '10000'])
    expect(list.renderedCount).toBeLessThan(40)
    list.destroy()
    expect(container.children.length).toBe(0)
  })
})
