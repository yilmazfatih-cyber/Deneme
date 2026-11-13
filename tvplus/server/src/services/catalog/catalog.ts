/**
 * Katalog servisi (Netflix "Video" grafiğinin kaynağı). İçerik paketinden dizinler kurar:
 * başlıklar, bölümler, ek videolar (videoId tüm bunlarda tekildir), kişiler, koleksiyonlar, kanallar.
 */
import type { ContentChannel, ContentCollection, ContentSource, ContentTitle } from '../../../../shared/content-schema'
import { join } from 'node:path'
import { KIDS_MAX_MATURITY_LEVEL, MATURITY } from '../../../../shared/taxonomy'
import { norm, stableId } from '../../../../shared/text'
import { parseEntityId } from '../../../../shared/tctx'
import type { ProfileRecord } from '../../kernel/context'
import type { ArtworkTypeName } from '../../kernel/imageUrls'
import type {
  ArtworkSource,
  CatalogService,
  PersonRecord,
  PlayableVideo,
  Services,
  VideoInfo,
} from '../../kernel/services'
import type { ContentBundle, ContentLog } from './load'

export const maturityLevelOf = (t: ContentTitle): number => MATURITY[t.maturity.rating].maturityLevel

/** Kişi kimliği: adın düzleştirilmiş halinden kararlı karma */
export const personIdOf = (name: string): number => stableId(norm(name))

export interface CatalogDeps {
  contentDir: string
  log: ContentLog
  /** İstek anında diğer servisler (kimlik, yayın akışı) */
  services: () => Partial<Services>
}

