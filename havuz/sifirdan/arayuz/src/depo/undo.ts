// Geri al / yinele ve zaman yolculuğu: herhangi bir indirgeyiciyi sarar; durumu { past, present, future }
// üçlüsünde tutar. Her kayda değer eylem `present`'ı geçmişe iter. Gruplama: aynı gruptan art arda gelen
// eylemler (ör. aynı alana yazılan harfler) tek adım sayılır. Zaman çizelgesi = [...past, present, ...future].
// Genişletme: geçmişi diske yazmak için `persist`'e yalnız `present`'ı seçen bir `select` verin.
import type { Action, Reducer } from './store.ts'

export interface UndoState<S> {
  past: S[]
  present: S
  future: S[]
  /** Son kaydedilen eylemin grubu (gruplama için). */
  group: string | undefined
}

export const UNDO = '@@depo/GERI_AL'
export const REDO = '@@depo/YINELE'
export const JUMP = '@@depo/ZAMAN_YOLCULUGU'
export const CLEAR_HISTORY = '@@depo/GECMISI_TEMIZLE'

export const undo = (): Action => ({ type: UNDO })
export const redo = (): Action => ({ type: REDO })
/** Zaman çizelgesinde mutlak konuma git (0 = en eski). */
export const jumpTo = (index: number): Action => ({ type: JUMP, payload: index })
export const clearHistory = (): Action => ({ type: CLEAR_HISTORY })

export interface UndoOptions {
  /** Geçmişte tutulacak en çok adım (varsayılan 100). */
  limit?: number
  /** false dönerse eylem durumu değiştirir ama geçmişe adım eklemez. */
  filter?: (action: Action) => boolean
  /** Aynı grup anahtarı art arda gelirse adımlar birleşir. */
  groupBy?: (action: Action) => string | undefined
}

export function timeline<S>(state: UndoState<S>): { states: S[]; index: number } {
  return { states: [...state.past, state.present, ...state.future], index: state.past.length }
}

function travel<S>(state: UndoState<S>, target: number): UndoState<S> {
  const { states, index } = timeline(state)
  const clamped = Math.max(0, Math.min(states.length - 1, target))
  if (clamped === index) return state
  return {
    past: states.slice(0, clamped),
    present: states[clamped] as S,
    future: states.slice(clamped + 1),
    group: undefined,
  }
}

export function undoable<S, A extends Action>(
  reducer: Reducer<S, A>,
  options: UndoOptions = {},
): Reducer<UndoState<S>, A> {
  const limit = options.limit ?? 100
  return (state, action) => {
    if (state === undefined) {
      return { past: [], present: reducer(undefined, action), future: [], group: undefined }
    }
    switch (action.type) {
      case UNDO:
        return travel(state, state.past.length - 1)
      case REDO:
        return travel(state, state.past.length + 1)
      case JUMP:
        return travel(state, Number(action.payload))
      case CLEAR_HISTORY:
        return { past: [], present: state.present, future: [], group: undefined }
    }
    const present = reducer(state.present, action)
    if (Object.is(present, state.present)) return state
    if (options.filter && !options.filter(action)) return { ...state, present }
    const group = options.groupBy?.(action)
    if (group !== undefined && group === state.group && state.future.length === 0) {
      return { ...state, present }
    }
    return { past: [...state.past, state.present].slice(-limit), present, future: [], group }
  }
}
