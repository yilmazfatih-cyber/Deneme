// Sinyal çizgesinin çekirdeği: düğüm arayüzleri, izleme (kim neyi okudu), dönem sayacı, toplu iş ve etki kuyruğu.
// signal.ts, computed.ts ve effect.ts yalnız bu dosyayı içe aktarır; birbirlerini doğrudan tanımazlar.
// Düzen "it-çek"tir: yazma, gözlemcilere "eskimiş olabilirsin" diye haber verir (itme); değer ancak okunurken
// kaynak sürümleri yukarıdan aşağı doğrulanarak yeniden hesaplanır (çekme). Böylece elmas bağımlılıkta her düğüm
// en çok bir kez ve tutarlı girdilerle hesaplanır.
// Genişletme: yeni bir düğüm türü `Source` ve/veya `Observer` arayüzünü uygular; kuyruğa `Runnable` olarak girer.

/** Okunabilen düğüm (sinyal ya da hesaplanmış değer). */
export interface Source {
  /** Değer her değiştiğinde bir artar. Gözlemci, okuduğu andaki sürümü saklar. */
  readonly version: number
  /** Bu kaynağa canlı abone olan gözlemciler. */
  readonly observers: Set<Observer>
  /** Hesaplanmış değerler için: gerekiyorsa yeniden hesapla. Sinyallerde boş işlemdir. */
  refresh(): void
  addObserver(observer: Observer): void
  removeObserver(observer: Observer): void
}

/** Okuyan düğüm (hesaplanmış değer ya da etki). */
export interface Observer {
  readonly kind: 'computed' | 'effect'
  /** Son çalışmada okunan kaynaklar → okuma anındaki sürümleri (okuma sırasıyla). */
  sources: Map<Source, number>
  /** Kaynaklardan biri değişti ya da değişmiş olabilir. */
  notify(): void
}

/** Kuyruktaki etkiler için: oluşturulma sırası (`id`) ve "gerekirse çalış" işlevi. */
export interface Runnable {
  readonly id: number
  runIfStale(): void
  dropFromQueue(): void
}

/** Bir etki zinciri bu kadar turdan sonra durmazsa sonsuz döngü sayılır. */
export const MAX_FLUSH_ROUNDS = 100

/** Her sinyal yazımında bir artar. Canlı olmayan hesaplanmışlar "o günden beri bir şey değişti mi?" diye bakar. */
let epoch = 0
let currentSources: Map<Source, number> | undefined
let currentObserver: Observer | undefined
let batchDepth = 0
const queue: Runnable[] = []

export function getEpoch(): number {
  return epoch
}

export function bumpEpoch(): void {
  epoch++
}

/** Okunan kaynağı etkin gözlemcinin listesine (bir kez, okuma sırasıyla) ekler. */
export function track(source: Source): void {
  if (currentSources !== undefined && !currentSources.has(source)) currentSources.set(source, source.version)
}

export type Collected<T> =
  { ok: true; value: T; sources: Map<Source, number> } | { ok: false; error: unknown; sources: Map<Source, number> }

/** `fn`'i `observer` adına çalıştırır ve okuduğu kaynakları toplar. Hata atsa da kaynaklar döner. */
export function collect<T>(observer: Observer, fn: () => T): Collected<T> {
  const prevSources = currentSources
  const prevObserver = currentObserver
  const sources = new Map<Source, number>()
  currentSources = sources
  currentObserver = observer
  try {
    return { ok: true, value: fn(), sources }
  } catch (error) {
    return { ok: false, error, sources }
  } finally {
    currentSources = prevSources
    currentObserver = prevObserver
  }
}

/** İzlemeyi geçici olarak kapatır: `fn` içindeki okumalar bağımlılık sayılmaz. */
export function untrack<T>(fn: () => T): T {
  const prevSources = currentSources
  const prevObserver = currentObserver
  currentSources = undefined
  currentObserver = undefined
  try {
    return fn()
  } finally {
    currentSources = prevSources
    currentObserver = prevObserver
  }
}

/** Hesaplanmış değer saf olmalıdır: içinden sinyal yazmak tutarsızlık doğurur. */
export function assertWritable(name: string | undefined): void {
  if (currentObserver?.kind === 'computed') {
    throw new Error(
      `Hesaplanmış değer içinde sinyal yazılamaz${name ? ` ("${name}")` : ''}. Yazmayı bir etkiye taşıyın.`,
    )
  }
}

/**
 * Gözlemcinin kaynak listesini yenisiyle değiştirir. `live` ise abonelikler de güncellenir:
 * önce yeniler eklenir, sonra artık okunmayanlar çıkarılır (paylaşılan ara düğüm boşuna "ölüp dirilmesin").
 */
export function swapSources(observer: Observer, next: Map<Source, number>, live: boolean): void {
  const prev = observer.sources
  observer.sources = next
  if (!live) return
  for (const source of next.keys()) if (!prev.has(source)) source.addObserver(observer)
  for (const source of prev.keys()) if (!next.has(source)) source.removeObserver(observer)
}

/** Kaynaklardan herhangi biri, gözlemcinin son gördüğünden farklı bir sürümde mi? (Okuma sırasıyla denetler.) */
export function sourcesChanged(observer: Observer): boolean {
  for (const [source, seenVersion] of observer.sources) {
    source.refresh()
    if (source.version !== seenVersion) return true
  }
  return false
}

export function enqueue(item: Runnable): void {
  queue.push(item)
}

export function startBatch(): void {
  batchDepth++
}

export function endBatch(): void {
  batchDepth--
  if (batchDepth === 0) flush()
}

/** `fn` içindeki tüm yazmalar bitene kadar etkileri bekletir; sonra her etki en çok bir kez çalışır. */
export function batch<T>(fn: () => T): T {
  startBatch()
  try {
    return fn()
  } finally {
    endBatch()
  }
}

/**
 * Bekleyen etkileri oluşturulma sırasıyla (üst etki çocuğundan önce) çalıştırır. Etkilerin yaptığı yazmalar
 * yeni bir tur doğurur. Bir etki hata atarsa diğerleri yine çalışır; ilk hata en sonda yeniden atılır.
 */
function flush(): void {
  let rounds = 0
  let firstError: { error: unknown } | undefined
  batchDepth++
  try {
    while (queue.length > 0) {
      if (++rounds > MAX_FLUSH_ROUNDS) {
        for (const item of queue.splice(0)) item.dropFromQueue()
        throw new Error(
          `Etki döngüsü: etkiler ${MAX_FLUSH_ROUNDS} turdur birbirini tetikliyor. Bir etki, okuduğu sinyali koşulsuz yazıyor olabilir.`,
        )
      }
      const round = queue.splice(0).sort((a, b) => a.id - b.id)
      for (const item of round) {
        try {
          item.runIfStale()
        } catch (error) {
          firstError ??= { error }
        }
      }
    }
  } finally {
    batchDepth--
  }
  if (firstError) throw firstError.error
}
