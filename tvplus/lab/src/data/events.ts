/**
 * Lab'ın kanonik olayı ve ikili kayıt biçimi.
 *
 * Katalogdan BAĞIMSIZDIR: içerik, olaydaki kendi kimliğiyle sözlüğe girer (örnek uygulamanın kataloğuyla eşleşmesi
 * gerekmez). Churn ve davranış analizi oynatma dışındaki olayları da ister: açılış, hata, takılma, arama, abonelik.
 *
 * Kayıt (32 bayt, küçük-endian):
 *    0 u32 uidHi   takma kimliğin üst 32 biti  (HMAC-SHA256(anahtar, ham kimlik) ilk 8 bayt)
 *    4 u32 uidLo
 *    8 u32 ts      epoch saniye (UTC)
 *   12 u8  kind    KINDS dizini
 *   13 u8  flags   FLAG_* bitleri
 *   14 u16 aux     türe özgü küçük kod: ekran / hata kodu / kol / satır içi sıra
 *   16 u32 cid     içerik sözlüğü dizini (0 = yok); EXPOSURE'da deney kodu
 *   20 f32 v1      izlenen sn | takılma sn | sonuç sayısı | puan | tutar | (PLAY_START) süre
 *   24 f32 v2      konum sn | satır dizini
 *   28 u32 tuple   boyut demeti kimliği (cihaz, ülke, plan, sürüm … birleşimi)
 */

export const KINDS = [
  'OTHER',
  'APP_OPEN',
  'SCREEN',
  'IMPRESSION',
  'CLICK',
  'PLAY_START',
  'PLAY_PROGRESS',
  'PLAY_END',
  'PLAY_ERROR',
  'BUFFER',
  'SEARCH',
  'LIST_ADD',
  'LIST_REMOVE',
  'RATING',
  'SIGNUP',
  'LOGIN',
  'SUBSCRIBE',
  'RENEW',
  'CANCEL',
  'EXPIRE',
  'PAYMENT_FAIL',
  'NOTIF_OPEN',
  'APP_ERROR',
  'EXPOSURE',
] as const
export type Kind = (typeof KINDS)[number]

export const K: { readonly [P in Kind]: number } = Object.fromEntries(KINDS.map((k, i) => [k, i])) as {
  [P in Kind]: number
}

/** Türkçe kısa adlar (çıktılar için) */
export const KIND_LABEL: Record<Kind, string> = {
  OTHER: 'diğer',
  APP_OPEN: 'açılış',
  SCREEN: 'ekran',
  IMPRESSION: 'gösterim',
  CLICK: 'tıklama',
  PLAY_START: 'oynatma başı',
  PLAY_PROGRESS: 'oynatma ilerlemesi',
  PLAY_END: 'oynatma sonu',
  PLAY_ERROR: 'oynatma hatası',
  BUFFER: 'takılma',
  SEARCH: 'arama',
  LIST_ADD: 'listeye ekleme',
  LIST_REMOVE: 'listeden çıkarma',
  RATING: 'beğeni',
  SIGNUP: 'kayıt',
  LOGIN: 'giriş',
  SUBSCRIBE: 'abonelik başı',
  RENEW: 'yenileme',
  CANCEL: 'iptal',
  EXPIRE: 'abonelik sonu',
  PAYMENT_FAIL: 'ödeme hatası',
  NOTIF_OPEN: 'bildirim açma',
  APP_ERROR: 'uygulama hatası',
  EXPOSURE: 'deney maruziyeti',
}

export const FLAG_COMPLETED = 1
export const FLAG_LIVE = 2
/** SEARCH: sonuç dönmedi */
export const FLAG_EMPTY = 4
/** v1 bilinmiyor (kaynakta değer yoktu) */
export const FLAG_NO_V1 = 8

export const RECORD_BYTES = 32

/** İzleme sayılan türler (varsayılan "etkinlik" tanımı) */
export const PLAY_KINDS: readonly Kind[] = ['PLAY_START', 'PLAY_PROGRESS', 'PLAY_END']

export const DEVICE_CLASSES = ['bilinmiyor', 'TV', 'MOBIL', 'WEB', 'DIGER'] as const
export type DeviceClass = (typeof DEVICE_CLASSES)[number]

/** İçerik sınıfı (eşlemedeki typeMap bu değerlere çevirir) */
export const CONTENT_CLASSES = ['bilinmiyor', 'FILM', 'BOLUM', 'CANLI', 'SPOR', 'KLIP', 'DIGER'] as const
export type ContentClass = (typeof CONTENT_CLASSES)[number]

export interface LabRecord {
  uidHi: number
  uidLo: number
  ts: number
  kind: number
  flags: number
  aux: number
  cid: number
  v1: number
  v2: number
  tuple: number
}

/** Kayıtları tipli görünümle okuma/yazma: tek DataView üstünde çalışır. */
export function writeRecord(view: DataView, off: number, r: LabRecord): void {
  view.setUint32(off, r.uidHi, true)
  view.setUint32(off + 4, r.uidLo, true)
  view.setUint32(off + 8, r.ts, true)
  view.setUint8(off + 12, r.kind)
  view.setUint8(off + 13, r.flags)
  view.setUint16(off + 14, r.aux, true)
  view.setUint32(off + 16, r.cid, true)
  view.setFloat32(off + 20, r.v1, true)
  view.setFloat32(off + 24, r.v2, true)
  view.setUint32(off + 28, r.tuple, true)
}
