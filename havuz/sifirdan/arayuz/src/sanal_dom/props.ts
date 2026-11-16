// Özellikleri DOM'a yansıtır: öznitelikler, `class`, `style` (dizgi ya da nesne), form değerleri (özellik
// olarak), olay işleyicileri (events.ts) ve güvenlik denetimi (`javascript:` adresleri engellenir).
// Yalnız değişen özellikler yazılır; `value`/`checked` ise kullanıcı DOM'u değiştirmiş olabileceği için
// her çizimde DOM'daki gerçek değerle karşılaştırılır (denetimli giriş alanı).
// Genişletme: özel davranış isteyen yeni bir özellik `setProp` içindeki `switch`'e bir dal olarak eklenir.
import { eventTypeFromProp, isEventProp, setHandler } from './events.ts'
import type { Root } from './root.ts'

type Props = Readonly<Record<string, unknown>>
const SKIP = new Set(['children', 'key', 'ref'])
const LIVE_PROPS = new Set(['value', 'checked', 'selected', 'indeterminate'])
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href'])

export function setProps(dom: Element, next: Props, prev: Props, svg: boolean, root: Root): void {
  for (const name of Object.keys(prev)) {
    if (!(name in next) && !SKIP.has(name)) setProp(dom, name, undefined, prev[name], svg, root)
  }
  for (const name of Object.keys(next)) {
    if (SKIP.has(name)) continue
    const value = next[name]
    if (value !== prev[name] || (!svg && LIVE_PROPS.has(name))) setProp(dom, name, value, prev[name], svg, root)
  }
}

/** `javascript:` ile başlayan adresler (boşluk/kontrol karakteri hilelerine karşı temizlenerek) reddedilir. */
export function isUnsafeUrl(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- tarayıcının yok saydığı kontrol karakterlerini biz de atıyoruz
  const cleaned = value.replace(/[\u0000- ]/g, '')
  return /^javascript:/i.test(cleaned)
}

function setProp(dom: Element, name: string, value: unknown, prev: unknown, svg: boolean, root: Root): void {
  if (isEventProp(name)) {
    setHandler(
      dom,
      eventTypeFromProp(name),
      typeof value === 'function' ? (value as (e: Event) => void) : undefined,
      root,
    )
    return
  }
  switch (name) {
    case 'style':
      setStyle(dom as HTMLElement, value, prev)
      return
    case 'className':
    case 'class':
      setAttr(dom, 'class', value)
      return
    case 'dangerouslySetInnerHTML':
      throw new Error('dangerouslySetInnerHTML desteklenmez: ham HTML yerine çocuk düğümler kullanın.')
  }
  if (!svg && LIVE_PROPS.has(name) && name in dom) {
    const target = dom as unknown as Record<string, unknown>
    const normalized = name === 'value' ? (value ?? '') : Boolean(value)
    if (target[name] !== normalized) target[name] = normalized
    return
  }
  if (URL_ATTRS.has(name) && typeof value === 'string' && isUnsafeUrl(value)) {
    dom.removeAttribute(name)
    return
  }
  setAttr(dom, name, value)
}

function setAttr(dom: Element, name: string, value: unknown): void {
  if (value === undefined || value === null || value === false) dom.removeAttribute(name)
  else if (value === true) dom.setAttribute(name, '')
  else dom.setAttribute(name, String(value as string | number))
}

function setStyle(dom: HTMLElement, value: unknown, prev: unknown): void {
  if (typeof value === 'string' || value === undefined || value === null) {
    dom.style.cssText = typeof value === 'string' ? value : ''
    return
  }
  const next = value as Record<string, string | number | null | undefined>
  const old = typeof prev === 'object' && prev !== null ? (prev as Record<string, unknown>) : {}
  if (typeof prev === 'string') dom.style.cssText = ''
  for (const key of Object.keys(old)) if (!(key in next)) writeStyle(dom, key, null)
  for (const key of Object.keys(next)) if (next[key] !== old[key]) writeStyle(dom, key, next[key])
}

function writeStyle(dom: HTMLElement, key: string, value: string | number | null | undefined): void {
  const text = value === null || value === undefined ? '' : String(value)
  if (key.includes('-')) dom.style.setProperty(key, text)
  else (dom.style as unknown as Record<string, string>)[key] = text
}

/** Ref: işlev ise çağrılır, `{ current }` nesnesi ise atanır. */
export function applyRef(ref: unknown, value: Element | null): void {
  if (typeof ref === 'function') (ref as (v: Element | null) => void)(value)
  else if (typeof ref === 'object' && ref !== null && 'current' in ref) (ref as { current: unknown }).current = value
}
