// Fark alma ve yamalama: yeni VNode ağacını yerleşik ağaçla karşılaştırıp DOM'u en az işlemle günceller.
// - Tür ya da anahtar değiştiyse düğüm baştan kurulur (eski yerine).
// - Çocuk listeleri anahtarla (key) eşleştirilir; yerinde kalabilecek en uzun artan alt dizi (LIS) bulunur ve
//   yalnız onun dışındakiler taşınır. Böylece "sona ekle" ya da "başa al" gibi işlemler tek taşımayla biter.
// - Bileşenler component.ts ile çizilir; etkileri kökün kuyruğuna alt-üst sırasıyla (önce çocuklar) eklenir.
// Genişletme: yeni bir VNode türü için `mount`, `patch` ve `teardown` işlevlerine birer dal ekleyin.
import { queueEffects, renderInstance } from './component.ts'
import { createInstance, type Instance } from './instance.ts'
import { collectDom, domStats, firstDom, insertDom, removeDom, type Mounted, type MountedComponent } from './mounted.ts'
import { applyRef, setProps } from './props.ts'
import type { Root } from './root.ts'
import { assertUniqueKeys, FRAGMENT, TEXT, type Key, type VNode } from './vnode.ts'

export const SVG_NS = 'http://www.w3.org/2000/svg'

export interface Ctx {
  root: Root
  parentInstance: Instance | undefined
  svg: boolean
}

export function mount(vnode: VNode, ctx: Ctx): Mounted {
  domStats.creations++
  if (vnode.type === TEXT) return { kind: 'text', vnode, dom: document.createTextNode(vnode.text) }
  if (vnode.type === FRAGMENT) {
    assertUniqueKeys(vnode.children)
    const children = vnode.children.map((child) => mount(child, ctx))
    return {
      kind: 'fragment',
      vnode,
      start: document.createTextNode(''),
      end: document.createTextNode(''),
      children,
      svg: ctx.svg,
    }
  }
  if (typeof vnode.type === 'function') return mountComponent(vnode, ctx)
  const tag = vnode.type
  const svg = ctx.svg || tag === 'svg'
  const dom = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  setProps(dom, vnode.props, {}, svg, ctx.root)
  const childCtx = { ...ctx, svg: svg && tag !== 'foreignObject' }
  assertUniqueKeys(vnode.children)
  const children = vnode.children.map((child) => mount(child, childCtx))
  for (const child of children) for (const node of collectDom(child)) dom.appendChild(node)
  applyRef(vnode.props.ref, dom)
  return { kind: 'element', vnode, dom, children, svg }
}

function mountComponent(vnode: VNode, ctx: Ctx): MountedComponent {
  const instance = createInstance(vnode, ctx.parentInstance, ctx.root)
  const placeholder: Mounted = { kind: 'text', vnode, dom: document.createTextNode('') }
  const node: MountedComponent = { kind: 'component', vnode, instance, child: placeholder, svg: ctx.svg }
  instance.mounted = node
  const rendered = renderInstance(instance)
  node.child = mount(rendered, { ...ctx, parentInstance: instance })
  queueEffects(instance)
  return node
}

function sameIdentity(a: VNode, b: VNode): boolean {
  return a.type === b.type && a.key === b.key
}

/** Eski düğümü yeni tarife getirir; gerekirse yenisini kurup eskisinin yerine koyar. Dönen düğüm kullanılmalıdır. */
export function patch(old: Mounted, vnode: VNode, ctx: Ctx): Mounted {
  if (!sameIdentity(old.vnode, vnode)) {
    const fresh = mount(vnode, ctx)
    const anchor = firstDom(old)
    const parent = anchor.parentNode
    if (parent) insertDom(fresh, parent, anchor)
    unmount(old)
    return fresh
  }
  switch (old.kind) {
    case 'text':
      if (old.vnode.text !== vnode.text) old.dom.data = vnode.text
      break
    case 'element': {
      setProps(old.dom, vnode.props, old.vnode.props, old.svg, ctx.root)
      const childCtx = { ...ctx, svg: old.svg && vnode.type !== 'foreignObject' }
      old.children = reconcileChildren(old.dom, old.children, vnode.children, null, childCtx)
      if (old.vnode.props.ref !== vnode.props.ref) {
        applyRef(old.vnode.props.ref, null)
        applyRef(vnode.props.ref, old.dom)
      }
      break
    }
    case 'fragment': {
      const parent = old.end.parentNode
      if (parent) old.children = reconcileChildren(parent, old.children, vnode.children, old.end, ctx)
      break
    }
    case 'component':
      old.instance.vnode = vnode
      old.vnode = vnode
      rerenderComponent(old)
      return old
  }
  old.vnode = vnode
  return old
}

