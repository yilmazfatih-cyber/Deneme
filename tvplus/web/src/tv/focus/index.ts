/**
 * TV odak motoru (uzamsal gezinme) — dışa açılan yüzey.
 *
 *   focusManager            uygulamanın tek motoru: focus(id), focusScope(id), current(), dispatchKey(key), …
 *   FocusRoot / FocusScope  sağlayıcı ve kapsam (satır, ızgara, yan menü, iletişim kutusu)
 *   useFocusable            odaklanabilir öğe → { ref, focused, focusSelf, id }
 *   useKeyInterceptor       öncelikli tuş kesici (oynatıcı, canlı TV, iletişim kutusu)
 *   useFocusedId / useFocusWithin   odak durumuna abonelik
 *   pickNext                saf yön seçimi (testli)
 *   remoteKeyFromKeyboard   klavye / TV kumandası tuşu → RemoteKey
 */
export {
  FocusEngine,
  focusManager,
  ROOT_SCOPE,
  type FocusEngineOptions,
  type FocusNodeConfig,
  type FocusReason,
  type FocusScopeConfig,
  type KeyInterceptor,
  type Orientation,
} from './engine'
export {
  inDirection,
  isUsableRect,
  pickNearest,
  pickNext,
  unionRect,
  type Candidate,
  type Direction,
  type Rect,
} from './geometry'
export {
  digitOf,
  directionOf,
  installKeyListener,
  KEY_TABLE,
  KEYCODE_TABLE,
  remoteKeyFromKeyboard,
  type KeyLike,
} from './keys'
export {
  settledRect,
  FocusRoot,
  FocusScope,
  useFocusable,
  useFocusContext,
  useFocusedId,
  useFocusEngine,
  useFocusWithin,
  useKeyInterceptor,
  type Focusable,
  type FocusRootProps,
  type FocusScopeProps,
  type UseFocusableOptions,
} from './react'