export function createCatalog(bundle: ContentBundle, deps: CatalogDeps): CatalogService {
  const titles = new Map<number, ContentTitle>()
  const titleOrder: ContentTitle[] = []
  const info = new Map<number, VideoInfo>()
  const episodeIdsOf = new Map<number, number[]>()
  const playables = new Map<number, PlayableVideo>()
  const playablesOf = new Map<number, number[]>()
  const seen = new Set<number>()

  const claim = (id: number, what: string, file: string): boolean => {
    if (seen.has(id)) {
      deps.log('error', `Yinelenen videoId ${id} (${what}, ${file}) atlandı`)
      return false
    }
    seen.add(id)
    return true
  }

  for (const { title: raw, file } of bundle.titles) {
    if (!claim(raw.videoId, `"${raw.title}"`, file)) continue
    // Yinelenen bölüm / ek videoları ayıklanmış kopya
    const seasons = raw.seasons
      .map((s) => ({ ...s, episodes: s.episodes.filter((e) => claim(e.videoId, `${raw.title} bölüm "${e.title}"`, file)) }))
      .filter((s) => s.episodes.length > 0)
      .sort((a, b) => a.number - b.number)
    if (raw.type === 'SHOW' && seasons.length === 0) {
      deps.log('error', `Dizi "${raw.title}" (${raw.videoId}) geçerli bölüm içermiyor, atlandı (${file})`)
      continue
    }
    const supplementals = raw.supplementals.filter((s) => claim(s.videoId, `${raw.title} ek video "${s.title}"`, file))
    const t: ContentTitle = { ...raw, seasons, supplementals }
    titles.set(t.videoId, t)
    titleOrder.push(t)
    info.set(t.videoId, { videoId: t.videoId, kind: t.type, title: t, episode: null, supplemental: null })

    const base = {
      titleId: t.videoId,
      license: t.license,
      maturityLevel: maturityLevelOf(t),
      kids: t.kids,
      requiredProduct: t.availability.requiredProduct,
    }
    const leaves: number[] = []
    if (t.type === 'MOVIE') {
      playables.set(t.videoId, {
        ...base,
        videoId: t.videoId,
        kind: 'MOVIE',
        displayTitle: t.title,
        runtimeSec: t.runtimeSec,
        sources: t.sources,
        promo: t.promo,
      })
      leaves.push(t.videoId)
    } else {
      const eps: number[] = []
      for (const s of seasons) {
        for (const e of [...s.episodes].sort((a, b) => a.number - b.number)) {
          info.set(e.videoId, {
            videoId: e.videoId,
            kind: 'EPISODE',
            title: t,
            episode: { data: e, seasonNumber: s.number, index: eps.length },
            supplemental: null,
          })
          playables.set(e.videoId, {
            ...base,
            videoId: e.videoId,
            kind: 'EPISODE',
            displayTitle: `${t.title} · S${s.number} B${e.number} · ${e.title}`,
            runtimeSec: e.runtimeSec,
            sources: e.sources,
            promo: t.promo,
          })
          eps.push(e.videoId)
        }
      }
      episodeIdsOf.set(t.videoId, eps)
      leaves.push(...eps)
    }
    for (const s of supplementals) {
      info.set(s.videoId, { videoId: s.videoId, kind: 'SUPPLEMENTAL', title: t, episode: null, supplemental: s })
      playables.set(s.videoId, {
        ...base,
        videoId: s.videoId,
        kind: 'SUPPLEMENTAL',
        displayTitle: `${t.title} · ${s.title}`,
        runtimeSec: s.runtimeSec,
        sources: s.sources,
        promo: null,
      })
      leaves.push(s.videoId)
    }
    playablesOf.set(t.videoId, leaves)
  }

  // Kişi dizini: oyuncu + yönetmen + yaratıcı
  const people = new Map<number, PersonRecord>()
  for (const t of titleOrder) {
    for (const name of new Set([...t.cast, ...t.directors, ...t.creators])) {
      const personId = personIdOf(name)
      let p = people.get(personId)
      if (!p) people.set(personId, (p = { personId, name, videoIds: [] }))
      if (!p.videoIds.includes(t.videoId)) p.videoIds.push(t.videoId)
    }
  }

  // Koleksiyonlar: bilinmeyen başlıklar ayıklanır
  const collections = new Map<number, ContentCollection>()
  for (const c of bundle.collections) {
    if (collections.has(c.collectionId)) {
      deps.log('error', `Yinelenen koleksiyon ${c.collectionId} atlandı`)
      continue
    }
    const missing = c.videoIds.filter((v) => !titles.has(v))
    if (missing.length) deps.log('warn', `Koleksiyon ${c.collectionId} bilinmeyen başlıkları atladı: ${missing.join(', ')}`)
    collections.set(c.collectionId, { ...c, videoIds: c.videoIds.filter((v) => titles.has(v)) })
  }
  const collectionsByTitle = new Map<number, ContentCollection[]>()
  for (const c of collections.values()) {
    for (const v of c.videoIds) collectionsByTitle.set(v, [...(collectionsByTitle.get(v) ?? []), c])
  }

  // Kanallar: kumanda numarasına göre
  const channels = new Map<number, ContentChannel>()
  for (const ch of bundle.channels) {
    if (channels.has(ch.channelId)) {
      deps.log('error', `Yinelenen kanal ${ch.channelId} atlandı`)
      continue
    }
    channels.set(ch.channelId, ch)
  }
  const channelList = [...channels.values()].sort((a, b) => a.number - b.number || a.channelId - b.channelId)

  const epg = bundle.epg.filter((tpl) => {
    if (channels.has(tpl.channelId)) return true
    deps.log('warn', `Yayın akışı şablonu bilinmeyen kanal için atlandı: ${tpl.channelId}`)
    return false
  })

  const titleOf = (videoId: number): ContentTitle | null => info.get(videoId)?.title ?? null

  /** Video görseli: tipe göre storyArt/boxart önceliği, bölüm/ek video için üst başlığa düşer. */
  function videoArtwork(videoId: number, type: ArtworkTypeName, entityId: string): ArtworkSource | null {
    const vi = info.get(videoId)
    if (!vi) return null
    const t = vi.title
    const own = vi.episode?.data.artwork ?? vi.supplemental?.artwork ?? null
    const pick = (a: { boxart: string | null; storyArt: string | null } | null) =>
      a ? (type === 'BOXART' ? (a.boxart ?? a.storyArt) : (a.storyArt ?? a.boxart)) : null
    const sourceUrl = type === 'TITLE_LOGO' ? null : (pick(own) ?? pick(t.artwork))
    const subtitle = vi.episode
      ? `S${vi.episode.seasonNumber} B${vi.episode.data.number} · ${vi.episode.data.title}`
      : vi.supplemental
        ? vi.supplemental.title
        : String(t.year)
    return {
      sourceUrl,
      localFile: null,
      title: t.title,
      subtitle,
      seed: entityId,
      focal: own?.focal ?? t.artwork.focal,
    }
  }

  const catalog: CatalogService = {
    allTitles: () => titleOrder,
    getTitle: (id) => titles.get(id) ?? null,
    titleOf,
    videoInfo: (id) => info.get(id) ?? null,
    episodeIds: (id) => episodeIdsOf.get(id) ?? [],
    allCollections: () => [...collections.values()],
    getCollection: (id) => collections.get(id) ?? null,
    collectionsOf: (id) => collectionsByTitle.get(id) ?? [],
    people: () => [...people.values()],
    getPerson: (id) => people.get(id) ?? null,
    homeLayout: () => bundle.homeLayout,
    epgTemplates: () => epg,
    interstitials: () => bundle.interstitials,

    isVisibleTo(profile: ProfileRecord | null, titleId: number): boolean {
      const t = titleOf(titleId)
      if (!t) return false
      if (!profile) return true
      const max = profile.isKids ? Math.min(profile.maturityLevel, KIDS_MAX_MATURITY_LEVEL) : profile.maturityLevel
      return maturityLevelOf(t) <= max
    },

    getPlayable: (id) => playables.get(id) ?? null,
    listPlayables: (titleId) => (playablesOf.get(titleId) ?? []).map((id) => playables.get(id)!).filter(Boolean),
    getChannel: (id) => channels.get(id) ?? null,
    listChannels: () => channelList,
    subtitlesDir: () => join(deps.contentDir, 'subtitles'),

    stats() {
      const bySourceKind: Record<string, number> = {}
      const count = (s: ContentSource | undefined) => {
        if (s) bySourceKind[s.type] = (bySourceKind[s.type] ?? 0) + 1
      }
      for (const p of playables.values()) count(p.sources[0])
      for (const ch of channelList) count(ch.source)
      return { titles: titleOrder.length, playables: playables.size, channels: channelList.length, bySourceKind }
    },

    getArtworkSource(entityId: string, type: ArtworkTypeName): ArtworkSource | null {
      const parsed = parseEntityId(entityId)
      if (!parsed) return null
      const num = Number(parsed.id)
      switch (parsed.kind) {
        case 'Video':
          return Number.isInteger(num) ? videoArtwork(num, type, entityId) : null
        case 'Channel': {
          const ch = channels.get(num)
          if (!ch) return null
          return {
            sourceUrl: null,
            localFile: ch.logo ? `brand/channels/${ch.logo}` : null,
            title: ch.name,
            subtitle: null,
            seed: entityId,
            focal: '50% 50%',
          }
        }
        case 'Profile': {
          const p = deps.services().identity?.getProfile(parsed.id) ?? null
          if (!p) return null
          return { sourceUrl: null, localFile: `brand/${p.avatar}`, title: p.name, subtitle: null, seed: entityId, focal: '50% 50%' }
        }
        case 'Collection': {
          const c = collections.get(num)
          if (!c) return null
          const first = c.videoIds[0]
          const art = first !== undefined ? videoArtwork(first, type, entityId) : null
          return {
            sourceUrl: art?.sourceUrl ?? null,
            localFile: null,
            title: c.name,
            subtitle: null,
            seed: entityId,
            focal: art?.focal ?? '50% 35%',
          }
        }
        case 'Airing': {
          const a = deps.services().epg?.getAiring(parsed.id) ?? null
          if (!a) return null
          const art = a.videoId !== null ? videoArtwork(a.videoId, type, entityId) : null
          const ch = channels.get(a.channelId)
          if (art?.sourceUrl) return { ...art, title: a.title, subtitle: ch?.name ?? null }
          return {
            sourceUrl: null,
            localFile: ch?.logo ? `brand/channels/${ch.logo}` : null,
            title: a.title,
            subtitle: ch?.name ?? null,
            seed: entityId,
            focal: '50% 50%',
          }
        }
        default:
          return null
      }
    },
  }
  return catalog
}
