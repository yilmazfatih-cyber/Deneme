import type { LicensedManifest } from '../../../../shared/playback'
import { ProgressiveAdapter } from './progressive'
import { StreamsAdapter } from './streams'
import type { AdapterOptions, PlayerAdapter } from './types'
import { YouTubeAdapter } from './youtube'

export function createAdapter(manifest: LicensedManifest, opts: AdapterOptions): PlayerAdapter {
  switch (manifest.kind) {
    case 'STREAMS':
      return new StreamsAdapter(manifest, opts)
    case 'PROGRESSIVE':
      return new ProgressiveAdapter(manifest, opts)
    case 'EXTERNAL_EMBED':
      return new YouTubeAdapter(manifest, opts)
  }
}

/** Telemetri için kaynak türü (SourceKind). */
export function sourceKindOf(m: LicensedManifest): 'OWN_CDN' | 'PROGRESSIVE' | 'YOUTUBE' {
  return m.kind === 'STREAMS' ? 'OWN_CDN' : m.kind === 'PROGRESSIVE' ? 'PROGRESSIVE' : 'YOUTUBE'
}

export type { PlayerAdapter, AdapterOptions } from './types'
