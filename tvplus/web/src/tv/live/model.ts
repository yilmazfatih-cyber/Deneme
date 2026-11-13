/**
 * Canlı TV ekranının saf mantığı (testli: model.test.ts). React ve DOM yok.
 *
 *   nowNext            sunucu saatine göre şimdiki yayın + sıradaki iki yayın
 *   airingProgress     yayın ilerlemesi (0–1)
 *   liveFilters / applyFilter   üstteki süzgeç satırı: Tümü · Kanallarım · kategoriler
 *   typeDigit / expireEntry     kanal numarası girişi (kumandanın rakam tuşları) durum makinesi
 *   clockOffset / nextRefreshAt sunucu saati farkı ve bir sonraki yeniden çekme anı (satır TTL'i + program sınırı)
 */

export interface TimedAiring {
  airingId: string
  startAt: string
  endAt: string
}

/** Sunucu saatine göre şimdi yayında olan ve sonra gelecek `count` yayın. */
export function nowNext<T extends TimedAiring>(airings: readonly T[], now: number, count = 2): { now: T | null; next: T[] } {
  const sorted = [...airings].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const seen = new Set<string>()
  const uniq = sorted.filter((a) => (seen.has(a.airingId) ? false : (seen.add(a.airingId), true)))
  const live = uniq.find((a) => Date.parse(a.startAt) <= now && now < Date.parse(a.endAt)) ?? null
  const next = uniq.filter((a) => Date.parse(a.startAt) >= (live ? Date.parse(live.endAt) : now) && a !== live)
  return { now: live, next: next.slice(0, count) }
}

/** Yayının ilerlemesi (0–1); süre geçersizse 0. */
export function airingProgress(a: Pick<TimedAiring, 'startAt' | 'endAt'>, now: number): number {
  const s = Date.parse(a.startAt)
  const e = Date.parse(a.endAt)
  if (!(e > s)) return 0
  return Math.min(1, Math.max(0, (now - s) / (e - s)))
}

/* ───────────── Süzgeç satırı ───────────── */

export interface FilterChannel {
  channelId: number
  category: string
  categoryName: string
}

export type LiveFilterId = 'tumu' | 'kanallarim' | `kategori:${string}`

export interface LiveFilter {
  id: LiveFilterId
  label: string
}

/** Tümü · Kanallarım · kanallarda geçen kategoriler (ilk görünme sırasıyla). */
export function liveFilters(channels: readonly FilterChannel[]): LiveFilter[] {
  const out: LiveFilter[] = [
    { id: 'tumu', label: 'Tümü' },
    { id: 'kanallarim', label: 'Kanallarım' },
  ]
  const seen = new Set<string>()
  for (const c of channels) {
    if (seen.has(c.category)) continue
    seen.add(c.category)
    out.push({ id: `kategori:${c.category}`, label: c.categoryName || c.category })
  }
  return out
}

/** Süzgeci uygular; `favorite` iyimser güncellemeyi de bilen "Kanallarımda mı" sorusudur. */
export function applyFilter<T extends FilterChannel>(
  channels: readonly T[],
  filter: LiveFilterId,
  favorite: (c: T) => boolean,
): T[] {
  if (filter === 'tumu') return [...channels]
  if (filter === 'kanallarim') return channels.filter(favorite)
  const cat = filter.slice('kategori:'.length)
  return channels.filter((c) => c.category === cat)
}

/* ───────────── Kanal numarası girişi ───────────── */

/** Rakamlar arasında beklenen en uzun süre; dolunca yazılan numaraya geçilir. */
export const NUMBER_ENTRY_MS = 2000

export interface NumberEntry {
  digits: string
  /** son rakamın anı (epoch ms) */
  at: number
}

export interface DigitResult {
  /** sürmekte olan giriş (null → bitti) */
  entry: NumberEntry | null
  /** geçilecek numara (null → henüz yok) */
  commit: number | null
}

/**
 * Bir rakam yazılır. Numara şu durumlarda hemen tamamlanır: en uzun kanal numarası kadar hane yazıldıysa ya da
 * yazılan önekle başlayan daha uzun bir kanal numarası yoksa (ör. kanallar 1, 20–60 iken "1" → hemen 1;
 * "2" → beklenir, "21" → hemen). Baştaki sıfır yok sayılır.
 */
export function typeDigit(entry: NumberEntry | null, digit: number, numbers: readonly number[], now: number): DigitResult {
  const prev = entry && now - entry.at <= NUMBER_ENTRY_MS ? entry.digits : ''
  if (prev === '' && digit === 0) return { entry: null, commit: null }
  const digits = `${prev}${digit}`
  const maxLen = Math.max(1, ...numbers.map((n) => String(n).length))
  const longer = numbers.some((n) => {
    const s = String(n)
    return s.length > digits.length && s.startsWith(digits)
  })
  if (digits.length >= maxLen || !longer) return { entry: null, commit: Number(digits) }
  return { entry: { digits, at: now }, commit: null }
}

/** Süre dolduysa yazılan numarayı tamamlar. */
export function expireEntry(entry: NumberEntry | null, now: number): DigitResult {
  if (!entry) return { entry: null, commit: null }
  if (now - entry.at < NUMBER_ENTRY_MS) return { entry, commit: null }
  return { entry: null, commit: Number(entry.digits) }
}

/* ───────────── Sunucu saati ve yeniden çekme ───────────── */

/** Sunucu saati − yerel saat (ms); yanıtın alındığı yerel anla hesaplanır. */
export function clockOffset(serverTime: string, receivedAt: number): number {
  const t = Date.parse(serverTime)
  return Number.isFinite(t) ? t - receivedAt : 0
}

/**
 * Bir sonraki yeniden çekme anı (sunucu saatiyle): en kısa satır TTL'i ya da verinin alınmasından sonraki ilk
 * program sınırı (şimdiki yayının bitişi), hangisi önce gelirse.
 */
export function nextRefreshAt(
  ttlSecs: readonly number[],
  boundaries: readonly (string | null | undefined)[],
  fetchedAt: number,
): number | null {
  let at = Infinity
  for (const ttl of ttlSecs) if (ttl > 0) at = Math.min(at, fetchedAt + ttl * 1000)
  for (const iso of boundaries) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (t > fetchedAt) at = Math.min(at, t)
  }
  return Number.isFinite(at) ? at : null
}
