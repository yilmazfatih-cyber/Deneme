/**
 * Vitrin (UX_SPEC §2 "Vitrin", §3 "Vitrin kartı").
 *   Masaüstü: tam genişlik görsel, başlık logosu, Top 10 satırı, kısa özet, ▶ Oynat (beyaz) · ⓘ Daha Fazla Bilgi (gri);
 *   sağda ses / yeniden oynat düğmesi + yaş işareti şeridi. Tanıtım varsa kısa bir beklemeden sonra sessiz oynar;
 *   vitrin ekrandan çıkınca, bir önizleme kartı açılınca ya da sekme gizlenince durur. 30 sn sonra biter (oynatıcının
 *   önizleme sınırı) ve yerine "Yeniden oynat" gelir.
 *   Mobil: çerçeveli 2:3 vitrin kartı (afiş başlığı zaten taşır), noktalı etiketler, ▶ Oynat · ＋ Listem.
 *   Vitrin ön hazırlığı: oynatılabilir öğenin lisanslı manifesti tıklamadan önce istenir (prefetchManifest).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useTitleHref } from '../../app'
import { useFormFactor } from '../../lib/formFactor'
import { PreviewPlayer, prefetchManifest } from '../../player'
import { logEvent } from '../../telemetry/logger'
import {
  Billboard as BillboardFrame,
  BillboardImage,
  BillboardInfo,
  BillboardSide,
  Button,
  ButtonLink,
  ErrorState,
  MobileHero,
  SkeletonBillboard,
  TopTenLine,
  usePrefersReducedMotion,
} from '../../ui'
import { notePlaybackIntent, usePlaylistToggle, usePreviewOpen } from '../preview'
import type { FalcorPath } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import {
  heroDeferredLeaves,
  mapHero,
  type HeroVM,
  type ImpressionTracker,
  type ListNode,
  type Screen,
  type VideoNode,
} from './lolomo'
import { useFalcorView } from './useFalcorView'

/** Netflix: vitrin görseli bir süre durur, sonra tanıtım başlar */
export const PROMO_DELAY_MS = 2500
/** Oynatıcının önizleme sınırı (PreviewPlayer 30 sn sonra durur) */
const PROMO_MAX_MS = 30_000

const prefetched = new Set<string>()
/** Manifest ön hazırlığı (vitrin ve devam et'in ilk öğesi); aynı kimlik için bir kez. */
export function prefetchOnce(viewableId: string | null): void {
  if (!viewableId || prefetched.has(viewableId)) return
  prefetched.add(viewableId)
  void prefetchManifest(viewableId)
}

export interface BillboardProps {
  list: ListNode
  rowIndex: number
  /** Ana sayfada ertelenen yapraklar ilk etkileşimde istenir (açılış ağ beklemez) */
  deferUntilInteraction: boolean
  error: Error | null
  onRetry: () => void
  tracker: ImpressionTracker
}

const INTERACTION_EVENTS = ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart'] as const

/** Kullanıcı sayfayla ilk kez etkileşti mi (kaydırma, dokunma, tuş). `enabled` false ise hemen true. */
function useFirstInteraction(enabled: boolean): boolean {
  const [done, setDone] = useState(!enabled)
  useEffect(() => {
    if (done) return
    const on = () => setDone(true)
    for (const ev of INTERACTION_EVENTS) window.addEventListener(ev, on, { capture: true, passive: true, once: true })
    return () => {
      for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, on, { capture: true })
    }
  }, [done])
  return done
}

