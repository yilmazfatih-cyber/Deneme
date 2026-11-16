// Geçmiş (history) soyutlaması: üç kip, tek arayüz.
// - browser: gerçek yollar (`/kullanici/1`), History API (pushState + popstate). Sunucunun her yola index.html
//   döndürmesi gerekir.
// - hash: yol adresin `#` sonrasında (`/#/kullanici/1`); her statik barındırmada yenilemede 404 olmaz.
// - memory: bellekte bir yığın; testler ve Node için.
// Her kayıt bir `key` taşır: kaydırma konumu bu anahtarla saklanıp geri/ileri gidince geri yüklenir.
// Genişletme: yeni kip (ör. sorgu parametresinde yol) `RouterHistory` arayüzünü uygulayan yeni bir işlevdir.

export interface HistoryLocation {
  pathname: string
  search: string
  hash: string
  state: unknown
  key: string
}

export type HistoryAction = 'POP' | 'PUSH' | 'REPLACE'
export type HistoryListener = (location: HistoryLocation, action: HistoryAction) => void

export interface RouterHistory {
  readonly kind: 'browser' | 'hash' | 'memory'
  location(): HistoryLocation
  push(to: string, state?: unknown): void
  replace(to: string, state?: unknown): void
  go(delta: number): void
  /** Yalnız POP (geri/ileri, adres çubuğu) olaylarını bildirir; push/replace'i çağıran zaten bilir. */
  listen(listener: HistoryListener): () => void
  createHref(to: string): string
}

/** `/a?b=1#c` → parçalar. Göreli adresler `/` köküne göre çözülür. */
export function parsePath(to: string): { pathname: string; search: string; hash: string } {
  const url = new URL(to, 'http://yer.tutucu/')
  return { pathname: url.pathname, search: url.search, hash: url.hash }
}

export function locationToString(location: Pick<HistoryLocation, 'pathname' | 'search' | 'hash'>): string {
  return `${location.pathname}${location.search}${location.hash}`
}

function keyFactory(random: () => number): () => string {
  const prefix = Math.floor(random() * 36 ** 6).toString(36)
  let counter = 0
  return () => `${prefix}-${++counter}`
}

type StoredState = { key?: string; usr?: unknown } | null

export function createMemoryHistory(initial = '/', random: () => number = Math.random): RouterHistory {
  const nextKey = keyFactory(random)
  const entries: HistoryLocation[] = [{ ...parsePath(initial), state: undefined, key: nextKey() }]
  let index = 0
  const listeners = new Set<HistoryListener>()
  return {
    kind: 'memory',
    location: () => entries[index] as HistoryLocation,
    push(to, state) {
      entries.splice(index + 1)
      entries.push({ ...parsePath(to), state, key: nextKey() })
      index = entries.length - 1
    },
    replace(to, state) {
      entries[index] = { ...parsePath(to), state, key: nextKey() }
    },
    go(delta) {
      const target = Math.min(Math.max(index + delta, 0), entries.length - 1)
      if (target === index) return
      index = target
      for (const listener of [...listeners]) listener(entries[index] as HistoryLocation, 'POP')
    },
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    createHref: (to) => to,
  }
}

/** Tarayıcı kipleri için ortak gövde: `read` adresi yola çevirir, `toUrl` yolu adrese. */
function createWindowHistory(
  kind: 'browser' | 'hash',
  read: () => string,
  toUrl: (to: string) => string,
  random: () => number,
): RouterHistory {
  const nextKey = keyFactory(random)
  const current = (): HistoryLocation => {
    const stored = window.history.state as StoredState
    return { ...parsePath(read()), state: stored?.usr, key: stored?.key ?? 'ilk' }
  }
  // Bilinen son adres: popstate ve hashchange aynı değişiklik için iki kez gelebilir; ikincisi atlanır.
  // push/replace de bunu günceller — yoksa geri tuşuyla o adrese dönüş "değişmedi" sanılıp kaçırılır.
  let last = locationToString(current())
  return {
    kind,
    location: current,
    push(to, state) {
      window.history.pushState({ key: nextKey(), usr: state }, '', toUrl(to))
      last = locationToString(current())
    },
    replace(to, state) {
      window.history.replaceState({ key: nextKey(), usr: state }, '', toUrl(to))
      last = locationToString(current())
    },
    go: (delta) => window.history.go(delta),
    listen(listener) {
      last = locationToString(current())
      const onChange = () => {
        const location = current()
        const text = locationToString(location)
        if (text === last) return
        last = text
        listener(location, 'POP')
      }
      window.addEventListener('popstate', onChange)
      if (kind === 'hash') window.addEventListener('hashchange', onChange)
      return () => {
        window.removeEventListener('popstate', onChange)
        window.removeEventListener('hashchange', onChange)
      }
    },
    createHref: toUrl,
  }
}

/** History API kipi. `base`: uygulama alt klasörde yayınlanıyorsa (ör. `/uygulamam`). */
export function createBrowserHistory(base = '', random: () => number = Math.random): RouterHistory {
  const prefix = base.replace(/\/+$/, '')
  return createWindowHistory(
    'browser',
    () => {
      const { pathname, search, hash } = window.location
      const inside = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) || '/' : pathname
      return `${inside}${search}${hash}`
    },
    (to) => `${prefix}${to}`,
    random,
  )
}

/** Hash kipi: yol `#` işaretinden sonra durur (`#/kullanici/1`). */
export function createHashHistory(random: () => number = Math.random): RouterHistory {
  return createWindowHistory(
    'hash',
    () => {
      const raw = window.location.hash.slice(1)
      return raw.startsWith('/') ? raw : `/${raw}`
    },
    (to) => `#${to}`,
    random,
  )
}
