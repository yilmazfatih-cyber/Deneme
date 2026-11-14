/**
 * Arama — dışa aktarım adları SABİT.
 *   SearchBox   — masaüstü üst menüdeki kutu (app/HeaderSearch çerçeveler); altında modelin tamamlama tahminleri.
 *                 Kabuk bunu durağan içe aktarır: bu dosya İNCE kalır.
 *   SearchField — kutunun kendisi ('header' | 'page' biçimi).
 *   SearchPage  — #/ara?q= ; ağır sayfa kodu ayrı parça olarak (SearchPage.tsx) istek anında yüklenir.
 */
import { lazy, Suspense, type ReactElement } from 'react'
import { SkeletonGrid } from '../../ui'
import { SearchField } from './SearchField'

export { SearchField, SEARCH_PLACEHOLDER } from './SearchField'

const LazySearchPage = lazy(() => import('./SearchPage'))

/** #/ara?q= */
export function SearchPage(): ReactElement {
  return (
    <Suspense fallback={<SkeletonGrid count={12} />}>
      <LazySearchPage />
    </Suspense>
  )
}

export function SearchBox({ className }: { className?: string }): ReactElement {
  return <SearchField className={className} variant="header" />
}
