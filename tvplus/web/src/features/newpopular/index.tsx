/**
 * Yeni ve Popüler (#/yeni-ve-populer) — `lolomoByCategory.newPopular` satırları, vitrin yok (UX_SPEC §2 "Sayfalar"):
 * Yeni Gelenler · Top 10 Diziler · Top 10 Filmler · Son Şans · Herkes Bunları İzliyor.
 * Dışa aktarım adı SABİT: NewPopularPage.
 */
import type { ReactElement } from 'react'
import { useDocumentTitle, useShellOptions } from '../../app'
import { LolomoPage } from '../home'
import './newpopular.css'

export function NewPopularPage(): ReactElement {
  useShellOptions({ mobileTitle: 'Yeni ve Popüler' })
  useDocumentTitle('Yeni ve Popüler')
  return (
    <div className="np-page">
      <header className="ui-gutter np-head ui-desktop-only">
        <h1 className="ui-page-title np-title">Yeni ve Popüler</h1>
      </header>
      <LolomoPage category="newPopular" title="Yeni ve Popüler" />
    </div>
  )
}
