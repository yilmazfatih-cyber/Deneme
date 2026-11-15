/**
 * Yeni ve Popüler — mobil akış. Üstte bölüm çipleri (Çok Yakında · Herkes Bunları İzliyor · Top 10 Dizi · Top 10 Film ·
 * Senin Topluluğun · Yeni Gelenler · Son Şans), altında bölüm bölüm büyük kartlar: tam görünen görsel, ad, özet,
 * Oynat ve Listem. Top 10 bölümlerinde her kartın üstünde iki haneli büyük sıra rakamı durur.
 *
 * Bölümlerin içeriği sunucudan gelir (lolomoByCategory.newPopular); kart ayrıntıları tek bir FeedVideos sorgusuyla
 * alınır. "Çok Yakında" canlı TV'nin sıradaki yayınlarıdır (ComingSoon.tsx).
 *
 * Önizleme: ekranın ortasına en yakın kart, kısa bir beklemeden sonra tanıtımını sessiz oynatır (aynı anda tek kart).
 * Oynatıcının üstüne yazı ya da düğme bindirilmez; yaş rozeti oynatma sırasında gizlenir.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import type { FalcorPath } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import { useGql } from '../../api/hooks'
import { ShellPills, useTitleHref } from '../../app'
import { PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { cx, EmptyState, Icon, Pill, Skeleton, type IconName } from '../../ui'
import { lockedTextOf } from '../detail/model'
import { localTctx, playPath } from '../detail/links'
import type { CardVideoData } from '../detail/types'
import { usePlaylistToggle } from '../preview'
import { SoonCard, useComingSoon } from './ComingSoon'

const ROOT: FalcorPath = ['lolomoByCategory', 'newPopular']
const MAX_ROWS = 8
const MAX_PER_SECTION = 10
/** Kart ekranın ortasında bu kadar durunca önizlemesi başlar */
const PREVIEW_DWELL_MS = 700
/** Akıştaki önizlemenin en uzun süresi (sn) */
const PREVIEW_SEC = 20
const SOON_KEY = 'comingSoon'
/** Mobil akışta gösterilen "Çok Yakında" kartı sayısı (popüler bölümler aşağıya kaçmasın) */
const SOON_MOBILE_MAX = 3

type ChipIcon = 'soon' | 'popular' | 'top10' | 'community' | 'new' | 'leaving'

/** Bölümlerin akıştaki sırası ve çip adı; listede olmayan bağlamlar sona, sunucudaki adıyla eklenir. */
const SECTIONS: Record<string, { order: number; chip: string; note: string; icon: ChipIcon; ranked?: boolean }> = {
  popular: { order: 0, chip: 'Herkes Bunları İzliyor', note: 'Şu sıralar en çok izlenenler', icon: 'popular' },
  top10Shows: { order: 1, chip: 'Top 10 Dizi Listesi', note: 'Bugünün sıralaması', icon: 'top10', ranked: true },
  top10Movies: { order: 2, chip: 'Top 10 Film Listesi', note: 'Bugünün sıralaması', icon: 'top10', ranked: true },
  tasteCommunity: {
    order: 3,
    chip: 'Senin Topluluğun',
    note: 'İzleme zevkine en yakın topluluğun öne çıkardıkları',
    icon: 'community',
  },
  newReleases: { order: 4, chip: 'Yeni Gelenler', note: 'Kataloğa yeni eklenenler', icon: 'new' },
  leaving: { order: 5, chip: 'Son Şans', note: 'Yakında kataloğdan ayrılacaklar', icon: 'leaving' },
}

const CHIP_ICONS: Record<Exclude<ChipIcon, 'top10'>, IconName> = {
  soon: 'bell',
  popular: 'flame',
  community: 'users',
  new: 'newPopular',
  leaving: 'clock',
}

interface Section {
  context: string
  title: string
  chip: string
  note: string
  icon: ChipIcon | null
  ranked: boolean
  ids: number[]
}

