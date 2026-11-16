import { describe, expect, it, vi } from 'vitest'
import { computed } from '../../src/sinyal/index.ts'
import {
  createMemoryHistory,
  createRouter,
  routerSignal,
  type RouteDef,
  type ScrollAdapter,
} from '../../src/yonlendirici/index.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function fakeScroll() {
  const log: string[] = []
  let y = 0
  const adapter: ScrollAdapter = {
    read: () => ({ x: 0, y }),
    restore: (p) => {
      y = p.y
      log.push(`restore ${p.y}`)
    },
    toHash: (id) => log.push(`hash ${id}`),
  }
  return { adapter, log, setY: (v: number) => (y = v) }
}

describe('yönlendirici', () => {
  it('geçiş yapar, geçmişe yazar; geri gelince kaydırmayı geri yükler', async () => {
    const scroll = fakeScroll()
    const history = createMemoryHistory('/')
    const router = createRouter({
      routes: [
        { path: '/', name: 'ana' },
        { path: '/hakkinda', name: 'hakkinda' },
      ],
      history,
      scroll: scroll.adapter,
    })
    await router.start()
    expect(router.state.matches[0]?.route.name).toBe('ana')
    scroll.setY(500)
    expect(await router.navigate('/hakkinda#ekip')).toBe('done')
    expect(router.state.location.pathname).toBe('/hakkinda')
    expect(scroll.log).toEqual(['hash ekip'])
    history.go(-1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(scroll.log).toEqual(['hash ekip', 'restore 500'])
    expect(router.isActive('/')).toBe(true)
    router.stop()
  })

  it('koruma yönlendirir ya da iptal eder; yönlendirme döngüsünü durdurur', async () => {
    let loggedIn = false
    const routes: RouteDef[] = [
      { path: '/', name: 'ana' },
      { path: '/giris', name: 'giris' },
      { path: '/yonetim', name: 'yonetim', guard: () => (loggedIn ? true : '/giris') },
      { path: '/kilitli', guard: () => false },
      { path: '/dongu', guard: () => '/dongu2' },
      { path: '/dongu2', guard: () => '/dongu' },
    ]
    const router = createRouter({ routes })
    await router.start()
    expect(await router.navigate('/yonetim')).toBe('redirected')
    expect(router.state.location.pathname).toBe('/giris')
    loggedIn = true
    expect(await router.navigate('/yonetim')).toBe('done')
    expect(await router.navigate('/kilitli')).toBe('cancelled')
    expect(router.state.location.pathname).toBe('/yonetim')
    await expect(router.navigate('/dongu')).rejects.toThrow(/Yönlendirme döngüsü/)
  })

  it('yarış: sonradan başlayan geçiş kazanır, eskisinin sinyali iptal edilir ve sonucu atılır', async () => {
    const slow = deferred<string>()
    const signals: AbortSignal[] = []
    const router = createRouter({
      routes: [
        { path: '/', name: 'ana' },
        {
          path: '/yavas',
          name: 'yavas',
          loader: ({ signal }) => {
            signals.push(signal)
            return slow.promise
          },
        },
        { path: '/hizli/:id', name: 'hizli', loader: ({ params }) => `hızlı ${params.id}` },
      ],
    })
    await router.start()
    const states: string[] = []
    router.subscribe((s) => states.push(`${s.status}:${s.location.pathname}`))
    const first = router.navigate('/yavas')
    await vi.waitFor(() => expect(signals.length).toBe(1))
    expect(router.state.status).toBe('loading')
    const second = router.navigate('/hizli/9')
    expect(await second).toBe('done')
    slow.resolve('geç kalan')
    expect(await first).toBe('superseded')
    expect(signals[0]?.aborted).toBe(true)
    expect(router.state.location.pathname).toBe('/hizli/9')
    expect(router.state.data.hizli).toBe('hızlı 9')
    expect(states.at(-1)).toBe('idle:/hizli/9')
  })

  it('yükleyici hatası durumda saklanır; bilinmeyen yol boş eşleşme verir', async () => {
    const router = createRouter({
      routes: [
        { path: '/', name: 'ana' },
        {
          path: '/bozuk',
          name: 'bozuk',
          loader: () => Promise.reject(new Error('sunucuya ulaşılamadı')),
        },
      ],
    })
    await router.start()
    expect(await router.navigate('/bozuk')).toBe('error')
    expect((router.state.error as Error).message).toBe('sunucuya ulaşılamadı')
    await router.navigate('/yok')
    expect(router.state.matches).toEqual([])
    expect(router.state.error).toBeUndefined()
  })

  it('adlı rotadan yol üretir; iç içe yükleyiciler paralel çalışır', async () => {
    const started: string[] = []
    const router = createRouter({
      routes: [
        {
          path: '/proje/:pid',
          name: 'proje',
          loader: async ({ params }) => (started.push('proje'), `P${params.pid}`),
          children: [
            {
              path: 'gorev/:gid',
              name: 'gorev',
              loader: async ({ params }) => (started.push('gorev'), `G${params.gid}`),
            },
          ],
        },
      ],
    })
    await router.start()
    const path = router.pathFor('gorev', { pid: '3', gid: '8' })
    expect(path).toBe('/proje/3/gorev/8')
    await router.navigate(path)
    expect(router.state.data).toEqual({ proje: 'P3', gorev: 'G8' })
    expect(started).toEqual(['proje', 'gorev'])
    expect(() => router.pathFor('yok')).toThrow(/"yok" adlı rota yok/)
  })

  it('sinyal köprüsüyle ince taneli hesap yazılır', async () => {
    const router = createRouter({ routes: [{ path: '/k/:id', name: 'k' }] })
    const { state, dispose } = routerSignal(router)
    const id = computed(() => state.value.params.id ?? '-')
    await router.navigate('/k/5')
    expect(id.value).toBe('5')
    dispose()
  })
})
