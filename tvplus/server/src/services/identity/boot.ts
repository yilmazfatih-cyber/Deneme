/**
 * Açılış bağlamı (Netflix `reactContext`): sunucunun ilk HTML'e gömdüğü ve GET /api/boot ile de dönen gövde.
 * Profil etkinse ilk satırların Falcor grafiği süreç içinde değerlendirilip gömülür (ilk boyama ağ beklemez).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { PERSISTED_QUERY_VERSION } from '../../../../shared/constants'
import type { BootContext, FalcorPath, JsonGraph, ProfileSummary } from '../../../../shared/types'
import { evaluatePaths, hasRoutes } from '../../falcor/engine'
import type { ProfileRecord } from '../../kernel/context'
import { buildArtwork } from '../../kernel/imageUrls'
import { deriveKey } from '../../kernel/config'
import { sessionOf } from './passport'
import { issueAuthURL } from './session'

export const FEATURE_FLAGS: Record<string, boolean> = { liveTv: true, kidsMode: true, top10: true, devtools: true }

/** Açılışta tohumlanan satır ve satır başına öğe sayısı (istemcinin ilk iki satır grubu × ilk sayfa). */
export const BOOT_ROWS = 6
export const BOOT_ITEMS = 10

/**
 * Satır bağlamına göre yapraklar — web/src/features/home/lolomo.ts ile aynı kümeler (POSTER_LEAVES, LANDSCAPE_LEAVES,
 * HERO_LEAVES, CURRENT_LEAVES). İstemci ilk boyamada bunları `lists[listId]` üzerinden sorar; burada eksik kalan her yaprak
 * açılışta bir pathEvaluator isteği demektir. Vitrine ayrıntı modalının ilk görünümü için birkaç yaprak eklenir.
 */
const POSTER_LEAVES = ['summary', 'title', 'boxart', 'badge', 'access', 'top10Rank']
const LANDSCAPE_LEAVES = ['summary', 'title', 'storyArt', 'access', 'displayRuntime', 'bookmark', 'watchStatus']
const HERO_LEAVES = [
  'summary',
  'title',
  'shortSynopsis',
  'billboardArt',
  'titleLogo',
  'storyArt',
  'maturity',
  'access',
  'displayRuntime',
  'watchStatus',
  'bookmark',
  'promoVideo',
  'synopsis',
  'releaseYear',
  'runtime',
]
const CURRENT_LEAVES = ['summary', 'displayRuntime', 'bookmark']
const HERO_CURRENT_LEAVES = [...CURRENT_LEAVES, 'title', 'watchStatus']

/** 1. aşama: lolomo ve ilk satırların özetleri (bağlam + uzunluk). */
export const BOOT_SUMMARY_PATHS: FalcorPath[] = [
  ['lolomo', 'summary'],
  ['lolomo', { from: 0, to: BOOT_ROWS - 1 }, 'summary'],
]

interface RowSummary {
  id: string
  context: string
  length: number
}

/** 2. aşama: her satırın bağlamına özel öğe yolları (istemcinin planRowItems karşılığı). */
export function bootRowPaths(row: RowSummary): FalcorPath[] {
  const kind =
    row.context === 'billboard'
      ? 'hero'
      : row.context === 'continueWatching'
        ? 'landscape'
        : row.context === 'bridge'
          ? null
          : 'poster'
  if (!kind) return []
  const count = Math.min(kind === 'hero' ? 1 : BOOT_ITEMS, row.length)
  if (count <= 0) return []
  const range = count === 1 ? 0 : { from: 0, to: count - 1 }
  const leaves = kind === 'hero' ? HERO_LEAVES : kind === 'landscape' ? LANDSCAPE_LEAVES : POSTER_LEAVES
  const paths: FalcorPath[] = [
    ['lists', row.id, range, leaves],
    ['lists', row.id, 'itemTctx', range],
  ]
  if (kind === 'hero') paths.push(['lists', row.id, range, 'current', HERO_CURRENT_LEAVES])
  if (kind === 'landscape') paths.push(['lists', row.id, range, 'current', CURRENT_LEAVES])
  return paths
}

/**
 * Açılış önbelleğinin yetenek bayrakları — istemcininkilerle aynı (materialize: olmayan yaprak boş atom olur,
 * istemci onu "eksik" saymaz; withSize gönderilmez: gövde küçük kalsın).
 */
