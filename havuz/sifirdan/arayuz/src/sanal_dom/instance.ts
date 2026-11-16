// Bileşen örneği: bir işlev bileşeninin ömrü boyunca kalıcı durumu (kanca dizisi, üst örnek, kök).
// Kancalar "kaçıncı çağrı" sırasıyla bu dizideki yuvalara bağlanır; bu yüzden kancalar koşul ya da döngü içinde
// çağrılamaz (hooks.ts sırayı her çizimde denetler). Ayrıca "şu an hangi bileşen çiziliyor" bilgisi burada tutulur.
// Genişletme: yeni bir kanca türü `Hook` birleşimine bir üye ekler.
import type { MountedComponent } from './mounted.ts'
import type { Root } from './root.ts'
import type { VNode } from './vnode.ts'

export type EffectHook = {
  kind: 'effect'
  deps: readonly unknown[] | undefined
  run: (() => void | (() => void)) | undefined
  cleanup: (() => void) | undefined
}

export type Hook =
  | { kind: 'state'; value: unknown; set: (next: unknown) => void }
  | EffectHook
  | { kind: 'memo'; deps: readonly unknown[]; value: unknown }
  | { kind: 'ref'; ref: { current: unknown } }
  | { kind: 'context' }

export interface Instance {
  vnode: VNode
  mounted: MountedComponent | undefined
  parent: Instance | undefined
  depth: number
  root: Root
  hooks: Hook[]
  /** Bu çizimde kuyruğa alınacak etkiler (bağımlılığı değişenler). */
  pendingEffects: EffectHook[]
  dirty: boolean
  unmounted: boolean
  renderCount: number
  /** Hata sınırı ise: alt ağaçta yakalanan hatayı işler. */
  onError: ((error: unknown) => void) | undefined
}

let current: Instance | undefined
let hookIndex = 0

export function createInstance(vnode: VNode, parent: Instance | undefined, root: Root): Instance {
  return {
    vnode,
    mounted: undefined,
    parent,
    depth: parent ? parent.depth + 1 : 0,
    root,
    hooks: [],
    pendingEffects: [],
    dirty: false,
    unmounted: false,
    renderCount: 0,
    onError: undefined,
  }
}

export function beginRender(instance: Instance): void {
  current = instance
  hookIndex = 0
  instance.pendingEffects = []
  instance.dirty = false
  instance.renderCount++
}

/** Çizim bitti: önceki çizimden daha az kanca çağrıldıysa kanca kuralı çiğnenmiştir. */
export function endRender(instance: Instance): void {
  const used = hookIndex
  current = undefined
  hookIndex = 0
  if (instance.renderCount > 1 && used !== instance.hooks.length) {
    throw new Error(
      `Kanca sayısı değişti (${instance.hooks.length} → ${used}). Kancaları koşul, döngü ya da erken dönüşten sonra çağırmayın.`,
    )
  }
}

export function abortRender(): void {
  current = undefined
  hookIndex = 0
}

/**
 * Sıradaki kanca yuvasını verir (yoksa `create` ile kurar). Tür önceki çizimle uyuşmazsa yol gösteren hata atar.
 * Dönen üçüncü değer, yuvanın bu çizimde yeni kurulup kurulmadığıdır.
 */
export function nextHook<K extends Hook['kind']>(
  kind: K,
  create: (instance: Instance) => Extract<Hook, { kind: K }>,
): [Instance, Extract<Hook, { kind: K }>, boolean] {
  const instance = current
  if (!instance) throw new Error('Kancalar (useState, useEffect…) yalnız bir bileşenin gövdesinde çağrılabilir.')
  const index = hookIndex++
  const existing = instance.hooks[index]
  if (existing === undefined) {
    if (instance.renderCount > 1) {
      throw new Error('Bu çizimde öncekinden fazla kanca çağrıldı. Kancaları koşul ya da döngü içinde çağırmayın.')
    }
    const hook = create(instance)
    instance.hooks.push(hook)
    return [instance, hook, true]
  }
  if (existing.kind !== kind) {
    throw new Error(
      `Kanca sırası değişti: ${index + 1}. kanca önce "${existing.kind}", şimdi "${kind}". Kancaları koşulsuz çağırın.`,
    )
  }
  return [instance, existing as Extract<Hook, { kind: K }>, false]
}

export function currentInstance(): Instance | undefined {
  return current
}
