// Bootstrap'in JS eklenti mimarisinin küçük modeli: veri kaydı + temel bileşen + olay delegasyonu + "data API".
// HTML'e yalnızca nitelik yazarsın (data-bs-toggle="collapse" data-bs-target="#x"); tek bir belge dinleyicisi,
// tıklanan öğeden yukarı doğru yürüyüp eşleşen tetikleyiciyi bulur ve bileşeni gerektiğinde oluşturur.
// Gerçek karşılıklar (v6 main, js/src/):
//   dom/data.ts (Data)   dom/event-handler.ts (bootstrapDelegationHandler, on/off/trigger, ad alanlı olaylar)
//   base-component.ts (getOrCreateInstance, dispose, DATA_KEY)   dom/manipulator.ts (getDataAttributes)
//   collapse.ts ("Data API implementation" bölümü)   menu.ts (v5'te dropdown.js; clearMenus)
// Yalnızca standart DOM API'leri kullanılır: tarayıcıda gerçek DOM'la, testlerde src/mini_dom.js ile çalışır.

// ------------------------------------------------------------------ saf yardımcılar

/** Olay hedefinden başlayıp sınıra kadar seçiciye uyan ilk atayı bulur (delegasyonun kalbi). */
export function delegeHedefi(hedef, secici, sinir) {
  for (let n = hedef; n && n !== sinir; n = n.parentNode) {
    if (typeof n.matches === 'function' && n.matches(secici)) return n
  }
  return null
}

/** Tetikleyicinin hedef seçicisi: önce data-bs-target, yoksa href="#id". */
export function hedefSecicisi(el) {
  const hedef = el.getAttribute('data-bs-target')
  if (hedef) return hedef
  const href = el.getAttribute('href')
  return href && href.startsWith('#') && href.length > 1 ? href : null
}

/** data-bs-* niteliklerini ayar nesnesine çevirir: data-bs-parent="#a" → { parent: '#a' } */
export function veriNitelikleri(el) {
  const ayarlar = {}
  for (const ad of el.getAttributeNames()) {
    if (!ad.startsWith('data-bs-') || ad === 'data-bs-toggle') continue
    const anahtar = ad.slice(8).replace(/-([a-z])/g, (_, h) => h.toUpperCase())
    const ham = el.getAttribute(ad)
    ayarlar[anahtar] = ham === 'true' ? true : ham === 'false' ? false : ham
  }
  return ayarlar
}

const belgeKoku = (el) => {
  if (el.ownerDocument) return el.ownerDocument
  let n = el
  while (n.parentNode) n = n.parentNode
  return n
}

/** İptal edilebilir, kabarcıklanan, ad alanlı olay (show.bs.collapse). false dönerse biri preventDefault etti. */
function olayYay(el, tur) {
  return el.dispatchEvent(new Event(tur, { bubbles: true, cancelable: true }))
}

// ------------------------------------------------------------------ veri kaydı ve temel bileşen

// Bootstrap bir Map kullanır ve dispose'ta siler; WeakMap, unutulan öğelerin çöp toplanmasına da izin verir.
const kayit = new WeakMap()
export const Data = {
  set(el, anahtar, ornek) {
    if (!kayit.has(el)) kayit.set(el, new Map())
    kayit.get(el).set(anahtar, ornek)
  },
  get: (el, anahtar) => (el && kayit.has(el) ? kayit.get(el).get(anahtar) || null : null),
  remove(el, anahtar) {
    if (kayit.has(el)) kayit.get(el).delete(anahtar)
  },
}

export class TemelBilesen {
  static AD = 'temel'
  static Varsayilan = {}
  static get VERI_ANAHTARI() {
    return `bs.${this.AD}`
  }

  constructor(element, ayarlar = {}) {
    this._element = element
    this._ayarlar = { ...this.constructor.Varsayilan, ...veriNitelikleri(element), ...ayarlar }
    const eski = Data.get(element, this.constructor.VERI_ANAHTARI)
    if (eski) eski.dispose() // aynı öğeye ikinci örnek: eskisini temizle
    Data.set(element, this.constructor.VERI_ANAHTARI, this)
  }

  dispose() {
    Data.remove(this._element, this.constructor.VERI_ANAHTARI)
    this._element = null
  }

  static getInstance(el) {
    return Data.get(el, this.VERI_ANAHTARI)
  }

  static getOrCreateInstance(el, ayarlar) {
    return this.getInstance(el) || new this(el, ayarlar)
  }
}

// ------------------------------------------------------------------ Collapse

export class Collapse extends TemelBilesen {
  static AD = 'collapse'
  static Varsayilan = { parent: null }

  get acik() {
    return this._element.classList.contains('show')
  }

  toggle() {
    return this.acik ? this.hide() : this.show()
  }

  show() {
    if (this.acik || !olayYay(this._element, 'show.bs.collapse')) return false
    if (this._ayarlar.parent) {
      // Akordeon: aynı ebeveyn içindeki açık kardeşleri kapat.
      const ebeveyn = belgeKoku(this._element).querySelector(this._ayarlar.parent)
      for (const kardes of [...ebeveyn.querySelectorAll('.collapse.show')]) {
        if (kardes !== this._element) Collapse.getOrCreateInstance(kardes).hide()
      }
    }
    this._element.classList.add('show')
    this._tetikleyicileriGuncelle(true)
    olayYay(this._element, 'shown.bs.collapse')
    return true
  }

