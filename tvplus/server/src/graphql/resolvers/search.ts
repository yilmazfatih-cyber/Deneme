/**
 * Arama çözümleyicileri: Query.searchPage / searchPredictions / popularSearches, Mutation.recordSearchFeedback,
 * SearchPage, SearchSection.__resolveType (SearchPredictedSection dahil), SearchEntity.
 * Üst nesne kuralı: varlık alanları yalnız kimlik başvurusu döndürür (`{ videoId }`, `{ channelId }`,
 * AiringRecord, `{ personId, name }`, `{ collectionId }`, `{ genreId }`); geri kalanını alan çözümleyicileri doldurur.
 */
import { GraphQLError } from 'graphql'
import type { GqlContext, ResolverMap } from '../../kernel/context'
import { buildArtwork } from '../../kernel/imageUrls'
import {
  DEFAULT_POPULAR,
  isFeedbackAction,
  popularSearchTitles,
  predictSearches,
  recordSearchFeedback,
  runSearch,
} from '../../services/search/engine'
import { DEFAULT_COMPLETIONS } from '../../services/search/model/completions'
import type {
  SearchEntityResult,
  SearchOptionsInput,
  SearchPageResult,
  SearchSectionResult,
} from '../../services/search/types'

interface SearchPageArgs {
  searchTerm: string
  options: SearchOptionsInput
}
interface FeedbackArgs {
  requestId: string
  searchTerm: string
  unifiedEntityId: string
  position: number
  action: string
}

function requireProfile(ctx: GqlContext): void {
  if (ctx.passport.profile) return
  const code = ctx.passport.account ? 'PROFILE_REQUIRED' : 'UNAUTHENTICATED'
  throw new GraphQLError(code === 'PROFILE_REQUIRED' ? 'Önce bir profil seçin.' : 'Bu işlem için giriş yapın.', {
    extensions: { code },
  })
}

const entity = (parent: unknown) => parent as SearchEntityResult

export const searchResolvers: ResolverMap = {
  Query: {
    searchPage: (_parent, args, ctx): SearchPageResult => {
      requireProfile(ctx)
      const { searchTerm, options } = args as SearchPageArgs
      return runSearch(ctx.services, ctx.passport, searchTerm ?? '', options, new Date(), ctx.config)
    },
    searchPredictions: (_parent, args, ctx) => {
      requireProfile(ctx)
      const { prefix, first } = args as { prefix: string; first?: number | null }
      return predictSearches(
        ctx.services,
        ctx.passport,
        prefix ?? '',
        first ?? DEFAULT_COMPLETIONS,
        new Date(),
        ctx.config,
      )
    },
    popularSearches: (_parent, args, ctx) => {
      requireProfile(ctx)
      const { first } = args as { first?: number | null }
      return popularSearchTitles(ctx.services, ctx.passport, first ?? DEFAULT_POPULAR, new Date(), ctx.config).map(
        (videoId) => ({ videoId }),
      )
    },
  },
  Mutation: {
    recordSearchFeedback: (_parent, args, ctx): boolean => {
      requireProfile(ctx)
      const a = args as FeedbackArgs
      if (!isFeedbackAction(a.action))
        throw new GraphQLError('Bilinmeyen geri bildirim türü.', { extensions: { code: 'BAD_USER_INPUT' } })
      return recordSearchFeedback(
        ctx.services,
        ctx.passport,
        {
          requestId: a.requestId,
          searchTerm: a.searchTerm ?? '',
          unifiedEntityId: a.unifiedEntityId,
          position: a.position,
          action: a.action,
        },
        new Date(),
        ctx.config,
      )
    },
  },
  SearchPage: {
    searchTerm: (p) => (p as SearchPageResult).searchTerm,
    requestId: (p) => (p as SearchPageResult).requestId,
    trackId: (p) => (p as SearchPageResult).trackId,
    expires: (p) => (p as SearchPageResult).expires,
    correction: (p) => (p as SearchPageResult).correction,
    sections: (p) => (p as SearchPageResult).sections,
    isFallback: (p) => (p as SearchPageResult).isFallback,
    recentSearches: (p) => (p as SearchPageResult).recentSearches,
    predictions: (p) => (p as SearchPageResult).predictions,
    modelVersion: (p) => (p as SearchPageResult).modelVersion,
  },
  SearchSection: {
    __resolveType: (p) => (p as SearchSectionResult).sectionType,
  },
  SearchGallerySection: {
    totalCount: (p) => (p as SearchSectionResult).totalCount,
  },
  SearchEntity: {
    unifiedEntityId: (p) => entity(p).unifiedEntityId,
    kind: (p) => entity(p).kind,
    displayString: (p) => entity(p).displayString,
    treatment: (p) => entity(p).treatment,
    track: (p) => entity(p).track,
    fuzzy: (p) => entity(p).fuzzy,
    predicted: (p) => entity(p).predicted,
    // GraphQL `score` modelin olasılığıdır; metin eşleşme puanı yalnız `explain` içinde (metin × 100) görünür.
    score: (p) => entity(p).modelScore,
    reason: (p) => entity(p).reason,
    explain: (p) => entity(p).explain,
    video: (p) => {
      const r = entity(p).ref
      return r.type === 'video' ? { videoId: r.videoId } : null
    },
    channel: (p) => {
      const r = entity(p).ref
      return r.type === 'channel' ? { channelId: r.channelId } : null
    },
    airing: (p) => {
      const r = entity(p).ref
      return r.type === 'airing' ? r.airing : null
    },
    person: (p) => {
      const r = entity(p).ref
      return r.type === 'person' ? { personId: r.personId, name: r.name } : null
    },
    collection: (p) => {
      const r = entity(p).ref
      return r.type === 'collection' ? { collectionId: r.collectionId } : null
    },
    genre: (p) => {
      const r = entity(p).ref
      return r.type === 'genre' ? { genreId: r.genreId } : null
    },
    contextualArtwork: (p, _args, ctx) => {
      const e = entity(p)
      return e.artworkType ? buildArtwork(ctx.config, e.artworkType, e.unifiedEntityId) : null
    },
  },
}
