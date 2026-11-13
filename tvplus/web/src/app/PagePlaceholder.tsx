/**
 * Henüz yazılmamış sayfalar için yer tutucu: başlık + iskelet + "Bu bölüm hazırlanıyor".
 * Sayfa ekipleri kendi modüllerini yazana dek yol tablosu bunu gösterir.
 */
import type { ReactElement } from 'react'
import { SkeletonGrid, SkeletonSlider } from '../ui'
import { useDocumentTitle } from './RouteEffects'

export function PagePlaceholder({
  title,
  variant = 'rows',
}: {
  title: string
  /** 'rows' satırlar · 'grid' ızgara */
  variant?: 'rows' | 'grid'
}): ReactElement {
  useDocumentTitle(title)
  return (
    <div className="app-placeholder">
      <header className="ui-gutter app-placeholder__head">
        <h1 className="ui-page-title">{title}</h1>
        <p className="ui-meta">Bu bölüm hazırlanıyor</p>
      </header>
      {variant === 'grid' ? (
        <SkeletonGrid count={12} />
      ) : (
        <>
          <SkeletonSlider />
          <SkeletonSlider />
        </>
      )}
    </div>
  )
}