interface FeedVideo extends CardVideoData {
  isInPlaylist: boolean
  matchScore?: number | null
  promoVideo: { viewableId: string; offset: number; sourceKind: string } | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Falcor yanıtından bölümleri çıkarır (saf). */
export function sectionsOf(json: unknown, rowCount: number): Section[] {
  const rows = isRecord(json) && isRecord(json.lolomoByCategory) ? json.lolomoByCategory.newPopular : null
  if (!isRecord(rows)) return []
  const out: (Section & { order: number })[] = []
  for (let i = 0; i < rowCount; i++) {
    const row = rows[String(i)]
    if (!isRecord(row) || !isRecord(row.summary)) continue
    const context = typeof row.summary.context === 'string' ? row.summary.context : ''
    const title = typeof row.summary.displayName === 'string' ? row.summary.displayName : ''
    if (!context || !title) continue
    const ids: number[] = []
    for (let j = 0; j < MAX_PER_SECTION; j++) {
      const item = row[String(j)]
      const id = isRecord(item) && isRecord(item.summary) ? item.summary.id : null
      if (typeof id === 'number' && !ids.includes(id)) ids.push(id)
    }
    if (!ids.length) continue
    const known = SECTIONS[context]
    out.push({
      context,
      title,
      chip: known?.chip ?? title,
      note: known?.note ?? '',
      icon: known?.icon ?? null,
      ranked: known?.ranked ?? false,
      ids,
      order: known?.order ?? 100 + i,
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

function useSections(): { sections: Section[]; loading: boolean; failed: boolean } {
  const [state, setState] = useState<{ sections: Section[]; loading: boolean; failed: boolean }>({
    sections: [],
    loading: true,
    failed: false,
  })
  useEffect(() => {
    let alive = true
    const load = async (): Promise<Section[]> => {
      const top = await falcor.get<unknown>([...ROOT, 'summary'])
      const summary =
        isRecord(top) && isRecord(top.lolomoByCategory) && isRecord(top.lolomoByCategory.newPopular)
          ? top.lolomoByCategory.newPopular.summary
          : null
      const length = isRecord(summary) && typeof summary.length === 'number' ? summary.length : 0
      const n = Math.min(length, MAX_ROWS)
      if (!n) return []
      const rows = { from: 0, to: n - 1 }
      const json = await falcor.get<unknown>(
        [...ROOT, rows, 'summary'],
        [...ROOT, rows, { from: 0, to: MAX_PER_SECTION - 1 }, 'summary'],
      )
      return sectionsOf(json, n)
    }
    load().then(
      (sections) => {
        if (alive) setState({ sections, loading: false, failed: false })
      },
      () => {
        if (alive) setState({ sections: [], loading: false, failed: true })
      },
    )
    return () => {
      alive = false
    }
  }, [])
  return state
}

/**
 * Önizlemesi oynayacak kart: görseli tümüyle görünen kartlardan ekranın ortasına en yakın olanı. Kaydırma durup
 * PREVIEW_DWELL_MS geçince seçilir. Hareketi azalt ya da veri tasarrufu açıksa hiçbir kart seçilmez.
 */
function useActivePreview(rootRef: RefObject<HTMLElement | null>, revision: string): string | null {
  const [key, setKey] = useState<string | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return

    const visible = new Set<HTMLElement>()
    let timer: ReturnType<typeof setTimeout> | null = null
    const pick = () => {
      const mid = window.innerHeight / 2
      let best: { key: string; distance: number } | null = null
      for (const el of visible) {
        const r = el.getBoundingClientRect()
        const distance = Math.abs((r.top + r.bottom) / 2 - mid)
        const k = el.dataset.preview
        if (k && (!best || distance < best.distance)) best = { key: k, distance }
      }
      setKey(best?.key ?? null)
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(pick, PREVIEW_DWELL_MS)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement
          if (e.isIntersecting && e.intersectionRatio >= 0.9) visible.add(el)
          else visible.delete(el)
        }
        schedule()
      },
      { threshold: [0, 0.9] },
    )
    root.querySelectorAll<HTMLElement>('[data-preview]').forEach((el) => io.observe(el))
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', schedule)
      if (timer) clearTimeout(timer)
    }
  }, [rootRef, revision])
  return key
}

const sectionDomId = (context: string) => `npf-${context}`

function ChipLabel({ icon, children }: { icon: ChipIcon | null; children: string }): ReactElement {
  return (
    <span className="npf-chip">
      {icon === 'top10' ? (
        <span className="npf-top10" aria-hidden="true">
          TOP<b>10</b>
        </span>
      ) : icon ? (
        <Icon name={CHIP_ICONS[icon]} size={16} />
      ) : null}
      {children}
    </span>
  )
}

