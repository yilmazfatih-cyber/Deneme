/**
 * TV Arama ekranı. Dışa aktarım adı SABİT.
 *   TvSearch  /tv/ara
 *
 * Solda ekran klavyesi (6 sütun; boşluk · sil · temizle, Türk alfabesi, rakamlar) ve altında modelin tamamlama
 * tahminleri (OK yazıya dönüştürür); sağda sonuç ızgarası (3 sütun 16:9) modelin sırasıyla, tahmin bölümü kendi
 * başlığıyla ve her tahmin kartının altında gerekçesiyle. Yazmadan önce "Sana Özel Öneriler".
 *
 * Yazı kaynakları: ekran klavyesi, fiziksel klavye (odak bu ekrandayken harf/rakam/boşluk; Backspace yazı varken
 * siler), kumandanın rakam tuşları ve telefonun klavyesi (`registerTextTarget`: TEXT komutu TAM metni verir).
 * Yetenek bildirimi `searchPredicted` bölümünü içerir; sonuç açılınca `recordSearchFeedback` (CLICK, sayfanın
 * requestId'si ve sonucun sırası) gider. devbus `predict`: tamamlama · sıralama · geri bildirim.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { gql } from '../../api/graphql'
import { useGql } from '../../api/hooks'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { digitOf, FocusScope, useFocusable, useFocusEngine, useKeyInterceptor, type Direction } from '../focus'
import { registerTextTarget, titlePath, useDeviceState, useTvBoot, watchPath } from '../shell'
import { screenScopeId, TvCard, TvGrid, TvIcon, TvScreen, TvSkeletonCard, useScrollFocusedIntoView } from '../ui'
import { useSettled } from '../home/Hero'
import { keyIdOf, LAYOUT, moveKey, nextPreferredCol, typedChar, type KeyDef } from './keyboard'
import {
  initialQuery,
  needsCommit,
  PREDICT_DEBOUNCE_MS,
  reduceQuery,
  SEARCH_DEBOUNCE_MS,
  termOf,
  type QueryAction,
} from './queryState'
import { rankingDetail, toSections, type ResultItem, type ResultSection, type SearchPageData } from './results'
import './search.css'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

const SCREEN_ID = 'ara'
const RESULTS_SCOPE = 'ara:sonuclar'
const DEFAULT_KEY = keyIdOf({ action: 'char', char: 'a' })

/** Yetenek bildirimi: çizebildiğimiz bölüm ve biçimler (tahmin bölümü dahil). */
const standard = (treatment: string, kinds: string[]) => ({
  capabilitiesBySectionTreatment: {
    standard: { capabilitiesByEntityTreatment: { [treatment]: { canHandleEntityKinds: kinds } } },
  },
})
export const TV_SEARCH_CAPABILITIES = {
  capabilitiesBySection: {
    searchLive: standard('standardChannelTile', ['CHANNEL']),
    searchGallery: standard('standardBoxshot', ['VIDEO']),
    searchPredicted: standard('standardBoxshot', ['VIDEO']),
  },
}

interface PredictionData {
  searchPredictions: { text: string; kind: string; unifiedEntityId: string | null; score: number }[]
}
interface PopularVideo {
  __typename: string
  videoId: number
  unifiedEntityId: string
  title: string
  access: { state: string }
  storyArt: { url: string } | null
  boxart: { url: string } | null
}

/** Sonuca girip Geri'ye basınca arama kaldığı yerden sürer (profil başına son yazı). */
let saved: { guid: string; text: string } | null = null

