// AŞAMA 2 — VNode ve patch: sanal düğüm ağacını platform işlemleriyle (nodeOps) gerçek ağaca uygulamak.
// En ilginç kısım anahtarlı çocuk karşılaştırması (patchKeyedChildren): baştan ve sondan eşleşenleri atla,
// ortadaki "bilinmeyen" bölümde yerinde kalabilecek en uzun düğüm dizisini (LIS) bul, yalnızca geri kalanı taşı.
// Gerçek karşılıklar (packages/runtime-core/src/):
//   vnode.ts (createVNode, isSameVNodeType, normalizeVNode)   h.ts
//   renderer.ts → createRenderer/baseCreateRenderer, patch, mountElement, patchElement, patchChildren,
//                 patchKeyedChildren (adımlar 1–5), move, unmount, getNextHostNode, getSequence (LIS)
//   packages/runtime-dom/src/nodeOps.ts + patchProp.ts (tarayıcı), packages/runtime-test/src/nodeOps.ts (test)

export const Text = Symbol('Text')
export const Comment = Symbol('Comment')

// Derleyicinin çalışma zamanına ipuçları (packages/shared/src/patchFlags.ts ile aynı bitler).
export const PatchFlags = { TEXT: 1, CLASS: 2, PROPS: 8 }

/**
 * VNode oluşturur. children: dize (metin çocuğu), dizi ya da null.
 * @param {string | symbol | object} type
 * @param {Record<string, any> | null} [props]
 * @param {string | Array<any> | null} [children]
 * @param {number} [patchFlag]  derleyiciden gelir; 0 = tam karşılaştırma
 * @param {string[] | null} [dynamicProps]  PROPS bayrağında hangi props'ların değişebileceği
 */
export function h(type, props = null, children = null, patchFlag = 0, dynamicProps = null) {
  let cocuklar = children
  if (Array.isArray(children)) cocuklar = children.map(normalizeVNode)
  else if (typeof children === 'number') cocuklar = String(children)
  return {
    __v_isVNode: true,
    type,
    props,
    children: cocuklar,
    key: props && props.key != null ? props.key : null,
    patchFlag,
    dynamicProps,
    el: null, // bağlandığı host düğümü
    component: null, // bileşen vnode'u ise örneği (Aşama 4)
  }
}

export function normalizeVNode(c) {
  if (c == null || typeof c === 'boolean') return h(Comment, null, '')
  if (typeof c === 'string' || typeof c === 'number') return h(Text, null, String(c))
  return c
}

export const createCommentVNode = (metin = '') => h(Comment, null, metin)

/** İki vnode "aynı düğüm" mü? Tür ve key aynıysa yamalanır, değilse yeniden kurulur. */
export const isSameVNodeType = (a, b) => a.type === b.type && a.key === b.key

/**
 * @param {object} nodeOps  createElement, createText, createComment, setText, setElementText, insert, remove,
 *                          patchProp, parentNode, nextSibling
 * @param {{ processComponent?: Function, unmountComponent?: Function }} [bilesenDestegi]  Aşama 4 takar
 */
