/**
 * Arama sayfası (#/ara?q=) — tembel parça. Bölümler geldiği sırayla `__typename`'e göre, varlıklar `treatment`'a
 * göre çizilir; çizici haritası capabilities.ts'teki TEK tablonun anahtarlarıyla tiplenmiştir.
 * Arama asla çıkmaz sokak değildir: boş sorguda son aramalar + yedek bölümler, sonuçsuzlukta sakin bir satır +
 * yedek bölümler, yazım hatasında düzeltme şeridi.
 */
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDocumentTitle } from '../../app'
import {
  AccessLock,
  Button,
  ChannelTile,
  Chip,
  cx,
  ErrorState,
  formatDayTime,
  formatLiveLine,
  HScroll,
  Icon,
  LandscapeCard,
  LiveChannelCard,
  LiveTag,
  Page,
  PosterCard,
  ProgressBar,
  Sheet,
  SkeletonRow,
  TextButton,
  liveProgress,
  useNow,
} from '../../design'
import { logEvent } from '../../telemetry/logger'
import { airingAction, liveWatchPath, lockText } from '../live/airing'
import { AccessSheet, AiringSheet, type AiringSheetTarget } from '../live/shared'
import {
  declarationSignature,
  KIND_SWITCHES,
  loadEnabledKinds,
  lookupTreatment,
  saveEnabledKinds,
  type EntityKindName,
  type SearchPageCapabilities,
  type TreatmentName,
} from './capabilities'
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  galleryGenres,
  posterArtwork,
  selectBanner,
  type Filters,
  type KindFilter,
  type SearchEntity,
  type SearchSection,
  type SortOrder,
  type YearFilter,
} from './searchModel'
import { SearchField } from './SearchField'
import { clearRecentSearches, recordSearch } from './searchStore'
import { normalizeTerm } from './ttlCache'
import { useSearch } from './useSearch'
import './search.css'

/* ───────────── Çizim bağlamı ───────────── */

interface RenderCtx {
  term: string
  /** Sonuç açıldı: tıklama olayı + aramayı kaydet */
  opened: (e: SearchEntity, action: string) => void
  openAiring: (t: AiringSheetTarget) => void
  openLock: (title: string, reason: string) => void
}

type GroupRenderer = (p: { entities: SearchEntity[]; section: SearchSection; ctx: RenderCtx }) => ReactElement | null

const detailPath = (videoId: number, tctx: string) => `/detay/${videoId}?tctx=${encodeURIComponent(tctx)}`

/* ───────────── Biçim çizicileri ───────────── */

const ChannelTiles: GroupRenderer = ({ entities, section, ctx }) => (
  <HScroll label={`${section.displayString}: kanallar`} scrollKey={`ara:${section.id}:kanal`}>
    {entities.flatMap((e) => {
      const ch = e.channel
      if (!ch) return []
      const lock = lockText(ch.access)
      if (!ch.now) {
        return [
          <ChannelTile
            key={e.unifiedEntityId}
            name={ch.name}
            logoUrl={ch.logo.url}
            to={lock ? undefined : liveWatchPath(ch.channelId, e.track.tctx)}
            onClick={() => ctx.opened(e, 'canli')}
          />,
        ]
      }
      return [
        <LiveChannelCard
          key={e.unifiedEntityId}
          channelName={ch.name}
          channelLogoUrl={ch.logo.url}
          programmeTitle={ch.now.title}
          start={ch.now.startAt}
          end={ch.now.endAt}
          lockedText={lock}
          to={lock ? undefined : liveWatchPath(ch.channelId, e.track.tctx)}
          onClick={() => {
            ctx.opened(e, lock ? 'kilit' : 'canli')
            if (lock) ctx.openLock(ch.name, lock)
          }}
        />,
      ]
    })}
  </HScroll>
)

