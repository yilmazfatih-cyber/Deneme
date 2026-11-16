// depo — öngörülebilir durum deposu: indirgeyici, ara katman, ezberlemeli seçici, değişmezlik yardımcıları,
// produce (taslakla güncelleme), geri al/yinele + zaman yolculuğu, kalıcılık (sürüm göçü), sekmeler arası eşitleme.
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça ayrı dosyada yazılıp buradan dışa aktarılır.
export {
  createStore,
  combineReducers,
  replaceable,
  isAction,
  INIT_ACTION,
  REPLACE_STATE,
  type Action,
  type Dispatch,
  type Middleware,
  type MiddlewareApi,
  type Reducer,
  type Store,
  type StoreOptions,
} from './store.ts'
export { thunk, logger } from './middleware.ts'
export { createSelector, type Selector } from './selector.ts'
export { getIn, setIn, updateIn, removeIn, deepFreeze, type Path } from './immutable.ts'
export { produce } from './produce.ts'
export {
  undoable,
  undo,
  redo,
  jumpTo,
  clearHistory,
  timeline,
  UNDO,
  REDO,
  JUMP,
  CLEAR_HISTORY,
  type UndoState,
  type UndoOptions,
} from './undo.ts'
export {
  loadPersisted,
  persist,
  type LoadResult,
  type PersistController,
  type PersistOptions,
  type StorageLike,
} from './persist.ts'
export { createTabSync, type ChannelLike, type SyncOptions, type TabSync } from './sync.ts'
