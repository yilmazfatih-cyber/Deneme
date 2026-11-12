// Testler için ~120 satırlık sahte DOM: jsdom gibi bir kütüphane olmadan veri API'sini sınamak için yeterli.
// Desteklenen seçiciler: etiket, .sınıf, #id, [nitelik], [nitelik="değer"], bunların birleşimi (button.btn[x="y"])
// ve virgüllü listeler. Torun seçicisi (boşluklu "a b") YOK; eklentinin buna ihtiyacı yok.
// Olaylar: addEventListener / removeEventListener / dispatchEvent, kabarcıklanma (bubbling), preventDefault.

const BASIT = /^([a-z][\w-]*)?((?:[.#][\w:-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i

function parcala(secici) {
  const m = BASIT.exec(secici.trim())
  if (!m) throw new Error(`mini_dom bu seçiciyi desteklemiyor: ${secici}`)
  const parcalar = [...m[2].matchAll(/[.#][\w:-]+|\[([\w-]+)(?:="([^"]*)")?\]/g)].map((p) => {
    if (p[0][0] === '.') return { tur: 'sinif', deger: p[0].slice(1) }
    if (p[0][0] === '#') return { tur: 'id', deger: p[0].slice(1) }
    return { tur: 'nitelik', ad: p[1], deger: p[2] }
  })
  return { etiket: m[1] ? m[1].toLowerCase() : null, parcalar }
}

class SinifListesi {
  constructor(el) {
    this.el = el
  }
  get _liste() {
    return (this.el.getAttribute('class') || '').split(/\s+/).filter(Boolean)
  }
  contains(ad) {
    return this._liste.includes(ad)
  }
  add(...adlar) {
    this.el.setAttribute('class', [...new Set([...this._liste, ...adlar])].join(' '))
  }
  remove(...adlar) {
    this.el.setAttribute('class', this._liste.filter((a) => !adlar.includes(a)).join(' '))
  }
  toggle(ad, zorla) {
    const ekle = zorla ?? !this.contains(ad)
    if (ekle) this.add(ad)
    else this.remove(ad)
    return ekle
  }
}

export class MiniElement {
  constructor(tagName, nitelikler = {}) {
    this.tagName = tagName.toUpperCase()
    this.nitelikler = new Map(Object.entries(nitelikler))
    this.children = []
    this.parentNode = null
    this.dinleyiciler = new Map()
    this.classList = new SinifListesi(this)
    this.odaklandi = false
  }
  getAttribute(ad) {
    return this.nitelikler.has(ad) ? this.nitelikler.get(ad) : null
  }
  setAttribute(ad, deger) {
    this.nitelikler.set(ad, String(deger))
  }
  hasAttribute(ad) {
    return this.nitelikler.has(ad)
  }
  removeAttribute(ad) {
    this.nitelikler.delete(ad)
  }
  getAttributeNames() {
    return [...this.nitelikler.keys()]
  }
  get id() {
    return this.getAttribute('id') || ''
  }
  appendChild(cocuk) {
    cocuk.parentNode = this
    this.children.push(cocuk)
    return cocuk
  }
  matches(secici) {
    return secici.split(',').some((tek) => {
      const { etiket, parcalar } = parcala(tek)
      if (etiket && etiket !== this.tagName.toLowerCase()) return false
      return parcalar.every((p) => {
        if (p.tur === 'sinif') return this.classList.contains(p.deger)
        if (p.tur === 'id') return this.id === p.deger
        return p.deger === undefined ? this.hasAttribute(p.ad) : this.getAttribute(p.ad) === p.deger
      })
    })
  }
  closest(secici) {
    for (let n = this; n instanceof MiniElement; n = n.parentNode) if (n.matches(secici)) return n
    return null
  }
  querySelectorAll(secici) {
    const sonuc = []
    const gez = (n) => {
      for (const c of n.children) {
        if (c.matches(secici)) sonuc.push(c)
        gez(c)
      }
    }
    gez(this)
    return sonuc
  }
  querySelector(secici) {
    return this.querySelectorAll(secici)[0] || null
  }
  get nextElementSibling() {
    if (!this.parentNode) return null
    const k = this.parentNode.children
    return k[k.indexOf(this) + 1] || null
  }
  focus() {
    this.odaklandi = true
  }
  addEventListener(tur, fn) {
    if (!this.dinleyiciler.has(tur)) this.dinleyiciler.set(tur, [])
    this.dinleyiciler.get(tur).push(fn)
  }
  removeEventListener(tur, fn) {
    const l = this.dinleyiciler.get(tur) || []
    const i = l.indexOf(fn)
    if (i >= 0) l.splice(i, 1)
  }
  /** Gerçek DOM gibi: hedeften köke kabarcıklanır; preventDefault edilmişse false döner. */
  dispatchEvent(olay) {
    const sarmal = {
      type: olay.type,
      key: olay.key,
      target: this,
      currentTarget: null,
      defaultPrevented: false,
      durdur: false,
      preventDefault() {
        if (olay.cancelable !== false) this.defaultPrevented = true
      },
      stopPropagation() {
        this.durdur = true
      },
    }
    for (let n = this; n && !sarmal.durdur; n = olay.bubbles === false ? null : n.parentNode) {
      sarmal.currentTarget = n
      for (const fn of [...(n.dinleyiciler.get(olay.type) || [])]) fn.call(n, sarmal)
    }
    return !sarmal.defaultPrevented
  }
  click() {
    return this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true })
  }
}

/** Kısa yardımcı: el('button', { class: 'btn' }, cocuk1, cocuk2) */
export function el(etiket, nitelikler = {}, ...cocuklar) {
  const e = new MiniElement(etiket, nitelikler)
  for (const c of cocuklar) e.appendChild(c)
  return e
}

/** Belge kökü: querySelector için bir MiniElement yeterli. */
export const belgeOlustur = (...cocuklar) => el('html', {}, ...cocuklar)
