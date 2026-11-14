/**
 * Kısa Videolar: dikey kaydırmalı kısa önizleme akışı (#/kisa).
 *
 * Her ekran bir başlık: önizlemesi sessiz kendiliğinden oynar, bitince sıradakine geçilir. Karar hızlıdır:
 * "Oynat" tamamını açar, "Listem" sonraya saklar, kaydırmak sıradakini getirir.
 *
 * Yerleşim kuralı: video kırpılmaz ve üstüne yazı ya da düğme bindirilmez; ad, etiketler ve eylemler videonun
 * altında durur. Katalogdaki kaynakların çoğu resmî gömme oynatıcıyla gelir ve o oynatıcının üstü kapatılamaz.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useGql } from '../../api/hooks'
import { useDocumentTitle, useShellOptions, useTitleHref } from '../../app'
import { PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { cx, EmptyState, Icon, toast } from '../../ui'
import { lockedTextOf } from '../detail/model'
import type { CardVideoData } from '../detail/types'
import { localTctx, playPath } from '../detail/links'
import { usePlaylistToggle } from '../preview'
import './shorts.css'

/** Bir önizlemenin en uzun süresi (sn); dolunca sıradakine geçilir. */
const CLIP_SEC = 30
const FEED_SIZE = 24
const ROW_ID = 'kisa-videolar'

interface ShortVideo extends CardVideoData {
  isInPlaylist: boolean
  matchScore?: number | null
  genreTags: { genreId: number; name: string }[]
  moodTags: { id: number; displayName: string }[]
  promoVideo: { viewableId: string; offset: number; sourceKind: string } | null
}

export function ShortsPage(): ReactElement {
  useDocumentTitle('Kısa Videolar')
  useShellOptions({ topBar: false })
  const { data, error, loading } = useGql<{ shortsFeed: ShortVideo[] }, { first: number }>(
    'ShortsFeed',
    { first: FEED_SIZE },
    { ttlMs: 120_000 },
  )
  const items = (data?.shortsFeed ?? []).filter((v) => v.promoVideo && v.isPlayable && !lockedTextOf(v.access))

  const feedRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(true)

  // Etkin öğe: ekranın çoğunu kaplayan
  useEffect(() => {
    const root = feedRef.current
    if (!root || !items.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = Number((e.target as HTMLElement).dataset.index)
            if (Number.isInteger(i)) setActive(i)
          }
        }
      },
      { root, threshold: [0.6] },
    )
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [items.length])

  const go = useCallback((index: number) => {
    const el = feedRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault()
      go(Math.min(items.length - 1, active + 1))
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      go(Math.max(0, active - 1))
    }
  }

  if (error && !data)
    return (
      <div className="sh-page sh-page--empty">
        <EmptyState title="Kısa videolar şu an gösterilemiyor" message="Biraz sonra yeniden dene." />
      </div>
    )
  if (!items.length)
    return (
      <div className="sh-page sh-page--empty" aria-busy={loading}>
        {loading ? (
          <p className="sh-loading">Kısa videolar hazırlanıyor…</p>
        ) : (
          <EmptyState title="Gösterilecek kısa video yok" />
        )}
      </div>
    )

  return (
    <div className="sh-page">
      <h1 className="sh-heading">Kısa Videolar</h1>
      <div
        className="sh-feed"
        ref={feedRef}
        role="feed"
        aria-label="Kısa videolar"
        aria-busy={loading}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {items.map((v, i) => (
          <ShortItem
            key={v.videoId}
            video={v}
            index={i}
            total={items.length}
            active={i === active}
            near={Math.abs(i - active) <= 1}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onEnded={() => go(i + 1 < items.length ? i + 1 : 0)}
            nextTitle={items[i + 1]?.title ?? null}
          />
        ))}
      </div>
    </div>
  )
}

