// Test nodeOps: DOM yerine düz nesne ağacı. Günlüğe (ops) yalnızca GÖRÜNÜR değişiklikler yazılır:
// henüz bağlanmamış (ekran dışı) düğümlerdeki prop/metin ayarları sayılmaz, "oluştur" her zaman yazılır.
// Vue'nun kendi test renderer'ının fikri:
//   packages/runtime-test/src/nodeOps.ts, serialize.ts, triggerEvent.ts
// Renderer (Aşama 2) platformu bilmez; tarayıcıda bunun yerine runtime-dom/src/nodeOps.ts kullanılır.

export function createNodeOps() {
  const ops = []
  const etiket = (n) => {
    if (n == null) return 'null'
    if (n.tur === 'metin') return `"${n.metin}"`
    if (n.tur === 'yorum') return `<!--${n.metin}-->`
    return n.props.id ? `${n.tag}#${n.props.id}` : n.tag
  }
  const bagli = (n) => {
    for (let p = n; p; p = p.parent) if (p.kok) return true
    return false
  }
  const ayir = (child) => {
    if (!child.parent) return false
    const k = child.parent.children
    k.splice(k.indexOf(child), 1)
    child.parent = null
    return true
  }

  const nodeOps = {
    ops,
    etiket,
    createElement(tag) {
      const el = { tur: 'eleman', tag, props: {}, olaylar: {}, children: [], parent: null }
      ops.push(`oluştur ${tag}`)
      return el
    },
    createText: (metin) => ({ tur: 'metin', metin, parent: null }),
    createComment: (metin) => ({ tur: 'yorum', metin, parent: null }),
    setText(node, metin) {
      if (bagli(node)) ops.push(`metin ${etiket(node)} -> "${metin}"`)
      node.metin = metin
    },
    setElementText(el, metin) {
      if (bagli(el)) ops.push(`eleman-metni ${etiket(el)} -> "${metin}"`)
      el.children.forEach((c) => (c.parent = null))
      el.children = metin ? [{ tur: 'metin', metin, parent: el }] : []
    },
    insert(child, parent, anchor = null) {
      const tasima = ayir(child)
      const at = anchor ? parent.children.indexOf(anchor) : parent.children.length
      if (at < 0) throw new Error('anchor bu ebeveynde değil')
      parent.children.splice(at, 0, child)
      child.parent = parent
      // Kurulum sırasında henüz bağlanmamış ebeveyne eklemeyi günlüğe yazmayız; görünür değişiklikler önemli.
      if (bagli(parent)) ops.push(`${tasima ? 'taşı' : 'ekle'} ${etiket(child)}`)
    },
    remove(child) {
      if (ayir(child)) ops.push(`sil ${etiket(child)}`)
    },
    patchProp(el, key, onceki, sonraki) {
      if (/^on[A-Z]/.test(key)) {
        // Vue'daki "invoker" fikri: dinleyiciyi söküp takmak yerine yalnızca içindeki fonksiyonu değiştir.
        const ad = key.slice(2).toLowerCase()
        if (sonraki == null) delete el.olaylar[ad]
        else el.olaylar[ad] = sonraki
        return
      }
      if (bagli(el)) ops.push(`prop ${etiket(el)} ${key}=${sonraki}`)
      if (sonraki == null) delete el.props[key]
      else el.props[key] = sonraki
    },
    parentNode: (n) => n.parent,
    nextSibling(n) {
      if (!n.parent) return null
      const k = n.parent.children
      return k[k.indexOf(n) + 1] || null
    },
  }
  return nodeOps
}

/** Kök kapsayıcı (tarayıcıda #app). */
export function createRoot() {
  return { tur: 'eleman', tag: 'KÖK', kok: true, props: {}, olaylar: {}, children: [], parent: null }
}

export function serialize(n) {
  if (n.tur === 'metin') return n.metin
  if (n.tur === 'yorum') return `<!--${n.metin}-->`
  const ic = n.children.map(serialize).join('')
  if (n.kok) return ic
  const attrs = Object.keys(n.props)
    .sort()
    .map((k) => ` ${k}="${n.props[k]}"`)
    .join('')
  return `<${n.tag}${attrs}>${ic}</${n.tag}>`
}

export function bul(n, id) {
  if (n.tur === 'eleman' && n.props.id === id) return n
  for (const c of n.children || []) {
    const r = bul(c, id)
    if (r) return r
  }
  return null
}

/** Olay tetikle (runtime-test/src/triggerEvent.ts gibi). */
export function tetikle(el, olay, ...args) {
  const fn = el.olaylar[olay]
  if (!fn) throw new Error(`${olay} dinleyicisi yok`)
  return fn(...args)
}
