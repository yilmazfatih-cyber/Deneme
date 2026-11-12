// Aşama 1'in temeli: eleman (element) nesneleri.
// JSX yalnızca bir sözdizimidir: <li id="a">Elma</li>  →  createElement('li', { id: 'a' }, 'Elma')
// Gerçek karşılığı: packages/react/src/jsx/ReactJSXElement.js (createElement, jsxProd, ReactElement)

/** Eleman nesnelerini işaretleyen sembol (React'te Symbol.for('react.transitional.element')). */
export const ELEMAN = Symbol.for('mini.react.eleman')

/** Metin düğümleri için özel tür. React metni dize olarak tutar; mini, düzenli olsun diye sarmalar. */
export const METIN = 'METIN'

/**
 * Bir eleman oluşturur. `key` props'a girmez, elemanın kimliğidir.
 * @param {string | Function} type  'div' gibi host türü ya da fonksiyon bileşen
 * @param {Record<string, unknown> | null} config
 * @param {...unknown} children
 */
export function createElement(type, config, ...children) {
  const props = {}
  let key = null
  if (config != null) {
    for (const ad of Object.keys(config)) {
      if (ad === 'key') key = config.key == null ? null : String(config.key)
      else props[ad] = config[ad]
    }
  }
  props.children = normalizeChildren(children)
  return { $$typeof: ELEMAN, type, key, props }
}

/** Kısa ad: testlerde h('ul', null, ...) yazmak JSX'e en yakın okunuştur. */
export const h = createElement

/** Birden çok çocuğu sarmalayıcı düğüm olmadan döndüren bileşen (React.Fragment'in mini hâli). */
export function Fragment(props) {
  return props.children
}

/**
 * Çocuk listesini düzleştirir; null/undefined/boolean atılır, dize ve sayılar METIN elemanına dönüşür.
 * Gerçek React iç içe dizileri düzleştirmez, her diziyi ayrı bir "fragment" fiber'ı gibi ele alır.
 * @returns {Array<{type: unknown, key: string | null, props: Record<string, any>}>}
 */
export function normalizeChildren(list) {
  const out = []
  const ekle = (c) => {
    if (c == null || typeof c === 'boolean') return
    if (Array.isArray(c)) {
      c.forEach(ekle)
      return
    }
    if (typeof c === 'string' || typeof c === 'number') {
      out.push({ $$typeof: ELEMAN, type: METIN, key: null, props: { nodeValue: String(c), children: [] } })
      return
    }
    out.push(c)
  }
  ekle(list)
  return out
}

/** children dışındaki props'ları sığ karşılaştırır (host düğümünü güncellemek gerekir mi?). */
export function shallowEqualProps(a, b) {
  const ka = Object.keys(a).filter((k) => k !== 'children')
  const kb = Object.keys(b).filter((k) => k !== 'children')
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.is(a[k], b[k]))
}
