/**
 * Uygulamanın Falcor motoru: alan servislerinin rotalarıyla (`./routes/index`) kurulur.
 * Hem `POST /api/member/pathEvaluator` hem de açılış bağlamındaki ilk satır önbelleği bunu kullanır.
 */
import type { FalcorPath, PathEvaluatorResponse } from '../../../shared/types'
import type { FalcorRouteContext } from '../kernel/context'
import { createFalcorEngine } from './engine-core'
import { routes } from './routes/index'

export { createFalcorEngine } from './engine-core'
export { FalcorPathError } from './paths'

const engine = createFalcorEngine({
  routes: () => routes,
  // Ayrıntı yalnız sunucu günlüğüne; istemci genel bir hata atomu görür.
  onRouteError: (err, route, ctx) =>
    ctx.req.log.error({ err, route: route.route.join('.') }, 'Falcor rotası hata verdi'),
})

/** Kayıtlı rota var mı (yoksa açılış önbelleği hiç denenmez). */
export const hasRoutes = (): boolean => routes.length > 0

export function evaluatePaths(ctx: FalcorRouteContext, paths: FalcorPath[]): Promise<PathEvaluatorResponse> {
  return engine.evaluate(ctx, paths)
}
