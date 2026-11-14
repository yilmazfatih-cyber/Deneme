/**
 * Yeni ve Popüler (#/yeni-ve-populer) — `lolomoByCategory.newPopular` satırları, vitrin yok (UX_SPEC §2 "Sayfalar"):
 * Yeni Gelenler · Top 10 Diziler · Top 10 Filmler · Son Şans · Herkes Bunları İzliyor.
 * Mobilde aynı satırlar dikey bir akış olarak çizilir (Feed.tsx): bölüm çipleri, büyük kartlar, Top 10 rakamları.
 * Dışa aktarım adı SABİT: NewPopularPage.
 */
import type { ReactElement } from 'react'
import { useDocumentTitle, useShellOptions } from '../../app'
import { useFormFactor } from '../../lib/formFactor'
import { LolomoPage } from '../home'
import { NewPopularFeed } from './Feed'
import './newpopular.css'

export function NewPopularPage(): ReactElement {
  useShellOptions({ mobileTitle: 'Yeni ve Popüler', keepPills: true })
  useDocumentTitle('Yeni ve Popüler')
  // Mobil: bölüm çipleri ve büyük kartlarla dikey akış; masaüstü: satırlar
  const mobile = useFormFactor() === 'mobile'
  if (mobile)
    return (
      <div className="np-page">
        <NewPopularFeed />
      </div>
    )
  return (
    <div className="np-page">
      <header className="ui-gutter np-head ui-desktop-only">
        <h1 className="ui-page-title np-title">Yeni ve Popüler</h1>
      </header>
      <LolomoPage category="newPopular" title="Yeni ve Popüler" />
    </div>
  )
}