export function HomeBillboard({
  list: base,
  rowIndex,
  deferUntilInteraction,
  error,
  onRetry,
  tracker,
}: BillboardProps): ReactElement {
  const mobile = useFormFactor() === 'mobile'
  const screen: Screen = mobile ? 'mobile' : 'desktop'
  // Ertelenen yapraklar (Top 10 sırası / Listem durumu): ilk etkileşimde ya da ana sayfa dışında hemen.
  const interacted = useFirstInteraction(deferUntilInteraction)
  const listId0 = base.summary?.id ?? null
  const deferred = useFalcorView<{ lists?: Record<string, Record<string, VideoNode>> }>(
    listId0 && base['0'] ? [['lists', listId0, 0, heroDeferredLeaves(screen)]] : [],
    { fetch: interacted },
  )
  const extra = listId0 ? deferred.json.lists?.[listId0]?.['0'] : undefined
  const list: ListNode = extra ? { ...base, '0': { ...(base['0'] as VideoNode), ...extra } } : base
  const hero = mapHero(list, rowIndex)
  const queueKnown = !!extra && typeof extra.queue === 'boolean'
  const rootRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  const prefetchId = hero?.prefetchViewableId ?? null
  useEffect(() => {
    prefetchOnce(prefetchId)
  }, [prefetchId])

  // Görünürlük: gösterim olayı + tanıtım yalnız vitrin ekrandayken.
  const videoId = hero?.videoId ?? null
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), {
      threshold: 0.5,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [videoId])

  const entityId = hero?.entityId ?? null
  const listId = list.summary?.id ?? 'billboard'
  const trackId = list.summary?.trackId ?? 0
  useEffect(() => {
    if (!entityId || !visible) return
    if (tracker.record(listId, 0, 0).length) {
      logEvent('impression', {
        listId,
        context: 'billboard',
        row: rowIndex,
        trackId,
        ranks: '0',
        entityIds: [entityId],
      })
    }
  }, [entityId, visible, listId, trackId, rowIndex, tracker])

  let body: ReactElement
  if (!hero) {
    body = error ? (
      <div className="gz-bb-error">
        <ErrorState title="Öne çıkan yüklenemedi" onRetry={onRetry} />
      </div>
    ) : (
      <SkeletonBillboard className={mobile ? 'gz-mhero-skel' : undefined} />
    )
  } else
    body = mobile ? (
      <MobileBillboard hero={hero} queueKnown={queueKnown} queuePath={['lists', listId0 ?? '', 0, 'queue']} />
    ) : (
      <DesktopBillboard hero={hero} visible={visible} />
    )

  return (
    <div ref={rootRef} className="gz-bb" data-row={rowIndex}>
      {body}
    </div>
  )
}

/* ───────────── Masaüstü ───────────── */

type PromoPhase = 'idle' | 'armed' | 'playing' | 'ended'

