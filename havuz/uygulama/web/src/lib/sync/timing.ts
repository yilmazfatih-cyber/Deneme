/**
 * Eşitleme zamanlamaları (ms). Tek yerde dursun ki ayarlamak kolay olsun.
 *
 * Genişletme: değerleri değiştirirken şunu düşünün: kısa süre = daha güncel veri ama daha çok istek ve pil.
 */
export const SYNC_TIMING = {
  /** Yerel yazmadan sonra bekleme: art arda yazmalar tek istekte toplansın. */
  pushDebounceMs: 500,
  /** Sunucudan gelen "değişti" dürtmesinden sonra bekleme: art arda dürtmeler tek istekte toplansın. */
  pokeDebounceMs: 250,
  /** Sekme görünürken düzenli yoklama aralığı (anlık bildirim kopsa da veri güncel kalsın). */
  pollMs: 60_000,
  /** Sekmeye dönünce yeniden eşitlemek için son denemeden bu yana geçmesi gereken en az süre. */
  resumeMinGapMs: 10_000,
  /** Tek bir eşitleme isteğinin zaman aşımı. */
  requestTimeoutMs: 30_000,
  /** Tek çalıştırmada art arda en çok tur (büyük ilk indirme için yeterli; sonsuz döngü sigortası). */
  maxRoundsPerRun: 200,
} as const
