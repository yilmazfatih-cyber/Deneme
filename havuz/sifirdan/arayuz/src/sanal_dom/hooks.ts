// Kancalar: işlev bileşenine durum ve yaşam döngüsü kazandırır. Her kanca, bileşen örneğinin kanca dizisinde
// çağrı sırasına göre bir yuva kullanır; bu yüzden kancalar her çizimde aynı sırayla ve koşulsuz çağrılmalıdır
// (instance.ts bu kuralı denetler ve çiğnenirse açıklayıcı hata atar).
// Genişletme: yeni kanca = `nextHook('tür', kur)` + gerekiyorsa instance.ts'teki `Hook` birleşimine bir üye.
import { nextHook } from './instance.ts'
import { scheduleUpdate } from './scheduler.ts'
import { Fragment, h, type Child, type Component } from './vnode.ts'

type SetState<T> = (next: T | ((previous: T) => T)) => void

export function useState<T>(initial: T | (() => T)): [T, SetState<T>] {
  const [, hook] = nextHook('state', (instance) => {
    const slot: { kind: 'state'; value: unknown; set: (next: unknown) => void } = {
      kind: 'state',
      value: typeof initial === 'function' ? (initial as () => T)() : initial,
      set: (next: unknown) => {
        const value = typeof next === 'function' ? (next as (previous: unknown) => unknown)(slot.value) : next
        if (Object.is(value, slot.value)) return
        slot.value = value
        scheduleUpdate(instance)
      },
    }
    return slot
  })
  return [hook.value as T, hook.set as SetState<T>]
}

export function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void] {
  const [state, setState] = useState(initial)
  const latest = useRef(reducer)
  latest.current = reducer
  const dispatch = useRef((action: A) => setState((previous) => latest.current(previous, action)))
  return [state, dispatch.current]
}

function depsChanged(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined): boolean {
  if (!previous || !next || previous.length !== next.length) return true
  return next.some((value, i) => !Object.is(value, previous[i]))
}

/**
 * Çizim DOM'a yansıdıktan sonra çalışır. `deps` verilmezse her çizimden sonra, `[]` ise yalnız ilk çizimden
 * sonra, `[a, b]` ise a ya da b değiştiğinde. Döndürülen işlev bir sonraki çalışmadan ya da sökülmeden önce çağrılır.
 */
export function useEffect(run: () => void | (() => void), deps?: readonly unknown[]): void {
  const [instance, hook, isNew] = nextHook('effect', () => ({
    kind: 'effect',
    deps: undefined,
    run: undefined,
    cleanup: undefined,
  }))
  if (!isNew && deps !== undefined && !depsChanged(hook.deps, deps)) return
  hook.deps = deps
  hook.run = run
  instance.pendingEffects.push(hook)
}

export function useMemo<T>(compute: () => T, deps: readonly unknown[]): T {
  const [, hook, isNew] = nextHook('memo', () => ({ kind: 'memo', deps, value: compute() }))
  if (!isNew && depsChanged(hook.deps, deps)) {
    hook.deps = deps
    hook.value = compute()
  }
  return hook.value as T
}

export function useCallback<F extends (...args: never[]) => unknown>(fn: F, deps: readonly unknown[]): F {
  return useMemo(() => fn, deps)
}

/** Çizimler arasında kalıcı, değişince yeniden çizim tetiklemeyen kutu. DOM ref'i olarak da kullanılır. */
export function useRef<T>(initial: T): { current: T } {
  const [, hook] = nextHook('ref', () => ({ kind: 'ref', ref: { current: initial } }))
  return hook.ref as { current: T }
}

export interface Context<T> {
  readonly Provider: Component<{ value: T; children?: Child }>
  readonly defaultValue: T
}

export function createContext<T>(defaultValue: T): Context<T> {
  const Provider: Component<{ value: T; children?: Child }> = (props) => h(Fragment, null, props.children)
  return { Provider, defaultValue }
}

/** En yakın üst Provider'ın değerini verir; yoksa varsayılanı. Provider yeniden çizilince alt ağaç da çizilir. */
export function useContext<T>(context: Context<T>): T {
  const [instance] = nextHook('context', () => ({ kind: 'context' }))
  for (let p = instance.parent; p; p = p.parent) {
    if (p.vnode.type === context.Provider) return p.vnode.props.value as T
  }
  return context.defaultValue
}

/** Bu bileşeni hata sınırı yapar: alt ağaçta çizim ya da etki sırasında atılan hatalar `handler`'a gelir. */
export function useErrorHandler(handler: (error: unknown) => void): void {
  const [instance] = nextHook('ref', () => ({ kind: 'ref', ref: { current: undefined } }))
  instance.onError = handler
}
