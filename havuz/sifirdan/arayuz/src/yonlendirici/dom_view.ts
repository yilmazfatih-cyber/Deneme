// Düz DOM ile iç içe sayfa çizimi: eşleşme zincirini yapraktan köke dolaşır; her rota için bir görünüm işlevi
// çağırır ve alt sayfanın düğümünü üst sayfaya `outlet` olarak verir (üst = düzen/çerçeve, alt = içerik).
// Hiçbir çatıya bağlı değildir; sanal_dom ya da sinyal ile de aynı fikir uygulanabilir.
// Genişletme: geçiş animasyonu için eski ve yeni düğümü birlikte tutup `animasyon` sistemiyle değiştirin.
import type { RouterState } from './router.ts'

export interface ViewContext {
  state: RouterState
  params: Record<string, string>
  data: unknown
  /** Alt sayfanın düğümü (yaprakta null). */
  outlet: Node | null
}

export type View = (ctx: ViewContext) => Node

/** Rota adına göre görünümleri seçer; eşleşme yoksa `notFound` çizilir. */
export function renderRoutes(state: RouterState, views: Record<string, View>, notFound: View): Node {
  let outlet: Node | null = null
  for (let i = state.matches.length - 1; i >= 0; i--) {
    const match = state.matches[i]
    const view = match?.route.name ? views[match.route.name] : undefined
    if (!match || !view) continue
    outlet = view({ state, params: match.params, data: state.data[match.route.name ?? String(i)], outlet })
  }
  return outlet ?? notFound({ state, params: {}, data: undefined, outlet: null })
}
