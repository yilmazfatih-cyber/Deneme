/**
 * Falcor (eski sistem) JSON Graph yolları — Film & Dizi ana sayfası (lolomo). Bkz. docs/MIMARI.md §6 ve §9.4.
 *   lolomo → ref lolomos[guid] → ref lists[listId] → ref videos[id]
 *   lolomoByCategory[home|shows|movies|newPopular] → ref lolomos["<guid>:<kategori>"] (home → lolomos[guid], aynı nesne)
 * Motor ref'leri izler; bu dosya yalnızca yaprakları ve ref'leri üretir.
 */
import type { FalcorKey } from '../../../../shared/types'
import { videoEntityId, formatTctx } from '../../../../shared/tctx'
import {
  atom,
  falcorError,
  ref,
  type FalcorMatch,
  type FalcorRoute,
  type FalcorRouteContext,
  type PathValue,
} from '../../kernel/context'
import { buildArtwork, type ArtworkTypeName } from '../../kernel/imageUrls'
import {
  badgeOf,
  bookmarkOf,
  contentAdvisoryOf,
  displayRuntimeOf,
  promoVideoOf,
  runtimeOf,
  sourceKindsOfVideo,
  textEvidenceOf,
} from '../../services/catalog/present'
import {
  buildLolomo,
  categoryOfListId,
  isLolomoCategory,
  lolomoKeyOf,
  profileHash,
  type Lolomo,
  type LolomoCategory,
} from '../../services/discovery/lolomo'
import { memo, requestCache } from '../../services/discovery/memo'
import { top10ForType, top10RankByType, type TitleType } from '../../services/discovery/top10'

/** Kişisel ve sık değişen atomların ömrü (Falcor göreli $expires) */
export const MEMBER_ATOM_EXPIRES_MS = 30_000

const nowOf = (ctx: FalcorRouteContext) =>
  memo(requestCache(ctx.req), 'now', () => ctx.services.epg?.now() ?? new Date())
const top10Supported = (ctx: FalcorRouteContext) => ctx.flags.isTop10Supported !== 'false'

function lolomoOf(ctx: FalcorRouteContext, category: LolomoCategory = 'home'): Lolomo | null {
  const profile = ctx.passport.profile
  if (!profile) return null
  return memo(requestCache(ctx.req), `lolomo:${profile.guid}:${category}:${top10Supported(ctx)}`, () =>
    buildLolomo(ctx.services, profile, { top10Supported: top10Supported(ctx), now: nowOf(ctx), category }),
  )
}

const noProfile = () => falcorError('Önce bir profil seç', 'PROFILE_REQUIRED')
const ints = (keys: FalcorKey[] | undefined) =>
  (keys ?? []).map((k) => ({ key: k, n: Number(k) })).filter((x) => Number.isInteger(x.n) && x.n >= 0)

/** Görsel atomu boyutları (MIMARI §6) */
const ARTWORK_KEYS: Record<string, { type: ArtworkTypeName; width: number }> = {
  boxart: { type: 'BOXART', width: 368 },
  storyArt: { type: 'STORY_ART', width: 600 },
  billboardArt: { type: 'BILLBOARD', width: 1280 },
  titleLogo: { type: 'TITLE_LOGO', width: 400 },
}

type VideoField = (ctx: FalcorRouteContext, videoId: number) => PathValue['value']

const guid = (ctx: FalcorRouteContext) => ctx.passport.profile?.guid ?? null
const access = (ctx: FalcorRouteContext, videoId: number) =>
  memo(requestCache(ctx.req), `access:v:${videoId}`, () =>
    ctx.services.entitlement.accessForVideo(ctx.passport, videoId),
  )

const typeOf = (kind: string) =>
  kind === 'MOVIE' ? 'movie' : kind === 'SHOW' ? 'show' : kind === 'EPISODE' ? 'episode' : 'supplemental'

