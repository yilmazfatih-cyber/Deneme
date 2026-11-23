/**
 * Eşitleme zamanlamaları (ms). Tek yerde dursun ki ayarlamak kolay olsun.
 *
 * Genişletme: değerleri değiştirirken şunu düşünün: kısa süre = daha güncel veri ama daha çok istek ve pil.
 * Telefonda arka planda eşitleme YOKTUR: uygulama ön plandayken çalışır (bkz. README → Sınırlar).
 */
export interface SyncTiming {
  readonly pushDebounceMs: number
  readonly pollMs: number
  readonly resumeMinGapMs: number
  readonly maxRoundsPerRun: number
}

export const SYNC_TIMING: SyncTiming = {
  /** Yerel yazmadan sonra bekleme: art arda yazmalar tek istekte toplansın. */
  pushDebounceMs: 500,
  /** Uygulama ön plandayken düzenli yoklama aralığı (başka cihazların değişiklikleri gelsin). */
  pollMs: 60_000,
  /** Ön plana dönünce yeniden eşitlemek için son denemeden bu yana geçmesi gereken en az süre. */
  resumeMinGapMs: 10_000,
  /** Tek çalıştırmada art arda en çok tur (büyük ilk indirme için yeterli; sonsuz döngü sigortası). */
  maxRoundsPerRun: 200,
}