function ShortItem({
  video: v,
  index,
  total,
  active,
  near,
  muted,
  onToggleMute,
  onEnded,
  nextTitle,
}: {
  video: ShortVideo
  index: number
  total: number
  active: boolean
  near: boolean
  muted: boolean
  onToggleMute: () => void
  onEnded: () => void
  nextTitle: string | null
}): ReactElement {
  const titleHref = useTitleHref()
  const tctx = localTctx(ROW_ID, index, v.videoId)
  const list = usePlaylistToggle(v.videoId, v.isInPlaylist, tctx)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!active) setPlaying(false)
  }, [active])

  const isShow = v.__typename === 'Show'
  const detail = titleHref(v.videoId, tctx)
  const art = v.storyArt?.url ?? v.boxart?.url ?? null
  const tags = [...v.moodTags.map((t) => t.displayName), ...v.genreTags.map((g) => g.name)].slice(0, 3)
  const meta = [isShow ? 'Dizi' : 'Film', v.latestYear, v.displayRuntime].filter(Boolean).join(' · ')
  const match = typeof v.matchScore === 'number' && v.matchScore >= 60 ? v.matchScore : null

  const share = () => {
    const url = `${window.location.href.replace(/#.*$/, '')}#${detail}`
    logEvent('click', { videoId: v.videoId, action: 'paylas', from: 'kisa-videolar' }, tctx)
    const nav = window.navigator
    if (typeof nav.share === 'function') {
      nav.share({ title: v.title, url }).catch(() => {
        /* paylaşım penceresi kapatıldı */
      })
      return
    }
    nav.clipboard?.writeText(url).then(
      () => toast('Bağlantı kopyalandı', { kind: 'success' }),
      () => toast('Bağlantı kopyalanamadı'),
    )
  }

  return (
    <article
      className={cx('sh-item', active && 'is-active')}
      data-index={index}
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={v.title}
    >
      {art && near ? (
        <div className="sh-item__backdrop" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />
      ) : null}

      <div className="sh-item__stage">
        <div className="sh-item__video">
          {art && near ? <img className="sh-item__poster" src={art} alt="" /> : null}
          {active && v.promoVideo && !failed ? (
            <div className={cx('sh-item__player', playing && 'is-playing')}>
              <PreviewPlayer
                viewableId={v.promoVideo.viewableId}
                offsetSec={v.promoVideo.offset}
                muted={muted}
                maxSec={CLIP_SEC}
                onPlaying={() => setPlaying(true)}
                onError={() => setFailed(true)}
                onEnded={onEnded}
              />
            </div>
          ) : null}
        </div>
        <div className="sh-item__progress" aria-hidden="true">
          <span
            className={cx(active && playing && 'is-running')}
            style={{ animationDuration: `${CLIP_SEC}s` }}
            key={active && playing ? 'run' : 'idle'}
          />
        </div>
      </div>

      <div className="sh-item__info">
        <div className="sh-item__signals">
          {v.top10Rank ? <span className="sh-chip sh-chip--hot">Top 10 · {v.top10Rank}. sırada</span> : null}
          {match ? <span className="sh-chip sh-chip--match">%{match} eşleşme</span> : null}
          <span className="sh-chip">{v.contentAdvisory.certificationValue}</span>
        </div>
        <h2 className="sh-item__title">
          <Link to={detail}>{v.title}</Link>
        </h2>
        <p className="sh-item__meta">{meta}</p>
        {tags.length ? <p className="sh-item__tags">{tags.join(' • ')}</p> : null}
        <p className="sh-item__synopsis">
          {v.shortSynopsis}{' '}
          <Link to={detail} className="sh-item__more">
            daha fazla bilgi
          </Link>
        </p>

        <div className="sh-item__actions">
          <Link
            to={isShow ? detail : playPath(v.videoId, tctx)}
            className="sh-btn sh-btn--primary"
            onClick={() =>
              logEvent(
                'click',
                { videoId: v.videoId, action: isShow ? 'incele' : 'oynat', from: 'kisa-videolar' },
                tctx,
              )
            }
          >
            <Icon name="play" size={20} />
            {isShow ? 'Bölümleri Gör' : 'Oynat'}
          </Link>
          <button
            type="button"
            className={cx('sh-btn', list.on && 'is-on')}
            aria-pressed={list.on}
            disabled={list.busy}
            onClick={list.toggle}
          >
            <Icon name={list.on ? 'check' : 'plus'} size={20} />
            Listem
          </button>
          <button
            type="button"
            className="sh-round"
            aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
            aria-pressed={!muted}
            onClick={onToggleMute}
          >
            <Icon name={muted ? 'mute' : 'volume'} size={20} />
          </button>
          <button type="button" className="sh-round" aria-label={`${v.title}: paylaş`} onClick={share}>
            <Icon name="share" size={20} />
          </button>
        </div>
      </div>
      {nextTitle ? (
        <p className="sh-item__next" aria-hidden="true">
          <Icon name="chevronDown" size={16} />
          Sıradaki: <strong>{nextTitle}</strong>
        </p>
      ) : null}
    </article>
  )
}
