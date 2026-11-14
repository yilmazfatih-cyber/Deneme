/**
 * Odak motorunun React katmanı: FocusRoot, FocusScope, useFocusable ve yardımcı kancalar.
 *
 *   <FocusRoot>                                   // klavye dinleyicisini kurar, motoru bağlama koyar
 *     <FocusScope id="satir-1" orientation="horizontal">
 *       <Kart />                                  // const { ref, focused } = useFocusable({ onEnter })
 *     </FocusScope>
 *   </FocusRoot>
 *
 * Kayıtlar useLayoutEffect içinde yapılır: aynı işleme (commit) içinde kalkan ve gelen düğümler birlikte görülür,
 * onarım hemen ardından (mikro görevde) çalışır.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { RemoteKey } from '../../../../shared/devices'
import { focusManager, ROOT_SCOPE, type FocusEngine, type KeyInterceptor, type Orientation } from './engine'
import type { Direction, Rect } from './geometry'
import { installKeyListener } from './keys'

interface FocusCtx {
  engine: FocusEngine
  scopeId: string
}

const Ctx = createContext<FocusCtx>({ engine: focusManager, scopeId: ROOT_SCOPE })

/** Motor ve içinde bulunulan kapsam. */
export function useFocusContext(): FocusCtx {
  return useContext(Ctx)
}

export function useFocusEngine(): FocusEngine {
  return useContext(Ctx).engine
}

export interface FocusRootProps {
  /** Varsayılan: uygulamanın tek `focusManager`'ı */
  engine?: FocusEngine
  /** Pencereye keydown dinleyicisi kur (varsayılan true) */
  keyboard?: boolean
  /** true dönerken fiziksel tuşlar işlenmez (TV oynatıcısı tuşları kendisi dinlerken) */
  keyboardSuspended?: () => boolean
  children: ReactNode
}