export function TvSearch(): ReactElement {
  const navigate = useNavigate()
  const engine = useFocusEngine()
  const guid = useTvBoot()?.activeProfile?.guid ?? ''
  const [query, dispatch] = useReducer(reduceQuery, guid, (g: string) => {
    const text = saved && saved.guid === g ? saved.text : ''
    return text ? { ...initialQuery, text, term: termOf(text) } : initialQuery
  })
  useEffect(() => {
    saved = { guid, text: query.text }
  }, [guid, query.text])
  const act = useCallback((a: QueryAction) => dispatch(a), [])
  const lastKey = useRef(DEFAULT_KEY)

  /* Yazı durunca arama terimi işlenir */
  useEffect(() => {
    if (!needsCommit(query)) return
    const t = setTimeout(() => act({ type: 'commit' }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, act])

  /* Telefonun klavyesi */
  useEffect(
    () =>
      registerTextTarget({
        setText: (text) => act({ type: 'set', text, from: 'phone' }),
        submit: () => act({ type: 'commit' }),
      }),
    [act],
  )

  /* Fiziksel klavye: odak bu ekrandayken harf, rakam ve boşluk yazıya gider (kumanda tuşlarından önce yakalanır) */
  const textRef = useRef(query.text)
  textRef.current = query.text
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (!engine.isWithin(screenScopeId(SCREEN_ID))) return
      if ((e.key === 'Backspace' || e.key === 'Delete') && textRef.current) {
        e.preventDefault()
        act({ type: 'delete', from: 'physical' })
        return
      }
      const ch = typedChar(e.key)
      if (ch === null) return
      e.preventDefault()
      act(ch === ' ' ? { type: 'space', from: 'physical' } : { type: 'char', ch, from: 'physical' })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine, act])

  /* Kumandanın rakam tuşları */
  useKeyInterceptor((key) => {
    const d = digitOf(key)
    if (d === null || !engine.isWithin(screenScopeId(SCREEN_ID))) return false
    act({ type: 'char', ch: String(d), from: 'keyboard' })
    return true
  }, 10)

  /* Tamamlama tahminleri */
  const prefix = useSettled(termOf(query.text), PREDICT_DEBOUNCE_MS)
  const predQ = useGql<PredictionData, { prefix: string; first: number }>(
    'TvSearchPredictions',
    { prefix, first: 6 },
    { enabled: prefix.length > 0, ttlMs: 60_000 },
  )
  const predictions = prefix ? (predQ.data?.searchPredictions ?? []) : []
  const predEmitted = useRef<string | null>(null)
  useEffect(() => {
    if (!prefix || !predQ.data || predEmitted.current === prefix) return
    predEmitted.current = prefix
    devbus.emit('predict', 'tamamlama', {
      prefix,
      predictions: predQ.data.searchPredictions.map((p) => ({ text: p.text, kind: p.kind, score: p.score })),
    })
  }, [prefix, predQ.data])

  /* Sonuçlar (yeni terim gelene dek önceki sonuçlar ekranda kalır) */
  const term = query.term
  const pageQ = useGql<{ searchPage: SearchPageData }, { searchTerm: string; options: object }>(
    'TvSearchPage',
    { searchTerm: term, options: { pageCapabilities: TV_SEARCH_CAPABILITIES, pageSize: 30 } },
    { enabled: term !== '', ttlMs: 60_000 },
  )
  const lastPage = useRef<SearchPageData | null>(null)
  if (term === '') lastPage.current = null
  else if (pageQ.data?.searchPage) lastPage.current = pageQ.data.searchPage
  const page = term === '' ? null : lastPage.current
  const sections = useMemo(() => (page ? toSections(page) : []), [page])
  const rankedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!page || rankedFor.current === page.requestId) return
    rankedFor.current = page.requestId
    devbus.emit('predict', 'sıralama', rankingDetail(page))
  }, [page])

  /* Sana Özel Öneriler (kutu boşken) */
  const popularQ = useGql<{ popularSearches: PopularVideo[] }, { first: number }>(
    'TvPopularSearches',
    { first: 12 },
    { ttlMs: 5 * 60_000 },
  )
  const popular: ResultSection[] = useMemo(() => {
    const list = popularQ.data?.popularSearches ?? []
    if (!list.length) return []
    return [
      {
        id: 'sana-ozel',
        title: 'Sana Özel Öneriler',
        predicted: true,
        items: list.map((v, i) => ({
          key: `sana-ozel:${v.unifiedEntityId}`,
          entityId: v.unifiedEntityId,
          position: i,
          title: v.title,
          imageUrl: v.storyArt?.url ?? v.boxart?.url ?? null,
          reason: null,
          predicted: true,
          tctx: `0,${i},sana-ozel,0,,,,,,,${v.unifiedEntityId},`,
          locked: v.access.state !== 'PLAYABLE',
          badge: null,
          target: { kind: 'video' as const, videoId: v.videoId },
          live: false,
          progress: null,
          score: null,
          explain: null,
        })),
      },
    ]
  }, [popularQ.data])

  const shown = term === '' ? popular : sections
  const loadingResults = term !== '' && !page

  /* Sonucu aç: geri bildirim + günlük + yönlendirme */
  const openResult = useCallback(
    (item: ResultItem) => {
      if (page && term) {
        void gql('TvRecordSearchFeedback', {
          requestId: page.requestId,
          searchTerm: page.searchTerm,
          unifiedEntityId: item.entityId,
          position: item.position,
          action: 'CLICK',
        }).catch(() => undefined)
        void gql('RecordSearch', { term: page.searchTerm }).catch(() => undefined)
        devbus.emit('predict', 'geri bildirim', {
          term: page.searchTerm,
          entityId: item.entityId,
          action: 'CLICK',
          position: item.position,
          requestId: page.requestId,
        })
      }
      logEvent(
        'click',
        {
          entityId: item.entityId,
          position: item.position,
          predicted: item.predicted,
          term: term || null,
          action: item.target.kind === 'channel' ? 'play' : 'detail',
          from: 'tv-search',
        },
        item.tctx,
      )
      if (item.target.kind === 'channel') navigate(watchPath(`Channel:${item.target.channelId}`))
      else navigate(`${titlePath(item.target.videoId)}?tctx=${encodeURIComponent(item.tctx)}`)
    },
    [page, term, navigate],
  )

  /* Telefon eşleşmişse ipucu */
  const devices = useDeviceState().devices
  const phoneOnline = devices.some((d) => !d.isThisDevice && d.online && d.kind === 'MOBILE')

  return (
    <TvScreen id={SCREEN_ID} title="Ara" defaultFocus={DEFAULT_KEY} className="tvs">
      <div className="tvs-cols">
        <div className="tvs-left">
          <div className={cx('tvs-box', !query.text && 'is-empty')} role="search" aria-live="polite">
            <TvIcon name="search" size={2} />
            <span className="tvs-box__text" data-search-text="">
              {query.text || 'Başlıklar, kişiler, türler'}
            </span>
            <span className="tvs-box__caret" aria-hidden="true" />
          </div>
          <Keyboard act={act} lastKey={lastKey} />
          <Predictions items={predictions.map((p) => p.text)} onPick={(text) => act({ type: 'set', text, from: 'prediction' })} />
          {phoneOnline && (
            <p className="tvs-hint">
              <TvIcon name="phone" size={1.6} />
              Telefonunla yazabilirsin
            </p>
          )}
        </div>
        <Results
          sections={shown}
          loading={loadingResults || (term === '' && popularQ.loading && !popular.length)}
          notice={
            page?.isFallback && term
              ? `“${term}” için eşleşme bulunamadı.`
              : page?.correction
                ? `“${page.correction.correctedTerm}” için sonuçlar`
                : null
          }
          onOpen={openResult}
          onExitLeft={() => engine.focus(lastKey.current) || engine.focus(DEFAULT_KEY)}
        />
      </div>
    </TvScreen>
  )
}

