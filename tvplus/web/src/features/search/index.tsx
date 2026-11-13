/**
 * Arama — dışa aktarım adları SABİT.
 *   SearchBox  — web üst çubuğundaki kutu (360×44, hap). Kabuk bunu durağan içe aktarır: bu dosya İNCE kalır.
 *   SearchPage — #/ara?q= ; ağır sayfa kodu ayrı parça olarak (SearchPage.tsx) istek anında yüklenir.
 */
import { lazy, Suspense, type ReactElement } from 'react'
import { SkeletonRow } from '../../design'
import { SearchField } from './SearchField'

const LazySearchPage = lazy(() => import('./SearchPage'))

/** #/ara?q= */
export function SearchPage(): ReactElement {
  return (
    <Suspense fallback={<SkeletonRow variant="poster" count={6} />}>
      <LazySearchPage />
    </Suspense>
  )
}

export function SearchBox({ className }: { className?: string }): ReactElement {
  return <SearchField className={className} />
}
