// sinyal — ince taneli tepkisellik: signal, computed, effect, batch, untrack, onCleanup.
// Dışarıya açılan tek giriş noktası budur; diğer sistemler ve gösterimler yalnız buradan içe aktarır.
// Ayrıntılı anlatım: README.md (it-çek algoritması, elmas örneği, döngü algılama).
// Genişletme: yeni yardımcı (ör. `watch`, `resource`) ayrı dosyada yazılıp buradan dışa aktarılır.
export { batch, untrack, MAX_FLUSH_ROUNDS } from './graph.ts'
export { Signal, signal, type SignalOptions } from './signal.ts'
export { Computed, computed, CycleError, type ComputedOptions } from './computed.ts'
export { Effect, effect, onCleanup, type Cleanup, type EffectFn } from './effect.ts'
export { watch } from './watch.ts'
