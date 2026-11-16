// Sinyal köprüsü: yönlendirici durumunu `sinyal` sistemindeki bir sinyale bağlar. Böylece
// `computed(() => router$.value.params.id)` gibi ince taneli hesaplar yazılabilir.
// Bu dosya yönlendiricinin sinyale bağımlı tek parçasıdır; düz DOM kullanan uygulama onu içe aktarmaz.
// Genişletme: yalnız belirli bir alanı (ör. params) izleyen ayrı sinyaller burada üretilebilir.
import { signal, type Signal } from '../sinyal/index.ts'
import type { Router, RouterState } from './router.ts'

export function routerSignal(router: Router): { state: Signal<RouterState>; dispose: () => void } {
  const state = signal(router.state)
  const dispose = router.subscribe((next) => state.set(next))
  return { state, dispose }
}