export const VIDEO_FIELDS: Record<string, VideoField> = {
  summary(ctx, id) {
    const vi = ctx.services.catalog.videoInfo(id)!
    return atom({
      id,
      type: typeOf(vi.kind),
      isPlayable: access(ctx, id).state === 'PLAYABLE',
      isKids: vi.title.kids,
      unifiedEntityId: videoEntityId(id),
    })
  },
  title(ctx, id) {
    const vi = ctx.services.catalog.videoInfo(id)!
    return atom(vi.episode?.data.title ?? vi.supplemental?.title ?? vi.title.title)
  },
  shortSynopsis: (ctx, id) => {
    const vi = ctx.services.catalog.videoInfo(id)!
    return atom(
      vi.kind === 'MOVIE' || vi.kind === 'SHOW'
        ? vi.title.shortSynopsis
        : (vi.episode?.data.synopsis ?? vi.supplemental?.synopsis ?? ''),
    )
  },
  synopsis: (ctx, id) => {
    const vi = ctx.services.catalog.videoInfo(id)!
    return atom(vi.episode?.data.synopsis ?? vi.supplemental?.synopsis ?? vi.title.synopsis)
  },
  releaseYear: (ctx, id) => atom(ctx.services.catalog.videoInfo(id)!.title.year),
  displayRuntime: (ctx, id) => atom(displayRuntimeOf(ctx.services, id)),
  runtime: (ctx, id) => atom(runtimeOf(ctx.services, id)),
  seasonCount: (ctx, id) => {
    const vi = ctx.services.catalog.videoInfo(id)!
    return vi.kind === 'SHOW' ? atom(vi.title.seasons.length) : undefined
  },
  badge: (ctx, id) => {
    const b = badgeOf(ctx.services, ctx.passport, id, access(ctx, id), nowOf(ctx))
    return b ? atom(b) : atom(undefined)
  },
  maturity: (ctx, id) => {
    const a = contentAdvisoryOf(ctx.services.catalog.videoInfo(id)!.title)
    return atom({ certificationValue: a.certificationValue, maturityLevel: a.maturityLevel, reasons: a.reasons })
  },
  access: (ctx, id) => {
    const a = access(ctx, id)
    return atom({
      state: a.state,
      reasonText: a.reasonText,
      requiredProduct: a.requiredProduct,
      requiredProductName: a.requiredProductName,
      cta: a.cta,
    })
  },
  bookmark: (ctx, id) => {
    const b = bookmarkOf(ctx.services, guid(ctx), id)
    return atom(
      b ? { positionSec: b.positionSec, runtimeSec: b.runtimeSec, progress: b.progress } : undefined,
      MEMBER_ATOM_EXPIRES_MS,
    )
  },
  watchStatus: (ctx, id) => {
    const g = guid(ctx)
    return atom(g ? ctx.services.progress.watchStatus(g, id) : 'NEVER_WATCHED', MEMBER_ATOM_EXPIRES_MS)
  },
  queue: (ctx, id) => {
    const g = guid(ctx)
    return atom(g ? ctx.services.progress.isInMyList(g, id) : false)
  },
  userRating: (ctx, id) => {
    const g = guid(ctx)
    return atom(g ? ctx.services.progress.thumbRating(g, id) : 'THUMBS_UNRATED')
  },
  /** Başlığın kendi türünün (dizi / film) Top 10 listesindeki sırası */
  top10Rank: (ctx, id) => {
    const kind = ctx.services.catalog.videoInfo(id)!.kind
    if (kind !== 'MOVIE' && kind !== 'SHOW') return atom(null)
    const listOf = (type: TitleType) =>
      memo(requestCache(ctx.req), `top10:${type}`, () =>
        top10ForType(ctx.services, ctx.passport.profile, nowOf(ctx), type),
      )
    return atom(top10RankByType(ctx.services, id, ctx.passport.profile, nowOf(ctx), listOf))
  },
  /** Önizleme kartındaki üç kısa etiket (GraphQL textEvidence BOB ile aynı) */
  tags: (ctx, id) => atom(textEvidenceOf(ctx.services.catalog.videoInfo(id)!.title, 'BOB').map((t) => t.text)),
  sourceKinds: (ctx, id) => atom(sourceKindsOfVideo(ctx.services, id)),
  promoVideo: (ctx, id) => {
    const p = promoVideoOf(ctx.services, id, access(ctx, id))
    return p ? atom(p) : atom(undefined)
  },
  current: (ctx, id) => {
    if (ctx.services.catalog.videoInfo(id)!.kind !== 'SHOW') return undefined
    const g = guid(ctx)
    const cur = (g ? ctx.services.progress.currentEpisode(g, id) : null) ?? ctx.services.catalog.episodeIds(id)[0]
    return cur !== undefined ? ref(['videos', cur]) : undefined
  },
}
for (const [key, spec] of Object.entries(ARTWORK_KEYS)) {
  VIDEO_FIELDS[key] = (ctx, id) => {
    const a = buildArtwork(ctx.config, spec.type, videoEntityId(id), {
      width: spec.width,
      format: ctx.flags.webp === 'false' ? 'jpg' : 'webp',
    })
    return atom({ url: a.url, width: a.width, height: a.height, key: a.key })
  }
}