export function FocusRoot({
  engine = focusManager,
  keyboard = true,
  keyboardSuspended,
  children,
}: FocusRootProps): ReactElement {
  const suspendedRef = useRef(keyboardSuspended)
  suspendedRef.current = keyboardSuspended
  useEffect(() => {
    if (!keyboard) return
    return installKeyListener(
      (key) => engine.dispatchKey(key),
      window,
      () => suspendedRef.current?.() === true,
    )
  }, [engine, keyboard])
  const value = useMemo(() => ({ engine, scopeId: ROOT_SCOPE }), [engine])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export interface FocusScopeProps {
  /** Sabit kimlik verilirse hafıza yeniden bağlanmada korunur (satırlar için önerilir) */
  id?: string
  trap?: boolean
  restore?: boolean
  modal?: boolean
  orientation?: Orientation
  /** Kapsama girilince (hafıza yoksa) odaklanacak düğüm */
  defaultFocus?: string
  onEdge?: (dir: Direction) => boolean | void
  children: ReactNode
}

export function FocusScope({
  id,
  trap,
  restore,
  modal,
  orientation,
  defaultFocus,
  onEdge,
  children,
}: FocusScopeProps): ReactElement {
  const parent = useContext(Ctx)
  const auto = useId()
  const scopeId = id ?? `kapsam${auto}`
  const edgeRef = useRef(onEdge)
  edgeRef.current = onEdge

  useLayoutEffect(
    () =>
      parent.engine.registerScope({
        id: scopeId,
        parentId: parent.scopeId,
        trap,
        restore,
        modal,
        orientation,
        defaultFocusId: defaultFocus,
        onEdge: (dir) => edgeRef.current?.(dir),
      }),
    [parent.engine, parent.scopeId, scopeId],
  )
  useLayoutEffect(() => {
    parent.engine.updateScope(scopeId, { trap, restore, modal, orientation, defaultFocusId: defaultFocus })
  }, [parent.engine, scopeId, trap, restore, modal, orientation, defaultFocus])

  const value = useMemo(() => ({ engine: parent.engine, scopeId }), [parent.engine, scopeId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export interface UseFocusableOptions {
  /** Sabit kimlik (focusManager.focus(id), varsayılan odak ve hafıza için); verilmezse üretilir */
  id?: string
  onEnter?: () => void
  onFocus?: () => void
  onBlur?: () => void
  /** Yön tuşu önce buraya sorulur; true → tüketildi (ör. kaydırıcı ←/→ ile değer değiştirir) */
  onArrow?: (dir: Direction) => boolean | void
  disabled?: boolean
  /** Odak boşken ya da kendiliğinden kurulmuşken bu öğe odağı alır */
  autoFocus?: boolean
}

export interface Focusable<E extends HTMLElement> {
  /** Odaklanabilir elemana verilecek ref */
  ref: (el: E | null) => void
  focused: boolean
  /** Bu öğeyi odaklar */
  focusSelf: () => void
  id: string
}

/** CSS uzunluğu ('12rem', '-340px') → px */
function lengthPx(v: string | undefined): number {
  if (!v) return 0
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return 0
  if (v.endsWith('rem')) return n * parseFloat(getComputedStyle(document.documentElement).fontSize)
  return n
}

/**
 * Elemanın "yerleşmiş" dikdörtgeni: kayan izler (satır, satır yığını) geçiş animasyonu sürerken bile animasyonun
 * varacağı konum kullanılır. İz elemanı `data-focus-track` ve hedef ötelemesini `data-track-x` / `data-track-y`
 * (rem ya da px) taşır; anlık öteleme hesaplanmış transform matrisinden okunur, fark eklenir.
 */
export function settledRect(el: HTMLElement | null): Rect | null {
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (!(r.width > 0 && r.height > 0)) return null
  let dx = 0
  let dy = 0
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (a.dataset.focusTrack === undefined) continue
    const t = getComputedStyle(a).transform
    const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : null
    dx += lengthPx(a.dataset.trackX) - (m?.m41 ?? 0)
    dy += lengthPx(a.dataset.trackY) - (m?.m42 ?? 0)
  }
  return { left: r.left + dx, top: r.top + dy, width: r.width, height: r.height }
}

/**
 * Odaklanabilir öğe. Fareyle tıklamak öğeyi odaklar ve onEnter'ı çağırır; üzerine gelmek odağı taşımaz.
 * Odaktaki elemanın `data-focused="true"` özniteliği motor tarafından yazılır.
 */
export function useFocusable<E extends HTMLElement = HTMLDivElement>(opts: UseFocusableOptions = {}): Focusable<E> {
  const { engine, scopeId } = useContext(Ctx)
  const auto = useId()
  const id = opts.id ?? `odak${auto}`
  const optsRef = useRef(opts)
  optsRef.current = opts
  const elRef = useRef<E | null>(null)
  const [focused, setFocused] = useState(() => engine.current() === id)
  const clickRef = useRef<((e: MouseEvent) => void) | null>(null)

  useLayoutEffect(
    () =>
      engine.registerNode({
        id,
        scopeId,
        element: elRef.current,
        disabled: optsRef.current.disabled,
        autoFocus: optsRef.current.autoFocus,
        getRect: () => settledRect(elRef.current),
        onEnter: () => optsRef.current.onEnter?.(),
        onFocus: () => optsRef.current.onFocus?.(),
        onBlur: () => optsRef.current.onBlur?.(),
        onArrow: (dir) => optsRef.current.onArrow?.(dir),
        onFocusedChange: setFocused,
      }),
    [engine, scopeId, id],
  )
  useLayoutEffect(() => {
    engine.updateNode(id, { disabled: !!opts.disabled })
  }, [engine, id, opts.disabled])

  const ref = useCallback(
    (el: E | null) => {
      const prev = elRef.current
      if (prev && clickRef.current) prev.removeEventListener('click', clickRef.current)
      elRef.current = el
      if (el) {
        const onClick = (e: MouseEvent): void => {
          e.preventDefault()
          engine.click(id)
        }
        clickRef.current = onClick
        el.addEventListener('click', onClick)
        if (!el.hasAttribute('tabindex')) el.tabIndex = -1
      }
      engine.updateNode(id, { element: el })
    },
    [engine, id],
  )

  const focusSelf = useCallback(() => {
    engine.focus(id, 'user')
  }, [engine, id])

  return { ref, focused, focusSelf, id }
}

/** Odaktaki düğümün kimliği (değişince yeniden çizer). */
export function useFocusedId(): string | null {
  const engine = useFocusEngine()
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => engine.current(),
    () => null,
  )
}

/** Odak bu kapsamın içinde mi (yan menü açık mı gibi)? */
export function useFocusWithin(scopeId: string): boolean {
  const engine = useFocusEngine()
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => engine.isWithin(scopeId),
    () => false,
  )
}

/**
 * Tuş kesici: etkinken her RemoteKey önce buraya sorulur (öncelik büyük olan önce). true → tüketildi.
 * Oynatıcı ve canlı ekranlar yön tuşlarını kendileri işlemek için yüksek öncelikle kaydolur.
 */
export function useKeyInterceptor(fn: KeyInterceptor, priority = 0, enabled = true): void {
  const engine = useFocusEngine()
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    if (!enabled) return
    return engine.addInterceptor((key: RemoteKey) => fnRef.current(key), priority)
  }, [engine, priority, enabled])
}
