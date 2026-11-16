// `produce`: değişmez güncellemeyi "değiştirilebilir gibi" yazdırır (Immer fikri). Tarif işlevine bir taslak
// (Proxy) verilir; taslağa yazmak yalnız dokunulan dalların sığ kopyasını değiştirir. Sonunda değişmeyen dallar
// eski referansıyla, değişenler yeni nesneyle döner (yapısal paylaşım). Taslaklar iş bitince iptal edilir
// (dışarı sızan taslağa erişim hata verir).
//   const next = produce(state, (d) => { d.gorevler[2].bitti = true })
// Genişletme: Map/Set taslakları için `isDraftable` ve `createDraft`'a dal ekleyin.

const DRAFT = Symbol('depo.taslak')

interface DraftState {
  base: object
  copy: Record<PropertyKey, unknown>
  parent: DraftState | undefined
  modified: boolean
}

function isDraftable(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return true
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

function draftState(value: unknown): DraftState | undefined {
  return typeof value === 'object' && value !== null
    ? ((value as Record<PropertyKey, unknown>)[DRAFT] as DraftState | undefined)
    : undefined
}

function markModified(state: DraftState): void {
  for (let s: DraftState | undefined = state; s && !s.modified; s = s.parent) s.modified = true
}

export function produce<T>(base: T, recipe: (draft: T) => T | void): T {
  if (!isDraftable(base)) {
    const replaced = recipe(base)
    return replaced === undefined ? base : replaced
  }
  const revokers: (() => void)[] = []

  const createDraft = (value: object, parent: DraftState | undefined): object => {
    const copy = (Array.isArray(value) ? value.slice() : { ...value }) as Record<PropertyKey, unknown>
    const state: DraftState = { base: value, copy, parent, modified: false }
    const { proxy, revoke } = Proxy.revocable(copy, {
      get(target, prop, receiver) {
        if (prop === DRAFT) return state
        const current = Reflect.get(target, prop, receiver) as unknown
        if (!Object.prototype.hasOwnProperty.call(target, prop) || !isDraftable(current)) return current
        if (current !== (state.base as Record<PropertyKey, unknown>)[prop]) return current
        const child = createDraft(current, state)
        target[prop] = child
        return child
      },
      set(target, prop, value) {
        if (Object.prototype.hasOwnProperty.call(target, prop) && Object.is(target[prop], value)) return true
        target[prop] = value
        markModified(state)
        return true
      },
      deleteProperty(target, prop) {
        if (!Object.prototype.hasOwnProperty.call(target, prop)) return true
        delete target[prop]
        markModified(state)
        return true
      },
    })
    revokers.push(revoke)
    return proxy
  }

  const finalize = (value: unknown): unknown => {
    const state = draftState(value)
    if (!state) return value
    if (!state.modified) return state.base
    for (const key of Object.keys(state.copy)) state.copy[key] = finalize(state.copy[key])
    return state.copy
  }

  const root = createDraft(base, undefined)
  try {
    const returned = recipe(root as T)
    const rootState = draftState(root) as DraftState
    if (returned !== undefined && returned !== root) {
      if (rootState.modified)
        throw new Error('produce: hem taslağı değiştirdiniz hem yeni değer döndürdünüz; birini seçin.')
      return returned
    }
    return finalize(root) as T
  } finally {
    for (const revoke of revokers) revoke()
  }
}
