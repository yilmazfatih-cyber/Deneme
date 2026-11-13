/**
 * Oynatma düzlemi testleri için küçük sahte servisler (katalog, yetki, EPG, ilerleme) ve pasaport.
 * Servisler istek anında `app.services` üzerinden arandığı için createTestApp() sonrasında atanabilir.
 */
import type { FastifyInstance } from 'fastify'
import type { ContentChannel } from '../../shared/content-schema'
import type { Passport } from '../src/kernel/context'
import type {
  AccessDecision,
  AiringRecord,
  BookmarkRecord,
  CatalogService,
  EntitlementService,
  EpgService,
  PlayableVideo,
  ProgressService,
} from '../src/kernel/services'
import { planeOf } from '../src/services/playback/plane'

export function fakePassport(overrides: Partial<Passport> = {}): Passport {
  return {
    membershipStatus: 'CURRENT_MEMBER',
    account: { accountId: 'acc-1', planName: 'Standart', products: ['temel'] },
    profile: { guid: 'PROFIL1', accountId: 'acc-1', name: 'Ayşe', avatar: 'avatar-1.png', isKids: false, maturityLevel: 100, language: 'tr' },
    esn: 'TVPWCH-MC-TEST-0001',
    deviceId: 'cihaz-1',
    authURLVerified: true,
    ...overrides,
  }
}

export const PLAYABLE_ACCESS: AccessDecision = { state: 'PLAYABLE', reasonText: null, requiredProduct: null, requiredProductName: null, cta: null }

export function playable(p: Partial<PlayableVideo> & Pick<PlayableVideo, 'videoId' | 'sources'>): PlayableVideo {
  return {
    kind: 'MOVIE',
    displayTitle: `Video ${p.videoId}`,
    titleId: p.videoId,
    runtimeSec: 6,
    promo: null,
    license: { name: 'CC BY 3.0', attribution: '© Blender Foundation', url: 'https://www.blender.org' },
    maturityLevel: 7,
    kids: false,
    requiredProduct: null,
    ...p,
  }
}

export interface Fakes {
  playables: Map<number, PlayableVideo>
  channels: Map<number, ContentChannel>
  airings: Map<string, AiringRecord>
  access: Map<number, AccessDecision>
  linear: Map<number, { airing: AiringRecord; videoId: number; offsetSec: number }>
  bookmarks: Map<string, BookmarkRecord>
  subtitlesDir: string
}

export function installFakes(app: FastifyInstance, subtitlesDir = '/nonexistent'): Fakes {
  const f: Fakes = {
    playables: new Map(),
    channels: new Map(),
    airings: new Map(),
    access: new Map(),
    linear: new Map(),
    bookmarks: new Map(),
    subtitlesDir,
  }
  const catalog: Partial<CatalogService> = {
    getPlayable: (id) => f.playables.get(id) ?? null,
    getChannel: (id) => f.channels.get(id) ?? null,
    subtitlesDir: () => f.subtitlesDir,
    allTitles: () => [],
    listPlayables: () => [],
  }
  const entitlement: EntitlementService = {
    accessForVideo: (_p, id) => f.access.get(id) ?? PLAYABLE_ACCESS,
    accessForChannel: (_p, id) => f.access.get(-id) ?? PLAYABLE_ACCESS,
  }
  const epg: Partial<EpgService> = {
    getAiring: (id) => f.airings.get(id) ?? null,
    currentAiring: () => null,
    linearPosition: (ch) => f.linear.get(ch) ?? null,
  }
  const progress: Partial<ProgressService> = {
    getBookmark: (guid, id) => f.bookmarks.get(`${guid}:${id}`) ?? null,
  }
  app.services.catalog = catalog as CatalogService
  app.services.entitlement = entitlement
  app.services.epg = epg as EpgService
  app.services.progress = progress as ProgressService
  return f
}

/** İstekleri belirli bir pasaportla yapar (kimlik eklentisi yerine düzlemin dikişi). */
export function usePassport(app: FastifyInstance, passport: Passport | null): void {
  planeOf(app).passportOf = () => passport
}
