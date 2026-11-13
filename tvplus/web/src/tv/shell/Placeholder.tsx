/**
 * Henüz yazılmamış TV ekranlarının yer tutucusu: başlık, "Bu ekran hazırlanıyor" ve odaklanabilir Geri.
 */
import type { ReactElement } from 'react'
import { TvButton, TvScreen } from '../ui'
import { useTvBack } from './history'

export function TvPlaceholderScreen({
  id,
  title,
  detail,
}: {
  id: string
  title: string
  detail?: string
}): ReactElement {
  const back = useTvBack()
  return (
    <TvScreen id={id} title={title} defaultFocus={`${id}:geri`}>
      <div className="tv-placeholder">
        <h1 className="tv-heading">{title}</h1>
        {detail && <p className="tv-subtle tv-placeholder__detail">{detail}</p>}
        <p className="tv-placeholder__text">Bu ekran hazırlanıyor</p>
        <TvButton id={`${id}:geri`} label="Geri" icon="back" onPress={back} />
      </div>
    </TvScreen>
  )
}
