// sanal_dom — küçük bir React benzeri: h()/JSX, fark alma (anahtarlı), işlev bileşenleri, kancalar,
// olay yetkilendirme, toplu güncelleme ve hata sınırı. Dışarıya açılan tek giriş noktası budur.
// Ayrıntılı anlatım ve kanca kuralları: README.md.
// Genişletme: yeni bir kanca ya da bileşen ayrı dosyada yazılıp buradan dışa aktarılır.
export { h, Fragment, isVNode, type Child, type Component, type Key, type VNode } from './vnode.ts'
export { render, unmountRoot } from './render.ts'
export { flush, MAX_RENDER_ROUNDS } from './scheduler.ts'
export {
  useState,
  useReducer,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  createContext,
  useContext,
  useErrorHandler,
  type Context,
} from './hooks.ts'
export { ErrorBoundary, type ErrorBoundaryProps } from './boundary.ts'
export { domStats, resetDomStats } from './mounted.ts'
export { isUnsafeUrl } from './props.ts'
