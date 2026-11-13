/**
 * Vitrin (billboard): geniş görsel, başlık logosu (yoksa başlık), kısa özet, RTÜK işareti,
 * TEK birincil buton ("İzle" / "Devam et") + ikincil "Detay".
 *   - Vitrin ön hazırlığı: oynatılabilir öğenin lisanslı manifesti tıklamadan önce istenir (prefetchManifest).
 *   - Web'de ~2 sn sonra sessiz tanıtım klibi (promoVideo varsa, hareket azaltma tercihi yoksa, vitrin görünürken).
 *     Klip başlayamazsa sessizce durağan görselde kalınır.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { AccessLock, AdvisoryBadge, Button, ErrorState } from '../../design'
import { PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { notePlaybackIntent } from '../preview'
import { mapHero, type ImpressionTracker, type ListNode } from './lolomo'
import { prefetchOnce } from './LolomoRow'

const PROMO_DELAY_MS = 2000

function canAutoplayPromo(): boolean {
  try {
    return window.matchMedia('(min-width: 900px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export interface BillboardProps {
  list: ListNode
  rowIndex: number
  loading: boolean
  error: Error | null
  onRetry: () => void
  tracker: ImpressionTracker
}

export function Billboard({ list, rowIndex, loading, error, onRetry, tracker }: BillboardProps): ReactElement | null {
  const hero = mapHero(list, rowIndex)
  const rootRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(true)
  const [armed, setArmed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [broken, setBroken] = useState(false)

  const prefetchId = hero?.prefetchViewableId ?? null
  useEffect(() => {
    prefetchOnce(prefetchId)
  }, [prefetchId])

  // Görünürlük: gösterim olayı + klip yalnız vitrin ekrandayken.
  const videoId = hero?.videoId ?? null
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [videoId])

  const entityId = hero?.entityId ?? null
  const listId = list.summary?.id ?? 'billboard'
  const trackId = list.summary?.trackId ?? 0
  useEffect(() => {
    if (!entityId || !visible) return
    if (tracker.record(listId, 0, 0).length) {
      logEvent('impression', { listId, context: 'billboard', row: rowIndex, trackId, ranks: '0', entityIds: [entityId] })
    }
  }, [entityId, visible, listId, trackId, rowIndex, tracker])

  const promo = hero?.promo ?? null
  const promoId = promo?.viewableId ?? null
  useEffect(() => {
    if (!promoId || !visible || !canAutoplayPromo()) {
      setArmed(false)
      setPlaying(false)
      return
    }
    const t = window.setTimeout(() => setArmed(true), PROMO_DELAY_MS)
    return () => clearTimeout(t)
  }, [promoId, visible])

  if (!hero) {
    if (error) return <ErrorState title="Vitrin yüklenemedi" onRetry={onRetry} />
    return loading ? <div className="hm-hero-skel" aria-busy="true" /> : null
  }

  return (
    <section ref={rootRef} className="hm-hero" aria-labelledby="hm-hero-title">
      <div className="hm-hero__media">
        {hero.artUrl && <img className="hm-hero__art" src={hero.artUrl} alt="" />}
        {promo && armed && !broken && (
          <div className={playing ? 'hm-hero__clip hm-hero__clip--on' : 'hm-hero__clip'}>
            <PreviewPlayer viewableId={promo.viewableId} offsetSec={promo.offset} muted onPlaying={() => setPlaying(true)} onError={() => setBroken(true)} />
          </div>
        )}
        <span className="hm-hero__shade" aria-hidden="true" />
      </div>
      <div className="hm-hero__body">
        {hero.logoUrl ? (
          <h2 id="hm-hero-title" className="hm-hero__logo">
            <img src={hero.logoUrl} alt={hero.title} />
          </h2>
        ) : (
          <h2 id="hm-hero-title" className="cn-hero-title">
            {hero.title}
          </h2>
        )}
        {hero.synopsis && <p className="cn-body hm-hero__synopsis">{hero.synopsis}</p>}
        <div className="hm-hero__meta">
          {hero.maturity && <AdvisoryBadge certification={hero.maturity.certificationValue} reasons={hero.maturity.reasons} />}
          {hero.accessText && <AccessLock text={hero.accessText} />}
        </div>
        <div className="hm-hero__actions">
          {hero.playTo ? (
            <Button
              icon="play"
              to={hero.playTo}
              onClick={() => {
                if (hero.playVideoId !== null) notePlaybackIntent(hero.playVideoId, hero.videoId)
                logEvent('click', { videoId: hero.videoId, action: hero.resume ? 'resume' : 'play', from: 'billboard' }, hero.tctx)
              }}
            >
              {hero.primaryLabel}
            </Button>
          ) : (
            <Button icon="info" to={hero.detailTo} onClick={() => logEvent('click', { videoId: hero.videoId, action: 'detail', from: 'billboard' }, hero.tctx)}>
              Detay
            </Button>
          )}
          {hero.playTo && (
            <Button
              variant="secondary"
              overImage
              icon="info"
              to={hero.detailTo}
              onClick={() => logEvent('click', { videoId: hero.videoId, action: 'detail', from: 'billboard' }, hero.tctx)}
            >
              Detay
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
