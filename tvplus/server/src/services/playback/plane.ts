/**
 * Oynatma düzleminin paylaşılan iç durumu (uygulama örneği başına bir tane):
 * nesne kayıt defteri, URL imzalayıcı, OCA düğümleri, blok önbelleği, altyazı servisi, kaynaklar, FTL sıralamaları.
 * playback / oca / ftl / subtitles eklentileri aynı örneği `planeOf(app)` ile paylaşır.
 * (Bu yapı oynatma düzleminin içidir; başka servisler kernel/services.ts arayüzlerini kullanır.)
 */
import { join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../kernel/config'
import type { Passport } from '../../kernel/context'
import { createBlockCache, type BlockCache } from '../oca/blockCache'
import { createNodeRegistry, type NodeRegistry } from '../oca/nodes'
import { createObjectRegistry, type ObjectRegistry } from '../oca/objects'
import { createSigner, type UrlSigner } from '../oca/signing'
import { createSubtitleService, type SubtitleService } from '../subtitles/service'
import { createMsl, type Msl } from './msl'
import { createSourceRegistry, type SourceRegistry } from './sources/registry'

export interface FtlRankings {
  set(key: string, ranking: string[]): void
  get(key: string): string[] | null
}

export interface PlaybackCounters {
  manifestsIssued: number
  prefetchIssued: number
  /** non-prefetch manifest zamanları (ms), son 2 dk için */
  recent: number[]
}

export interface Plane {
  config: AppConfig
  objects: ObjectRegistry
  signer: UrlSigner
  nodes: NodeRegistry
  cache: BlockCache
  subtitles: SubtitleService
  sources: SourceRegistry
  msl: Msl
  ftl: FtlRankings
  counters: PlaybackCounters
  /** Kimlik çözümü (çekirdek API'nin req.passport'u). Testler bu dikişi değiştirebilir. */
  passportOf(req: FastifyRequest): Passport | null
}

const planes = new WeakMap<FastifyInstance, Plane>()

function createRankings(): FtlRankings {
  const map = new Map<string, string[]>()
  return {
    set(key, ranking) {
      map.delete(key)
      map.set(key, ranking)
      if (map.size > 10_000) map.delete(map.keys().next().value!)
    },
    get: (key) => map.get(key) ?? null,
  }
}

export function planeOf(app: FastifyInstance): Plane {
  let p = planes.get(app)
  if (p) return p
  const config = app.config
  p = {
    config,
    objects: createObjectRegistry(config),
    signer: createSigner(config),
    nodes: createNodeRegistry(),
    cache: createBlockCache({ dir: join(config.dataDir, 'oca-cache') }),
    subtitles: createSubtitleService(config),
    sources: createSourceRegistry(config),
    msl: createMsl(config),
    ftl: createRankings(),
    counters: { manifestsIssued: 0, prefetchIssued: 0, recent: [] },
    passportOf: (req) => (req.passport as Passport | null | undefined) ?? null,
  }
  planes.set(app, p)
  return p
}

/** Test/araç kurulumları için: belirli bir düzlemi (ör. küçük önbellek sınırıyla) yerleştirir. */
export function replaceCache(app: FastifyInstance, cache: BlockCache): void {
  planeOf(app).cache = cache
}
