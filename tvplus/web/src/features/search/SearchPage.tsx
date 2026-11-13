/**
 * Arama sayfası (#/ara?q=) — tembel parça. Netflix'in arama düzeni, TV+ markası, sonuçlar tahmin modelinden.
 *
 * Masaüstü (UX_SPEC §2 "Arama"), yukarıdan aşağıya:
 *   şerit (düzeltme / eşleşme yok) · "Şunu mu arıyorsun:" (modelin tamamlamaları) · "Şunlarla ilgili daha fazla
 *   keşfedin:" (kişi, tür, koleksiyon) · Canlı TV (tek satır) · sonuç ızgarası (16:9, modelin sırası, önizleme
 *   kartı) · tahmin bölümü ("‹X› ile ilgili" / "Bunlar ilgini çekebilir"; her kartta gerekçe satırı).
 *   Kutu boşken: son aramalar + "Sana Özel Öneriler" (popularSearches).
 * Mobil (UX_SPEC §3): üstte sabit girdi + İptal; yazmadan önce son aramalar + "Sana Özel Öneriler" satırları
 *   (16:9 küçük görsel, ad, ▶); yazarken tahmin satırları, 3 sütun afiş ızgarası, tahmin bölümü.
 * Açıklama kipi (inspect.ts): puan çipi + öznitelik katkıları, model sürümü, yetenek bildirimi. Kapalıyken görünmez.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDocumentTitle, useShellFormFactor, useShellOptions, useTitleHref } from '../../app'
import { useGql, queryCache } from '../../api/hooks'
import { detectFormFactor } from '../../lib/formFactor'
import { logEvent } from '../../telemetry/logger'
import {
  Badge,
  cx,
  EmptyState,
  ErrorState,
  formatDayTime,
  formatRemaining,
  Icon,
  liveProgress,
  Pill,
  PosterCard,
  Sheet,
  SkeletonGrid,
  Switch,
  TitleCard,
  useNow,
} from '../../ui'
import { localTctx, playPath, PreviewScope, PreviewTarget } from '../preview'
import {
  declarationSignature,
  KIND_SWITCHES,
  loadChoice,
  lookupTreatment,
  saveChoice,
  type CapabilityChoice,
  type SearchPageCapabilities,
} from './capabilities'
import { installFeedbackListeners, ledger, onFeedback, sendFeedback } from './feedback'
import { useInspectMode } from './inspect'
import {
  FEATURE_LABEL,
  landscapeArtwork,
  pageParts,
  posterArtwork,
  predictionKindLabel,
  selectBanner,
  suggestedQueries,
  type SearchEntity,
  type SearchPageData,
  type SearchPrediction,
  type SearchSection,
  type SearchVideo,
} from './searchModel'
import { PredictionText, SearchField, searchPath } from './SearchField'
import { clearRecentSearches, recordSearch } from './searchStore'
import { usePredictions, useSearch } from './useSearch'
import './search.css'

installFeedbackListeners()

const POPULAR_FIRST = 12

/* ───────────── Ortak bağlam ───────────── */

interface Ctx {
  term: string
  requestId: string
  inspect: boolean
  /** Sonuç açıldı: CLICK geri bildirimi + tıklama olayı + aramayı kaydet */
  opened: (e: { unifiedEntityId: string; kind?: string; treatment?: string; track: { tctx: string } }) => void
  explainOpen: string | null
  setExplainOpen: (id: string | null) => void
}

interface PopularVideo extends SearchVideo {
  top10Rank?: number | null
}

/** Kart rozeti: kilit > Top 10 > sunucunun rozeti (kart başına en çok bir tane). */
function cardBadge(v: Pick<SearchVideo, 'access' | 'badge' | 'top10Rank'>): ReactNode {
  if (v.access.state !== 'PLAYABLE') return <Badge tone="lock" />
  if (v.badge && v.badge.kind !== 'LOCKED' && v.badge.kind !== 'TOP10') return <Badge>{v.badge.text}</Badge>
  if (v.top10Rank) return <Badge tone="top10" />
  return null
}

/** Açıklama penceresinin genişliği (search.css `.sr-explain` ile aynı) */
const EXPLAIN_WIDTH = 290

const fmtNum = (n: number) => (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2))

/* ───────────── Puan çipi + açıklama penceresi (yalnız açıklama kipinde) ───────────── */

