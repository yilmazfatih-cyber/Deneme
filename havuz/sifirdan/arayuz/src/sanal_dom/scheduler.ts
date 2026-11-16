// Toplu güncelleme zamanlayıcısı: `setState` hemen çizmez, bileşeni "kirli" işaretler ve bir mikro görev
// planlar. Aynı olay içindeki tüm durum değişiklikleri tek çizimde birleşir. Boşaltmada kirli bileşenler
// derinliğe göre (önce üst) çizilir; üst çizilince altı zaten güncellenir. Sonra etkiler işlenir: önce
// değişen etkilerin eski temizlikleri, sonra yeni etkiler (alt bileşenler önce).
// Genişletme: öncelikli güncellemeler (ör. girdi > liste) için `dirty` dizisi önceliğe göre ayrılabilir.
import { reportError } from './component.ts'
import { preserveFocus } from './focus.ts'
import type { Instance } from './instance.ts'
import { rerenderComponent } from './reconcile.ts'
import type { Root } from './root.ts'

/** Bir boşaltmada bu kadar turdan sonra hâlâ iş varsa sonsuz yeniden çizim sayılır. */
export const MAX_RENDER_ROUNDS = 50

const pendingRoots = new Set<Root>()
let microtaskQueued = false

export function scheduleUpdate(instance: Instance): void {
  if (instance.unmounted) return
  if (!instance.dirty) {
    instance.dirty = true
    instance.root.dirty.push(instance)
  }
  pendingRoots.add(instance.root)
  if (!microtaskQueued) {
    microtaskQueued = true
    queueMicrotask(flush)
  }
}

/** Bekleyen tüm güncellemeleri ve etkileri hemen (eşzamanlı) işler. Testlerde ve `render` sonunda kullanılır. */
export function flush(): void {
  microtaskQueued = false
  for (const root of [...pendingRoots]) {
    pendingRoots.delete(root)
    flushRoot(root)
  }
}

export function flushRoot(root: Root): void {
  pendingRoots.delete(root)
  let rounds = 0
  while (root.dirty.length > 0 || root.effects.length > 0) {
    if (++rounds > MAX_RENDER_ROUNDS) {
      root.dirty.length = 0
      root.effects.length = 0
      throw new Error('Sonsuz yeniden çizim: bir etki ya da çizim her turda durumu yeniden değiştiriyor.')
    }
    const dirty = root.dirty.splice(0).sort((a, b) => a.depth - b.depth)
    const restoreFocus = dirty.length > 0 ? preserveFocus(root.container) : () => {}
    for (const instance of dirty) {
      if (instance.dirty && !instance.unmounted && instance.mounted) rerenderComponent(instance.mounted)
    }
    restoreFocus()
    commitEffects(root)
  }
}

function commitEffects(root: Root): void {
  const list = root.effects.splice(0)
  for (const { instance, hook } of list) {
    const cleanup = hook.cleanup
    hook.cleanup = undefined
    try {
      cleanup?.()
    } catch (error) {
      reportError(instance, error)
    }
  }
  for (const { instance, hook } of list) {
    const run = hook.run
    hook.run = undefined
    if (instance.unmounted || !run) continue
    try {
      const result = run()
      hook.cleanup = typeof result === 'function' ? result : undefined
    } catch (error) {
      reportError(instance, error)
    }
  }
}
