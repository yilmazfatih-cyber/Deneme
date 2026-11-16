// Yerleşik ağaç: her VNode'un DOM'daki karşılığını ve bileşen durumunu tutan değişebilir düğümler.
// Kural: her yerleşik düğüm en az bir DOM düğümüne karşılık gelir. Parça (Fragment) iki boş metin düğümü
// (başlangıç/bitiş çapası) arasına yerleşir; `null` döndüren bileşen boş bir metin düğümü bırakır. Böylece
// "bu düğüm DOM'da nerede başlıyor?" sorusunun her zaman bir yanıtı vardır ve taşıma işlemleri basitleşir.
// Genişletme: yeni bir yerleşik tür eklerseniz `firstDom` ve `collectDom` işlevlerine de bir dal ekleyin.
import type { Instance } from './instance.ts'
import type { VNode } from './vnode.ts'

export type Mounted = MountedText | MountedElement | MountedFragment | MountedComponent

export interface MountedText {
  kind: 'text'
  vnode: VNode
  dom: Text
}

export interface MountedElement {
  kind: 'element'
  vnode: VNode
  dom: Element
  children: Mounted[]
  svg: boolean
}

export interface MountedFragment {
  kind: 'fragment'
  vnode: VNode
  start: Text
  end: Text
  children: Mounted[]
  svg: boolean
}

export interface MountedComponent {
  kind: 'component'
  vnode: VNode
  instance: Instance
  child: Mounted
  /** Bileşen bir <svg> içinde mi? (Çocuk öğeler doğru ad alanında yaratılsın diye.) */
  svg: boolean
}

/** Düğümün DOM'daki ilk düğümü (taşıma ve "şunun önüne ekle" için çapa). */
export function firstDom(node: Mounted): Node {
  switch (node.kind) {
    case 'text':
    case 'element':
      return node.dom
    case 'fragment':
      return node.start
    case 'component':
      return firstDom(node.child)
  }
}

/** Düğüme ait üst düzey DOM düğümlerini sırasıyla toplar. */
export function collectDom(node: Mounted, out: Node[] = []): Node[] {
  switch (node.kind) {
    case 'text':
    case 'element':
      out.push(node.dom)
      break
    case 'fragment':
      out.push(node.start)
      for (const child of node.children) collectDom(child, out)
      out.push(node.end)
      break
    case 'component':
      collectDom(node.child, out)
      break
  }
  return out
}

/** DOM işlem sayaçları: testler "yeniden sıralamada kaç taşıma yapıldı?" sorusunu bununla yanıtlar. */
export const domStats = { inserts: 0, removals: 0, creations: 0 }

export function resetDomStats(): void {
  domStats.inserts = 0
  domStats.removals = 0
  domStats.creations = 0
}

/** Düğümün tüm DOM parçalarını `before`'un önüne (null ise sona) yerleştirir. */
export function insertDom(node: Mounted, parent: Node, before: Node | null): void {
  for (const dom of collectDom(node)) {
    parent.insertBefore(dom, before)
    domStats.inserts++
  }
}

export function removeDom(node: Mounted): void {
  for (const dom of collectDom(node)) {
    dom.parentNode?.removeChild(dom)
    domStats.removals++
  }
}
