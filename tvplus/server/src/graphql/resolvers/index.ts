/**
 * Şemadaki tüm tiplerin çözümleyicileri (arama tipleri hariç: onlar ./search içindeki `searchResolvers`).
 * Motor bunları buildSchema ile kurulan şemaya uygular; `Video`, `RowEntity` için `__resolveType` buradadır.
 */
import type { ResolverMap } from '../../kernel/context'
import { liveResolvers } from './live'
import { memberResolvers } from './member'
import { microgenreResolvers } from './microgenre'
import { playbackResolvers } from './playback'
import { searchResolvers } from './search'
import { videoResolvers } from './video'

/** Tip bazında birleştirir; aynı tipin alanları tek haritada toplanır (sonraki kazanır). */
export function mergeResolvers(...maps: ResolverMap[]): ResolverMap {
  const out: ResolverMap = {}
  for (const m of maps) {
    for (const [type, fields] of Object.entries(m)) out[type] = { ...(out[type] ?? {}), ...fields }
  }
  return out
}

export const resolvers: ResolverMap = mergeResolvers(
  videoResolvers,
  liveResolvers,
  memberResolvers,
  microgenreResolvers,
  playbackResolvers,
  searchResolvers,
)
