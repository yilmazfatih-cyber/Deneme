/**
 * Ana sayfa ekleri: Canlı TV köprü şeridi (bridge bağlamı) ve satırların üstündeki duyuru
 * (Netflix CLCS interstitial karşılığı: gql InterstitialHome / DismissInterstitial).
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { gql } from '../../api/graphql'
import { queryCache, useGql } from '../../api/hooks'
import { Button, Icon, IconButton } from '../../design'
import { logEvent } from '../../telemetry/logger'
import { appPathOfHref } from '../preview'
import type { ListSummary } from './lolomo'

/** Diğer dünyaya küçük köprü (DESIGN_SPEC §0): Canlı TV'ye götüren ince şerit. */
export function BridgeStrip({ summary, rowIndex }: { summary: ListSummary; rowIndex: number }): ReactElement {
  useEffect(() => {
    logEvent('impression', { listId: summary.id, context: 'bridge', row: rowIndex, trackId: summary.trackId, ranks: '', entityIds: [] })
  }, [summary.id, summary.trackId, rowIndex])
  return (
    <Link
      to="/canli"
      className="hm-bridge cn-gutter-x"
      onClick={() => logEvent('click', { listId: summary.id, context: 'bridge', action: 'mode', to: 'canli' })}
    >
      <span className="hm-bridge__icon" aria-hidden="true">
        <Icon name="guide" size={24} />
      </span>
      <span className="hm-bridge__text">
        <span className="hm-bridge__title">{summary.displayName || 'Canlı TV'}</span>
        <span className="cn-meta">Kanallara geç, yayını şimdi izle</span>
      </span>
      <Icon name="chevronRight" size={24} className="hm-bridge__chev" />
    </Link>
  )
}

interface InterstitialData {
  interstitial: { id: string; location: string; title: string; body: string; cta: string; href: string } | null
}

export function InterstitialBanner(): ReactElement | null {
  const { data } = useGql<InterstitialData, { location: string }>('InterstitialHome', { location: 'HOME' }, { ttlMs: 5 * 60_000 })
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
    <aside className="hm-banner cn-gutter-x" aria-labelledby="hm-banner-title">
      <div className="hm-banner__text">
        <p className="hm-banner__title" id="hm-banner-title">
          {item.title}
        </p>
        <p className="cn-body">{item.body}</p>
      </div>
      <div className="hm-banner__actions">
        {to ? (
          <Button variant="secondary" size="md" to={to} onClick={() => logEvent('click', { interstitialId: item.id, action: 'cta' })}>
            {item.cta}
          </Button>
        ) : (
          <Button variant="secondary" size="md" href={item.href}>
            {item.cta}
          </Button>
        )}
        <IconButton icon="close" label="Duyuruyu kapat" size={40} onClick={dismiss} />
      </div>
    </aside>
  )
}
