/**
 * Üye durumu (Netflix bookmark / watchStatus / My List / thumbs): profil başına kalıcı durum.
 * Depo: createStore('member-state'). Profil kaydı ilk yazmada oluşur; okuma tarafı boş varsayılan döner.
 */
import { norm } from '../../../../shared/text'
import type { Store } from '../../kernel/store'
import type {
  BookmarkRecord,
  ProgressService,
  Services,
  ThumbRatingValue,
  WatchStatusValue,
} from '../../kernel/services'

export interface ProfileState {
  bookmarks: Record<string, BookmarkRecord>
  /** Listem: en yeni önce */
  myList: { videoId: number; addedAt: string }[]
  thumbs: Record<string, { rating: ThumbRatingValue; at: string }>
  lastChannel: number | null
  /** null → içerikteki favorite:true kanallar (ilk değişikliğe kadar) */
  favoriteChannels: number[] | null
  recentSearches: string[]
  dismissed: string[]
}
export interface MemberState {
  profiles: Record<string, ProfileState>
  /** Süresi içerikte olmayan videolar için oynatıcının bildirdiği süre */
  learnedRuntimes: Record<string, number>
}
export const initialMemberState = (): MemberState => ({ profiles: {}, learnedRuntimes: {} })

export const MAX_RECENT_SEARCHES = 8
/** İzlendi sayılma eşiği: sürenin %95'i; 10 dakikadan uzun videolarda son 60 sn de yeter */
export const WATCHED_RATIO = 0.95
export const WATCHED_TAIL_SEC = 60
const TAIL_RULE_MIN_RUNTIME_SEC = 600

const emptyProfile = (): ProfileState => ({
  bookmarks: {},
  myList: [],
  thumbs: {},
  lastChannel: null,
  favoriteChannels: null,
  recentSearches: [],
  dismissed: [],
})

export function isWatched(positionSec: number, runtimeSec: number | null): boolean {
  if (!runtimeSec || runtimeSec <= 0) return false
  if (positionSec >= WATCHED_RATIO * runtimeSec) return true
  return runtimeSec >= TAIL_RULE_MIN_RUNTIME_SEC && positionSec >= runtimeSec - WATCHED_TAIL_SEC
}

