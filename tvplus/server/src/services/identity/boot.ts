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

/** İlk boyama için önceden değerlendirilen yollar. */
export const BOOT_FALCOR_PATHS: FalcorPath[] = [
  ['lolomo', 'summary'],
  ['lolomo', { from: 0, to: 5 }, 'summary'],
  [
    'lolomo',
    { from: 0, to: 5 },
    { from: 0, to: 9 },
    [
      'summary',
      'title',
      'shortSynopsis',
      'boxart',
      'storyArt',
      'badge',
      'displayRuntime',
      'maturity',
      'access',
      'watchStatus',
      'bookmark',
      'top10Rank',
      'sourceKinds',
    ],
  ],
]

/** Açılış önbelleğinin yetenek bayrakları (istemcinin pathEvaluator'a yolladıklarıyla aynı). */
const BOOT_FLAGS: Record<string, string> = {
  webp: 'true',
  isTop10Supported: 'true',
  hasVideoMerchInBob: 'true',
  falcor_server: '0.1.0',
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
    const res = await evaluatePaths(
      { req, passport: req.passport, services: app.services, config: app.config, flags: { ...BOOT_FLAGS } },
      BOOT_FALCOR_PATHS,
    )
    return Object.keys(res.jsonGraph).length > 0 ? res.jsonGraph : null
  } catch (err) {
    req.log.warn({ err }, 'açılış Falcor önbelleği üretilemedi')
    return null
  }
}

export async function buildBootContext(app: FastifyInstance, req: FastifyRequest): Promise<BootContext> {
  const passport = req.passport
  const account = passport.account
  const session = sessionOf(req)
  const profiles = account ? app.services.identity.listProfiles(account.accountId).map((p) => profileSummary(app, p)) : []
  return {
    buildId: app.config.buildId,
    region: app.config.region,
    serverTime: new Date().toISOString(),
    membershipStatus: passport.membershipStatus,
    account: account ? { accountId: account.accountId, planName: account.planName, products: [...account.products] } : null,
    profiles,
    activeProfile: passport.profile ? profileSummary(app, passport.profile) : null,
    esn: passport.esn,
    authURL: account && session ? issueAuthURL(deriveKey(app.config, 'authurl'), session.sid) : null,
    persistedQueryVersion: PERSISTED_QUERY_VERSION,
    featureFlags: { ...FEATURE_FLAGS },
    falcorCache: await bootFalcorCache(app, req),
  }
}
