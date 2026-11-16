// Olay yetkilendirme: her olay türü için köke tek bir dinleyici bağlanır; tıklanan düğümden köke doğru
// yürünerek düğümlerde saklanan işleyiciler çağrılır. Çizimde işleyici değişse bile DOM'a dinleyici eklenip
// çıkarılmaz; yalnız düğümdeki işleyici tablosu güncellenir. `stopPropagation()` yürüyüşü durdurur.
// Kabarmayan (bubble etmeyen) olaylar (mouseenter, scroll…) doğrudan öğeye bağlanır.
// Genişletme: yeni bir ad eşlemesi gerekiyorsa `SPECIAL_NAMES` tablosuna ekleyin.
import type { Root } from './root.ts'

type Handler = (event: Event) => void
const HANDLERS = Symbol('sanal_dom.handlers')
const DIRECT_ATTACHED = Symbol('sanal_dom.direct')
type WithHandlers = Element & { [HANDLERS]?: Record<string, Handler>; [DIRECT_ATTACHED]?: Set<string> }

/** Kabarmayan olaylar: köke yetkilendirilemez, öğeye doğrudan bağlanır. */
const DIRECT_EVENTS = new Set([
  'mouseenter',
  'mouseleave',
  'pointerenter',
  'pointerleave',
  'scroll',
  'load',
  'error',
  'toggle',
])

/** React alışkanlığıyla gelen adlar: onFocus/onBlur kabaran focusin/focusout ile çalışır. */
const SPECIAL_NAMES: Record<string, string> = { doubleclick: 'dblclick', focus: 'focusin', blur: 'focusout' }

/**
 * Yalnız ASCII harfleri küçültür. Olay adları İngilizcedir: `toLocaleLowerCase('tr-TR')` "Input"u "ınput"
 * yapardı; düz `toLowerCase` ise lint kuralıyla yasak. Bu yüzden harf kodu üzerinden çeviriyoruz.
 */
export function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
}

export function isEventProp(name: string): boolean {
  return name.length > 2 && name.startsWith('on') && name.charCodeAt(2) >= 65 && name.charCodeAt(2) <= 90
}

/** `onClick` → `click`, `onKeyDown` → `keydown`, `onFocus` → `focusin`. */
export function eventTypeFromProp(name: string): string {
  const raw = asciiLower(name.slice(2))
  return SPECIAL_NAMES[raw] ?? raw
}

export function setHandler(dom: Element, type: string, handler: Handler | undefined, root: Root): void {
  const target = dom as WithHandlers
  const table = (target[HANDLERS] ??= {})
  if (handler) table[type] = handler
  else delete table[type]
  if (!handler) return
  if (DIRECT_EVENTS.has(type)) attachDirect(target, type)
  else attachToRoot(root, type)
}

function attachDirect(target: WithHandlers, type: string): void {
  const attached = (target[DIRECT_ATTACHED] ??= new Set())
  if (attached.has(type)) return
  attached.add(type)
  target.addEventListener(type, (event) => target[HANDLERS]?.[type]?.(event))
}

function attachToRoot(root: Root, type: string): void {
  if (root.listeners.has(type)) return
  const listener = (event: Event) => dispatch(event, root.container)
  root.container.addEventListener(type, listener)
  root.listeners.set(type, listener)
}

/** Hedeften köke yürür; işleyiciyi bulduğu her düğümde `currentTarget`'ı o düğüm yaparak çağırır. */
function dispatch(event: Event, container: Element): void {
  let node = event.target as Node | null
  while (node !== null && node !== container) {
    const handler = (node as WithHandlers)[HANDLERS]?.[event.type]
    if (handler) {
      Object.defineProperty(event, 'currentTarget', { configurable: true, value: node })
      handler(event)
      if (event.cancelBubble) return
    }
    node = node.parentNode
  }
}

export function detachRoot(root: Root): void {
  for (const [type, listener] of root.listeners) root.container.removeEventListener(type, listener)
  root.listeners.clear()
}
