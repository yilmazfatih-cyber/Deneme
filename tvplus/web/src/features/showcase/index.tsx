/**
 * Cihaz vitrini (#/vitrin) — YER TUTUCU. Cihaz deneyimi ekibi dolduracak; dışa aktarım adı SABİT: ShowcasePage.
 * Kabuksuz ve korumasız çizilir (UX_SPEC §5: TV, web ve mobil yan yana, her biri ayrı sanal cihaz).
 */
import type { ReactElement } from 'react'
import { PagePlaceholder } from '../../app'

export function ShowcasePage(): ReactElement {
  return (
    <main className="app-bare">
      <PagePlaceholder title="Cihaz vitrini" variant="grid" />
    </main>
  )
}
