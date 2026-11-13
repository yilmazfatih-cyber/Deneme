/**
 * Sanal OCA düğümleri (Netflix Open Connect Appliance benzetimi). Hepsi aynı kökte yol önekidir:
 * /oca/<düğüm>/… . Her düğümün yapay koşulları (gecikme, hız sınırı, hata oranı, kapalı) ve sayaçları vardır;
 * "Kaputun altı" paneli bu koşulları değiştirerek ABR düşüşünü ve CDN yük devrini canlı gösterir.
 */
import type { CdnInfo } from '../../../../shared/playback'
import type { OcaNodeState } from '../../../../shared/types'

export const ANYCAST_ALIAS = 'anycast'

interface NodeDefaults {
  id: string
  name: string
  type: OcaNodeState['type']
  location: string
  latencyMs: number
  throughputKbps: number | null
}

export const NODE_DEFAULTS: readonly NodeDefaults[] = [
  {
    id: 'c101-ist001-ix',
    name: 'İstanbul IX · c101',
    type: 'IX',
    location: 'İstanbul',
    latencyMs: 12,
    throughputKbps: null,
  },
  {
    id: 'c102-ist001-ix',
    name: 'İstanbul IX · c102',
    type: 'IX',
    location: 'İstanbul',
    latencyMs: 18,
    throughputKbps: null,
  },
  {
    id: 'c201-ank001-isp',
    name: 'Ankara ISP · c201',
    type: 'ISP',
    location: 'Ankara',
    latencyMs: 35,
    throughputKbps: null,
  },
  {
    id: 'cloud-ist-origin',
    name: 'Bulut kökeni',
    type: 'CLOUD',
    location: 'İstanbul (bulut)',
    latencyMs: 90,
    throughputKbps: 6000,
  },
]
export const DEFAULT_NODE_ORDER: readonly string[] = NODE_DEFAULTS.map((n) => n.id)

export type NodeConditions = Pick<OcaNodeState, 'latencyMs' | 'throughputKbps' | 'errorRate' | 'down'>

export interface NodeRegistry {
  list(): OcaNodeState[]
  get(id: string): OcaNodeState | null
  /** Takma ad dahil çözüm: 'anycast' → sağlıklı en düşük gecikmeli düğüm */
  resolve(id: string): OcaNodeState | null
  isKnown(id: string): boolean
  setConditions(id: string, patch: Partial<NodeConditions>): OcaNodeState | null
  reset(): void
  cdnInfo(id: string, rank: number): CdnInfo | null
}

function fresh(d: NodeDefaults): OcaNodeState {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    location: d.location,
    latencyMs: d.latencyMs,
    throughputKbps: d.throughputKbps,
    errorRate: 0,
    down: false,
    requests: 0,
    bytesServed: 0,
    cacheHits: 0,
    cacheMisses: 0,
  }
}

export function createNodeRegistry(): NodeRegistry {
  const nodes = new Map<string, OcaNodeState>()
  const reset = () => {
    nodes.clear()
    for (const d of NODE_DEFAULTS) nodes.set(d.id, fresh(d))
  }
  reset()
  const best = (): OcaNodeState | null => {
    let pick: OcaNodeState | null = null
    for (const n of nodes.values()) {
      if (n.down) continue
      if (!pick || n.latencyMs < pick.latencyMs) pick = n
    }
    return pick
  }
  return {
    list: () => [...nodes.values()].map((n) => ({ ...n })),
    get: (id) => nodes.get(id) ?? null,
    resolve: (id) => (id === ANYCAST_ALIAS ? best() : (nodes.get(id) ?? null)),
    isKnown: (id) => id === ANYCAST_ALIAS || nodes.has(id),
    setConditions(id, patch) {
      const n = nodes.get(id)
      if (!n) return null
      if (patch.latencyMs !== undefined) n.latencyMs = patch.latencyMs
      if (patch.throughputKbps !== undefined) n.throughputKbps = patch.throughputKbps
      if (patch.errorRate !== undefined) n.errorRate = patch.errorRate
      if (patch.down !== undefined) n.down = patch.down
      return { ...n }
    },
    reset,
    cdnInfo(id, rank) {
      const n = nodes.get(id)
      return n ? { id: n.id, name: n.name, rank, type: n.type, location: n.location } : null
    },
  }
}
