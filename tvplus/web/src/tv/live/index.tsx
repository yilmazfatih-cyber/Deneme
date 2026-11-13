/**
 * TV Canlı TV ve Rehber ekranları — YER TUTUCU (TV canlı + kumanda ekibi dolduracak). Dışa aktarım adları SABİT.
 *   TvLive   /tv/canli
 *   TvGuide  /tv/rehber
 */
import type { ReactElement } from 'react'
import { TvPlaceholderScreen } from '../shell/Placeholder'

export function TvLive(): ReactElement {
  return <TvPlaceholderScreen id="canli" title="Canlı TV" />
}

export function TvGuide(): ReactElement {
  return <TvPlaceholderScreen id="rehber" title="Rehber" />
}
