// AŞAMA 1 — Eleman ağacını host config üzerinden bir kerede kurmak (yalnızca ilk montaj).
// Öğrettiği fikir: React çekirdeği "div nedir" bilmez. Platforma özgü her iş host config'e devredilir.
// react-dom bunu packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js ile yapar,
// üçüncü taraf renderer'lar ise react-reconciler paketine kendi config nesnelerini verir
// (packages/react-reconciler/src/forks/ReactFiberConfig.custom.js içindeki $$$config).

import { METIN, normalizeChildren } from './eleman.js'

/**
 * Elemanı (ve tüm alt ağacını) oluşturur, en sonda kapsayıcıya tek seferde ekler.
 * @param {object} element  createElement çıktısı
 * @param {object} container  host kapsayıcısı
 * @param {object} host  host config (createInstance, appendInitialChild, appendChildToContainer...)
 */
export function render(element, container, host) {
  // Önce ekran dışında kur, sonra tek hamlede bağla: kullanıcı yarım ağaç görmez.
  for (const node of instantiate(element, host)) host.appendChildToContainer(container, node)
}

/** Bir elemandan host düğümleri üretir. Fonksiyon bileşen birden çok düğüm döndürebilir. */
function instantiate(element, host) {
  if (element.type === METIN) return [host.createTextInstance(element.props.nodeValue)]

  if (typeof element.type === 'function') {
    // Bileşen = props alıp eleman döndüren saf fonksiyon. Çıktısı da bir eleman ağacıdır.
    const cikti = normalizeChildren([element.type(element.props)])
    return cikti.flatMap((c) => instantiate(c, host))
  }

  const instance = host.createInstance(element.type, element.props)
  for (const child of element.props.children) {
    for (const node of instantiate(child, host)) host.appendInitialChild(instance, node)
  }
  return [instance]
}
