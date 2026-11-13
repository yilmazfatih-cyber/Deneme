/**
 * Geri bildirim defteri (saf): gösterilen her sonucun hangi yanıtta (requestId), hangi terimle, hangi bölümde ve
 * kaçıncı sırada gösterildiğini tutar. Tıklama / oynatma / Listem olayı geldiğinde modele doğru konum gider.
 *   - Konum: bölüm içindeki sıra (0'dan) — sunucunun "üstünde gösterilenler" hesabıyla aynı ölçü.
 *   - tctx ile arama: oynat bağlantısı ve Listem isteği kartın tctx'ini taşır (önizleme, detay penceresi).
 *   - Aynı yanıtta aynı öğe için aynı eylem bir kez gider (çift tıklama modeli iki kez itmesin).
 */

export type FeedbackAction = 'CLICK' | 'PLAY' | 'ADD_TO_LIST' | 'DISMISS'

export interface ShownItem {
  requestId: string
  term: string
  entityId: string
  sectionId: string
  /** Bölüm içindeki sıra (0'dan) */
  position: number
  tctx: string
}

export interface ShownSection {
  id: string
  entities: readonly { unifiedEntityId: string; track: { tctx: string } }[]
}

export class FeedbackLedger {
  private readonly byTctx = new Map<string, ShownItem>()
  private readonly byKey = new Map<string, ShownItem>()
  private readonly sent = new Set<string>()
  private readonly max: number

  constructor(max = 600) {
    this.max = max
  }

  /** Bir yanıtın bölümlerini kaydeder; konumlar bölüm içi sıradır. */
  registerPage(requestId: string, term: string, sections: readonly ShownSection[]): ShownItem[] {
    const out: ShownItem[] = []
    for (const s of sections)
      s.entities.forEach((e, position) => {
        out.push({ requestId, term, entityId: e.unifiedEntityId, sectionId: s.id, position, tctx: e.track.tctx })
      })
    for (const item of out) this.put(item)
    return out
  }

  private put(item: ShownItem): void {
    const k = itemKey(item.requestId, item.entityId)
    this.byKey.delete(k)
    this.byKey.set(k, item)
    if (item.tctx) {
      this.byTctx.delete(item.tctx)
      this.byTctx.set(item.tctx, item)
    }
    trim(this.byKey, this.max)
    trim(this.byTctx, this.max)
  }

  find(requestId: string, entityId: string): ShownItem | null {
    return this.byKey.get(itemKey(requestId, entityId)) ?? null
  }

  findByTctx(tctx: string | null | undefined): ShownItem | null {
    return tctx ? (this.byTctx.get(tctx) ?? null) : null
  }

  /** true → gönderilmeli (ilk kez); aynı (yanıt, öğe, eylem) ikinci kez false. */
  claim(item: ShownItem, action: FeedbackAction): boolean {
    const k = `${itemKey(item.requestId, item.entityId)}|${action}`
    if (this.sent.has(k)) return false
    this.sent.add(k)
    if (this.sent.size > this.max * 2) this.sent.delete(this.sent.values().next().value as string)
    return true
  }
}

const itemKey = (requestId: string, entityId: string) => `${requestId}|${entityId}`

function trim<K, V>(m: Map<K, V>, max: number): void {
  while (m.size > max) {
    const first = m.keys().next()
    if (first.done) break
    m.delete(first.value)
  }
}

/** `#/izle/Video:1?tctx=…` ya da `/izle/…?tctx=…` → tctx (oynat bağlantısı değilse null). */
export function playTctxOfHref(href: string): string | null {
  const path = href.includes('#') ? href.slice(href.indexOf('#') + 1) : href
  if (!path.startsWith('/izle/')) return null
  const q = path.indexOf('?')
  if (q < 0) return null
  return new URLSearchParams(path.slice(q + 1)).get('tctx')
}
