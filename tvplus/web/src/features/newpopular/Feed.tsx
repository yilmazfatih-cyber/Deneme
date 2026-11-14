/**
 * Yeni ve Popüler — mobil akış. Üstte bölüm çipleri (Herkes Bunları İzliyor · Top 10 Dizi · Top 10 Film ·
 * Yeni Gelenler · Son Şans), altında bölüm bölüm büyük kartlar: tam görünen görsel, ad, özet, Oynat ve Listem.
 * Top 10 bölümlerinde her kartın üstünde iki haneli büyük sıra rakamı durur.
 *
 * Bölümlerin sırası ve içeriği sunucudan gelir (lolomoByCategory.newPopular); kart ayrıntıları tek bir
 * FeedVideos sorgusuyla alınır.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { FalcorPath } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import { useGql } from '../../api/hooks'
import { ShellPills, useTitleHref } from '../../app'
import { logEvent } from '../../telemetry/logger'
import { cx, EmptyState, Icon, Pill, Skeleton } from '../../ui'
import { lockedTextOf } from '../detail/model'
import { localTctx, playPath } from '../detail/links'
import type { CardVideoData } from '../detail/types'
import { usePlaylistToggle } from '../preview'

const ROOT: FalcorPath = ['lolomoByCategory', 'newPopular']
const MAX_ROWS = 8
const MAX_PER_SECTION = 10

/** Bölümlerin akıştaki sırası ve çip adı; listede olmayan bağlamlar sona, sunucudaki adıyla eklenir. */
const SECTIONS: Record<string, { order: number; chip: string; note: string; ranked?: boolean }> = {
  popular: { order: 0, chip: 'Herkes Bunları İzliyor', note: 'Şu sıralar en çok izlenenler' },
  top10Shows: { order: 1, chip: 'Top 10 Dizi Listesi', note: 'Bugünün sıralaması', ranked: true },
  top10Movies: { order: 2, chip: 'Top 10 Film Listesi', note: 'Bugünün sıralaması', ranked: true },
  newReleases: { order: 3, chip: 'Yeni Gelenler', note: 'Kataloğa yeni eklenenler' },
  leaving: { order: 4, chip: 'Son Şans', note: 'Yakında kataloğdan ayrılacaklar' },
}

interface Section {
  context: string
  title: string
  chip: string
  note: string
  ranked: boolean
  ids: number[]
}

interface FeedVideo extends CardVideoData {
  isInPlaylist: boolean
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

const sectionDomId = (context: string) => `npf-${context}`

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

  // Kaydırırken hangi bölümdeyiz (çip ona göre seçili görünür)
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (!sections.length) return
    setActive((cur) => cur ?? sections[0]!.context)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.context ?? null)
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(sectionDomId(s.context))
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [sections])

  const jump = (context: string) => {
    setActive(context)
    document.getElementById(sectionDomId(context))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    logEvent('click', { surface: 'yeni-ve-populer', action: 'bolum', context })
  }

  if (failed) return <EmptyState title="Yeni ve Popüler şu an gösterilemiyor" message="Biraz sonra yeniden dene." />
  if (!loading && !sections.length) return <EmptyState title="Gösterilecek içerik yok" />

  return (
    <div className="npf" aria-busy={loading || details.loading}>
      <ShellPills label="Bölümler">
        {sections.map((s) => (
          <Pill key={s.context} selected={active === s.context} onClick={() => jump(s.context)}>
            {s.chip}
          </Pill>
        ))}
      </ShellPills>

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
              return (
                <li key={id}>
                  {v ? (
                    <FeedCard video={v} rank={s.ranked ? i + 1 : null} rowId={s.context} index={i} />
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
}: {
  video: FeedVideo
  rank: number | null
  rowId: string
  index: number
}): ReactElement {
  const titleHref = useTitleHref()
  const tctx = localTctx(rowId, index, v.videoId)
  const list = usePlaylistToggle(v.videoId, v.isInPlaylist, tctx)
  const isShow = v.__typename === 'Show'
  const detail = titleHref(v.videoId, tctx)
  const locked = lockedTextOf(v.access)
  const canPlay = v.isPlayable && !locked
  const art = v.storyArt?.url ?? v.boxart?.url ?? null
  const meta = [isShow ? 'Dizi' : 'Film', v.latestYear, v.displayRuntime].filter(Boolean).join(' · ')
  const label = rank ? `${rank}. ${v.title}` : v.title
  return (
    <article className={cx('npf-card', rank !== null && 'npf-card--ranked')} aria-label={label}>
      {rank !== null ? (
        <span className="npf-rank" aria-hidden="true">
          {String(rank).padStart(2, '0')}
        </span>
      ) : null}
      <div className="npf-card__box">
        <Link to={detail} className="npf-card__art" aria-label={`${v.title}: ayrıntılar`}>
          {art ? (
            <img src={art} alt="" loading="lazy" />
          ) : (
            <span className="ui-art-fallback">
              <span>{v.title}</span>
            </span>
          )}
          <span className="npf-card__age">{v.contentAdvisory.certificationValue}</span>
        </Link>
        <div className="npf-card__body">
          {rank === 1 ? <p className="npf-card__signal">Bugün {isShow ? 'dizilerde' : 'filmlerde'} 1 numara</p> : null}
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