export function createRenderer(nodeOps, bilesenDestegi = {}) {
  const { createElement, createText, createComment, setText, setElementText, insert, remove, patchProp } = nodeOps

  function patch(n1, n2, container, anchor = null, parentComponent = null) {
    if (n1 === n2) return // aynı vnode nesnesi (önbelleğe alınmış statik ağaç): hiç bakma
    if (n1 !== null && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1)
      unmount(n1)
      n1 = null
    }
    const { type } = n2
    if (type === Text) {
      if (n1 === null) insert((n2.el = createText(n2.children)), container, anchor)
      else {
        n2.el = n1.el
        if (n2.children !== n1.children) setText(n2.el, n2.children)
      }
    } else if (type === Comment) {
      if (n1 === null) insert((n2.el = createComment(n2.children)), container, anchor)
      else n2.el = n1.el
    } else if (typeof type === 'string') {
      if (n1 === null) mountElement(n2, container, anchor, parentComponent)
      else patchElement(n1, n2, parentComponent)
    } else if (typeof type === 'object' && bilesenDestegi.processComponent) {
      bilesenDestegi.processComponent(n1, n2, container, anchor, parentComponent, internals)
    } else {
      throw new Error(`desteklenmeyen vnode türü: ${String(type)}`)
    }
  }

  function mountElement(vnode, container, anchor, parentComponent) {
    const el = (vnode.el = createElement(vnode.type))
    if (vnode.props) for (const k of Object.keys(vnode.props)) if (k !== 'key') patchProp(el, k, null, vnode.props[k])
    if (typeof vnode.children === 'string') setElementText(el, vnode.children)
    else if (Array.isArray(vnode.children)) mountChildren(vnode.children, el, null, parentComponent)
    insert(el, container, anchor) // alt ağaç hazır, tek seferde bağlanır
  }

  function mountChildren(cocuklar, container, anchor, parentComponent) {
    for (const c of cocuklar) patch(null, c, container, anchor, parentComponent)
  }

  function patchElement(n1, n2, parentComponent) {
    const el = (n2.el = n1.el)
    const eski = n1.props || {}
    const yeni = n2.props || {}
    const bayrak = n2.patchFlag
    if (bayrak > 0) {
      // Derleyici "neyin değişebileceğini" söyledi: yalnızca ona bak.
      if (bayrak & PatchFlags.CLASS && eski.class !== yeni.class) patchProp(el, 'class', eski.class, yeni.class)
      if (bayrak & PatchFlags.PROPS) {
        for (const k of n2.dynamicProps) if (eski[k] !== yeni[k]) patchProp(el, k, eski[k], yeni[k])
      }
      if (bayrak & PatchFlags.TEXT) {
        if (n1.children !== n2.children) setElementText(el, n2.children)
        return
      }
    } else {
      for (const k of Object.keys(yeni)) if (k !== 'key' && eski[k] !== yeni[k]) patchProp(el, k, eski[k], yeni[k])
      for (const k of Object.keys(eski)) if (k !== 'key' && !(k in yeni)) patchProp(el, k, eski[k], null)
    }
    patchChildren(n1, n2, el, parentComponent)
  }

  function patchChildren(n1, n2, container, parentComponent) {
    const c1 = n1.children
    const c2 = n2.children
    if (typeof c2 === 'string') {
      if (Array.isArray(c1)) unmountChildren(c1)
      if (c1 !== c2) setElementText(container, c2)
    } else if (Array.isArray(c2)) {
      if (Array.isArray(c1)) patchKeyedChildren(c1, c2, container, null, parentComponent)
      else {
        if (typeof c1 === 'string') setElementText(container, '')
        mountChildren(c2, container, null, parentComponent)
      }
    } else if (Array.isArray(c1)) unmountChildren(c1)
    else if (typeof c1 === 'string') setElementText(container, '')
  }

  // Anahtarsız çocuklar da buradan geçer: key null === null olduğundan sıra ile eşleşirler.
  function patchKeyedChildren(c1, c2, container, parentAnchor, parentComponent) {
    let i = 0
    let e1 = c1.length - 1
    let e2 = c2.length - 1

    // 1) Baştan eşleşenler:  (a b) c  →  (a b) d e
    while (i <= e1 && i <= e2 && isSameVNodeType(c1[i], c2[i])) {
      patch(c1[i], c2[i], container, null, parentComponent)
      i++
    }
    // 2) Sondan eşleşenler:  a (b c)  →  d e (b c)
    while (i <= e1 && i <= e2 && isSameVNodeType(c1[e1], c2[e2])) {
      patch(c1[e1], c2[e2], container, null, parentComponent)
      e1--
      e2--
    }

    if (i > e1) {
      // 3) Eskiler bitti, yeniler kaldı → ekle (bir sonraki düğümün önüne)
      const anchor = e2 + 1 < c2.length ? c2[e2 + 1].el : parentAnchor
      while (i <= e2) patch(null, c2[i++], container, anchor, parentComponent)
    } else if (i > e2) {
      // 4) Yeniler bitti, eskiler kaldı → sil
      while (i <= e1) unmount(c1[i++])
    } else {
      // 5) Bilinmeyen orta bölge:  a b [c d e] f g  →  a b [e d c h] f g
      //    Alt adım numaraları renderer.ts'deki yorumlarla aynıdır (5.1, 5.2, 5.3).
      const s1 = i
      const s2 = i
      // 5.1) Yeni listedeki anahtar → indeks haritası.
      const keyToNewIndex = new Map()
      for (let j = s2; j <= e2; j++) if (c2[j].key != null) keyToNewIndex.set(c2[j].key, j)

      const yamalanacak = e2 - s2 + 1
      const newIndexToOldIndex = new Array(yamalanacak).fill(0) // 0 = yeni düğüm; diğerleri eski indeks + 1
      let yamalanan = 0
      let tasindi = false
      let enBuyukYeniIndex = 0

      // 5.2) Eski düğümleri gez: yeni listede yeri varsa yamala, yoksa sil.
      for (let j = s1; j <= e1; j++) {
        const eski = c1[j]
        if (yamalanan >= yamalanacak) {
          unmount(eski) // tüm yeniler eşleşti, kalan eskiler fazlalık
          continue
        }
        let yeniIndex
        if (eski.key != null) yeniIndex = keyToNewIndex.get(eski.key)
        else {
          for (let k = s2; k <= e2; k++) {
            if (newIndexToOldIndex[k - s2] === 0 && isSameVNodeType(eski, c2[k])) {
              yeniIndex = k
              break
            }
          }
        }
        if (yeniIndex === undefined) {
          unmount(eski)
        } else {
          newIndexToOldIndex[yeniIndex - s2] = j + 1
          if (yeniIndex >= enBuyukYeniIndex) enBuyukYeniIndex = yeniIndex
          else tasindi = true // sıra bozuldu: bir şeylerin taşınması gerekecek
          patch(eski, c2[yeniIndex], container, null, parentComponent)
          yamalanan++
        }
      }

      // 5.3) LIS içindekiler yerinde kalır; sondan başa giderek diğerlerini taşı, yenileri kur.
      const kalacaklar = tasindi ? getSequence(newIndexToOldIndex) : []
      let k = kalacaklar.length - 1
      for (let j = yamalanacak - 1; j >= 0; j--) {
        const idx = s2 + j
        const sonraki = c2[idx]
        const anchor = idx + 1 < c2.length ? c2[idx + 1].el : parentAnchor
        if (newIndexToOldIndex[j] === 0) patch(null, sonraki, container, anchor, parentComponent)
        else if (tasindi) {
          if (k < 0 || j !== kalacaklar[k]) move(sonraki, container, anchor)
          else k--
        }
      }
    }
  }

  function move(vnode, container, anchor) {
    if (vnode.component) return move(vnode.component.subTree, container, anchor)
    insert(vnode.el, container, anchor)
  }

  function unmount(vnode, doRemove = true) {
    if (vnode.component) {
      bilesenDestegi.unmountComponent(vnode.component, doRemove, internals)
      return
    }
    // Çocuklar DOM'dan tek tek sökülmez (ebeveynle gider) ama içlerindeki bileşenler durdurulmalı.
    if (Array.isArray(vnode.children)) for (const c of vnode.children) unmount(c, false)
    if (doRemove) remove(vnode.el)
  }

  function unmountChildren(cocuklar) {
    for (const c of cocuklar) unmount(c)
  }

  function getNextHostNode(vnode) {
    if (vnode.component) return getNextHostNode(vnode.component.subTree)
    return nodeOps.nextSibling(vnode.el)
  }

  function render(vnode, container) {
    if (vnode == null) {
      if (container._vnode) unmount(container._vnode)
    } else patch(container._vnode || null, vnode, container)
    container._vnode = vnode
  }

  const internals = { patch, unmount, move, getNextHostNode, nodeOps }
  return { render, patch, internals }
}