/** Bileşeni (yalnız onu ve altını) yeniden çizer: zamanlayıcı ve üst yamalama bunu kullanır. */
export function rerenderComponent(node: MountedComponent): void {
  const instance = node.instance
  const rendered = renderInstance(instance)
  node.child = patch(node.child, rendered, { root: instance.root, parentInstance: instance, svg: node.svg })
  queueEffects(instance)
}

/**
 * Çocuk listesini uzlaştırır. Adımlar: (1) anahtarlı olanları anahtarla, anahtarsızları sırayla eşleştir;
 * (2) eşi olmayan eskileri kaldır; (3) eşleşenleri yamala, yenileri kur; (4) sağdan sola yürüyerek LIS dışındaki
 * ve yeni düğümleri bir sağdakinin önüne yerleştir.
 */
export function reconcileChildren(
  parent: Node,
  oldChildren: Mounted[],
  next: readonly VNode[],
  end: Node | null,
  ctx: Ctx,
): Mounted[] {
  const byKey = new Map<Key, number>()
  const unkeyed: number[] = []
  oldChildren.forEach((child, i) => {
    if (child.vnode.key === undefined) unkeyed.push(i)
    else byKey.set(child.vnode.key, i)
  })
  assertUniqueKeys(next)
  const oldIndexOf = next.map(() => -1)
  const used = oldChildren.map(() => false)
  let unkeyedCursor = 0
  next.forEach((vnode, i) => {
    const match = vnode.key === undefined ? unkeyed[unkeyedCursor++] : byKey.get(vnode.key)
    if (match !== undefined && !used[match]) {
      used[match] = true
      oldIndexOf[i] = match
    }
  })
  oldChildren.forEach((child, i) => {
    if (!used[i]) unmount(child)
  })
  const result = next.map((vnode, i) => {
    const oldIndex = oldIndexOf[i] ?? -1
    const old = oldIndex >= 0 ? oldChildren[oldIndex] : undefined
    return old ? patch(old, vnode, ctx) : mount(vnode, ctx)
  })
  const stay = longestIncreasingSubsequence(oldIndexOf)
  let anchor: Node | null = end
  for (let i = result.length - 1; i >= 0; i--) {
    const node = result[i] as Mounted
    if (!stay.has(i)) insertDom(node, parent, anchor)
    anchor = firstDom(node)
  }
  return result
}

/** Değerleri artan sırada olan en uzun alt dizinin konumları (-1'ler yok sayılır). O(n log n). */
export function longestIncreasingSubsequence(values: readonly number[]): Set<number> {
  const tails: number[] = []
  const previous: number[] = values.map(() => -1)
  values.forEach((value, i) => {
    if (value < 0) return
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((values[tails[mid] as number] as number) < value) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) previous[i] = tails[lo - 1] as number
    tails[lo] = i
  })
  const keep = new Set<number>()
  let index = tails.length > 0 ? (tails[tails.length - 1] as number) : -1
  while (index >= 0) {
    keep.add(index)
    index = previous[index] as number
  }
  return keep
}

/** Düğümü söker: önce çocukların, sonra kendi etkilerini temizler; ref'leri boşaltır; DOM'dan kaldırır. */
export function unmount(node: Mounted): void {
  teardown(node)
  removeDom(node)
}

function teardown(node: Mounted): void {
  switch (node.kind) {
    case 'text':
      return
    case 'element':
      for (const child of node.children) teardown(child)
      applyRef(node.vnode.props.ref, null)
      return
    case 'fragment':
      for (const child of node.children) teardown(child)
      return
    case 'component':
      teardown(node.child)
      cleanupInstance(node.instance)
  }
}

function cleanupInstance(instance: Instance): void {
  instance.unmounted = true
  for (const hook of instance.hooks) {
    if (hook.kind !== 'effect' || !hook.cleanup) continue
    const cleanup = hook.cleanup
    hook.cleanup = undefined
    cleanup()
  }
}
