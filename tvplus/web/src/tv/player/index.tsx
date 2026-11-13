/**
 * TV oynatıcı ekranı — GEÇİCİ (TV canlı + kumanda ekibi dolduracak). Dışa aktarım adı SABİT.
 *   TvWatch  /tv/izle/:viewableId   (?konum=<sn>&baslat=bastan&tctx=…)
 * Şimdilik oynatıcının TV kabuğunu (`chrome="tv"`) doğrudan bağlar: oynatıcı tuşları kendisi dinler,
 * odak motoru bu sırada geri çekilir (TvApp → FocusRoot keyboardSuspended).
 */
import type { ReactElement } from 'react'
import { WatchPage } from '../../player'

export function TvWatch(): ReactElement {
  return <WatchPage chrome="tv" />
}