function AiringRow({ e, ctx }: { e: SearchEntity; ctx: RenderCtx }): ReactElement | null {
  const now = useNow()
  const a = e.airing
  if (!a) return null
  const action = airingAction(a, a.channel.channelId, now, e.track.tctx)
  const live =
    action.kind === 'live' || (action.kind === 'locked' && Date.parse(a.startAt) <= now && now < Date.parse(a.endAt))
  const when = live ? formatLiveLine(a.startAt, a.endAt, now) : formatDayTime(a.startAt, now)
  return (
    <li className="sr-airing">
      <button
        type="button"
        className="sr-airing__main"
        aria-label={`${a.channel.name}, ${a.title}, ${when}`}
        onClick={() => {
          ctx.opened(e, 'ayrinti')
          ctx.openAiring({ airing: a, channel: a.channel, tctx: e.track.tctx, surface: 'arama' })
        }}
      >
        <ChannelTile name={a.channel.name} logoUrl={a.channel.logo.url} />
        <span className="sr-airing__text">
          <span className="sr-airing__when">
            {live && <LiveTag />}
            <span className="cn-meta">{when}</span>
          </span>
          <span className="cn-card-title">{a.title}</span>
          <span className="cn-meta">{a.channel.name}</span>
          {live && (
            <ProgressBar
              value={liveProgress(a.startAt, a.endAt, now)}
              label="Yayın ilerlemesi"
              className="sr-airing__progress"
            />
          )}
        </span>
      </button>
      <span className="sr-airing__action">
        {action.kind === 'live' ? (
          <Button
            variant="secondary"
            size="sm"
            icon="play"
            to={action.primary.to}
            onClick={() => ctx.opened(e, 'canli')}
          >
            {action.primary.label}
          </Button>
        ) : action.kind === 'catchup' ? (
          <Button
            variant="secondary"
            size="sm"
            icon="play"
            to={action.primary.to}
            onClick={() => ctx.opened(e, 'geri-al')}
          >
            {action.primary.label}
          </Button>
        ) : action.kind === 'locked' ? (
          <AccessLock text={action.reason} />
        ) : action.kind === 'upcoming' ? (
          <span className="sr-airing__start">{formatDayTime(a.startAt, now)}</span>
        ) : (
          <span className="cn-meta">{action.note}</span>
        )}
      </span>
    </li>
  )
}

const AiringRows: GroupRenderer = ({ entities, ctx }) => (
  <ul className="sr-airings cn-gutter-x">
    {entities.map((e) => (
      <AiringRow key={e.unifiedEntityId} e={e} ctx={ctx} />
    ))}
  </ul>
)

