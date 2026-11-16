// Bağlantı yakalama: sayfadaki `<a href>` tıklamalarını dinler; aynı kökenli, sol tık, değiştirici tuşsuz,
// `target`/`download` içermeyen bağlantılarda sayfa yenilemek yerine yönlendiriciyle geçiş yapar.
// Hash kipinde bağlantılar `#/yol` biçimindedir; `#bolum` gibi sayfa içi çapalar tarayıcıya bırakılır.
// `data-router-ignore` özniteliği olan bağlantılara dokunulmaz.
// Genişletme: "üzerine gelince yükleyiciyi önceden çalıştır" (prefetch) için `pointerenter` dinleyicisi ekleyin.
import type { Router } from './router.ts'

/** Bağlantının yönlendiricide karşılığı olan yolu; yakalanmaması gerekiyorsa undefined. */
export function routeFromAnchor(anchor: HTMLAnchorElement, router: Router, current: Location): string | undefined {
  if (anchor.hasAttribute('download') || anchor.hasAttribute('data-router-ignore')) return undefined
  if (anchor.target && anchor.target !== '_self') return undefined
  const url = new URL(anchor.href, current.href)
  if (url.origin !== current.origin) return undefined
  if (router.history.kind === 'hash') return url.hash.startsWith('#/') ? url.hash.slice(1) : undefined
  return `${url.pathname}${url.search}${url.hash}`
}

/** Belgedeki bağlantı tıklamalarını yönlendiriciye bağlar; dönen işlev dinlemeyi bırakır. */
export function interceptLinks(router: Router, root: Document | HTMLElement = document): () => void {
  const onClick = (event: Event) => {
    const mouse = event as MouseEvent
    if (mouse.defaultPrevented || mouse.button !== 0) return
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return
    const anchor = (mouse.target as Element | null)?.closest?.('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) return
    const to = routeFromAnchor(anchor, router, window.location)
    if (to === undefined) return
    mouse.preventDefault()
    void router.navigate(to)
  }
  root.addEventListener('click', onClick)
  return () => root.removeEventListener('click', onClick)
}