function ScoreChip({ e, id, ctx }: { e: SearchEntity; id: string; ctx: Ctx }): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null)
  const open = ctx.explainOpen === id
  // Sol kenara yakın kartlarda pencere sağa doğru açılır (ekrandan taşmasın).
  const [shift, setShift] = useState(0)
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent) => {
      if (!ref.current?.contains(ev.target as Node)) ctx.setExplainOpen(null)
    }
    // Esc yalnız pencereyi kapatır (yakalama evresinde: arama kutusu temizlenmesin).
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.stopPropagation()
      ctx.setExplainOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  if (!ctx.inspect || e.score === null || e.score === undefined) return null
  const explain = e.explain ?? []
  const sum = explain.reduce((a, f) => a + f.contribution, 0)
  return (
    <div className={cx('sr-score', open && 'is-open')} ref={ref}>
      <button
        type="button"
        className="sr-score__chip"
        aria-expanded={open}
        aria-label={`Model puanı ${e.score.toFixed(2)}, ayrıntı`}
        onClick={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect()
          setShift(Math.max(0, 8 - (r.right - EXPLAIN_WIDTH)))
          ctx.setExplainOpen(open ? null : id)
        }}
      >
        {e.score.toFixed(2)}
      </button>
      {open && (
        <div
          className="sr-explain"
          style={shift ? { right: -shift } : undefined}
          role="dialog"
          aria-label={`${e.displayString}: puanın bileşenleri`}
        >
          <p className="sr-explain__head">
            <span>{e.displayString}</span>
            <span>p = {e.score.toFixed(3)}</span>
          </p>
          {explain.length ? (
            <table className="sr-explain__table">
              <thead>
                <tr>
                  <th scope="col">öznitelik</th>
                  <th scope="col">değer × ağırlık</th>
                  <th scope="col">katkı</th>
                </tr>
              </thead>
              <tbody>
                {explain.map((f) => (
                  <tr key={f.name} className={cx(f.name === 'tiklanma' && 'is-click')}>
                    <th scope="row" title={FEATURE_LABEL[f.name] ?? f.name}>
                      {f.name}
                    </th>
                    <td>
                      {fmtNum(f.value)} × {fmtNum(f.weight)}
                    </td>
                    <td>{fmtNum(f.contribution)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">toplam</th>
                  <td />
                  <td>{fmtNum(sum)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="sr-explain__none">Bu öğe metin eşleşmesiyle sıralandı.</p>
          )}
          {e.reason && <p className="sr-explain__reason">Gerekçe: {e.reason}</p>}
        </div>
      )}
    </div>
  )
}

/* ───────────── Masaüstü kartları ───────────── */

function DesktopTitleGrid({
  section,
  ctx,
  declaration,
}: {
  section: SearchSection
  ctx: Ctx
  declaration: SearchPageCapabilities
}): ReactElement {
  const href = useTitleHref()
  const rowId = `ara-${section.id}`
  const ents = section.entities.filter(
    (e) => e.video && lookupTreatment(section.__typename, e.treatment, declaration) === 'standardBoxshot',
  )
  const ids = () => ents.map((e) => e.video!.videoId)
  return (
    <ul className="sr-grid">
      {ents.map((e) => {
        const v = e.video!
        const id = `${section.id}:${e.unifiedEntityId}`
        return (
          <li key={e.unifiedEntityId} className="sr-cell">
            <PreviewTarget
              info={{
                rowId,
                videoId: v.videoId,
                getRowVideoIds: ids,
                tctx: e.track.tctx,
                title: v.title,
                imageUrl: landscapeArtwork(e),
              }}
            >
              <TitleCard
                title={v.title}
                image={landscapeArtwork(e)}
                badge={cardBadge(v)}
                progress={
                  v.bookmark && v.bookmark.progress > 0 && v.bookmark.progress < 0.97 ? v.bookmark.progress : null
                }
                caption={e.reason ?? undefined}
                to={href(v.videoId, e.track.tctx)}
                onClick={() => ctx.opened(e)}
              />
            </PreviewTarget>
            <ScoreChip e={e} id={id} ctx={ctx} />
          </li>
        )
      })}
    </ul>
  )
}

/** Canlı TV: eşleşen kanal ve yayınlar, tek satır (UX_SPEC §2 madde 3). Canlıya 1 adım. */
function LiveStrip({
  section,
  ctx,
  compact,
}: {
  section: SearchSection
  ctx: Ctx
  compact?: boolean
}): ReactElement | null {
  const now = useNow()
  const href = useTitleHref()
  // Kanal kartı şimdiki programı zaten gösteriyorsa aynı yayının ayrı kartı tekrar çizilmez.
  const nowShown = new Set(
    section.entities.flatMap((e) => (e.channel?.now ? [`${e.channel.channelId}|${e.channel.now.title}`] : [])),
  )
  const cards = section.entities.flatMap((e) => {
    const ch = e.channel
    const a = e.airing
    if (a && !ch && nowShown.has(`${a.channel.channelId}|${a.title}`) && Date.parse(a.startAt) <= now) return []
    if (ch) {
      const prog = ch.now
      return [
        {
          e,
          title: prog ? `${ch.name}: ${prog.title}` : ch.name,
          image: prog?.artwork?.url ?? null,
          logo: ch.logo.url,
          channelName: ch.name,
          locked: ch.access.state !== 'PLAYABLE',
          progress: prog ? liveProgress(prog.startAt, prog.endAt, now) : null,
          caption: prog ? [prog.title, formatRemaining(prog.endAt, now)].filter(Boolean).join(' · ') : ch.name,
          to: `/izle/Channel:${ch.channelId}`,
        },
      ]
    }
    if (a) {
      const live = Date.parse(a.startAt) <= now && now < Date.parse(a.endAt)
      return [
        {
          e,
          title: `${a.channel.name}: ${a.title}`,
          image: a.artwork?.url ?? null,
          logo: a.channel.logo.url,
          channelName: a.channel.name,
          locked: a.access.state !== 'PLAYABLE',
          progress: live ? liveProgress(a.startAt, a.endAt, now) : null,
          caption: live
            ? [a.title, formatRemaining(a.endAt, now)].filter(Boolean).join(' · ')
            : `${a.title} · ${formatDayTime(a.startAt, now)}`,
          to: live ? `/izle/Channel:${a.channel.channelId}` : a.video ? href(a.video.videoId, e.track.tctx) : '/rehber',
        },
      ]
    }
    return []
  })
  if (!cards.length) return null
  return (
    <section className={cx('sr-section sr-live', compact && 'sr-live--compact')} aria-labelledby="sr-live-h">
      <h2 className="sr-row-title" id="sr-live-h">
        Canlı TV
      </h2>
      <ul className="sr-grid sr-grid--one-row">
        {cards.map((c) => (
          <li key={c.e.unifiedEntityId} className="sr-cell">
            <TitleCard
              title={c.title}
              image={c.image}
              channelLogo={c.logo}
              channelName={c.channelName}
              showTitle={!c.image}
              badge={c.locked ? <Badge tone="lock" /> : undefined}
              progress={c.progress}
              caption={c.caption}
              to={c.to}
              onClick={() => ctx.opened(c.e)}
            />
            <ScoreChip e={c.e} id={`canli:${c.e.unifiedEntityId}`} ctx={ctx} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Şunu mu arıyorsun:" ve "Şunlarla ilgili daha fazla keşfedin:" — sessiz tek satırlar, ` | ` ile ayrılmış. */
function LinkLine({ label, children }: { label: string; children: ReactNode[] }): ReactElement | null {
  if (!children.length) return null
  return (
    <p className="sr-line">
      <span className="sr-line__label">{label}</span>
      {children.map((c, i) => (
        <span key={i} className="sr-line__item">
          {i > 0 && (
            <span className="sr-line__sep" aria-hidden="true">
              |
            </span>
          )}
          {c}
        </span>
      ))}
    </p>
  )
}

/* ───────────── Şeritler ───────────── */

function Banner({
  data,
  onSearch,
}: {
  data: SearchPageData
  onSearch: (q: string, exactTerm?: boolean) => void
}): ReactElement | null {
  const b = selectBanner(data)
  if (!b) return null
  if (b.kind === 'fallback')
    return (
      <p className="sr-banner" role="status">
        “{b.term}” için eşleşme bulunamadı.
      </p>
    )
  if (b.kind === 'mixed') {
    return (
      <p className="sr-banner">
        Bunu mu demek istedin:{' '}
        <button type="button" className="sr-link" onClick={() => onSearch(b.corrected)}>
          {b.corrected}
        </button>
      </p>
    )
  }
  return (
    <div className="sr-banner" role="status">
      <p>“{b.corrected}” için sonuçlar gösteriliyor.</p>
      <button type="button" className="sr-link sr-banner__alt" onClick={() => onSearch(b.original, true)}>
        Bunun yerine “{b.original}” ara
      </button>
    </div>
  )
}

/* ───────────── Yetenek bildirimi (açıklama kipinde) ───────────── */

function CapabilitySheet({
  open,
  onClose,
  choice,
  setChoice,
  declaration,
}: {
  open: boolean
  onClose: () => void
  choice: CapabilityChoice
  setChoice: (c: CapabilityChoice) => void
  declaration: SearchPageCapabilities
}): ReactElement {
  const json = JSON.stringify({ pageCapabilities: declaration })
  return (
    <Sheet open={open} onClose={onClose} title="Yetenek bildirimi" className="sr-capsheet">
      <p className="sr-cap__intro">
        İstemci çizebildiği türleri bildirir; sunucu yalnız bunları döndürür. Tahmin bölümü de bir yetenektir.
      </p>
      <div className="sr-cap__list">
        <Switch
          checked={choice.predicted}
          onChange={(on) => setChoice({ ...choice, predicted: on })}
          label="Tahmin modeli bölümü"
          description="searchPredicted"
        />
        {KIND_SWITCHES.map((s) => (
          <Switch
            key={s.kind}
            checked={choice.kinds.has(s.kind)}
            onChange={(on) => {
              const kinds = new Set(choice.kinds)
              if (on) kinds.add(s.kind)
              else kinds.delete(s.kind)
              setChoice({ ...choice, kinds })
            }}
            label={s.label}
            description={s.kind}
          />
        ))}
      </div>
      <p className="sr-cap__sig">
        {json.length} bayt · {declarationSignature(declaration) || 'boş'}
      </p>
    </Sheet>
  )
}

function ModelFooter({
  data,
  onCaps,
  fromCache,
}: {
  data: SearchPageData | undefined
  onCaps: () => void
  fromCache: boolean
}): ReactElement {
  return (
    <footer className="sr-model">
      <span>Model: {data?.modelVersion ?? '…'}</span>
      {data && <span>istek {data.requestId.slice(0, 8)}</span>}
      {fromCache && <span>önbellekten</span>}
      <button type="button" className="sr-link" onClick={onCaps}>
        Yetenek bildirimi
      </button>
    </footer>
  )
}

/* ───────────── Son aramalar ───────────── */

function RecentSearches({
  items,
  onPick,
  onClear,
  mobile,
}: {
  items: string[]
  onPick: (q: string) => void
  onClear: () => void
  mobile: boolean
}): ReactElement | null {
  if (!items.length) return null
  return (
    <section className="sr-section sr-recent" aria-labelledby="sr-recent-h">
      <div className="sr-rowhead">
        <h2 className="sr-row-title" id="sr-recent-h">
          Son aramalar
        </h2>
        <button type="button" className="sr-link sr-quiet" onClick={onClear}>
          Temizle
        </button>
      </div>
      {mobile ? (
        <ul className="sr-mlist">
          {items.map((r) => (
            <li key={r}>
              <button type="button" className="sr-mrow sr-mrow--text" onClick={() => onPick(r)}>
                <Icon name="clock" size={18} />
                <span className="sr-mrow__title">{r}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sr-pills">
          {items.map((r) => (
            <Pill key={r} onClick={() => onPick(r)}>
              {r}
            </Pill>
          ))}
        </div>
      )}
    </section>
  )
}

/* ───────────── Mobil parçaları ───────────── */

/** Netflix mobil "Önerilen" satırı: 16:9 küçük görsel + ad + ▶ */
function MobileSuggestRows({
  videos,
  rowId,
  ctx,
}: {
  videos: { v: SearchVideo; tctx: string; entityId: string; reason?: string | null }[]
  rowId: string
  ctx: Ctx
}): ReactElement {
  const href = useTitleHref()
  return (
    <ul className="sr-mlist" data-row={rowId}>
      {videos.map(({ v, tctx, entityId, reason }) => (
        <li key={entityId} className="sr-mrow">
          <Link
            to={href(v.videoId, tctx)}
            className="sr-mrow__main"
            onClick={() => ctx.opened({ unifiedEntityId: entityId, track: { tctx } })}
          >
            <span className="sr-mrow__thumb">
              {v.storyArt?.url ? <img src={v.storyArt.url} alt="" loading="lazy" /> : null}
              {v.access.state !== 'PLAYABLE' && (
                <span className="sr-mrow__lock">
                  <Badge tone="lock" />
                </span>
              )}
            </span>
            <span className="sr-mrow__text">
              <span className="sr-mrow__title">{v.title}</span>
              {reason && <span className="sr-reason">{reason}</span>}
            </span>
          </Link>
          <Link
            to={playPath(v.videoId, tctx)}
            className="sr-mrow__play"
            aria-label={`${v.title} oynat`}
            onClick={() => ctx.opened({ unifiedEntityId: entityId, track: { tctx } })}
          >
            <Icon name="play" size={18} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function MobilePosterGrid({
  section,
  ctx,
  declaration,
}: {
  section: SearchSection
  ctx: Ctx
  declaration: SearchPageCapabilities
}): ReactElement {
  const href = useTitleHref()
  const ents = section.entities.filter(
    (e) => e.video && lookupTreatment(section.__typename, e.treatment, declaration) === 'standardBoxshot',
  )
  return (
    <ul className="sr-mgrid">
      {ents.map((e) => {
        const v = e.video!
        return (
          <li key={e.unifiedEntityId} className="sr-cell">
            <PosterCard
              title={v.title}
              image={posterArtwork(e)}
              badge={cardBadge(v)}
              to={href(v.videoId, e.track.tctx)}
              onClick={() => ctx.opened(e)}
            />
            {e.reason && <span className="sr-reason">{e.reason}</span>}
            <ScoreChip e={e} id={`${section.id}:${e.unifiedEntityId}`} ctx={ctx} />
          </li>
        )
      })}
    </ul>
  )
}

function MobilePredictionRows({
  items,
  typed,
  onPick,
}: {
  items: SearchPrediction[]
  typed: string
  onPick: (p: SearchPrediction) => void
}): ReactElement | null {
  if (!items.length) return null
  return (
    <ul className="sr-mlist sr-mpredict" aria-label="Tahminler">
      {items.map((p) => (
        <li key={`${p.kind}:${p.text}`}>
          <button type="button" className="sr-mrow sr-mrow--text" onClick={() => onPick(p)}>
            <Icon name={p.kind === 'QUERY' ? 'clock' : 'search'} size={18} />
            <PredictionText text={p.text} typed={typed} />
            <span className="tvp-predict__kind">{predictionKindLabel(p.kind)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ───────────── Sayfa ───────────── */

export default function SearchPage(): ReactElement {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const shellFF = useShellFormFactor()
  const mobile = (shellFF ?? detectFormFactor()) === 'mobile'
  const q = params.get('q') ?? ''
  const term = q.trim()
  // "Bunun yerine … ara": düzeltmesiz arama. Kullanıcı sorguyu değiştirince kutu adresi `tam` olmadan yazar.
  const exact = params.get('tam') === '1' && !!term
  useDocumentTitle(term ? `“${term}” araması` : 'Ara')
  useShellOptions(mobile ? { topBar: false } : {})

  const inspect = useInspectMode()
  const [choice, setChoiceState] = useState<CapabilityChoice>(loadChoice)
  const setChoice = (c: CapabilityChoice) => {
    setChoiceState(c)
    saveChoice(c)
  }
  const [capOpen, setCapOpen] = useState(false)
  const [explainOpen, setExplainOpen] = useState<string | null>(null)
  const [recentCleared, setRecentCleared] = useState(false)

  const search = useSearch(term, choice, exact, inspect)
  const { data, loading, error, declaration } = search
  // Ekrandaki veri başka bir terime aitse (yeni sorgu sürüyor) eski sonuç sönük kalır.
  const stale = loading && !!data && data.searchTerm.trim() !== term

  // Kutu boşken: profile göre tahmin edilmiş başlıklar.
  const popular = useGql<{ popularSearches: PopularVideo[] }, { first: number }>(
    'PopularSearches',
    { first: POPULAR_FIRST },
    { ttlMs: 60_000, enabled: !term },
  )
  // Geri bildirim kişisel önerileri de değiştirir.
  useEffect(() => onFeedback(() => queryCache.invalidate('PopularSearches')), [])

  // Mobil: yazarken tahmin satırları (hafif uç; sayfa sorgusundan önce gelir).
  const mPredict = usePredictions(term, mobile && !!term)

  useEffect(() => {
    if (term) setRecentCleared(false)
    setExplainOpen(null)
  }, [term])

  const goSearch = (next: string, exactTerm = false) => {
    navigate(searchPath(next, exactTerm), { replace: true })
    recordSearch(next)
  }

  const requestId = data?.requestId ?? 'populer'
  const ctx: Ctx = {
    term,
    requestId,
    inspect,
    explainOpen,
    setExplainOpen,
    opened: (e) => {
      const item = ledger.find(requestId, e.unifiedEntityId) ?? ledger.findByTctx(e.track.tctx)
      sendFeedback(item, 'CLICK')
      logEvent(
        'click',
        { surface: 'arama', treatment: e.treatment ?? null, kind: e.kind ?? null, entityId: e.unifiedEntityId },
        e.track.tctx,
      )
      recordSearch(term)
    },
  }

  // Popüler başlıklar geri bildirim defterine yazılır (konum = listedeki sıra; boş sorgunun yanıt kimliğiyle).
  const popularRows = useMemo(
    () =>
      (popular.data?.popularSearches ?? []).map((v, i) => ({
        v,
        entityId: v.unifiedEntityId,
        tctx: localTctx('ara-populer', i, v.videoId),
      })),
    [popular.data],
  )
  useEffect(() => {
    if (term || !popularRows.length) return
    ledger.registerPage(requestId, '', [
      { id: 'populer', entities: popularRows.map((r) => ({ unifiedEntityId: r.entityId, track: { tctx: r.tctx } })) },
    ])
  }, [popularRows, requestId, term])

  const parts = pageParts(term ? data : undefined)
  const recent = !term && !recentCleared ? (data?.recentSearches ?? []) : []
  const clearRecent = () => {
    setRecentCleared(true)
    void clearRecentSearches().then((ok) => {
      if (ok) search.reload()
      else setRecentCleared(false)
    })
  }
  const pickRecent = (r: string) => goSearch(r)
  const suggestions = data && term ? suggestedQueries(data) : []
  const mobilePredictions = (mPredict.items ?? []).filter(
    (p) => p.text.trim().toLocaleLowerCase('tr-TR') !== term.toLocaleLowerCase('tr-TR'),
  )

  const showResults = !!data && !!term
  const hasLive = !!parts.live && !data?.isFallback
  const nothing =
    showResults && !parts.gallery && !parts.predicted && !parts.live && parts.related.length === 0 && !error

  const body = (
    <>
      {error && (
        <ErrorState
          size={data ? 'inline' : 'page'}
          title="Arama yapılamadı"
          message="Bağlantını kontrol et ve tekrar dene."
          onRetry={search.retry}
        />
      )}

      {/* Yazmadan önce */}
      {!term && (
        <>
          <RecentSearches items={recent} onPick={pickRecent} onClear={clearRecent} mobile={mobile} />
          <section className="sr-section" aria-labelledby="sr-popular-h">
            <h2 className="sr-row-title" id="sr-popular-h">
              Sana Özel Öneriler
            </h2>
            {!popular.data && popular.loading && <SkeletonGrid count={mobile ? 6 : 12} className="sr-skel" />}
            {popularRows.length > 0 &&
              (mobile ? (
                <MobileSuggestRows videos={popularRows} rowId="ara-populer" ctx={ctx} />
              ) : (
                <PopularGrid rows={popularRows} ctx={ctx} />
              ))}
          </section>
        </>
      )}

      {/* Yazarken */}
      {term && mobile && (
        <MobilePredictionRows items={mobilePredictions.slice(0, 4)} typed={term} onPick={(p) => goSearch(p.text)} />
      )}

      {term && !data && !error && <SkeletonGrid count={mobile ? 9 : 12} className="sr-skel" />}

      {showResults && data && (
        <div className={cx('sr-results', stale && 'is-stale')} aria-busy={loading}>
          <Banner data={data} onSearch={goSearch} />
          {!mobile && (
            <LinkLine label="Şunu mu arıyorsun:">
              {suggestions.map((p) => (
                <button key={p.text} type="button" className="sr-link" onClick={() => goSearch(p.text)}>
                  {p.text}
                </button>
              ))}
            </LinkLine>
          )}
          <LinkLine label="Şunlarla ilgili daha fazla keşfedin:">
            {parts.related.map((r) => (
              <Link key={r.id} to={r.to} className="sr-link" onClick={() => ctx.opened(r.entity)}>
                {r.label}
              </Link>
            ))}
          </LinkLine>

          {hasLive && parts.live && <LiveStrip section={parts.live} ctx={ctx} compact={mobile} />}

          {parts.gallery && (
            <section className="sr-section" aria-labelledby="sr-gallery-h">
              {/* Netflix'te ızgaranın başlığı yok; Canlı TV satırı üstündeyse ayrılsın diye görünür başlık. */}
              <h2 className={mobile || hasLive ? 'sr-row-title' : 'ui-sr-only'} id="sr-gallery-h">
                {mobile || hasLive ? 'Filmler ve Diziler' : `“${term}” için sonuçlar`}
              </h2>
              {mobile ? (
                <MobilePosterGrid section={parts.gallery} ctx={ctx} declaration={declaration} />
              ) : (
                <DesktopTitleGrid section={parts.gallery} ctx={ctx} declaration={declaration} />
              )}
            </section>
          )}

          {parts.predicted && (
            <section className="sr-section sr-predicted" aria-labelledby="sr-predicted-h">
              <h2 className="sr-row-title" id="sr-predicted-h">
                {parts.predicted.displayString}
              </h2>
              {mobile ? (
                <MobilePosterGrid section={parts.predicted} ctx={ctx} declaration={declaration} />
              ) : (
                <DesktopTitleGrid section={parts.predicted} ctx={ctx} declaration={declaration} />
              )}
            </section>
          )}

          {nothing && (
            <EmptyState icon="search" title={`“${term}” için sonuç yok`} message="Başka bir ad, kişi ya da tür dene." />
          )}
        </div>
      )}

      {inspect && <ModelFooter data={data} onCaps={() => setCapOpen(true)} fromCache={search.fromCache} />}
      <CapabilitySheet
        open={capOpen}
        onClose={() => setCapOpen(false)}
        choice={choice}
        setChoice={setChoice}
        declaration={declaration}
      />
    </>
  )

  if (mobile) {
    return (
      <div className="sr-page sr-page--mobile">
        <h1 className="ui-sr-only">Ara</h1>
        <div className="sr-mbar">
          <SearchField
            variant="page"
            autoFocus={!q}
            onCancel={() => {
              const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
              if (idx > 0) navigate(-1)
              else navigate('/goz-at', { replace: true })
            }}
          />
        </div>
        {body}
      </div>
    )
  }
  // Yeni sonuç kümesi gelince açık önizleme kapanır (kapsam yalnız yol değişince kapatıyor; SÖZLEŞME notu).
  return (
    <PreviewScope key={term ? (data?.requestId ?? 'yukleniyor') : 'bos'}>
      <div className="sr-page sr-page--desktop">
        <h1 className="ui-sr-only">{term ? `“${term}” araması` : 'Ara'}</h1>
        {body}
      </div>
    </PreviewScope>
  )
}

/** Masaüstü boş kutu: "Sana Özel Öneriler" ızgarası (popularSearches; model sırası). */
function PopularGrid({
  rows,
  ctx,
}: {
  rows: { v: SearchVideo; tctx: string; entityId: string }[]
  ctx: Ctx
}): ReactElement {
  const href = useTitleHref()
  const ids = () => rows.map((r) => r.v.videoId)
  return (
    <ul className="sr-grid">
      {rows.map(({ v, tctx, entityId }) => (
        <li key={entityId} className="sr-cell">
          <PreviewTarget
            info={{
              rowId: 'ara-populer',
              videoId: v.videoId,
              getRowVideoIds: ids,
              tctx,
              title: v.title,
              imageUrl: v.storyArt?.url,
            }}
          >
            <TitleCard
              title={v.title}
              image={v.storyArt?.url}
              badge={cardBadge(v)}
              to={href(v.videoId, tctx)}
              onClick={() => ctx.opened({ unifiedEntityId: entityId, kind: 'VIDEO', track: { tctx } })}
            />
          </PreviewTarget>
        </li>
      ))}
    </ul>
  )
}