/* ───────────── Ekran klavyesi ───────────── */

function Keyboard({ act, lastKey }: { act: (a: QueryAction) => void; lastKey: { current: string } }): ReactElement {
  const engine = useFocusEngine()
  const prefCol = useRef<number | undefined>(undefined)
  const onArrow = useCallback(
    (from: string, dir: Direction): boolean => {
      const r = moveKey(LAYOUT, from, dir, prefCol.current)
      if (r.kind === 'exit') return false // ekrana bırakılır: → sonuçlar, ↓ tahminler, ← yan menü
      if (dir === 'up' || dir === 'down') prefCol.current = nextPreferredCol(LAYOUT, r.id, prefCol.current)
      else prefCol.current = undefined
      engine.focus(r.id)
      return true
    },
    [engine],
  )
  return (
    <FocusScope id="ara:klavye" orientation="grid" defaultFocus={DEFAULT_KEY}>
      <div className="tvs-kb" role="group" aria-label="Ekran klavyesi">
        {LAYOUT.flat().map((k) => (
          <Key
            key={k.id}
            k={k}
            onArrow={(dir) => onArrow(k.id, dir)}
            onFocus={() => {
              lastKey.current = k.id
            }}
            onPress={() => {
              if (k.action === 'char' && k.char) act({ type: 'char', ch: k.char })
              else if (k.action === 'space') act({ type: 'space' })
              else if (k.action === 'delete') act({ type: 'delete' })
              else act({ type: 'clear' })
            }}
          />
        ))}
      </div>
    </FocusScope>
  )
}

