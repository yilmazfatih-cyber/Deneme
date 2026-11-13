/**
 * TV Detay ve Bölümler ekranları — YER TUTUCU (TV göz atma ekibi dolduracak). Dışa aktarım adları SABİT.
 *   TvDetail    /tv/baslik/:videoId
 *   TvEpisodes  /tv/baslik/:videoId/bolumler
 */
import type { ReactElement } from 'react'
import { useParams } from 'react-router-dom'
import { TvPlaceholderScreen } from '../shell/Placeholder'

export function TvDetail(): ReactElement {
  const { videoId = '' } = useParams()
  return <TvPlaceholderScreen id={`detay-${videoId}`} title="Detay" detail={`Başlık ${videoId}`} />
}

export function TvEpisodes(): ReactElement {
  const { videoId = '' } = useParams()
  return <TvPlaceholderScreen id={`bolumler-${videoId}`} title="Bölümler" detail={`Başlık ${videoId}`} />
}
