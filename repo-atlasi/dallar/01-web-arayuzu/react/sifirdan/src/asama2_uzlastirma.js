// AŞAMA 2 — Uzlaştırma (reconciliation): eski ve yeni eleman ağaçlarını karşılaştırıp host'a en az değişikliği uygula.
// Bu, React 15'e kadarki "stack reconciler" tarzıdır: özyinelemeli, bölünemez, tek seferde biter.
// Liste algoritması (anahtarla eşleme + lastPlacedIndex) bugün de aynı; fiber üzerinde şurada yaşar:
//   packages/react-reconciler/src/ReactChildFiber.js → reconcileChildrenArray, placeChild, deleteRemainingChildren
// İki sezgisel kural (React belgelerindeki "heuristic"):
//   1) Türü değişen eleman (div → span ya da A → B bileşeni) eski alt ağacı tamamen atar, yenisini kurar.
//   2) Kardeşler `key` ile eşleşir; key yoksa sıra numarası (index) anahtar sayılır.

import { METIN, normalizeChildren, shallowEqualProps } from './eleman.js'

/**
 * @param {object} container  host kapsayıcısı
 * @param {object} host  host config
 */
export function createStackRoot(container, host) {
  let cocuklar = [] // kök düzeyindeki iç örnekler (internal instances)
  return {
    render(element) {
      cocuklar = reconcileHostChildren(host, container, cocuklar, normalizeChildren([element]))
    },
    unmount() {
      cocuklar = reconcileHostChildren(host, container, cocuklar, [])
    },
  }
}

// İç örnek türleri:
//   { tur: 'metin', element, node }
//   { tur: 'host', element, node, cocuklar: Ornek[] }
//   { tur: 'bilesen', element, cikti: Ornek[] }   // bileşenin ürettiği eleman listesi

/** Bir host ebeveynin tüm çocuklarını uzlaştırır, sonra host düğümlerini doğru sıraya koyar. */
function reconcileHostChildren(host, parentNode, eskiler, yeniElemanlar) {
  const eskiSira = new Map(hostNodesOf(eskiler).map((n, i) => [n, i]))
  const yeniler = reconcileList(host, parentNode, eskiler, yeniElemanlar)
  yerlestir(host, parentNode, hostNodesOf(yeniler), eskiSira)
  return yeniler
}

/** Anahtar: açık `key` varsa o, yoksa listedeki sıra. */
const slotKey = (el, i) => (el.key != null ? `k:${el.key}` : `i:${i}`)

/** Bir eleman listesini eski örneklerle eşler: yeniden kullan, yeni kur ya da sil. Yerleştirme yapmaz. */
function reconcileList(host, parentNode, eskiler, yeniElemanlar) {
  const anahtarla = new Map()
  eskiler.forEach((ornek, i) => anahtarla.set(slotKey(ornek.element, i), ornek))

  const sonuc = yeniElemanlar.map((el, i) => {
    const k = slotKey(el, i)
    const eski = anahtarla.get(k)
    if (eski && eski.element.type === el.type) {
      anahtarla.delete(k)
      return guncelle(host, parentNode, eski, el)
    }
    return kur(host, el) // tür farklıysa eski örnek haritada kalır ve aşağıda silinir
  })

  for (const artik of anahtarla.values()) {
    for (const node of hostNodesOf([artik])) host.removeChild(parentNode, node)
  }
  return sonuc
}

/** Yeni örnek kurar (host düğümleri ekran dışında oluşur, ebeveyne henüz eklenmez). */
function kur(host, el) {
  if (el.type === METIN) return { tur: 'metin', element: el, node: host.createTextInstance(el.props.nodeValue) }
  if (typeof el.type === 'function') {
    const cikti = normalizeChildren([el.type(el.props)]).map((c) => kur(host, c))
    return { tur: 'bilesen', element: el, cikti }
  }
  const node = host.createInstance(el.type, el.props)
  const cocuklar = el.props.children.map((c) => kur(host, c))
  for (const n of hostNodesOf(cocuklar)) host.appendInitialChild(node, n)
  return { tur: 'host', element: el, node, cocuklar }
}

/** Aynı türden örneği yeni elemana göre günceller. */
function guncelle(host, parentNode, ornek, el) {
  const eski = ornek.element
  ornek.element = el
  if (ornek.tur === 'metin') {
    if (eski.props.nodeValue !== el.props.nodeValue) {
      host.commitTextUpdate(ornek.node, eski.props.nodeValue, el.props.nodeValue)
    }
  } else if (ornek.tur === 'host') {
    if (!shallowEqualProps(eski.props, el.props)) host.commitUpdate(ornek.node, el.type, eski.props, el.props)
    ornek.cocuklar = reconcileHostChildren(host, ornek.node, ornek.cocuklar, el.props.children)
  } else {
    // Bileşen yeniden çağrılır; çıktısı aynı host ebeveyni içinde uzlaştırılır.
    ornek.cikti = reconcileList(host, parentNode, ornek.cikti, normalizeChildren([el.type(el.props)]))
  }
  return ornek
}

/** Örnek listesinin en üst düzey host düğümleri (bileşenler kendi çıktılarına açılır). */
function hostNodesOf(ornekler) {
  return ornekler.flatMap((o) => (o.tur === 'bilesen' ? hostNodesOf(o.cikti) : [o.node]))
}

/**
 * Yerleştirme: React'in lastPlacedIndex kuralı.
 * Eski sırası, şimdiye kadar yerinde bırakılanların en büyüğünden küçük olan düğüm "taşınır";
 * diğerleri yerinde kalır. Sonra sondan başa yürüyüp her taşınan/yeni düğümü bir sonrakinin önüne koyarız.
 */
function yerlestir(host, parentNode, istenen, eskiSira) {
  let lastPlacedIndex = 0
  const tasinacak = istenen.map((node) => {
    const eskiIndex = eskiSira.get(node)
    if (eskiIndex === undefined) return true // yeni düğüm
    if (eskiIndex < lastPlacedIndex) return true // geriye kalmış: taşı
    lastPlacedIndex = eskiIndex
    return false
  })
  let sonraki = null
  for (let i = istenen.length - 1; i >= 0; i--) {
    if (tasinacak[i]) {
      if (sonraki) host.insertBefore(parentNode, istenen[i], sonraki)
      else host.appendChild(parentNode, istenen[i])
    }
    sonraki = istenen[i]
  }
}
