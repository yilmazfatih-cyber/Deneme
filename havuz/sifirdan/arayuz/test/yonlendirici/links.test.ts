// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBrowserHistory,
  createRouter,
  interceptLinks,
  renderRoutes,
  type Router,
} from '../../src/yonlendirici/index.ts'

let router: Router
let stop: () => void

beforeEach(async () => {
  window.history.replaceState(null, '', '/')
  router = createRouter({
    routes: [
      { path: '/', name: 'ana' },
      {
        path: '/kullanici/:id',
        name: 'kullanici',
        children: [{ path: 'ayrinti', name: 'ayrinti' }],
      },
    ],
    history: createBrowserHistory(),
  })
  await router.start()
  stop = interceptLinks(router)
  document.body.innerHTML = `
    <a id="ic" href="/kullanici/3">iç</a>
    <a id="dis" href="https://ornek.com/x">dış</a>
    <a id="yeni" href="/kullanici/4" target="_blank">yeni sekme</a>
    <a id="indir" href="/rapor.pdf" download>indir</a>`
})

afterEach(() => {
  stop()
  router.stop()
})

/** Tıklar; yönlendiricinin kararını (defaultPrevented) okur, sonra jsdom'un gerçek gezinmeye kalkmasını önler. */
const click = (id: string, init: MouseEventInit = {}) => {
  let prevented = false
  const after = (e: Event) => {
    prevented = e.defaultPrevented
    e.preventDefault()
  }
  window.addEventListener('click', after, { once: true })
  document
    .getElementById(id)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))
  return { defaultPrevented: prevented }
}

describe('bağlantı yakalama', () => {
  it('aynı kökenli sol tıkı yönlendiriciye verir', async () => {
    const event = click('ic')
    expect(event.defaultPrevented).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(window.location.pathname).toBe('/kullanici/3')
    expect(router.state.params).toEqual({ id: '3' })
  })

  it('dış adrese, yeni sekmeye, indirmeye ve Ctrl+tıka dokunmaz', () => {
    expect(click('dis').defaultPrevented).toBe(false)
    expect(click('yeni').defaultPrevented).toBe(false)
    expect(click('indir').defaultPrevented).toBe(false)
    expect(click('ic', { ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it('iç içe görünümleri düz DOM ile çizer', async () => {
    await router.navigate('/kullanici/5/ayrinti')
    const node = renderRoutes(
      router.state,
      {
        kullanici: ({ params, outlet }) => {
          const section = document.createElement('section')
          section.textContent = `Kullanıcı ${params.id}: `
          if (outlet) section.append(outlet)
          return section
        },
        ayrinti: () => document.createTextNode('ayrıntılar'),
      },
      () => document.createTextNode('bulunamadı'),
    )
    expect(node.textContent).toBe('Kullanıcı 5: ayrıntılar')
  })
})

describe('hash geçmişi', () => {
  it('ileri gidip geri dönünce, push ile gelinmiş adrese de POP bildirilir', async () => {
    const { createHashHistory } = await import('../../src/yonlendirici/index.ts')
    window.history.replaceState(null, '', '/#/a')
    const history = createHashHistory()
    const seen: string[] = []
    const stop = history.listen((location, action) => seen.push(`${action} ${location.pathname}`))
    history.push('/b')
    window.history.back()
    await vi.waitFor(() => expect(seen).toEqual(['POP /a']))
    history.push('/c')
    history.push('/d')
    window.history.back()
    await vi.waitFor(() => expect(seen).toEqual(['POP /a', 'POP /c']))
    stop()
  })
})