const BOOT_FLAGS: Record<string, string> = {
  webp: 'true',
  isTop10Supported: 'true',
  hasVideoMerchInBob: 'true',
  falcor_server: '0.1.0',
  materialize: 'true',
}

type Node = Record<string, unknown>
const child = (n: unknown, k: string | number): unknown =>
  n && typeof n === 'object' ? (n as Node)[String(k)] : undefined
const refTarget = (n: unknown): (string | number)[] | null =>
  n && typeof n === 'object' && (n as Node).$type === 'ref' && Array.isArray((n as Node).value)
    ? ((n as Node).value as (string | number)[])
    : null

/** Grafikte yolu ref'leri izleyerek okur. */
function resolveIn(graph: JsonGraph, path: (string | number)[], depth = 0): unknown {
  let node: unknown = graph
  for (let i = 0; i < path.length; i++) {
    const t = refTarget(node)
    if (t) return depth > 8 ? undefined : resolveIn(graph, [...t, ...path.slice(i)], depth + 1)
    node = child(node, path[i]!)
  }
  const t = refTarget(node)
  return t && depth <= 8 ? resolveIn(graph, t, depth + 1) : node
}

/** 1. aşama grafiğinden satır özetleri; satırın liste kimliği ref hedefinden alınır. */
function rowSummaries(graph: JsonGraph): RowSummary[] {
  const rows: RowSummary[] = []
  for (let i = 0; i < BOOT_ROWS; i++) {
    const summary = child(resolveIn(graph, ['lolomo', i, 'summary']), 'value') as Partial<RowSummary> | undefined
    if (!summary || typeof summary.id !== 'string' || typeof summary.context !== 'string') continue
    rows.push({ id: summary.id, context: summary.context, length: Number(summary.length) || 0 })
  }
  return rows
}

export function profileSummary(app: FastifyInstance, p: ProfileRecord): ProfileSummary {
  return {
    guid: p.guid,
    name: p.name,
    avatarUrl: buildArtwork(app.config, 'AVATAR', `Profile:${p.guid}`, { width: 160 }).url,
    isKids: p.isKids,
    maturityLevel: p.maturityLevel,
  }
}

async function bootFalcorCache(app: FastifyInstance, req: FastifyRequest): Promise<JsonGraph | null> {
  if (!req.passport.profile || !hasRoutes()) return null
  try {
    const ctx = { req, passport: req.passport, services: app.services, config: app.config, flags: { ...BOOT_FLAGS } }
    // İki aşama: satır bağlamları bilinmeden hangi yaprakların gerektiği bilinmez (vitrin ≠ afiş ≠ devam et).
    const first = await evaluatePaths(ctx, BOOT_SUMMARY_PATHS)
    const rows = rowSummaries(first.jsonGraph)
    const graph = rows.length
      ? (await evaluatePaths(ctx, [...BOOT_SUMMARY_PATHS, ...rows.flatMap(bootRowPaths)])).jsonGraph
      : first.jsonGraph
    return Object.keys(graph).length > 0 ? graph : null
  } catch (err) {
    req.log.warn({ err }, 'açılış Falcor önbelleği üretilemedi')
    return null
  }
}

export async function buildBootContext(app: FastifyInstance, req: FastifyRequest): Promise<BootContext> {
  const passport = req.passport
  const account = passport.account
  const session = sessionOf(req)
  const profiles = account
    ? app.services.identity.listProfiles(account.accountId).map((p) => profileSummary(app, p))
    : []
  return {
    buildId: app.config.buildId,
    region: app.config.region,
    serverTime: new Date().toISOString(),
    membershipStatus: passport.membershipStatus,
    account: account
      ? { accountId: account.accountId, planName: account.planName, products: [...account.products] }
      : null,
    profiles,
    activeProfile: passport.profile ? profileSummary(app, passport.profile) : null,
    esn: passport.esn,
    authURL: account && session ? issueAuthURL(deriveKey(app.config, 'authurl'), session.sid) : null,
    persistedQueryVersion: PERSISTED_QUERY_VERSION,
    featureFlags: { ...FEATURE_FLAGS },
    falcorCache: await bootFalcorCache(app, req),
  }
}
