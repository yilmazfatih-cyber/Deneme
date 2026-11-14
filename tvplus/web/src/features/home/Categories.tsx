/**
 * Kategori gezintisi:
 *   Mobil  — üst çubuğun altındaki haplar (UX_SPEC §3): Diziler · Filmler · Canlı TV · Kategoriler ▾; kategori
 *            seçiliyken başında ✕. "Kategoriler" türlerin listesini alt sayfada açar.
 *   Masaüstü — Diziler / Filmler sayfasının başlığı + "Türler ▾" açılır listesi (vitrinin üstünde, menünün altında).
 * Tür listesi: o kategorinin lolomo'sundaki tür satırları (sunucu en az 4 başlığı olan türleri satır yapar);
 * ana sayfada ya da liste gelmeden önce sabit sözlük (shared/taxonomy).
 */
import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { GENRES } from '../../../../shared/taxonomy'
import { useScrolled, Dropdown, MenuItem, Pill, PillClear, Sheet, cx } from '../../ui'
import { ShellPills } from '../../app'
import {
  genreLinksOf,
  lolomoRoot,
  summaryPath,
  type ListSummary,
  type LolomoCategory,
  type LolomoSummary,
} from './lolomo'
import { useFalcorView } from './useFalcorView'

export interface GenreLink {
  to: string
  name: string
}

/** Sabit tür sözlüğü, ada göre (Türkçe sıralama). */
export const ALL_GENRES: GenreLink[] = Object.values(GENRES)
  .map((g) => ({ to: `/tur/${g.genreId}`, name: g.name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

/** Kategorinin tür satırları (Türler ▾). Ana sayfada sabit sözlük. */
export function useGenreLinks(category: LolomoCategory): GenreLink[] {
  const root = lolomoRoot(category)
  const enabled = category === 'shows' || category === 'movies'
  const top = useFalcorView<{ lolomoByCategory?: Record<string, { summary?: LolomoSummary }> }>(
    enabled ? [summaryPath(root)] : [],
    { fetch: enabled },
  )
  const length = top.json.lolomoByCategory?.[category]?.summary?.length ?? 0
  const all = useFalcorView<{ lolomoByCategory?: Record<string, Record<string, { summary?: ListSummary }>> }>(
    enabled && length > 0 ? [[...root, { from: 0, to: length - 1 }, 'summary']] : [],
    { fetch: enabled },
  )
  if (!enabled) return ALL_GENRES
  const node = all.json.lolomoByCategory?.[category] ?? {}
  const links = genreLinksOf(Array.from({ length }, (_, i) => node[String(i)]?.summary))
  return links.length ? links.sort((a, b) => a.name.localeCompare(b.name, 'tr')) : ALL_GENRES
}

const CATEGORY_PILLS: { category: 'shows' | 'movies'; label: string; to: string }[] = [
  { category: 'shows', label: 'Diziler', to: '/goz-at/diziler' },
  { category: 'movies', label: 'Filmler', to: '/goz-at/filmler' },
]

/** Mobil hap sırası + Kategoriler alt sayfası. */
export function BrowsePills({ category }: { category: LolomoCategory }): ReactElement {
  const [open, setOpen] = useState(false)
  const genres = useGenreLinks(category)
  const selected = CATEGORY_PILLS.find((p) => p.category === category)
  return (
    <>
      <ShellPills label="Kategoriler">
        {selected ? (
          <>
            <PillClear to="/goz-at" label={`${selected.label} seçimini kaldır`} />
            <Pill selected to={selected.to}>
              {selected.label}
            </Pill>
          </>
        ) : (
          <>
            {CATEGORY_PILLS.map((p) => (
              <Pill key={p.category} to={p.to}>
                {p.label}
              </Pill>
            ))}
            <Pill to="/canli">Canlı TV</Pill>
          </>
        )}
        <Pill caret onClick={() => setOpen(true)}>
          {selected ? 'Tüm Kategoriler' : 'Kategoriler'}
        </Pill>
      </ShellPills>
      <Sheet open={open} onClose={() => setOpen(false)} title={selected ? `${selected.label}: Türler` : 'Kategoriler'}>
        <nav aria-label="Türler">
          <ul className="gz-cat-list">
            {!selected && (
              <li>
                <Link to="/listem" className="gz-cat-list__link" onClick={() => setOpen(false)}>
                  Listem
                </Link>
              </li>
            )}
            {genres.map((g) => (
              <li key={g.to}>
                <Link to={g.to} className="gz-cat-list__link" onClick={() => setOpen(false)}>
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Sheet>
    </>
  )
}

/** Masaüstü: "Diziler  [Türler ▾]" — vitrinin üstünde, üst menünün hemen altında; sayfa kayınca zemin alır. */
export function CategoryHeader({ category, title }: { category: 'shows' | 'movies'; title: string }): ReactElement {
  const genres = useGenreLinks(category)
  const scrolled = useScrolled(0)
  return (
    <div className="gz-subnav ui-desktop-only">
      <div className={cx('gz-subnav__bar ui-gutter', scrolled && 'is-solid')}>
        <h1 className="gz-subnav__title">{title}</h1>
        <Dropdown label="Türler" columns={genres.length > 12 ? 3 : 2} className="gz-subnav__genres">
          {genres.map((g) => (
            <MenuItem key={g.to} to={g.to}>
              {g.name}
            </MenuItem>
          ))}
        </Dropdown>
      </div>
    </div>
  )
}
