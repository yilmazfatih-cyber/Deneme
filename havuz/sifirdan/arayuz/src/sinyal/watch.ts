// Küçük yardımcılar: `watch` bir değeri izler ve yalnız değiştiğinde (ilk değer hariç) geri çağırır.
// Düz DOM kodu ya da yönlendirici gibi sistemlerin sinyallere "abone olması" için kullanılır.
// Genişletme: `immediate: true` gibi seçenekler buraya eklenir; çekirdeğe (graph.ts) dokunmak gerekmez.
import { untrack } from './graph.ts'
import { effect } from './effect.ts'

/** `read()` değeri değiştikçe `callback(yeni, eski)` çağrılır. Dönen işlev izlemeyi bitirir. */
export function watch<T>(read: () => T, callback: (next: T, previous: T) => void): () => void {
  let first = true
  let previous: T
  return effect(() => {
    const next = read()
    if (first) {
      first = false
      previous = next
      return
    }
    if (Object.is(next, previous)) return
    const old = previous
    previous = next
    untrack(() => callback(next, old))
  })
}