  hide() {
    if (!this.acik || !olayYay(this._element, 'hide.bs.collapse')) return false
    this._element.classList.remove('show')
    this._tetikleyicileriGuncelle(false)
    olayYay(this._element, 'hidden.bs.collapse')
    return true
  }

  _tetikleyicileriGuncelle(acik) {
    const kok = belgeKoku(this._element)
    for (const t of [...kok.querySelectorAll('[data-bs-toggle="collapse"]')]) {
      const secici = hedefSecicisi(t)
      if (secici && [...kok.querySelectorAll(secici)].includes(this._element)) {
        t.setAttribute('aria-expanded', String(acik))
        t.classList.toggle('collapsed', !acik)
      }
    }
  }
}

// ------------------------------------------------------------------ Menu (v6) / Dropdown (v5)

export class Menu extends TemelBilesen {
  static AD = 'menu'
  static Varsayilan = { menuSecicisi: '.menu' }

  get _menu() {
    const sonraki = this._element.nextElementSibling
    return sonraki && sonraki.matches(this._ayarlar.menuSecicisi) ? sonraki : null
  }

  get acik() {
    return Boolean(this._menu && this._menu.classList.contains('show'))
  }

  toggle() {
    return this.acik ? this.hide() : this.show()
  }

  show() {
    if (this.acik || !olayYay(this._element, 'show.bs.menu')) return false
    Menu.hepsiniKapat(belgeKoku(this._element), this) // aynı anda tek menü açık
    this._menu.classList.add('show')
    this._element.setAttribute('aria-expanded', 'true')
    olayYay(this._element, 'shown.bs.menu')
    return true
  }

  hide() {
    if (!this.acik || !olayYay(this._element, 'hide.bs.menu')) return false
    this._menu.classList.remove('show')
    this._element.setAttribute('aria-expanded', 'false')
    olayYay(this._element, 'hidden.bs.menu')
    return true
  }

  /** clearMenus: dışarı tıklama ve Escape tuşu için. */
  static hepsiniKapat(kok, haric = null, toggleSecici = '[data-bs-toggle="menu"]') {
    for (const t of [...kok.querySelectorAll(toggleSecici)]) {
      const m = Menu.getInstance(t)
      if (m && m !== haric && m.acik) m.hide()
    }
  }
}

// ------------------------------------------------------------------ data API

/** Delegasyonlu dinleyici (EventHandler.on(document, 'click', secici, fn) gibi). Kaldırıcı fonksiyon döner. */
export function on(kok, tur, secici, isleyici) {
  const sarici = (olay) => {
    const hedef = delegeHedefi(olay.target, secici, kok)
    if (hedef) isleyici(olay, hedef)
  }
  kok.addEventListener(tur, sarici)
  return () => kok.removeEventListener(tur, sarici)
}

/**
 * Data API'yi bir belgeye bağlar. Bootstrap bunu modül yüklenirken `document` üzerinde kendiliğinden yapar;
 * mini, test edilebilsin diye açık çağrı ister.
 * @param {{ menuAdi?: string, menuSecicisi?: string }} [secenekler]  v5 için { menuAdi: 'dropdown', menuSecicisi: '.dropdown-menu' }
 */
export function baslat(belge, { menuAdi = 'menu', menuSecicisi = '.menu' } = {}) {
  const menuTetik = `[data-bs-toggle="${menuAdi}"]`
  const kaldir = [
    on(belge, 'click', '[data-bs-toggle="collapse"]', (olay, tetik) => {
      if (tetik.tagName === 'A') olay.preventDefault() // bağlantı sayfayı kaydırmasın
      const secici = hedefSecicisi(tetik)
      if (!secici) return
      for (const hedef of [...belge.querySelectorAll(secici)]) Collapse.getOrCreateInstance(hedef).toggle()
    }),
    on(belge, 'click', menuTetik, (olay, tetik) => {
      olay.preventDefault()
      Menu.getOrCreateInstance(tetik, { menuSecicisi }).toggle()
    }),
  ]
  const disariTiklama = (olay) => {
    if (delegeHedefi(olay.target, `${menuTetik}, ${menuSecicisi}`, belge)) return
    Menu.hepsiniKapat(belge, null, menuTetik)
  }
  const escape = (olay) => {
    if (olay.key !== 'Escape') return
    for (const t of [...belge.querySelectorAll(menuTetik)]) {
      const m = Menu.getInstance(t)
      if (m && m.acik) {
        m.hide()
        t.focus() // odak tetikleyiciye döner (erişilebilirlik)
      }
    }
  }
  belge.addEventListener('click', disariTiklama)
  belge.addEventListener('keydown', escape)
  kaldir.push(() => belge.removeEventListener('click', disariTiklama))
  kaldir.push(() => belge.removeEventListener('keydown', escape))
  return () => kaldir.forEach((k) => k())
}
