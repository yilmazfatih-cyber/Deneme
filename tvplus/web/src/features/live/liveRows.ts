/**
 * Canlı TV sayfasının satırlarını sunucunun sayfasından türeten saf hesaplar (birim testi: liveRows.test.ts).
 *
 *   Şimdi / sonraki  Sunucu "şimdi" ve "sonraki" yayını veri alındığı ana göre verir; sayfa açık kalırken program
 *                    sınırı geçince istemci saatine (sunucu saatine göre düzeltilmiş) göre kayarız: biten "şimdi"
 *                    düşer, başlamış "sonraki" şimdi olur — yeniden çekme gelene dek ekran doğru kalır.
 *   Satırlar         "Şu An Yayında" (her kanal bir kart), "Kanallarım" (favoriler, iyimser değişikliklerle),
 *                    kategori satırları, "Az Sonra" (her kanalın sıradaki yayını, başlama sırasıyla).
 *   Saat farkı       serverTime ile istemci saati arasındaki fark (2 sn altı yok sayılır).
 */
import type { AiringBriefData, ChannelData, RowItemData, TrackData } from './types'
import { asChannel, type RenderableRow } from './liveLogic'

export interface ChannelEntry {
  channel: ChannelData
  track: TrackData
}

interface Timed {
  startAt: string
  endAt: string
}

const t = (iso: string) => Date.parse(iso)

/** Kanalın ŞU AN yayındaki programı (istemci saatiyle); bilinmiyorsa null. */
export function currentAiring<A extends Timed>(ch: { now: A | null; next: A | null }, now: number): A | null {
  for (const a of [ch.now, ch.next]) if (a && t(a.startAt) <= now && now < t(a.endAt)) return a
  return null
}

/** Kanalın sıradaki (henüz başlamamış) programı; bilinmiyorsa null. */
export function upcomingAiring<A extends Timed>(ch: { now: A | null; next: A | null }, now: number): A | null {
  for (const a of [ch.now, ch.next]) if (a && now < t(a.startAt)) return a
  return null
}

/** Sayfadaki tüm kanallar (en kalabalık kanal satırı = "Tüm kanallar"), kahraman dahil, numara sırasıyla. */
export function channelEntries(rows: readonly RenderableRow[]): ChannelEntry[] {
  const lists = rows
    .filter((r) => r.type === 'CHANNEL_ROW')
    .map((r) => r.items.flatMap((it) => entryOf(it)))
    .sort((a, b) => b.length - a.length)
  const seen = new Set<number>()
  const out: ChannelEntry[] = []
  for (const list of lists)
    for (const e of list)
      if (!seen.has(e.channel.channelId)) {
        seen.add(e.channel.channelId)
        out.push(e)
      }
  return out.sort((a, b) => a.channel.number - b.channel.number)
}

/** Bir satırın kanalları, sunucunun sırasıyla ("Kanallarım"). */
export function rowEntries(row: RenderableRow | undefined): ChannelEntry[] {
  return row ? row.items.flatMap((it) => entryOf(it)) : []
}

function entryOf(it: RowItemData): ChannelEntry[] {
  const ch = asChannel(it)
  return ch ? [{ channel: ch, track: it.track }] : []
}

/**
 * "Kanallarım": sunucunun favori sırası korunur; iyimser olarak çıkarılanlar düşer, eklenenler sona eklenir.
 * `isFavorite` geçersiz kılma uygulanmış değeri döndürür.
 */
export function favoriteEntries(
  serverFavorites: readonly ChannelEntry[],
  all: readonly ChannelEntry[],
  isFavorite: (ch: ChannelData) => boolean,
): ChannelEntry[] {
  const out = serverFavorites.filter((e) => isFavorite(e.channel))
  const ids = new Set(out.map((e) => e.channel.channelId))
  for (const e of all) if (!ids.has(e.channel.channelId) && isFavorite(e.channel)) out.push(e)
  return out
}

export interface CategoryGroup {
  key: string
  name: string
  entries: ChannelEntry[]
}

/** Kategori satırları: ilk görülme sırasıyla (kanal numarası düzeni), her biri kendi kanallarıyla. */
export function categoryGroups(entries: readonly ChannelEntry[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>()
  for (const e of entries) {
    const g = map.get(e.channel.category)
    if (g) g.entries.push(e)
    else map.set(e.channel.category, { key: e.channel.category, name: e.channel.categoryName, entries: [e] })
  }
  return [...map.values()]
}

export interface UpNext {
  entry: ChannelEntry
  airing: AiringBriefData
}

/** "Az Sonra": her kanalın sıradaki yayını, başlama sırasıyla (eşitlikte kanal numarası); en çok `limit`. */
export function upNext(entries: readonly ChannelEntry[], now: number, limit = 20): UpNext[] {
  return entries
    .flatMap((entry) => {
      const airing = upcomingAiring(entry.channel, now)
      return airing ? [{ entry, airing }] : []
    })
    .sort((a, b) => t(a.airing.startAt) - t(b.airing.startAt) || a.entry.channel.number - b.entry.channel.number)
    .slice(0, limit)
}

/** Kahraman kanal: sunucunun LIVE_HERO önerisi (son izlenen kanal), yoksa 1 numara, yoksa ilk kanal. */
export function featuredEntry(
  heroRow: RenderableRow | undefined,
  entries: readonly ChannelEntry[],
): ChannelEntry | null {
  const item = heroRow?.items[0]
  const ch = item ? asChannel(item) : null
  if (item && ch) return { channel: ch, track: item.track }
  return entries.find((e) => e.channel.number === 1) ?? entries[0] ?? null
}

/** Sunucu saati − istemci saati (ms); 2 sn altındaki fark ölçüm gürültüsüdür, 0 sayılır. */
export function clockOffset(serverTime: string, observedAt: number): number {
  const d = t(serverTime) - observedAt
  return Number.isFinite(d) && Math.abs(d) >= 2000 ? d : 0
}

/** Kanalın canlı önizlemesi bu cihazda oynayabilir mi (yalnız kendi CDN'imizdeki doğrusal kanal, kilitsiz). */
export function previewable(ch: Pick<ChannelData, 'sourceKind' | 'access'>): boolean {
  return ch.sourceKind === 'OWN_CDN' && ch.access.state === 'PLAYABLE'
}
