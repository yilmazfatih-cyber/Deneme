/**
 * Ana sayfa duyurusu (Netflix CLCS interstitial karşılığı: gql InterstitialHome / DismissInterstitial).
 * Satırların arasında ince, sakin bir şerit; kapatılınca sunucuya bildirilir.
 */
import { useState, type ReactElement } from 'react'
import { gql } from '../../api/graphql'
import { queryCache, useGql } from '../../api/hooks'
import { logEvent } from '../../telemetry/logger'
import { ButtonLink, IconButton } from '../../ui'
import { appPathOfHref } from '../preview'

interface InterstitialData {
  interstitial: { id: string; location: string; title: string; body: string; cta: string; href: string } | null
}

export function InterstitialBanner(): ReactElement | null {
  const { data } = useGql<InterstitialData, { location: string }>(
    'InterstitialHome',
    { location: 'HOME' },
    { ttlMs: 5 * 60_000 },
  )
  const [hidden, setHidden] = useState<string | null>(null)
  const item = data?.interstitial ?? null
  if (!item || hidden === item.id) return null
  const to = appPathOfHref(item.href)

  const dismiss = () => {
    setHidden(item.id)
    logEvent('click', { interstitialId: item.id, action: 'dismiss' })
    gql<{ dismissInterstitial: boolean }, { id: string }>('DismissInterstitial', { id: item.id }).then(
      () => queryCache.invalidate('InterstitialHome'),
      () => {
        /* kapatma kaydedilemediyse bir sonraki açılışta yeniden görünür; kullanıcıyı rahatsız etme */
      },
    )
  }

  return (
    <aside className="gz-banner ui-gutter" aria-labelledby="gz-banner-title">
      <div className="gz-banner__inner">
        <div className="gz-banner__text">
          <p className="gz-banner__title" id="gz-banner-title">
            {item.title}
          </p>
          <p className="ui-body gz-banner__body">{item.body}</p>
        </div>
        <div className="gz-banner__actions">
          {to ? (
            <ButtonLink size="sm" to={to} onClick={() => logEvent('click', { interstitialId: item.id, action: 'cta' })}>
              {item.cta}
            </ButtonLink>
          ) : (
            <ButtonLink size="sm" href={item.href}>
              {item.cta}
            </ButtonLink>
          )}
          <IconButton icon="close" label="Duyuruyu kapat" iconSize={20} onClick={dismiss} />
        </div>
      </div>
    </aside>
  )
}