const Suggestions: GroupRenderer = ({ entities, ctx }) => {
  const navigate = useNavigate()
  return (
    <ul className="sr-suggest cn-gutter-x">
      {entities.map((e) => {
        const v = e.video
        const meta = v ? [v.displayRuntime, v.latestYear].filter(Boolean).join(' · ') : ''
        return (
          <li key={e.unifiedEntityId}>
            <button
              type="button"
              className="sr-suggest__item"
              onClick={() => {
                ctx.opened(e, 'oneri')
                if (v) navigate(detailPath(v.videoId, e.track.tctx))
                else navigate(`/ara?q=${encodeURIComponent(e.displayString)}`)
              }}
            >
              <Icon name="search" size={18} />
              <span className="sr-suggest__text">
                <span className="sr-suggest__title">{e.displayString}</span>
                {meta && <span className="cn-meta">{meta}</span>}
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const PersonChips: GroupRenderer = ({ entities, ctx }) => (
  <div className="sr-chips cn-gutter-x">
    {entities.flatMap((e) =>
      e.person
        ? [
            <Chip
              key={e.unifiedEntityId}
              to={`/kisi/${e.person.personId}?tctx=${encodeURIComponent(e.track.tctx)}`}
              onClick={() => ctx.opened(e, 'kisi')}
            >
              {e.person.name}
            </Chip>,
          ]
        : [],
    )}
  </div>
)

const Destinations: GroupRenderer = ({ entities, section, ctx }) => (
  <HScroll label={`${section.displayString}: koleksiyonlar`} scrollKey={`ara:${section.id}:hedef`}>
    {entities.flatMap((e) => {
      const tctx = encodeURIComponent(e.track.tctx)
      if (e.collection)
        return [
          <LandscapeCard
            key={e.unifiedEntityId}
            title={e.collection.name}
            imageUrl={e.collection.artwork?.url}
            meta="Koleksiyon"
            to={`/koleksiyon/${e.collection.collectionId}?tctx=${tctx}`}
            onClick={() => ctx.opened(e, 'koleksiyon')}
          />,
        ]
      if (e.genre)
        return [
          <LandscapeCard
            key={e.unifiedEntityId}
            title={e.genre.name}
            meta="Tür"
            to={`/tur/${e.genre.genreId}?tctx=${tctx}`}
            onClick={() => ctx.opened(e, 'tur')}
          />,
        ]
      return []
    })}
  </HScroll>
)

const Boxshots: GroupRenderer = ({ entities, ctx }) => (
  <ul className="sr-grid cn-gutter-x">
    {entities.flatMap((e) => {
      const v = e.video
      if (!v) return []
      const lock = lockText(v.access)
      return [
        <li key={e.unifiedEntityId}>
          <PosterCard
            size="fill"
            showTitle
            title={v.title}
            imageUrl={posterArtwork(e)}
            badge={v.badge?.text ?? null}
            lockedText={lock}
            meta={[v.displayRuntime, v.latestYear].filter(Boolean).join(' · ')}
            to={detailPath(v.videoId, e.track.tctx)}
            onClick={() => ctx.opened(e, 'detay')}
          />
        </li>,
      ]
    })}
  </ul>
)

/** Tablo anahtarlarıyla tiplenmiş çizici haritası: tabloya biçim eklenip burada çizici yoksa derleme kırılır. */
const RENDERERS: Record<TreatmentName, GroupRenderer> = {
  standardBoxshot: Boxshots,
  standardSuggestion: Suggestions,
  standardChannelTile: ChannelTiles,
  standardAiringRow: AiringRows,
  standardPersonChip: PersonChips,
  standardDestination: Destinations,
}

/** Ardışık aynı biçimli varlıkları gruplar; tanımadığımız ya da bildirmediğimiz biçim sessizce atlanır. */
function groupEntities(
  section: SearchSection,
  declaration: SearchPageCapabilities,
): { treatment: TreatmentName; entities: SearchEntity[] }[] {
  const groups: { treatment: TreatmentName; entities: SearchEntity[] }[] = []
  for (const e of section.entities) {
    const t = lookupTreatment(section.__typename, e.treatment, declaration)
    if (!t) continue
    const last = groups[groups.length - 1]
    if (last && last.treatment === t) last.entities.push(e)
    else groups.push({ treatment: t, entities: [e] })
  }
  return groups
}

function SectionView({
  section,
  declaration,
  ctx,
}: {
  section: SearchSection
  declaration: SearchPageCapabilities
  ctx: RenderCtx
}): ReactElement | null {
  const groups = groupEntities(section, declaration)
  if (!groups.length) return null
  const id = `sr-sec-${section.id}`
  return (
    <section className="sr-section" aria-labelledby={id}>
      <div className="cn-rowhead">
        <h2 className="cn-row-title" id={id}>
          {section.displayString}
        </h2>
        {section.__typename === 'SearchGallerySection' && section.totalCount !== undefined && (
          <span className="cn-meta">{section.totalCount} sonuç</span>
        )}
      </div>
      {groups.map((g, i) => {
        const Render = RENDERERS[g.treatment]
        return <Render key={`${g.treatment}-${i}`} entities={g.entities} section={section} ctx={ctx} />
      })}
    </section>
  )
}

/* ───────────── Anahtar (switch) ───────────── */

function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}): ReactElement {
  return (
    <button type="button" role="switch" aria-checked={checked} className="sr-switch" onClick={() => onChange(!checked)}>
      <span className="sr-switch__label">{children}</span>
      <span className={cx('sr-switch__track', checked && 'sr-switch__track--on')} aria-hidden="true">
        <span className="sr-switch__knob" />
      </span>
    </button>
  )
}

/* ───────────── Süzgeç alt sayfası ───────────── */

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}): ReactElement {
  return (
    <fieldset className="sr-fgroup">
      <legend className="sr-fgroup__title">{label}</legend>
      <div className="sr-fgroup__chips">
        {options.map(([v, text]) => (
          <Chip key={v} selected={v === value} onClick={() => onChange(v)}>
            {text}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function FilterSheet({
  open,
  onClose,
  filters,
  setFilters,
  genres,
  total,
}: {
  open: boolean
  onClose: () => void
  filters: Filters
  setFilters: (f: Filters) => void
  genres: { genreId: number; name: string }[]
  total: number | null
}): ReactElement {
  const toggleGenre = (id: number) =>
    setFilters({
      ...filters,
      genreIds: filters.genreIds.includes(id) ? filters.genreIds.filter((g) => g !== id) : [...filters.genreIds, id],
    })
  const isDefault = activeFilterCount(filters) === 0 && filters.sort === 'rel'
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtrele"
      className="sr-sidesheet"
      actions={
        <>
          <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={isDefault}>
            Temizle
          </Button>
          <Button onClick={onClose}>{total !== null ? `${total} sonucu gör` : 'Sonuçları gör'}</Button>
        </>
      }
    >
      <div className="sr-filters">
        {genres.length > 0 && (
          <fieldset className="sr-fgroup">
            <legend className="sr-fgroup__title">Tür</legend>
            <div className="sr-fgroup__chips">
              {genres.map((g) => (
                <Chip
                  key={g.genreId}
                  selected={filters.genreIds.includes(g.genreId)}
                  onClick={() => toggleGenre(g.genreId)}
                >
                  {g.name}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}
        <ChoiceGroup<KindFilter>
          label="İçerik"
          value={filters.kind}
          options={[
            ['all', 'Tümü'],
            ['film', 'Film'],
            ['dizi', 'Dizi'],
          ]}
          onChange={(kind) => setFilters({ ...filters, kind })}
        />
        <ChoiceGroup<YearFilter>
          label="Yıl"
          value={filters.year}
          options={[
            ['all', 'Tümü'],
            ['2020', '2020+'],
            ['2010', "2010'lar"],
            ['old', 'Daha eski'],
          ]}
          onChange={(year) => setFilters({ ...filters, year })}
        />
        <Switch checked={filters.entitledOnly} onChange={(entitledOnly) => setFilters({ ...filters, entitledOnly })}>
          Yalnız paketimde olanlar
        </Switch>
        <ChoiceGroup<SortOrder>
          label="Sırala"
          value={filters.sort}
          options={[
            ['rel', 'Önerilen'],
            ['new', 'En yeni'],
            ['az', 'A–Z'],
          ]}
          onChange={(sort) => setFilters({ ...filters, sort })}
        />
      </div>
    </Sheet>
  )
}

/* ───────────── Yetenek bildirimi (geliştirici denetimi) ───────────── */

function CapabilitySheet({
  open,
  onClose,
  enabled,
  setEnabled,
  declaration,
}: {
  open: boolean
  onClose: () => void
  enabled: ReadonlySet<EntityKindName>
  setEnabled: (s: Set<EntityKindName>) => void
  declaration: SearchPageCapabilities
}): ReactElement {
  const json = JSON.stringify({ pageCapabilities: declaration })
  return (
    <Sheet open={open} onClose={onClose} title="Yetenek bildirimi" className="sr-sidesheet">
      <p className="cn-body sr-cap__intro">
        İstemci çizebildiği varlık türlerini bildirir; sunucu yalnızca bunları döndürür. Böylece yeni bir tür
        eklendiğinde eski istemciler bozulmadan çalışır.
      </p>
      <div className="sr-cap__list">
        {KIND_SWITCHES.map((s) => (
          <Switch
            key={s.kind}
            checked={enabled.has(s.kind)}
            onChange={(on) => {
              const next = new Set(enabled)
              if (on) next.add(s.kind)
              else next.delete(s.kind)
              setEnabled(next)
            }}
          >
            {s.label}
            <span className="cn-meta sr-cap__kind">{s.kind}</span>
          </Switch>
        ))}
      </div>
      <p className="cn-meta sr-cap__sig">
        Bildirim · {json.length} bayt · {declarationSignature(declaration) || 'boş'}
      </p>
    </Sheet>
  )
}

/* ───────────── Şeritler ───────────── */

function Banner({
  data,
  onSearch,
}: {
  data: Parameters<typeof selectBanner>[0]
  onSearch: (q: string, exactTerm?: boolean) => void
}): ReactElement | null {
  const b = selectBanner(data)
  if (!b) return null
  if (b.kind === 'fallback') return <p className="sr-banner cn-gutter-x">“{b.term}” için sonuç yok</p>
  if (b.kind === 'mixed') {
    return (
      <p className="sr-banner cn-gutter-x">
        Bunu mu demek istedin:{' '}
        <button type="button" className="sr-banner__link" onClick={() => onSearch(b.corrected)}>
          {b.corrected}
        </button>
        ?
      </p>
    )
  }
  return (
    <div className="sr-banner cn-gutter-x" role="status">
      <p className="sr-banner__line">“{b.corrected}” için sonuçlar gösteriliyor</p>
      <button type="button" className="sr-banner__alt" onClick={() => onSearch(b.original, true)}>
        Bunun yerine “{b.original}” ara
      </button>
    </div>
  )
}

/* ───────────── Sayfa ───────────── */

export default function SearchPage(): ReactElement {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const term = q.trim()
  // "Bunun yerine … ara": düzeltmesiz arama. Kullanıcı sorguyu değiştirince SearchField adresi `tam` olmadan yazar.
  const exact = params.get('tam') === '1' && !!term
  useDocumentTitle(term ? `“${term}” araması` : 'Ara')

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [enabled, setEnabledState] = useState<Set<EntityKindName>>(() => loadEnabledKinds())
  const [filterOpen, setFilterOpen] = useState(false)
  const [capOpen, setCapOpen] = useState(false)
  const [airing, setAiring] = useState<AiringSheetTarget | null>(null)
  const [locked, setLocked] = useState<{ title: string; reason: string } | null>(null)
  const [recentCleared, setRecentCleared] = useState(false)
  const [genreMemo, setGenreMemo] = useState<{ term: string; genres: Map<number, string> }>({
    term: '',
    genres: new Map(),
  })

  // Terim değişince türe özgü süzgeç sıfırlanır (önceki aramanın türü yeni aramada olmayabilir).
  const normTerm = normalizeTerm(term)
  useEffect(() => {
    setFilters((f) => (f.genreIds.length ? { ...f, genreIds: [] } : f))
  }, [normTerm])

  const setEnabled = (s: Set<EntityKindName>) => {
    setEnabledState(s)
    saveEnabledKinds(s)
  }

  const search = useSearch(term, filters, enabled, exact)
  const { data, loading, error, declaration } = search

  // Tür çipleri: bu terim için görülen galeri türleri birikir (süzgeç uygulanınca liste daralmasın).
  useEffect(() => {
    if (!data) return
    const found = galleryGenres(data)
    setGenreMemo((m) => {
      const base = m.term === normTerm ? m.genres : new Map<number, string>()
      const next = new Map(base)
      for (const g of found) next.set(g.genreId, g.name)
      return next.size === m.genres.size && m.term === normTerm ? m : { term: normTerm, genres: next }
    })
  }, [data, normTerm])
  const genres = useMemo(
    () =>
      [...(genreMemo.term === normTerm ? genreMemo.genres : new Map<number, string>())]
        .map(([genreId, name]) => ({ genreId, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [genreMemo, normTerm],
  )

  const goSearch = (next: string, exactTerm = false) =>
    navigate(`/ara?q=${encodeURIComponent(next)}${exactTerm ? '&tam=1' : ''}`)
  const ctx: RenderCtx = {
    term,
    opened: (e, action) => {
      logEvent(
        'click',
        { surface: 'arama', treatment: e.treatment, kind: e.kind, action, entityId: e.unifiedEntityId, fuzzy: e.fuzzy },
        e.track.tctx,
      )
      recordSearch(term)
    },
    openAiring: setAiring,
    openLock: (title, reason) => setLocked({ title, reason }),
  }

  const count = activeFilterCount(filters)
  const gallery = data?.sections.find((s) => s.__typename === 'SearchGallerySection')
  const recent = !term && !recentCleared ? (data?.recentSearches ?? []) : []
  useEffect(() => {
    if (term) setRecentCleared(false)
  }, [term])

  return (
    <Page className="sr-page">
      <h1 className="cn-sr-only">Ara</h1>
      <div className="sr-mobilebar">
        <SearchField className="sr-field" autoFocus={!q} />
      </div>

      <div className="sr-toolbar cn-gutter-x">
        <button
          type="button"
          className={cx('sr-filterbtn', count > 0 && 'sr-filterbtn--on')}
          onClick={() => setFilterOpen(true)}
          aria-haspopup="dialog"
        >
          <Icon name="settings" size={18} />
          Filtrele
          {count > 0 && (
            <span className="sr-filterbtn__count" aria-label={`${count} filtre etkin`}>
              {count}
            </span>
          )}
        </button>
        <TextButton onClick={() => setCapOpen(true)}>Yetenek bildirimi</TextButton>
        {loading && data && (
          <span className="cn-meta sr-toolbar__busy" role="status">
            Aranıyor
          </span>
        )}
      </div>

      {error && (
        <ErrorState
          size={data ? 'inline' : 'page'}
          title="Arama yapılamadı"
          message="Bağlantını kontrol et ve tekrar dene."
          onRetry={search.retry}
          className="cn-gutter-x"
        />
      )}

      {!data && !error && <SkeletonRow variant="poster" count={6} />}

      {data && (
        <div className={cx('sr-results', loading && 'sr-results--stale')}>
          <Banner data={data} onSearch={goSearch} />

          {recent.length > 0 && (
            <section className="sr-section" aria-labelledby="sr-recent">
              <div className="cn-rowhead">
                <h2 className="cn-row-title" id="sr-recent">
                  Son aramalar
                </h2>
                <TextButton
                  onClick={() => {
                    setRecentCleared(true)
                    void clearRecentSearches().then((ok) => {
                      if (ok) search.reload()
                      else setRecentCleared(false)
                    })
                  }}
                >
                  Temizle
                </TextButton>
              </div>
              <div className="sr-chips cn-gutter-x">
                {recent.map((r) => (
                  <Chip key={r} onClick={() => goSearch(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {data.sections.map((s) => (
            <SectionView key={s.id} section={s} declaration={declaration} ctx={ctx} />
          ))}

          {count > 0 && !gallery && (
            <div className="sr-banner cn-gutter-x">
              <p className="sr-banner__line">Bu filtrelerle film ya da dizi yok</p>
              <button type="button" className="sr-banner__alt" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Filtreleri temizle
              </button>
            </div>
          )}
          {data.sections.length === 0 && (
            <p className="sr-banner cn-gutter-x">Bu bildirimle gösterilecek sonuç yok. Yetenek bildirimini aç.</p>
          )}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        genres={genres}
        total={gallery?.totalCount ?? null}
      />
      <CapabilitySheet
        open={capOpen}
        onClose={() => setCapOpen(false)}
        enabled={enabled}
        setEnabled={setEnabled}
        declaration={declaration}
      />
      <AiringSheet target={airing} onClose={() => setAiring(null)} />
      <AccessSheet title={locked?.title ?? null} reason={locked?.reason ?? ''} onClose={() => setLocked(null)} />
    </Page>
  )
}