/** usp.features[bayrak] */
function featureFlag(ctx: FalcorRouteContext, flag: string): boolean {
  switch (flag) {
    case 'liveTv':
    case 'search':
    case 'catchup':
    case 'notifications':
      return true
    case 'kidsMode':
      return ctx.passport.profile?.isKids ?? false
    case 'top10':
      return top10Supported(ctx)
    default:
      return false
  }
}

const lolomoRoute: FalcorRoute = {
  route: ['lolomo'],
  get(ctx) {
    const profile = ctx.passport.profile
    return [{ path: ['lolomo'], value: profile ? ref(['lolomos', profile.guid]) : noProfile() }]
  },
}

/** lolomoByCategory[kategori] → ref lolomos[...] (home → eski `lolomo` ile aynı nesne) */
const lolomoByCategoryRoute: FalcorRoute = {
  route: ['lolomoByCategory', 'KEYS'],
  get(ctx, match) {
    const profile = ctx.passport.profile
    return (match[1] ?? []).map((cat) => ({
      path: ['lolomoByCategory', cat],
      value: !profile
        ? noProfile()
        : isLolomoCategory(String(cat))
          ? ref(['lolomos', lolomoKeyOf(profile.guid, String(cat) as LolomoCategory)])
          : undefined,
    }))
  },
}

/** lolomos[guid] ya da lolomos["guid:kategori"]: yalnız etkin profilin kendi lolomoları */
function lolomoFor(ctx: FalcorRouteContext, key: FalcorKey): Lolomo | PathValue['value'] {
  const profile = ctx.passport.profile
  if (!profile) return noProfile()
  const [guidPart, cat = 'home', ...rest] = String(key).split(':')
  if (guidPart !== profile.guid) return falcorError('Bu lolomo etkin profile ait değil', 'FORBIDDEN')
  if (rest.length || !isLolomoCategory(cat)) return undefined
  return lolomoOf(ctx, cat)
}
const isLolomo = (x: unknown): x is Lolomo => typeof x === 'object' && x !== null && 'lists' in x && 'profileGuid' in x

const lolomoSummaryRoute: FalcorRoute = {
  route: ['lolomos', 'KEYS', 'summary'],
  get(ctx, match: FalcorMatch) {
    return (match[1] ?? []).map((key) => {
      const l = lolomoFor(ctx, key)
      return {
        path: ['lolomos', key, 'summary'],
        value: isLolomo(l) ? atom({ length: l.lists.length, trackId: l.trackId, expires: l.expires }) : l,
      }
    })
  },
}

const lolomoIndexRoute: FalcorRoute = {
  route: ['lolomos', 'KEYS', 'INTEGERS'],
  get(ctx, match) {
    const out: PathValue[] = []
    for (const key of match[1] ?? []) {
      const l = lolomoFor(ctx, key)
      for (const { key: k, n } of ints(match[2])) {
        const list = isLolomo(l) ? l.lists[n] : undefined
        out.push({
          path: ['lolomos', key, k],
          value: isLolomo(l) ? (list ? ref(['lists', list.listId]) : undefined) : l,
        })
      }
    }
    return out
  },
}

