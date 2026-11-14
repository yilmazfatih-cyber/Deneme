/**
 * TV Ana Sayfa ve kategori ekranları. Dışa aktarım adları SABİT.
 *   TvHome      /tv
 *   TvCategory  /tv/kategori/:category   (shows | movies | newPopular)
 * Üstte odaktaki başlık (görsel, bilgi, özet, etiketler; durunca sessiz önizleme), altta satırlar — ayrıntı:
 * ./Browse.tsx. Saf satır modeli ./model.ts, odak hafızası ./memory.ts.
 */
import type { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { TV_PATHS } from '../shell'
import { Browse } from './Browse'
import { CATEGORY_TITLES, isBrowseCategory } from './model'

export function TvHome(): ReactElement {
  return <Browse key="ana-sayfa" screenId="ana-sayfa" category="home" title="Ana Sayfa" />
}

export function TvCategory(): ReactElement {
  const { category = '' } = useParams()
  if (!isBrowseCategory(category)) return <Navigate to={TV_PATHS.home} replace />
  const title = CATEGORY_TITLES[category]
  return <Browse key={category} screenId={`kategori-${category}`} category={category} title={title} showPageTitle />
}
