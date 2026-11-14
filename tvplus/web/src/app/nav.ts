/**
 * Masaüstü üst menü bağlantıları ve etkin öğe kararı (saf; birim testi nav.test.ts).
 * Etkin öğe yalnız o bölümün kendi yollarında yanar: /tur/*, /koleksiyon/*, /kisi/*, /studyo, /cihazlar …
 * gibi sayfalarda hiçbir bağlantı etkin değildir (Netflix'te tür / kişi sayfası da menüde işaretlenmez).
 */
export interface NavEntry {
  label: string
  to: string
  /** Etkin sayılır mı (alt yollar dahil) */
  match: (pathname: string) => boolean
}

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`)

/** Üst menü bağlantıları (sıra UX_SPEC §2). /studyo bilerek yok (avatar menüsünde). */
export const DESKTOP_NAV: readonly NavEntry[] = [
  { label: 'Ana Sayfa', to: '/goz-at', match: (p) => p === '/goz-at' },
  { label: 'Canlı TV', to: '/canli', match: (p) => under('/canli')(p) || under('/rehber')(p) },
  { label: 'Diziler', to: '/goz-at/diziler', match: under('/goz-at/diziler') },
  { label: 'Filmler', to: '/goz-at/filmler', match: under('/goz-at/filmler') },
  { label: 'Yeni ve Popüler', to: '/yeni-ve-populer', match: under('/yeni-ve-populer') },
  { label: 'Listem', to: '/listem', match: under('/listem') },
]

/** Etkin üst menü öğesi; yoksa null. */
export function activeDesktopNav(pathname: string): NavEntry | null {
  return DESKTOP_NAV.find((n) => n.match(pathname)) ?? null
}
