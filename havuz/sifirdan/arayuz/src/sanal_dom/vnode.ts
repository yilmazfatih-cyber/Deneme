// Sanal düğüm (VNode) tanımı ve `h()` fabrikası. VNode değişmez bir "tarif"tir: ne çizileceğini anlatır,
// DOM düğümü ya da bileşen durumu taşımaz (onlar mounted.ts'teki "yerleşik ağaç"ta durur). Bu ayrım sayesinde
// aynı VNode iki yerde kullanılabilir ve eski/yeni karşılaştırması basitleşir.
// `h(tür, özellikler, ...çocuklar)` imzası klasik JSX dönüşümüyle uyumludur (`jsxFactory: "h"`).
// Genişletme: yeni bir özel tür (ör. Portal) için buraya bir sembol ekleyin ve reconcile.ts'te ele alın.

/** İç tür sembolleri: parça ve metin düğümü. Kullanıcı `Fragment` işlevini kullanır; `h` onu FRAGMENT'e çevirir. */
export const FRAGMENT: unique symbol = Symbol('Fragment')
export const TEXT: unique symbol = Symbol('Text')

export type Key = string | number
export type Child = VNode | string | number | boolean | null | undefined | readonly Child[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bileşen özellikleri her türde olabilir
export type Component<P = any> = (props: P) => Child
export type VNodeType = string | Component | typeof FRAGMENT | typeof TEXT

/**
 * Parça: çocuklarını sarmalayıcı öğe olmadan yan yana çizer (`<>...</>`). TypeScript JSX denetimi için bir
 * işlev bileşeni gibi tanımlıdır; `h()` onu iç FRAGMENT türüne çevirir, bu yüzden gerçekte hiç çağrılmaz.
 */
export function Fragment(props: { children?: Child }): Child {
  return props.children ?? null
}

export interface VNode {
  readonly type: VNodeType
  readonly props: Readonly<Record<string, unknown>>
  readonly key: Key | undefined
  /** Öğe ve parça için normalleştirilmiş çocuklar; bileşende çocuklar `props.children` içindedir. */
  readonly children: readonly VNode[]
  /** Yalnız metin düğümünde dolu. */
  readonly text: string
}

export function isVNode(value: unknown): value is VNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'children' in value && 'text' in value
}

export function textNode(text: string): VNode {
  return { type: TEXT, props: {}, key: undefined, children: [], text }
}

/** İç içe dizileri düzleştirir; null/undefined/true/false atlanır; sayı ve dizgi metin düğümü olur. */
export function normalizeChildren(children: readonly Child[], out: VNode[] = []): VNode[] {
  for (const child of children) {
    if (child === null || child === undefined || typeof child === 'boolean') continue
    if (Array.isArray(child)) normalizeChildren(child as readonly Child[], out)
    else if (typeof child === 'string' || typeof child === 'number') out.push(textNode(String(child)))
    else out.push(child as VNode)
  }
  return out
}

/** Bileşenin döndürdüğü değeri tek bir VNode'a çevirir (boş → boş metin, dizi → parça). */
export function normalizeRendered(result: Child): VNode {
  if (Array.isArray(result))
    return { type: FRAGMENT, props: {}, key: undefined, children: normalizeChildren(result), text: '' }
  const [single] = normalizeChildren([result])
  return single ?? textNode('')
}

/** Kardeşler arasında aynı anahtar iki kez kullanılırsa, eşleştirme bozulmasın diye açıklayıcı hata atar. */
export function assertUniqueKeys(children: readonly VNode[]): void {
  const seen = new Set<Key>()
  for (const child of children) {
    if (child.key === undefined) continue
    if (seen.has(child.key))
      throw new Error(`Aynı key iki kez kullanıldı: "${child.key}". Kardeşlerin key'leri benzersiz olmalı.`)
    seen.add(child.key)
  }
}

export function h(type: VNodeType, props?: Record<string, unknown> | null, ...children: Child[]): VNode {
  // __self/__source: bazı JSX dönüştürücülerinin geliştirme kipinde eklediği hata ayıklama alanları; DOM'a gitmesin.
  const { key, __self: _self, __source: _source, ...rest } = props ?? {}
  if (key !== undefined && typeof key !== 'string' && typeof key !== 'number') {
    throw new TypeError('`key` yalnız dizgi ya da sayı olabilir.')
  }
  const normalized = normalizeChildren(children)
  if (type === Fragment) return { type: FRAGMENT, props: rest, key, children: normalized, text: '' }
  if (typeof type === 'function') {
    if (normalized.length > 0) rest.children = normalized
    return { type, props: rest, key, children: [], text: '' }
  }
  return { type, props: rest, key, children: normalized, text: '' }
}

// TypeScript, `jsxFactory: "h"` ayarında JSX türlerini `h.JSX` altında arar. Bu ad alanı yalnız tür içerir.
// eslint-disable-next-line @typescript-eslint/no-namespace -- JSX tür denetimi için gerekli
export declare namespace h {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- iç ad alanı da JSX tür araması için gerekli
  namespace JSX {
    type Element = VNode
    type ElementType = string | Component
    interface IntrinsicElements {
      [tag: string]: Record<string, unknown>
    }
    interface ElementChildrenAttribute {
      children: unknown
    }
  }
}
