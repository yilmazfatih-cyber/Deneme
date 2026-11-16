// Giriş noktası: `render(vnode, kap)` ilk çağrıda ağacı kurar, sonrakilerde yamalar; sonunda bekleyen
// güncellemeleri ve etkileri eşzamanlı işler (böylece testler `render` döner dönmez DOM'u görebilir).
// `unmount(kap)` tüm bileşenleri söker, etkileri temizler ve olay dinleyicilerini kaldırır.
// Genişletme: sunucuda çizim (HTML dizgisi üretme) ayrı bir `renderToString.ts` dosyası olarak yazılabilir.
import { detachRoot } from './events.ts'
import { preserveFocus } from './focus.ts'
import { insertDom } from './mounted.ts'
import { mount, patch, SVG_NS, unmount } from './reconcile.ts'
import { createRoot, type Root } from './root.ts'
import { flushRoot } from './scheduler.ts'
import { normalizeRendered, type Child } from './vnode.ts'

const roots = new WeakMap<Element, Root>()

export function render(child: Child, container: Element): void {
  let root = roots.get(container)
  if (!root) {
    root = createRoot(container)
    roots.set(container, root)
  }
  const vnode = normalizeRendered(child)
  const ctx = { root, parentInstance: undefined, svg: container.namespaceURI === SVG_NS }
  if (root.mounted) {
    const restoreFocus = preserveFocus(container)
    root.mounted = patch(root.mounted, vnode, ctx)
    restoreFocus()
  } else {
    container.textContent = ''
    root.mounted = mount(vnode, ctx)
    insertDom(root.mounted, container, null)
  }
  flushRoot(root)
}

export function unmountRoot(container: Element): void {
  const root = roots.get(container)
  if (!root) return
  if (root.mounted) unmount(root.mounted)
  root.mounted = undefined
  detachRoot(root)
  roots.delete(container)
}