/**
 * En uzun artan alt dizi (LIS) — sıfırlar (yeni düğümler) atlanır. Dönen dizi, arr içindeki İNDEKSLERDİR.
 * Sabır sıralaması (patience sorting): kuyruklar[u] = uzunluğu u+1 olan artan dizilerin en küçük son elemanı.
 * Her eleman için ikili arama → O(n log n). öncül[] ile dizi sondan geriye kurulur.
 * Örnek: [5, 3, 4, 0] → değerler 3,4 artan → indeksler [1, 2]
 */
export function getSequence(arr) {
  const oncul = new Array(arr.length)
  const kuyruklar = []
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    if (v === 0) continue
    let alt = 0
    let ust = kuyruklar.length
    while (alt < ust) {
      const orta = (alt + ust) >> 1
      if (arr[kuyruklar[orta]] < v) alt = orta + 1
      else ust = orta
    }
    if (alt > 0) oncul[i] = kuyruklar[alt - 1]
    kuyruklar[alt] = i
  }
  const sonuc = new Array(kuyruklar.length)
  let iz = kuyruklar[kuyruklar.length - 1]
  for (let u = kuyruklar.length - 1; u >= 0; u--) {
    sonuc[u] = iz
    iz = oncul[iz]
  }
  return sonuc
}
