/**
 * TV Arama ekranı — YER TUTUCU (TV göz atma ekibi dolduracak). Dışa aktarım adı SABİT.
 *   TvSearch  /tv/ara   (telefon klavyesi için: registerTextTarget — web/src/tv/shell/commands.ts)
 */
import type { ReactElement } from 'react'
import { TvPlaceholderScreen } from '../shell/Placeholder'

export function TvSearch(): ReactElement {
  return <TvPlaceholderScreen id="ara" title="Ara" />
}
