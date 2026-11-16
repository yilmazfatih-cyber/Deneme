// Yönlendirici gösterimi: hash kipi, yükleyiciler (yapay gecikmeli, iptal edilebilir), koruma, iç içe rotalar,
// düz DOM görünümleri ve kaydırma konumu. Geçişten sonra odak sayfa başlığına taşınır (ekran okuyucu yeni
// sayfayı duyurur).
// Genişletme: yeni sayfa = `routes`'a { path, name } + `views`'a aynı adla bir görünüm işlevi.
import {
  createHashHistory,
  createRouter,
  interceptLinks,
  renderRoutes,
  windowScroll,
  type RouteDef,
  type View,
} from '../../src/yonlendirici/index.ts'
import { metin } from '../metin.ts'

const users = [
  { id: '1', ad: 'Ayşe Yılmaz', sehir: 'İzmir' },
  { id: '2', ad: 'Ali Işık', sehir: 'Iğdır' },
  { id: '3', ad: 'Zeynep Çelik', sehir: 'Şanlıurfa' },
]
let loggedIn = false

/** Ağ isteği taklidi: gecikmeli yanıt; yeni geçiş başlarsa iptal edilir. */
function fakeFetch<T>(value: () => T, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        resolve(value())
      } catch (error) {
        reject(error as Error)
      }
    }, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('İptal edildi', 'AbortError'))
    })
  })
}

const routes: RouteDef[] = [
  { path: '/', name: 'ana' },
  { path: '/kullanicilar', name: 'kullanicilar', loader: ({ signal }) => fakeFetch(() => users, 300, signal) },
  {
    path: '/kullanici/:id',
    name: 'kullanici',
    loader: ({ params, signal }) =>
      fakeFetch(
        () => {
          const user = users.find((u) => u.id === params.id)
          if (!user) throw new Error(`${params.id ?? ''} numaralı kullanıcı yok`)
          return user
        },
        400,
        signal,
      ),
  },
  {
    path: '/ayarlar',
    name: 'ayarlar',
    children: [
      { path: '', name: 'ayarlar-ozet' },
      { path: 'profil', name: 'profil' },
      { path: 'bildirim', name: 'bildirim' },
    ],
  },
  { path: '/yonetim', name: 'yonetim', guard: () => (loggedIn ? true : '/giris') },
  { path: '/giris', name: 'giris' },
  { path: '*', name: 'bulunamadi' },
]

const el = (tag: string, text?: string, attrs: Record<string, string> = {}) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
const page = (title: string, ...children: Node[]) => {
  const wrap = el('div', undefined, { class: 'duzen' })
  wrap.append(el('h2', title, { tabindex: '-1' }), ...children)
  return wrap
}

const views: Record<string, View> = {
  ana: () => page('Ana sayfa', el('p', 'Yukarıdaki bağlantılarla gezinin; tarayıcının geri düğmesi de çalışır.')),
  kullanicilar: ({ data }) => {
    const list = el('ul')
    for (const u of data as typeof users) {
      const item = el('li')
      item.append(el('a', u.ad, { href: `#/kullanici/${u.id}` }))
      list.append(item)
    }
    return page('Kullanıcılar', list)
  },
  kullanici: ({ data, params }) => {
    const user = data as (typeof users)[number] | undefined
    return page(user ? user.ad : `Kullanıcı ${params.id ?? ''}`, el('p', user ? `Şehir: ${user.sehir}` : ''))
  },
  ayarlar: ({ outlet }) => {
    const menu = el('nav', undefined, { class: 'alt-menu', 'aria-label': 'Ayarlar' })
    menu.append(el('a', 'Profil', { href: '#/ayarlar/profil' }), el('a', 'Bildirimler', { href: '#/ayarlar/bildirim' }))
    const wrap = page('Ayarlar', menu)
    if (outlet) wrap.append(outlet)
    return wrap
  },
  'ayarlar-ozet': () => el('p', 'Soldaki bağlantılardan bir ayar seçin.'),
  profil: () => el('p', 'Profil: iç içe rota. Üst düzen (Ayarlar) aynı kalır, yalnız bu bölüm değişir.'),
  bildirim: () => el('p', 'Bildirim ayarları: bu da iç içe bir rota.'),
  yonetim: () => page('Yönetim', el('p', 'Korumalı sayfa: buraya yalnız giriş yapınca gelinir.')),
  giris: () => page('Giriş', el('p', metin.yonlendirici.girisGerekli)),
}
const notFound: View = () => page('Bulunamadı', el('p', metin.yonlendirici.bulunamadi))

const router = createRouter({ routes, history: createHashHistory(), scroll: windowScroll() })
const outlet = document.getElementById('sayfa') as HTMLElement
const status = document.getElementById('durum') as HTMLElement
let firstRender = true

router.subscribe((state) => {
  status.textContent = state.status === 'loading' ? metin.yonlendirici.yukleniyor(state.pending ?? '') : ''
  if (state.status === 'loading') return
  const content =
    state.error !== undefined
      ? page('Hata', el('p', metin.yonlendirici.yuklemeHatasi((state.error as Error).message), { class: 'hata-metni' }))
      : state.matches.length === 0 || state.matches.at(-1)?.route.name === 'bulunamadi'
        ? notFound({ state, params: {}, data: undefined, outlet: null })
        : renderRoutes(state, views, notFound)
  outlet.replaceChildren(content)
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.baglantilar a')) {
    const target = link.getAttribute('href')?.slice(1) ?? '/'
    if (router.isActive(target, target === '/')) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  if (!firstRender) outlet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  firstRender = false
})

const loginButton = document.getElementById('giris') as HTMLButtonElement
loginButton.addEventListener('click', () => {
  loggedIn = !loggedIn
  loginButton.setAttribute('aria-pressed', String(loggedIn))
  loginButton.textContent = loggedIn ? 'Çıkış yap' : 'Giriş yap'
  status.textContent = loggedIn ? metin.yonlendirici.girisYapildi : metin.yonlendirici.cikisYapildi
})

interceptLinks(router)
void router.start()
