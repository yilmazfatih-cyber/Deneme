/**
 * Göz atma ekranlarının odak hafızası (saf; birim testi memory.test.ts).
 *
 * Odak motoru kapsam hafızasını kimlikle tutar (ekran ve satır kapsamları kalkıp geri gelince son odaklanan kartı
 * hatırlar). Ama pencerelenmiş satırda o kart ancak satır doğru yerden çizilirse vardır: bu modül, ekran yeniden
 * açıldığında hangi satırın hangi sırasından çizileceğini tutar. Böylece başlığa girip Geri'ye basınca aynı kart
 * çizilir, motor onu bulur ve odak oraya döner.
 *
 * Kimlikler:
 *   satır kapsamı   `<ekran>:satir:<listId>`
 *   kart            `<ekran>:satir:<listId>:<kart anahtarı>`  (kart anahtarı = videoId; tekrar ederse -sıra)
 */

export interface LaneMemory {
  index: number
  key: string | null
}

export interface BrowseMemory {
  /** Odaktaki satırın listId'si ve lolomo sırası */
  rowListId: string | null
  rowIndex: number
  /** Yüklenmiş satır sayısı (dönüşte aynı kadar satır hemen çizilir) */
  loadedRows: number
  /** listId → satırda son odaklanan kart */
  lanes: Record<string, LaneMemory>
  /** listId → yüklenmiş öğe sayısı */
  loadedItems: Record<string, number>
}

export const emptyMemory = (): BrowseMemory => ({
  rowListId: null,
  rowIndex: 0,
  loadedRows: 0,
  lanes: {},
  loadedItems: {},
})

export const rowScopeId = (screenId: string, listId: string): string => `${screenId}:satir:${listId}`
export const cardFocusId = (screenId: string, listId: string, cardKey: string): string =>
  `${rowScopeId(screenId, listId)}:${cardKey}`

/** Kartın odaklandığını kaydeder (yeni nesne döner). */
export function rememberFocus(
  mem: BrowseMemory,
  listId: string,
  rowIndex: number,
  index: number,
  key: string | null,
): BrowseMemory {
  const prev = mem.lanes[listId]
  if (mem.rowListId === listId && mem.rowIndex === rowIndex && prev?.index === index && prev.key === key) return mem
  return { ...mem, rowListId: listId, rowIndex, lanes: { ...mem.lanes, [listId]: { index, key } } }
}

/**
 * Satır yeniden çizilirken başlanacak sıra: kaydedilen kart hâlâ satırdaysa onun (yeni) sırası, değilse kaydedilen
 * sıra (satır kısaldıysa son öğe), hiç kayıt yoksa 0.
 */
export function restoreIndex(mem: BrowseMemory, listId: string, keys: readonly (string | null)[], length: number) {
  const lane = mem.lanes[listId]
  if (!lane || length <= 0) return 0
  if (lane.key !== null) {
    const at = keys.indexOf(lane.key)
    if (at >= 0) return at
  }
  return Math.min(Math.max(0, lane.index), length - 1)
}

/** Dönüşte odaklanacak kartın kimliği (ekranın varsayılan odağı); kayıt yoksa null. */
export function restoreFocusId(mem: BrowseMemory, screenId: string): string | null {
  if (!mem.rowListId) return null
  const lane = mem.lanes[mem.rowListId]
  if (!lane?.key) return null
  return cardFocusId(screenId, mem.rowListId, lane.key)
}

/** Profil + ekran başına hafıza deposu (uygulama ömrü boyunca). */
export class MemoryStore {
  private readonly map = new Map<string, BrowseMemory>()

  get(key: string): BrowseMemory {
    return this.map.get(key) ?? emptyMemory()
  }

  set(key: string, mem: BrowseMemory): void {
    this.map.set(key, mem)
  }

  clear(): void {
    this.map.clear()
  }
}

export const browseMemory = new MemoryStore()
