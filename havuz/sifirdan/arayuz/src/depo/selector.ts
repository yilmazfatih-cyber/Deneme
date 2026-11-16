// Ezberlemeli seçiciler: türetilmiş veriyi (ör. "yapılmamış görev sayısı") yalnız girdileri değişince yeniden
// hesaplar. Girdi seçicileri her çağrıda çalışır (ucuz olmalı); birleştirici yalnız girdilerden biri
// `Object.is` ile değiştiyse çalışır. Yapısal paylaşım sayesinde değişmeyen dilimler aynı referansla gelir.
// Genişletme: birden çok son değeri saklayan (LRU) önbellek için `last` alanını bir diziye çevirin.

export interface Selector<S, R> {
  (state: S): R
  /** Birleştiricinin kaç kez gerçekten çalıştığı (testler ve ayar için). */
  recomputations(): number
}

type AnyInput = (state: never) => unknown
type StateOf<F extends readonly AnyInput[]> = F extends readonly [(state: infer S) => unknown, ...unknown[]] ? S : never
type ValuesOf<F extends readonly AnyInput[]> = { [K in keyof F]: F[K] extends (state: never) => infer V ? V : never }

/** `createSelector([s => s.a, s => s.b], (a, b) => …)`: durum türü ilk girdi seçicisinden çıkarılır. */
export function createSelector<F extends readonly AnyInput[], R>(
  inputs: readonly [...F],
  combine: (...values: ValuesOf<F>) => R,
): Selector<StateOf<F>, R> {
  type S = StateOf<F>
  let last: { values: unknown[]; result: R } | undefined
  let count = 0
  const selector = (state: S): R => {
    const values = inputs.map((input) => (input as (s: S) => unknown)(state))
    if (last && values.every((value, i) => Object.is(value, last?.values[i]))) return last.result
    count++
    const result = combine(...(values as unknown as ValuesOf<F>))
    last = { values, result }
    return result
  }
  return Object.assign(selector, { recomputations: () => count })
}