function DesktopBillboard({ hero, visible }: { hero: HeroVM; visible: boolean }): ReactElement {
  const href = useTitleHref()
  const previewOpen = usePreviewOpen()
  const reduced = usePrefersReducedMotion()
  const [phase, setPhase] = useState<PromoPhase>('idle')
  const [muted, setMuted] = useState(true)
  const [broken, setBroken] = useState(false)
  const [pageHidden, setPageHidden] = useState(() => document.visibilityState === 'hidden')

  useEffect(() => {
    const on = () => setPageHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  const promoId = hero.promo?.viewableId ?? null
  const allowed = !!promoId && !broken && !reduced && visible && !previewOpen && !pageHidden

  // Kurulum: izin varsa beklemeden sonra başlat; izin kalkınca dur (bitti ise bitmiş kalır).
  useEffect(() => {
    if (!allowed) {
      setPhase((p) => (p === 'ended' ? p : 'idle'))
      return
    }
    if (phase !== 'idle') return
    const t = window.setTimeout(() => setPhase('armed'), PROMO_DELAY_MS)
    return () => clearTimeout(t)
  }, [allowed, phase])

  // Oynatıcının 30 sn sınırında tanıtım biter: görsel geri gelir, "Yeniden oynat" çıkar.
  useEffect(() => {
    if (phase !== 'playing') return
    const t = window.setTimeout(() => setPhase('ended'), PROMO_MAX_MS)
    return () => clearTimeout(t)
  }, [phase])

  const playing = phase === 'playing'
  const showClip = !!hero.promo && (phase === 'armed' || phase === 'playing')

  const detail = href(hero.videoId, hero.tctx)
  return (
    <BillboardFrame
      label={`Öne çıkan: ${hero.title}`}
      media={
        <>
          <BillboardImage src={hero.artUrl} />
          {showClip && hero.promo && (
            <div className={playing ? 'gz-bb__clip is-on' : 'gz-bb__clip'}>
              <PreviewPlayer
                viewableId={hero.promo.viewableId}
                offsetSec={hero.promo.offset}
                muted={muted}
                onPlaying={() => setPhase((p) => (p === 'armed' ? 'playing' : p))}
                onError={() => {
                  setBroken(true)
                  setPhase('idle')
                }}
              />
            </div>
          )}
        </>
      }
      side={
        <BillboardSide
          muted={playing ? muted : undefined}
          onToggleMute={playing ? () => setMuted((m) => !m) : undefined}
          ended={phase === 'ended'}
          onReplay={() => setPhase('armed')}
          certification={hero.maturity?.certificationValue}
          reasons={hero.maturity?.reasons}
        />
      }
    >
      <BillboardInfo
        logo={hero.logoUrl}
        title={hero.title}
        compact={playing}
        topTen={
          hero.top10Rank ? (
            <TopTenLine rank={hero.top10Rank} category={hero.isShow ? 'Dizilerde' : 'Filmlerde'} />
          ) : undefined
        }
        synopsis={hero.synopsis || undefined}
        actions={
          <>
            {hero.playTo && (
              <ButtonLink
                variant="play"
                size="lg"
                icon="play"
                to={hero.playTo}
                onClick={() => {
                  if (hero.playVideoId !== null) notePlaybackIntent(hero.playVideoId, hero.videoId)
                  logEvent(
                    'click',
                    { videoId: hero.videoId, action: hero.resume ? 'resume' : 'play', from: 'billboard' },
                    hero.tctx,
                  )
                }}
              >
                {hero.primaryLabel}
              </ButtonLink>
            )}
            <ButtonLink
              size="lg"
              icon="info"
              to={detail}
              onClick={() =>
                logEvent('click', { videoId: hero.videoId, action: 'detail', from: 'billboard' }, hero.tctx)
              }
            >
              Daha Fazla Bilgi
            </ButtonLink>
          </>
        }
      />
    </BillboardFrame>
  )
}

/* ───────────── Mobil ───────────── */

function MobileBillboard({
  hero,
  queueKnown,
  queuePath,
}: {
  hero: HeroVM
  /** Listem durumu biliniyor mu (ertelenmiş yaprak geldi mi) */
  queueKnown: boolean
  queuePath: FalcorPath
}): ReactElement {
  const href = useTitleHref()
  const list = usePlaylistToggle(hero.videoId, hero.inMyList, hero.tctx)
  const [checking, setChecking] = useState(false)
  // Durum henüz bilinmiyorsa önce sorulur: zaten listedeyse yalnız ✓ görünür, değilse eklenir.
  const onList = () => {
    if (queueKnown) return list.toggle()
    setChecking(true)
    falcor
      .get<{ lists?: Record<string, Record<string, { queue?: boolean }>> }>(queuePath)
      .then(
        (json) => {
          const inList = json.lists?.[String(queuePath[1])]?.['0']?.queue === true
          if (!inList) list.toggle()
        },
        () => list.toggle(),
      )
      .finally(() => setChecking(false))
  }
  return (
    <MobileHero
      image={hero.posterUrl}
      title={hero.title}
      showTitle={false}
      tags={hero.tags}
      to={href(hero.videoId, hero.tctx)}
      onOpen={() => logEvent('click', { videoId: hero.videoId, action: 'detail', from: 'billboard' }, hero.tctx)}
      actions={
        <>
          {hero.playTo ? (
            <ButtonLink
              variant="play"
              icon="play"
              block
              to={hero.playTo}
              onClick={() => {
                if (hero.playVideoId !== null) notePlaybackIntent(hero.playVideoId, hero.videoId)
                logEvent('click', { videoId: hero.videoId, action: 'play', from: 'billboard' }, hero.tctx)
              }}
            >
              {hero.primaryLabel}
            </ButtonLink>
          ) : (
            <ButtonLink variant="play" icon="info" block to={href(hero.videoId, hero.tctx)}>
              Daha Fazla Bilgi
            </ButtonLink>
          )}
          <Button
            icon={list.on ? 'check' : 'plus'}
            block
            aria-pressed={list.on}
            busy={checking || list.busy}
            onClick={onList}
          >
            Listem
          </Button>
        </>
      }
    />
  )
}
