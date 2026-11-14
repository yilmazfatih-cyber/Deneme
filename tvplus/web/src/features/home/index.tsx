/**
 * Ana Sayfa (#/goz-at) — Netflix göz atma deneyimi, TV+ markası (UX_SPEC §2, §3).
 * Masaüstü: saydam üst menünün altına uzanan vitrin, ona binen satırlar, önizleme kartı.
 * Mobil: haplar (Diziler · Filmler · Canlı TV · Kategoriler ▾), çerçeveli vitrin kartı, afiş satırları.
 * Dışa aktarım adı SABİT: HomePage. Diziler / Filmler / Yeni ve Popüler aynı `LolomoPage`'i kullanır.
 */
import type { ReactElement } from 'react'
import { useShellOptions } from '../../app'
import { BrowsePills } from './Categories'
import { LolomoPage } from './LolomoPage'

export { LolomoPage, type LolomoPageProps } from './LolomoPage'
export { BrowsePills, CategoryHeader, useGenreLinks, ALL_GENRES, type GenreLink } from './Categories'

export function HomePage(): ReactElement {
  useShellOptions({ fullBleed: true })
  return (
    <>
      <BrowsePills category="home" />
      <LolomoPage category="home" title="Ana Sayfa" />
    </>
  )
}
