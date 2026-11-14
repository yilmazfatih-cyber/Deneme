/**
 * Yan menüden bir ekrana geçilince odak, ekranın içeriği gelir gelmez ekrana iner. Motor, kullanıcının bastığı
 * tuşla kurulmuş odağı (yan menüdeki öğe) sonradan gelen `autoFocus` öğesine kendiliğinden devretmez; ekran ilk
 * kez içerik çizdiğinde odak hâlâ yan menüdeyse (ya da hiç yoksa) bir kez ekrana alınır. Açık bir pencereye
 * dokunulmaz.
 */
import { useEffect, useRef } from 'react'
import { useFocusEngine } from '../focus'
import { screenScopeId, TV_RAIL_SCOPE } from '../ui'

export function useClaimFocusOnContent(screenId: string, ready: boolean, target?: string | null): void {
  const engine = useFocusEngine()
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const scope = screenScopeId(screenId)
    if (engine.isWithin(scope)) return
    if (engine.current() !== null && !engine.isWithin(TV_RAIL_SCOPE)) return
    if (!(target && engine.focus(target, 'auto'))) engine.focusScope(scope, 'auto')
  }, [ready, engine, screenId, target])
}
