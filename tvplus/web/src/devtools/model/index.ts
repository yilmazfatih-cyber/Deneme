/** Panelin tüm görünüm modeli: tek paket olaydan tüm sekmelerin durumunu üretir. */
import type { DevEvent } from '../../lib/devbus'
import { initialApi, reduceApi, type ApiState } from './api'
import { initialFeed, reduceFeed, type FeedState } from './feed'
import { initialPipeline, reducePipeline, type PipelineState } from './pipeline'
import { str } from './read'
import { initialTelemetry, reduceTelemetry, type TelemetryState } from './telemetry'

export interface DevModel {
  feed: FeedState
  pipeline: PipelineState
  api: ApiState
  telemetry: TelemetryState
  lastTraceId: string | null
  lastTraceAt: number | null
  total: number
}

export function initialModel(): DevModel {
  return {
    feed: initialFeed(),
    pipeline: initialPipeline(),
    api: initialApi(),
    telemetry: initialTelemetry(),
    lastTraceId: null,
    lastTraceAt: null,
    total: 0,
  }
}

/**
 * Bir olay paketini uygular. `feedAfterId`: akış "Temizle"den sonra yalnızca bu kimlikten büyük olayları gösterir
 * (diğer sekmeler etkilenmez).
 */
export function reduceModel(m: DevModel, events: readonly DevEvent[], feedAfterId = 0): DevModel {
  if (!events.length) return m
  let pipeline = m.pipeline
  let api = m.api
  let telemetry = m.telemetry
  let lastTraceId = m.lastTraceId
  let lastTraceAt = m.lastTraceAt
  for (const e of events) {
    pipeline = reducePipeline(pipeline, e)
    api = reduceApi(api, e)
    telemetry = reduceTelemetry(telemetry, e)
    const t = e.detail ? str(e.detail.traceId) : null
    if (t) {
      lastTraceId = t
      lastTraceAt = e.at
    }
  }
  const feedEvents = feedAfterId ? events.filter((e) => e.id > feedAfterId) : events
  return { feed: reduceFeed(m.feed, feedEvents), pipeline, api, telemetry, lastTraceId, lastTraceAt, total: m.total + events.length }
}
