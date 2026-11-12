// Test host'u: DOM yerine düz JS nesnelerine "çizen" bir host config.
// Uzlaştırıcı (reconciler) platformu bilmez; yalnızca bu yöntemleri çağırır. Aynı fikir:
//   packages/react-reconciler/README.md ("An (Incomplete!) Reference" bölümü)
//   packages/react-noop-renderer/src/createReactNoop.js (React'in kendi test renderer'ı)
// Her değişiklik `ops` günlüğüne yazılır; testler "ne kadar az iş yapıldı" sorusunu buradan yanıtlar.

/** Kök kapsayıcı (react-dom'da document içindeki bir <div id="root">). */
export function createContainer() {
  return { type: 'KÖK', props: {}, children: [], parent: null }
}

/** Günlükte okunur ad: li#a, "Merhaba", KÖK */
export function etiket(node) {
  if (node == null) return 'null'
  if ('text' in node) return `"${node.text}"`
  return node.props && node.props.id ? `${node.type}#${node.props.id}` : node.type
}

function hostProps(props) {
  const out = {}
  for (const k of Object.keys(props)) if (k !== 'children') out[k] = props[k]
  return out
}

export function createTestHost() {
  const ops = []
  const kaydet = (op) => ops.push(op)

  const ayir = (child) => {
    if (!child.parent) return false
    const kardesler = child.parent.children
    kardesler.splice(kardesler.indexOf(child), 1)
    child.parent = null
    return true
  }
  // DOM kuralı: zaten bağlı bir düğümü yeniden eklemek onu taşır.
  const yerlestir = (parent, child, before) => {
    const bagliydi = ayir(child)
    const at = before ? parent.children.indexOf(before) : parent.children.length
    if (at < 0) throw new Error(`${etiket(before)} bu ebeveynin çocuğu değil`)
    parent.children.splice(at, 0, child)
    child.parent = parent
    return bagliydi ? 'taşı' : 'ekle'
  }

  const host = {
    ops,
    createInstance(type, props) {
      const node = { type, props: hostProps(props), children: [], parent: null }
      kaydet(`oluştur ${etiket(node)}`)
      return node
    },
    createTextInstance(text) {
      const node = { text: String(text), parent: null }
      kaydet(`oluştur ${etiket(node)}`)
      return node
    },
    // Ekran dışında (henüz görünmeyen) ağacı kurarken kullanılır.
    appendInitialChild(parent, child) {
      yerlestir(parent, child, null)
      kaydet(`ilk-ekle ${etiket(child)} -> ${etiket(parent)}`)
    },
    appendChild(parent, child) {
      kaydet(`${yerlestir(parent, child, null)} ${etiket(child)} -> ${etiket(parent)}`)
    },
    insertBefore(parent, child, before) {
      kaydet(`${yerlestir(parent, child, before)} ${etiket(child)} -> ${etiket(parent)} (önüne: ${etiket(before)})`)
    },
    removeChild(parent, child) {
      ayir(child)
      kaydet(`sil ${etiket(child)}`)
    },
    commitUpdate(instance, type, oldProps, newProps) {
      instance.props = hostProps(newProps)
      kaydet(`güncelle ${etiket(instance)}`)
    },
    commitTextUpdate(textInstance, oldText, newText) {
      textInstance.text = String(newText)
      kaydet(`metin "${oldText}" -> "${newText}"`)
    },
  }
  // react-dom'da kapsayıcı (container) ayrı yöntemlerle ele alınır; burada aynı davranış yeterli.
  host.appendChildToContainer = host.appendChild
  host.insertInContainerBefore = host.insertBefore
  host.removeChildFromContainer = host.removeChild
  return host
}

/** Ağacı okunur HTML benzeri dizeye çevirir (on* olay props'ları gösterilmez). */
export function serialize(node) {
  if ('text' in node) return node.text
  const ic = node.children.map(serialize).join('')
  if (node.type === 'KÖK') return ic
  const attrs = Object.keys(node.props)
    .filter((k) => !k.startsWith('on'))
    .sort()
    .map((k) => ` ${k}="${node.props[k]}"`)
    .join('')
  return `<${node.type}${attrs}>${ic}</${node.type}>`
}

/** id'si verilen ilk host düğümünü bulur. */
export function bul(node, id) {
  if (node.props && node.props.id === id) return node
  for (const c of node.children || []) {
    const r = bul(c, id)
    if (r) return r
  }
  return null
}

/** Basit olay tetikleyici: props.onClick gibi işleyiciyi çağırır (react-dom'un olay sistemi yok). */
export function tetikle(node, olay, ...args) {
  const ad = 'on' + olay[0].toUpperCase() + olay.slice(1)
  const fn = node.props[ad]
  if (typeof fn !== 'function') throw new Error(`${etiket(node)} üzerinde ${ad} yok`)
  return fn(...args)
}
