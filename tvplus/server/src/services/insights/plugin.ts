/**
 * İçgörüler ve planlayıcı (docs/ICERIK_ZEKASI.md §7): hangi türde ne kadar içerik var, ne kadar izleniyor; zaman içinde
 * pay; dil, ülke, edinim kırılımları; talep, maliyet ve editör yargısıyla içerik karması önerisi.
 * Sözleşme: server/src/kernel/intelligence.ts (InsightsService), shared/intelligence.ts.
 *
 *   GET  /api/studio/overview                                          → StudioOverview
 *   GET  /api/studio/insights/mix?type=MOVIE|SHOW|ALL&from=&to=        → CatalogMix
 *   GET  /api/studio/insights/timeline?dimension=genre|acquisition|origin&months=12 → Timeline
 *   POST /api/studio/plan                                              gövde: PlanInput → PlanResult
 */
import type { FastifyInstance } from 'fastify'
import { ROUTES } from '../../../../shared/constants'
import type {
  CatalogMix,
  Microgenre,
  PlanResult,
  StudioOverview,
  TasteCommunity,
  Timeline,
  TitleTotals,
  ViewingSource,
} from '../../../../shared/intelligence'
import type { InsightsService, ViewingQuery } from '../../kernel/intelligence'
import { dayOf, dayStart, monthOf } from './labels'
import { computeMix, computeTimeline, monthsEndingAt } from './mix'
import { computeOverview } from './overview'
import { computePlan } from './plan'
import {
  MIX_MESSAGES,
  PLAN_MESSAGES,
  TIMELINE_MESSAGES,
  parseOrThrow,
  zMixQuery,
  zPlanBody,
  zTimelineQuery,
} from './schemas'

/** Testlerin değiştirebildiği iç bağımlılıklar (saat). */
export interface InsightsInternals {
  now: () => number
}
const internalsByApp = new WeakMap<FastifyInstance, InsightsInternals>()
export function insightsInternals(app: FastifyInstance): InsightsInternals {
  const i = internalsByApp.get(app)
  if (!i) throw new Error('İçgörü eklentisi bu uygulamada kurulmamış')
  return i
}

const DAY_MS = 86_400_000
const TREND_WINDOW_MS = 28 * DAY_MS

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

const hoursMap = (totals: Map<number, TitleTotals>): Map<number, number> =>
  new Map([...totals].map(([id, t]) => [id, t.hours]))

export default async function insightsPlugin(app: FastifyInstance): Promise<void> {
  const internals: InsightsInternals = { now: () => Date.now() }
  internalsByApp.set(app, internals)
  const s = () => app.services

  const totals = (q: ViewingQuery = {}) => hoursMap(attempt(() => s().viewing.titleTotals(q), new Map()))
  const activeSources = (): ViewingSource[] => attempt(() => s().viewing.activeSources(), [])

  /** Eğilim pencerelerinin bitişi: etkin kaynaklardaki en son olay (geçmişe dönük içe aktarımda da anlamlı), en çok "şimdi". */
  const trendAnchor = (): number => {
    const now = internals.now()
    const active = new Set(activeSources())
    let last: number | null = null
    for (const src of attempt(() => s().viewing.sources(), [])) {
      if (!active.has(src.source) || src.lastTs === null) continue
      last = last === null ? src.lastTs : Math.max(last, src.lastTs)
    }
    return last === null ? now : Math.min(now, last)
  }

  const service: InsightsService = {
    mix(opts = {}): CatalogMix {
      const q: ViewingQuery = {}
      if (opts.from !== undefined) q.from = opts.from
      if (opts.to !== undefined) q.to = opts.to
      return computeMix({
        titles: s().catalog.allTitles(),
        hoursByTitle: totals(q),
        scope: opts.scope ?? 'ALL',
        window: {
          from: opts.from !== undefined ? dayOf(opts.from) : null,
          to: opts.to !== undefined ? dayOf(opts.to - 1) : null,
        },
        sources: activeSources(),
      })
    },
    timeline({ dimension, months }): Timeline {
      const count = Math.max(1, Math.min(60, Math.floor(months)))
      const list = monthsEndingAt(monthOf(internals.now()), count)
      const monthly = attempt(
        () => s().viewing.monthlyTitleHours({ from: dayStart(`${list[0]!}-01`) }),
        new Map<string, Map<number, number>>(),
      )
      return computeTimeline(s().catalog.allTitles(), monthly, dimension, list)
    },
    plan(input): PlanResult {
      const anchor = trendAnchor()
      const end = anchor + 1
      const audience = s().audience
      return computePlan(input, {
        titles: s().catalog.allTitles(),
        hours: totals(),
        recent: totals({ from: end - TREND_WINDOW_MS, to: end }),
        previous: totals({ from: end - 2 * TREND_WINDOW_MS, to: end - TREND_WINDOW_MS }),
        microgenres: attempt((): Microgenre[] => s().microgenres.all(), []),
        communities: attempt((): TasteCommunity[] => audience.communities(), []),
        communityTitles: (id) => attempt(() => audience.topTitles(id, 1000), []),
        generatedAt: new Date(internals.now()).toISOString(),
      })
    },
  }
  app.services.insights = service

  app.get(`${ROUTES.STUDIO}/overview`, async (): Promise<StudioOverview> => computeOverview(s()))

  app.get(`${ROUTES.STUDIO}/insights/mix`, async (req): Promise<CatalogMix> => {
    const q = parseOrThrow(zMixQuery, req.query, MIX_MESSAGES, 'Sorgu')
    const opts: Parameters<InsightsService['mix']>[0] = { scope: q.type ?? 'ALL' }
    if (q.from) opts.from = dayStart(q.from)
    if (q.to) opts.to = dayStart(q.to) + DAY_MS // 'to' günü dahil
    return service.mix(opts)
  })

  app.get(`${ROUTES.STUDIO}/insights/timeline`, async (req): Promise<Timeline> => {
    const q = parseOrThrow(zTimelineQuery, req.query, TIMELINE_MESSAGES, 'Sorgu')
    return service.timeline({ dimension: q.dimension, months: q.months })
  })

  app.post(`${ROUTES.STUDIO}/plan`, async (req): Promise<PlanResult> => {
    const body = parseOrThrow(zPlanBody, req.body, PLAN_MESSAGES, 'Gövde')
    return service.plan(body)
  })
}
