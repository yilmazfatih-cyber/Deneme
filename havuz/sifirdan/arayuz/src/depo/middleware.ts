// Hazır ara katmanlar. Ara katman üç katlı bir işlevdir: (api) => (next) => (eylem) => sonuç.
// `next(eylem)` zincirde bir sonrakine (en sonda indirgeyiciye) iletir; çağırmazsanız eylem yutulur.
// Genişletme: yeni ara katman = `logger`'ı kopyalayın, gövdesini değiştirin, `createStore(..., { middleware })`.
import type { Middleware } from './store.ts'

/** İşlev gönderilirse onu (dispatch, getState) ile çağırır: eşzamansız iş akışları için. */
export function thunk<S>(): Middleware<S> {
  return (api) => (next) => (action) =>
    typeof action === 'function'
      ? (action as (dispatch: typeof api.dispatch, getState: () => S) => unknown)(api.dispatch, () => api.getState())
      : next(action)
}

/** Her eylemi önceki ve sonraki durumla birlikte verilen işleve yazar. */
export function logger<S>(write: (entry: { action: unknown; before: S; after: S }) => void): Middleware<S> {
  return (api) => (next) => (action) => {
    const before = api.getState()
    const result = next(action)
    write({ action, before, after: api.getState() })
    return result
  }
}