export function NewPopularFeed(): ReactElement {
  const { sections, loading, failed } = useSections()
  const ids = useMemo(() => [...new Set(sections.flatMap((s) => s.ids))], [sections])
  const details = useGql<{ videos: (FeedVideo | null)[] }, { videoIds: number[] }>(
    'FeedVideos',
    { videoIds: ids },
    { enabled: ids.length > 0, ttlMs: 60_000 },
  )
  const byId = useMemo(() => {
    const m = new Map<number, FeedVideo>()
    for (const v of details.data?.videos ?? []) if (v) m.set(v.videoId, v)
    return m
  }, [details.data])

  // Çok Yakında: canlı TV'nin sıradaki yayınları
  const { soon, now } = useComingSoon()

  const blocks = useMemo(
    () => [
      ...(soon.length ? [{ key: SOON_KEY, chip: 'Çok Yakında', icon: 'soon' as ChipIcon | null }] : []),
      ...sections.map((s) => ({ key: s.context, chip: s.chip, icon: s.icon })),
    ],
    [soon.length, sections],
  )
  const blockKeys = blocks.map((b) => b.key).join('|')

  // Kaydırırken hangi bölümdeyiz (çip ona göre seçili görünür)
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const keys = blockKeys ? blockKeys.split('|') : []
    if (!keys.length) return
    setActive((cur) => (cur && keys.includes(cur) ? cur : keys[0]!))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.context ?? null)
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )
    for (const k of keys) {
      const el = document.getElementById(sectionDomId(k))
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [blockKeys])

  const rootRef = useRef<HTMLDivElement>(null)
  const previewKey = useActivePreview(rootRef, `${blockKeys}#${byId.size}`)

  const jump = (context: string) => {
    setActive(context)
    document.getElementById(sectionDomId(context))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    logEvent('click', { surface: 'yeni-ve-populer', action: 'bolum', context })
  }

  if (failed) return <EmptyState title="Yeni ve Popüler şu an gösterilemiyor" message="Biraz sonra yeniden dene." />
  if (!loading && !sections.length && !soon.length) return <EmptyState title="Gösterilecek içerik yok" />

  return (
    <div className="npf" ref={rootRef} aria-busy={loading || details.loading}>
      <ShellPills label="Bölümler">
        {blocks.map((b) => (
          <Pill key={b.key} selected={active === b.key} onClick={() => jump(b.key)}>
            <ChipLabel icon={b.icon}>{b.chip}</ChipLabel>
          </Pill>
        ))}
      </ShellPills>

      {soon.length ? (
        <section
          id={sectionDomId(SOON_KEY)}
          data-context={SOON_KEY}
          className="npf-section"
          aria-labelledby={`${sectionDomId(SOON_KEY)}-h`}
        >
          <header className="npf-section__head">
            <h2 id={`${sectionDomId(SOON_KEY)}-h`} className="npf-section__title">
              Çok Yakında
            </h2>
            <p className="npf-section__note">Canlı TV'de birazdan başlayacaklar</p>
          </header>
          <ol className="npf-list">
            {soon.slice(0, SOON_MOBILE_MAX).map((item) => (
              <li key={item.airing.airingId}>
                <SoonCard item={item} now={now} />
              </li>
            ))}
          </ol>
          <Link to="/rehber" className="npf-more">
            Yayın akışının tamamı
            <Icon name="chevronRight" size={18} />
          </Link>
        </section>
      ) : null}

      {loading ? (
        <div className="npf-skel">
          <Skeleton variant="card" />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="card" />
        </div>
      ) : null}

      {sections.map((s) => (
        <section
          key={s.context}
          id={sectionDomId(s.context)}
          data-context={s.context}
          className="npf-section"
          aria-labelledby={`${sectionDomId(s.context)}-h`}
        >
          <header className="npf-section__head">
            <h2 id={`${sectionDomId(s.context)}-h`} className="npf-section__title">
              {s.title}
            </h2>
            {s.note ? <p className="npf-section__note">{s.note}</p> : null}
          </header>
          <ol className="npf-list">
            {s.ids.map((id, i) => {
              const v = byId.get(id)
              const key = `${s.context}:${id}`
              return (
                <li key={id}>
                  {v ? (
                    <FeedCard
                      video={v}
                      rank={s.ranked ? i + 1 : null}
                      rowId={s.context}
                      index={i}
                      previewKey={key}
                      preview={previewKey === key}
                    />
                  ) : (
                    <Skeleton variant="card" />
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

function FeedCard({
  video: v,
  rank,
  rowId,
  index,
  previewKey,
  preview,
}: {
  video: FeedVideo
  rank: number | null
  rowId: string
  index: number
  previewKey: string
  preview: boolean
}): ReactElement {
  const titleHref = useTitleHref()
  const tctx = localTctx(rowId, index, v.videoId)
  const list = usePlaylistToggle(v.videoId, v.isInPlaylist, tctx)
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!preview) {
      setPlaying(false)
      setDone(false)
    }
  }, [preview])

  const isShow = v.__typename === 'Show'
  const detail = titleHref(v.videoId, tctx)
  const locked = lockedTextOf(v.access)
  const canPlay = v.isPlayable && !locked
  const art = v.storyArt?.url ?? v.boxart?.url ?? null
  const meta = [isShow ? 'Dizi' : 'Film', v.latestYear, v.displayRuntime].filter(Boolean).join(' · ')
  const label = rank ? `${rank}. ${v.title}` : v.title
  const promo = v.promoVideo
  const showPlayer = preview && !!promo && !done
  const match = typeof v.matchScore === 'number' && v.matchScore >= 60 ? v.matchScore : null
  // Sıra işareti: Top 10 bölümünde yalnız 1 numara; öteki bölümlerde başlığın Top 10'daki yeri
  const rankSignal =
    rank === 1
      ? `Bugün ${isShow ? 'dizilerde' : 'filmlerde'} 1 numara`
      : rank === null && v.top10Rank
        ? `Top 10'da ${v.top10Rank}. sırada`
        : null
  return (
    <article className={cx('npf-card', rank !== null && 'npf-card--ranked')} aria-label={label}>
      {rank !== null ? (
        <span className="npf-rank" aria-hidden="true">
          {String(rank).padStart(2, '0')}
        </span>
      ) : null}
      <div className="npf-card__box">
        <div className="npf-card__art" data-preview={promo ? previewKey : undefined}>
          <Link to={detail} className="npf-card__artlink" aria-label={`${v.title}: ayrıntılar`}>
            {art ? (
              <img src={art} alt="" loading="lazy" />
            ) : (
              <span className="ui-art-fallback">
                <span>{v.title}</span>
              </span>
            )}
          </Link>
          {showPlayer ? (
            <div
              className={cx(
                'npf-card__player',
                playing && 'is-playing',
                promo.sourceKind !== 'YOUTUBE' && 'npf-card__player--passthrough',
              )}
            >
              <PreviewPlayer
                viewableId={promo.viewableId}
                offsetSec={promo.offset}
                muted
                maxSec={PREVIEW_SEC}
                fit="cover"
                onPlaying={() => setPlaying(true)}
                onError={() => setDone(true)}
                onEnded={() => setDone(true)}
              />
            </div>
          ) : null}
          {showPlayer && playing ? null : <span className="npf-card__age">{v.contentAdvisory.certificationValue}</span>}
        </div>
        <div className="npf-card__body">
          {rankSignal || match ? (
            <p className="npf-card__signals">
              {rankSignal ? <span className="npf-card__signal">{rankSignal}</span> : null}
              {match ? <span className="npf-card__signal npf-card__signal--match">%{match} eşleşme</span> : null}
            </p>
          ) : null}
          <h3 className="npf-card__title">{v.title}</h3>
          <p className="npf-card__meta">{meta}</p>
          <p className="npf-card__synopsis">{v.shortSynopsis}</p>
          <div className="npf-card__actions">
            <Link
              to={canPlay && !isShow ? playPath(v.videoId, tctx) : detail}
              className="npf-btn npf-btn--primary"
              onClick={() =>
                logEvent(
                  'click',
                  { videoId: v.videoId, action: canPlay && !isShow ? 'oynat' : 'incele', from: 'yeni-ve-populer' },
                  tctx,
                )
              }
            >
              <Icon name={canPlay && !isShow ? 'play' : 'info'} size={20} />
              {canPlay && !isShow ? 'Oynat' : isShow ? 'Bölümleri Gör' : 'İncele'}
            </Link>
            <button
              type="button"
              className={cx('npf-btn', list.on && 'is-on')}
              aria-pressed={list.on}
              disabled={list.busy}
              onClick={list.toggle}
            >
              <Icon name={list.on ? 'check' : 'plus'} size={20} />
              Listem
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