export function createProgressService(
  store: Store<MemberState>,
  services: () => Partial<Services>,
  now: () => Date = () => new Date(),
): ProgressService {
  const read = (guid: string): ProfileState => store.get().profiles[guid] ?? emptyProfile()
  const write = (guid: string, fn: (p: ProfileState) => void) =>
    store.update((s) => {
      fn((s.profiles[guid] ??= emptyProfile()))
    })

  /** Aynı milisaniyedeki yazmalar da sıralı kalsın diye tekdüze zaman damgası */
  let lastStamp = 0
  const stamp = () => {
    lastStamp = Math.max(now().getTime(), lastStamp + 1)
    return new Date(lastStamp).toISOString()
  }

  const catalog = () => services().catalog
  /** Liste / puan gibi başlık düzeyindeki durum için: bölüm ve ek video üst başlığa eşlenir */
  const titleIdOf = (videoId: number) => catalog()?.titleOf(videoId)?.videoId ?? videoId

  const learnedRuntime = (videoId: number) => store.get().learnedRuntimes[String(videoId)] ?? null
  const runtimeOf = (videoId: number, bm: BookmarkRecord | null) =>
    catalog()?.getPlayable(videoId)?.runtimeSec ?? learnedRuntime(videoId) ?? bm?.runtimeSec ?? null

  const getBookmark = (guid: string, videoId: number): BookmarkRecord | null => {
    const bm = read(guid).bookmarks[String(videoId)]
    if (!bm) return null
    return { ...bm, runtimeSec: runtimeOf(videoId, bm) }
  }

  const leafStatus = (guid: string, videoId: number): WatchStatusValue => {
    const bm = getBookmark(guid, videoId)
    if (!bm) return 'NEVER_WATCHED'
    return isWatched(bm.positionSec, bm.runtimeSec) ? 'WATCHED' : 'STARTED'
  }

  const watchStatus = (guid: string, videoId: number): WatchStatusValue => {
    const vi = catalog()?.videoInfo(videoId)
    if (vi?.kind !== 'SHOW') return leafStatus(guid, videoId)
    const eps = catalog()!.episodeIds(videoId)
    const statuses = eps.map((e) => leafStatus(guid, e))
    if (statuses.every((s) => s === 'NEVER_WATCHED')) return 'NEVER_WATCHED'
    return statuses.every((s) => s === 'WATCHED') ? 'WATCHED' : 'STARTED'
  }

  const currentEpisode = (guid: string, showId: number): number | null => {
    const vi = catalog()?.videoInfo(showId)
    if (vi?.kind !== 'SHOW') return null
    const eps = catalog()!.episodeIds(showId)
    if (eps.length === 0) return null
    const marks = read(guid).bookmarks
    // En son dokunulan bölüm: yarım kaldıysa o, bittiyse ardından gelen
    let latest: { id: number; at: string } | null = null
    for (const e of eps) {
      const bm = marks[String(e)]
      if (bm && (!latest || bm.lastModified > latest.at)) latest = { id: e, at: bm.lastModified }
    }
    if (!latest) return eps[0]!
    if (leafStatus(guid, latest.id) !== 'WATCHED') return latest.id
    const i = eps.indexOf(latest.id)
    // Son bölüm de izlendiyse: izlenmemiş ilk bölüm, o da yoksa baştan
    return eps[i + 1] ?? eps.find((e) => leafStatus(guid, e) !== 'WATCHED') ?? eps[0]!
  }

  const favoriteChannels = (guid: string): number[] => {
    const own = read(guid).favoriteChannels
    if (own) return [...own]
    return (catalog()?.listChannels() ?? []).filter((c) => c.favorite).map((c) => c.channelId)
  }

  /** Yer imleri, en son değişen önce */
  const sortedBookmarks = (guid: string) =>
    Object.entries(read(guid).bookmarks)
      .map(([id, bm]) => ({ videoId: Number(id), bm }))
      .sort((a, b) => (a.bm.lastModified < b.bm.lastModified ? 1 : a.bm.lastModified > b.bm.lastModified ? -1 : 0))

  return {
    getBookmark,
    setBookmark(guid, videoId, positionSec, durationSec) {
      const contentRuntime = catalog()?.getPlayable(videoId)?.runtimeSec ?? null
      if (contentRuntime === null && durationSec && durationSec > 0) {
        store.update((s) => {
          s.learnedRuntimes[String(videoId)] = Math.round(durationSec)
        })
      }
      const rec: BookmarkRecord = {
        positionSec: Math.max(0, Math.round(positionSec)),
        runtimeSec:
          contentRuntime ??
          learnedRuntime(videoId) ??
          (durationSec && durationSec > 0 ? Math.round(durationSec) : null),
        lastModified: stamp(),
      }
      write(guid, (p) => {
        p.bookmarks[String(videoId)] = rec
      })
      return { ...rec }
    },
    learnedRuntime,

    recentSearches: (guid) => [...read(guid).recentSearches],
    recordSearch(guid, term) {
      const t = term.trim()
      if (!norm(t)) return
      write(guid, (p) => {
        p.recentSearches = [t, ...p.recentSearches.filter((s) => norm(s) !== norm(t))].slice(0, MAX_RECENT_SEARCHES)
      })
    },
    clearRecentSearches(guid) {
      write(guid, (p) => {
        p.recentSearches = []
      })
    },

    watchStatus,
    currentEpisode,
    continueWatching(guid) {
      const out: { titleId: number; videoId: number }[] = []
      const seen = new Set<number>()
      for (const { videoId } of sortedBookmarks(guid)) {
        const vi = catalog()?.videoInfo(videoId)
        if (!vi || vi.kind === 'SUPPLEMENTAL') continue
        const titleId = vi.title.videoId
        if (seen.has(titleId)) continue
        seen.add(titleId)
        if (vi.kind === 'MOVIE') {
          if (leafStatus(guid, videoId) === 'STARTED') out.push({ titleId, videoId })
        } else if (watchStatus(guid, titleId) !== 'WATCHED') {
          const cur = currentEpisode(guid, titleId)
          if (cur !== null) out.push({ titleId, videoId: cur })
        }
      }
      return out
    },
    recentTitles(guid) {
      const out: number[] = []
      for (const { videoId } of sortedBookmarks(guid)) {
        const id = titleIdOf(videoId)
        if (!out.includes(id) && catalog()?.getTitle(id)) out.push(id)
      }
      return out
    },

    myList: (guid) => read(guid).myList.map((e) => e.videoId),
    isInMyList: (guid, videoId) => read(guid).myList.some((e) => e.videoId === titleIdOf(videoId)),
    addToMyList(guid, videoId) {
      const id = titleIdOf(videoId)
      write(guid, (p) => {
        if (!p.myList.some((e) => e.videoId === id)) p.myList.unshift({ videoId: id, addedAt: stamp() })
      })
    },
    removeFromMyList(guid, videoId) {
      const id = titleIdOf(videoId)
      write(guid, (p) => {
        p.myList = p.myList.filter((e) => e.videoId !== id)
      })
    },

    thumbRating: (guid, videoId) => read(guid).thumbs[String(titleIdOf(videoId))]?.rating ?? 'THUMBS_UNRATED',
    setThumbRating(guid, videoId, rating) {
      const id = String(titleIdOf(videoId))
      write(guid, (p) => {
        if (rating === 'THUMBS_UNRATED') delete p.thumbs[id]
        else p.thumbs[id] = { rating, at: stamp() }
      })
    },
    liked: (guid) =>
      Object.entries(read(guid).thumbs)
        .filter(([, t]) => t.rating === 'THUMBS_UP' || t.rating === 'THUMBS_WAY_UP')
        .sort((a, b) => (a[1].at < b[1].at ? 1 : -1))
        .map(([id]) => Number(id)),
    disliked: (guid) =>
      Object.entries(read(guid).thumbs)
        .filter(([, t]) => t.rating === 'THUMBS_DOWN')
        .map(([id]) => Number(id)),

    lastChannel: (guid) => read(guid).lastChannel,
    setLastChannel(guid, channelId) {
      write(guid, (p) => {
        p.lastChannel = channelId
      })
    },
    favoriteChannels,
    toggleFavoriteChannel(guid, channelId) {
      const current = favoriteChannels(guid)
      const next = current.includes(channelId) ? current.filter((c) => c !== channelId) : [...current, channelId]
      write(guid, (p) => {
        p.favoriteChannels = next
      })
      return next.includes(channelId)
    },

    dismissedInterstitials: (guid) => [...read(guid).dismissed],
    dismissInterstitial(guid, id) {
      write(guid, (p) => {
        if (!p.dismissed.includes(id)) p.dismissed.push(id)
      })
    },
  }
}
