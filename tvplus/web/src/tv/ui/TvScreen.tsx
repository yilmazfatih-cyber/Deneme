/**
 * TvScreen — her TV ekranının çerçevesi: güvenli alan, ekranın odak kapsamı (tuzaklı) ve açılışta varsayılan odak.
 *
 *   <TvScreen id="ayarlar" title="Ayarlar" defaultFocus="ayarlar:profil">…</TvScreen>
 *
 * Açılınca motorun "ekranı" olur ve odağı kendi kapsamına alır: hafıza (geri dönülen ekran) → `defaultFocus` →
 * ilk odaklanabilir. Odak böyle kendiliğinden kurulduysa, sonradan yüklenen `autoFocus` öğesi (ör. ilk kart)
 * odağı devralır. Yan menülü düzende ← kenarı yan menüyü açar (TvScreenEdgeProvider).
 */
import { createContext, useContext, useLayoutEffect, type ReactElement, type ReactNode } from 'react'
import { FocusScope, useFocusEngine, type Direction } from '../focus'

type EdgeHandler = (dir: Direction) => boolean | void

const EdgeCtx = createContext<EdgeHandler | null>(null)

/** Kabuk, ekranların kenar davranışını (← yan menü) buradan verir. */
export function TvScreenEdgeProvider({ onEdge, children }: { onEdge: EdgeHandler; children: ReactNode }): ReactElement {
  return <EdgeCtx.Provider value={onEdge}>{children}</EdgeCtx.Provider>
}

export const screenScopeId = (id: string): string => `ekran:${id}`

export interface TvScreenProps {
  /** Ekranın sabit kimliği (kapsam: `ekran:<id>`; dönüşte hafıza korunur) */
  id: string
  /** Ekran okuyucu için ekran adı */
  title: string
  /** Açılışta odaklanacak öğenin kimliği */
  defaultFocus?: string
  /** Ekranın kendi kenar işleyicisi; işlemezse kabuğunki (← yan menü) çalışır */
  onEdge?: EdgeHandler
  /** Güvenli alan dolgusu (varsayılan true) */
  padded?: boolean
  className?: string
  children: ReactNode
}

export function TvScreen({
  id,
  title,
  defaultFocus,
  onEdge,
  padded = true,
  className,
  children,
}: TvScreenProps): ReactElement {
  const engine = useFocusEngine()
  const shellEdge = useContext(EdgeCtx)
  const scopeId = screenScopeId(id)

  useLayoutEffect(() => {
    engine.setScreen(scopeId)
    // Açılır pencere ya da yan menü odaktaysa dokunma; değilse ekrana gir.
    if (!engine.isWithin(scopeId)) engine.focusScope(scopeId, 'auto')
    return () => {
      if (engine.screen() === scopeId) engine.setScreen(null)
    }
  }, [engine, scopeId])

  const cls = ['tv-screen', padded ? 'tv-screen--padded' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <FocusScope
      id={scopeId}
      trap
      defaultFocus={defaultFocus}
      onEdge={(dir) => onEdge?.(dir) === true || shellEdge?.(dir) === true}
    >
      <section className={cls} aria-label={title} data-screen={id}>
        {children}
      </section>
    </FocusScope>
  )
}
