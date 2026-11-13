/**
 * TV Ana Sayfa ve kategori ekranları — YER TUTUCU (TV göz atma ekibi dolduracak). Dışa aktarım adları SABİT.
 *   TvHome      /tv
 *   TvCategory  /tv/kategori/:category   (shows | movies | newPopular)
 */
import type { ReactElement } from 'react'
import { useParams } from 'react-router-dom'
import { TvPlaceholderScreen } from '../shell/Placeholder'

export function TvHome(): ReactElement {
  return <TvPlaceholderScreen id="ana-sayfa" title="Ana Sayfa" />
}

const CATEGORY_TITLES: Record<string, string> = { shows: 'Diziler', movies: 'Filmler', newPopular: 'Yeni ve Popüler' }

export function TvCategory(): ReactElement {
  const { category = '' } = useParams()
  return <TvPlaceholderScreen id={`kategori-${category}`} title={CATEGORY_TITLES[category] ?? 'Kategori'} />
}
