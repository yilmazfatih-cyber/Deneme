import type { ContentSource } from '../../../../shared/content-schema'

/** GraphQL `SourceKind`: oynatmanın nasıl taşındığı */
export type SourceKindName = 'OWN_CDN' | 'YOUTUBE' | 'PROGRESSIVE'

export function sourceKindOf(s: ContentSource): SourceKindName {
  switch (s.type) {
    case 'DASH':
    case 'PACKAGED':
    case 'LINEAR':
      return 'OWN_CDN'
    case 'YOUTUBE':
    case 'YOUTUBE_LIVE':
      return 'YOUTUBE'
    case 'PROGRESSIVE':
      return 'PROGRESSIVE'
  }
}

const ORDER: SourceKindName[] = ['OWN_CDN', 'PROGRESSIVE', 'YOUTUBE']

/** Kaynak listesinden tekil türler, sabit sırayla */
export function sourceKindsOf(sources: ContentSource[]): SourceKindName[] {
  const set = new Set(sources.map(sourceKindOf))
  return ORDER.filter((k) => set.has(k))
}
