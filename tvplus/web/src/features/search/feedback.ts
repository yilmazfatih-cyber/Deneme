/**
 * Modelin öğrenme döngüsü (istemci tarafı): `recordSearchFeedback` gönderimi.
 *   CLICK        sonuç kartına / bağlantısına basıldı (SearchPage çağırır)
 *   PLAY         karttan, önizlemeden ya da detaydan oynat bağlantısı — kartın tctx'i ile tanınır
 *   ADD_TO_LIST  önizleme / detaydan Listeme ekle — `AddToPlaylist` isteğinin tctx'i ile tanınır (devbus)
 * Gönderim ateşle-unut: gezinmeyi asla bekletmez, hata sessizdir. Gönderildiği anda o terimin önbellek girdileri
 * silinir — aynı terimin bir sonraki araması güncellenmiş modelle sıralanır.
 */
import { gql } from '../../api/graphql'
import { devbus, type DevEvent } from '../../lib/devbus'
import { FeedbackLedger, playTctxOfHref, type FeedbackAction, type ShownItem } from './feedbackLedger'
import { invalidateTerm } from './searchStore'

export const ledger = new FeedbackLedger()

type Listener = (item: ShownItem, action: FeedbackAction) => void
const listeners = new Set<Listener>()

/** Geri bildirim gönderildi (sayfa açıklama penceresini tazelemek için dinleyebilir). */
export function onFeedback(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function sendFeedback(item: ShownItem | null, action: FeedbackAction): void {
  if (!item || !ledger.claim(item, action)) return
  invalidateTerm(item.term)
  devbus.emit('predict', 'geri bildirim', {
    term: item.term,
    entityId: item.entityId,
    action,
    position: item.position,
    sectionId: item.sectionId,
    requestId: item.requestId,
  })
  gql<{ recordSearchFeedback: boolean }, object>('RecordSearchFeedback', {
    requestId: item.requestId,
    searchTerm: item.term,
    unifiedEntityId: item.entityId,
    position: item.position,
    action,
  }).then(
    // Yanıttan önce başlamış bir sorgu eski sırayı önbelleğe yazmış olabilir: yeniden temizle.
    () => invalidateTerm(item.term),
    () => undefined,
  )
  for (const l of listeners) {
    try {
      l(item, action)
    } catch {
      /* dinleyici hatası gönderimi durdurmaz */
    }
  }
}

/* ───────────── Oynat / Listem dinleyicileri (bir kez kurulur) ───────────── */

let installed = false

/**
 * Belge düzeyinde dinler; başka ekiplerin bileşenlerine dokunmadan çalışır:
 *  - oynat bağlantısına basış (`#/izle/…?tctx=`) ya da adresin oynatıcıya geçmesi (düğmeyle `navigate`) —
 *    önizleme kartı, detay penceresi, mobil detay; aynı yanıtta aynı öğe için bir kez (defter `claim`);
 *  - başarılı `AddToPlaylist` isteği (devbus `graphql` olayı, değişkenlerde tctx).
 */
export function installFeedbackListeners(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]')
      if (!a) return
      const tctx = playTctxOfHref(a.getAttribute('href') ?? '')
      if (tctx) sendFeedback(ledger.findByTctx(tctx), 'PLAY')
    },
    true,
  )
  // Oynatmayı düğmeyle (navigate) başlatan bileşenler için: adres oynatıcıya geçti mi? HashRouter pushState
  // kullanır (hashchange gelmez) — hafif bir yoklama yeterli; tctx yalnız ilk görüşte sayılır.
  let lastHash = location.hash
  window.setInterval(() => {
    const h = location.hash
    if (h === lastHash) return
    lastHash = h
    const tctx = playTctxOfHref(h)
    if (tctx) sendFeedback(ledger.findByTctx(tctx), 'PLAY')
  }, 300)
  devbus.subscribe((ev: DevEvent) => {
    if (ev.cat !== 'graphql' || ev.label !== 'AddToPlaylist' || !ev.ok) return
    const vars = ev.detail?.variables as { tctx?: unknown } | undefined
    if (typeof vars?.tctx === 'string') sendFeedback(ledger.findByTctx(vars.tctx), 'ADD_TO_LIST')
  })
}