const KEY_LABELS: Record<string, string> = { space: 'Boşluk', delete: 'Sil', clear: 'Temizle' }

function Key({
  k,
  onArrow,
  onFocus,
  onPress,
}: {
  k: KeyDef
  onArrow: (dir: Direction) => boolean
  onFocus: () => void
  onPress: () => void
}): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: k.id, onArrow, onFocus, onEnter: onPress })
  const wide = k.span > 1
  return (
    <div
      ref={ref}
      role="button"
      aria-label={k.action === 'char' ? k.label : KEY_LABELS[k.action]}
      className={cx('tvs-key', wide && 'tvs-key--wide', focused && 'is-focused')}
      style={{ gridColumn: `${k.col + 1} / span ${k.span}`, gridRow: k.row + 1 }}
    >
      {k.action === 'delete' ? (
        <>
          <TvIcon name="backspace" size={1.7} />
          <span>Sil</span>
        </>
      ) : k.action === 'char' ? (
        k.label
      ) : (
        KEY_LABELS[k.action]
      )}
    </div>
  )
}

/* ───────────── Tahminler ───────────── */

function Predictions({ items, onPick }: { items: string[]; onPick: (text: string) => void }): ReactElement {
  return (
    <FocusScope id="ara:tahminler" orientation="vertical">
      <div className="tvs-preds" role="list" aria-label="Tahminler">
        {items.slice(0, 5).map((text) => (
          <PredictionItem key={text} text={text} onPick={() => onPick(text)} />
        ))}
      </div>
    </FocusScope>
  )
}

function PredictionItem({ text, onPick }: { text: string; onPick: () => void }): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: `ara:tahmin:${text}`, onEnter: onPick })
  return (
    <div
      ref={ref}
      role="listitem"
      aria-label={`Şunu ara: ${text}`}
      className={cx('tvs-pred', focused && 'is-focused')}
    >
      <TvIcon name="search" size={1.4} />
      <span>{text}</span>
    </div>
  )
}

/* ───────────── Sonuçlar ───────────── */

function Results({
  sections,
  loading,
  notice,
  onOpen,
  onExitLeft,
}: {
  sections: ResultSection[]
  loading: boolean
  notice: string | null
  onOpen: (item: ResultItem) => void
  onExitLeft: () => boolean
}): ReactElement {
  const boxRef = useRef<HTMLDivElement | null>(null)
  useScrollFocusedIntoView(boxRef, 80)
  return (
    <FocusScope id={RESULTS_SCOPE} onEdge={(dir) => dir === 'left' && onExitLeft()}>
      <div ref={boxRef} className="tvs-results" aria-busy={loading || undefined}>
        {notice && <p className="tvs-notice">{notice}</p>}
        {sections.map((sec) => (
          <section key={sec.id} className="tvs-section" aria-label={sec.title}>
            <h2 className={cx('tvs-section__title', sec.predicted && 'is-predicted')}>{sec.title}</h2>
            <TvGrid id={`ara:bolum:${sec.id}`} columns={3} gap={1.2} className="tvs-grid">
              {sec.items.map((item) => (
                <TvCard
                  key={item.key}
                  id={`ara:sonuc:${item.key}`}
                  imageUrl={item.imageUrl}
                  title={item.title}
                  badge={item.badge}
                  locked={item.locked}
                  live={item.live}
                  progress={item.live ? item.progress : null}
                  caption={item.reason}
                  width="100%"
                  className={cx('tvs-card', item.reason && 'has-reason')}
                  onPress={() => onOpen(item)}
                />
              ))}
            </TvGrid>
          </section>
        ))}
        {loading && !sections.length && (
          <div className="tvs-skel">
            {Array.from({ length: 6 }, (_, i) => (
              <TvSkeletonCard key={i} width={20} />
            ))}
          </div>
        )}
      </div>
    </FocusScope>
  )
}
