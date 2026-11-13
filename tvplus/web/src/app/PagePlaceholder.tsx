/** Henüz yazılmamış sayfalar için yer tutucu: başlık + iskelet satırı + "Bu bölüm hazırlanıyor". */
import type { ReactElement } from 'react'
import { Page, SkeletonRow } from '../design'

export function PagePlaceholder({
  title,
  variant = 'poster',
}: {
  title: string
  variant?: 'poster' | 'landscape' | 'tile'
}): ReactElement {
  return (
    <Page title={title}>
      <p className="cn-body cn-gutter-x">Bu bölüm hazırlanıyor</p>
      <SkeletonRow variant={variant} />
    </Page>
  )
}
