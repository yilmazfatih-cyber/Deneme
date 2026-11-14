/**
 * Kart önizlemesi: sessiz, kısa tanıtım oynatımı. Manifest { promo: true, prefetch: true } ile istenir.
 * STREAMS → kendi motorumuz (360 px yükseklik sınırı), EXTERNAL_EMBED → sessiz otomatik oynayan iframe,
 * PROGRESSIVE → sessiz <video> (#t=). 30 sn sonra durur; söküldüğünde her şey temizlenir.
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { createAdapter } from '../adapters'
import type { PlayerAdapter } from '../adapters/types'
import { requestManifest } from '../net/manifest'
import './player.css'

const PREVIEW_MAX_SEC = 30
const PREVIEW_MAX_HEIGHT = 360
/** YouTube gömme kuralı: çerçeve en az 200×200 */
const EMBED_MIN = 200

export interface PreviewPlayerProps {
  viewableId: string
  offsetSec: number
  muted?: boolean
  onPlaying?: () => void
  onError?: () => void
  /** En uzun oynatma (sn); varsayılan 30. null → söküline dek oynar (canlı kanal önizlemesi) */
  maxSec?: number | null
  /** Önizleme kendiliğinden durunca (maxSec doldu) ya da yayın bitince bir kez */
  onEnded?: () => void
  /** Görüntünün kutuya yerleşimi; varsayılan 'contain' (bugünkü gibi). YouTube çerçevesinde etkisizdir. */
  fit?: 'contain' | 'cover'
}

export default function PreviewPlayerImpl({
  viewableId,
  offsetSec,
  muted = true,
  onPlaying,
  onError,
  maxSec = PREVIEW_MAX_SEC,
  onEnded,
  fit = 'contain',
}: PreviewPlayerProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<PlayerAdapter | null>(null)
  const cbs = useRef({ onPlaying, onError, onEnded })
  cbs.current = { onPlaying, onError, onEnded }
  const fitRef = useRef(fit)
  fitRef.current = fit
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    let cancelled = false
    let stopTimer: number | null = null
    let failed = false
    let ended = false
    const end = () => {
      if (cancelled || ended) return
      ended = true
      cbs.current.onEnded?.()
    }
    const fail = (why: string) => {
      if (cancelled || failed) return
      failed = true
      devbus.emit('player', 'önizleme başarısız', { viewableId, state: 'error', reason: why }, { ok: false })
      cbs.current.onError?.()
    }
    void (async () => {
      let m
      try {
        m = await requestManifest(viewableId, { promo: true, prefetch: true })
      } catch (err) {
        fail(String(err))
        return
      }
      const host = ref.current
      if (cancelled || !host) return
      if (m.kind === 'EXTERNAL_EMBED') {
        const r = host.getBoundingClientRect()
        if (r.width < EMBED_MIN || r.height < EMBED_MIN) {
          // Kural gereği küçük kutuda YouTube gömülmez; kart durağan görselde kalır
          fail(`gömme için alan küçük (${Math.round(r.width)}×${Math.round(r.height)})`)
          return
        }
      }
      const a = createAdapter(m, {
        startSec: offsetSec,
        autoplay: true,
        muted: mutedRef.current,
        maxHeight: PREVIEW_MAX_HEIGHT,
        preview: true,
        refreshManifest: () => requestManifest(viewableId, { promo: true, prefetch: true, fresh: true }),
      })
      adapterRef.current = a
      a.on((e) => {
        if (e.type === 'firstFrame') {
          logEvent('preview.start', { viewableId, kind: m.kind, offsetSec })
          cbs.current.onPlaying?.()
          if (maxSec !== null && maxSec > 0 && stopTimer === null) {
            stopTimer = window.setTimeout(() => {
              a.pause()
              devbus.emit('player', `önizleme durdu (${maxSec} sn)`, {
                viewableId,
                state: 'paused',
                positionSec: Math.round(a.position()),
              })
              end()
            }, maxSec * 1000)
          }
        } else if (e.type === 'state' && e.state === 'ended') {
          end()
        } else if (e.type === 'error') {
          fail(e.error.message)
        }
      })
      if (a.media) a.media.style.objectFit = fitRef.current
      await a.mount(host)
    })()
    return () => {
      cancelled = true
      if (stopTimer !== null) clearTimeout(stopTimer)
      adapterRef.current?.destroy()
      adapterRef.current = null
    }
    // maxSec yalnız kurulumda okunur (değişirse önizleme yeniden kurulur)
  }, [viewableId, offsetSec, maxSec])

  useEffect(() => {
    const v = adapterRef.current?.media
    if (v) v.style.objectFit = fit
  }, [fit])

  useEffect(() => {
    adapterRef.current?.setMuted(muted)
  }, [muted])

  return <div ref={ref} className="kb-preview" aria-hidden="true" />
}