/** lists[listId]: etkin profilin (kimlikteki kategoriye ait) lolomosunda aranır (listId profil özetiyle başlar) */
function listFor(ctx: FalcorRouteContext, listId: FalcorKey) {
  const profile = ctx.passport.profile
  if (!profile) return { error: noProfile() }
  const id = String(listId)
  if (!id.startsWith(`${profileHash(profile.guid)}_`))
    return { error: falcorError('Bu liste etkin profile ait değil', 'FORBIDDEN') }
  const l = lolomoOf(ctx, categoryOfListId(id))
  if (!l) return { error: noProfile() }
  const row = l.lists.findIndex((x) => x.listId === id)
  return { list: row >= 0 ? l.lists[row]! : null, row }
}

const listSummaryRoute: FalcorRoute = {
  route: ['lists', 'KEYS', 'summary'],
  get(ctx, match) {
    return (match[1] ?? []).map((listId) => {
      const r = listFor(ctx, listId)
      if ('error' in r) return { path: ['lists', listId, 'summary'], value: r.error }
      const L = r.list
      return {
        path: ['lists', listId, 'summary'],
        value: L
          ? atom({
              id: L.listId,
              context: L.context,
              displayName: L.displayName,
              length: L.videoIds.length,
              trackId: L.trackId,
              ...(L.genreId !== undefined ? { genreId: L.genreId } : {}),
              ...(L.collectionId !== undefined ? { collectionId: L.collectionId } : {}),
            })
          : undefined,
      }
    })
  },
}

const listItemsRoute: FalcorRoute = {
  route: ['lists', 'KEYS', 'INTEGERS'],
  get(ctx, match) {
    const out: PathValue[] = []
    for (const listId of match[1] ?? []) {
      const r = listFor(ctx, listId)
      for (const { key, n } of ints(match[2])) {
        const id = 'error' in r ? null : r.list?.videoIds[n]
        out.push({
          path: ['lists', listId, key],
          value: 'error' in r ? r.error : id !== undefined && id !== null ? ref(['videos', id]) : undefined,
        })
      }
    }
    return out
  },
}

const listTctxRoute: FalcorRoute = {
  route: ['lists', 'KEYS', 'itemTctx', 'INTEGERS'],
  get(ctx, match) {
    const out: PathValue[] = []
    for (const listId of match[1] ?? []) {
      const r = listFor(ctx, listId)
      for (const { key, n } of ints(match[3])) {
        let value: PathValue['value']
        if ('error' in r) value = r.error
        else if (r.list && r.list.videoIds[n] !== undefined) {
          const L = r.list
          value = atom(
            formatTctx({
              row: r.row,
              rank: n,
              rowId: L.listId,
              trackId: L.trackId,
              entityId: videoEntityId(L.videoIds[n]!),
            }),
          )
        }
        out.push({ path: ['lists', listId, 'itemTctx', key], value })
      }
    }
    return out
  },
}

const videosRoute: FalcorRoute = {
  route: ['videos', 'INTEGERS', 'KEYS'],
  get(ctx, match) {
    const out: PathValue[] = []
    for (const { key: vk, n: id } of ints(match[1])) {
      const known = !!ctx.services.catalog.videoInfo(id) && ctx.services.catalog.isVisibleTo(ctx.passport.profile, id)
      for (const field of match[2] ?? []) {
        const fn = VIDEO_FIELDS[String(field)]
        out.push({ path: ['videos', vk, field], value: known && fn ? fn(ctx, id) : undefined })
      }
    }
    return out
  },
}

const uspRoute: FalcorRoute = {
  route: ['usp', 'features', 'KEYS'],
  get(ctx, match) {
    return (match[2] ?? []).map((flag) => ({
      path: ['usp', 'features', flag],
      value: atom(featureFlag(ctx, String(flag))),
    }))
  },
}

export const routes: FalcorRoute[] = [
  lolomoRoute,
  lolomoByCategoryRoute,
  lolomoSummaryRoute,
  lolomoIndexRoute,
  listSummaryRoute,
  listItemsRoute,
  listTctxRoute,
  videosRoute,
  uspRoute,
]
