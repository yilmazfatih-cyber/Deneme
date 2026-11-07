import { api, items } from '../../api'
import { useApi } from '../../hooks'
import type { Entity, ListResponse } from '../../types'

/** id → display name map for operator tables that only carry entity_id. */
export function useEntityNames(enabled = true): Record<string, string> {
  const res = useApi<ListResponse<Entity>>(
    () => (enabled ? api.entities({ limit: 1000 }) : Promise.resolve({ items: [] })),
    `entity-names|${enabled}`,
  )
  const map: Record<string, string> = {}
  for (const e of items(res.data)) map[e.id] = e.trade_name || e.legal_name
  return map
}
