// Aşama 3 — Üç ağaç: Widget → Element → RenderObject.
//
// Widget: değişmez bir "tarif" (ucuz, her build'de yeniden üretilir).
// Element: tarifin ağaçtaki kalıcı örneği; State'i ve RenderObject'i o tutar, iki build arasında yaşar.
// RenderObject: yerleşim ve boyama yapan ağır nesne.
// Yeniden build'de Flutter eski Element'i atıp yenisini kurmaz; `Widget.canUpdate` (aynı tür + aynı key)
// doğruysa Element'i yeni widget'la günceller. State'in korunmasının ve hızın sırrı budur.
// Gerçek: packages/flutter/lib/src/widgets/framework.dart (Widget, Element, State, BuildContext,
//         updateChild, updateChildren, InheritedElement), basic.dart (Padding, Row, Column, Expanded …),
//         text.dart (Text), gesture_detector.dart (GestureDetector).

import { BoxConstraints, EdgeInsets, Size } from './asama1_kisitlar.js'
import {
  RenderCerceve,
  RenderColoredBox,
  RenderConstrainedBox,
  RenderFlex,
  RenderPadding,
  RenderParagraph,
  RenderPointerListener,
  RenderPositionedBox,
} from './asama2_render.js'

// ---------------------------------------------------------------------------------------------
// Widget türleri

export class Widget {
  /** @param {{ key?: unknown }} [p] */
  constructor({ key = null } = {}) {
    this.key = key
  }

  /** @returns {Element} */
  createElement() {
    throw new Error(`${this.constructor.name}.createElement yazılmamış`)
  }

  /** Aynı çalışma zamanı türü ve aynı key → eski Element yeni widget'la güncellenebilir. */
  static canUpdate(eski, yeni) {
    return eski.constructor === yeni.constructor && eski.key === yeni.key
  }
}

export class StatelessWidget extends Widget {
  createElement() {
    return new StatelessElement(this)
  }

  /** @param {Element} _context @returns {Widget} */
  build(_context) {
    throw new Error(`${this.constructor.name}.build yazılmamış`)
  }
}

export class StatefulWidget extends Widget {
  createElement() {
    return new StatefulElement(this)
  }

  /** @returns {State} */
  createState() {
    throw new Error(`${this.constructor.name}.createState yazılmamış`)
  }
}

export class State {
  /** @type {any} */
  widget = null
  /** @type {StatefulElement | null} */
  _element = null

  get context() {
    return this._element
  }

  get mounted() {
    return this._element !== null
  }

  initState() {}
  /** @param {any} _eskiWidget */
  didUpdateWidget(_eskiWidget) {}
  dispose() {}

  /** @param {Element} _context @returns {Widget} */
  build(_context) {
    throw new Error(`${this.constructor.name}.build yazılmamış`)
  }

  /** Durumu değiştir ve bu Element'i kirli işaretle; yeniden build bir sonraki karede olur. @param {() => void} fn */
  setState(fn) {
    if (!this._element) throw new Error('setState() dispose edilmiş bir State üzerinde çağrıldı')
    fn()
    this._element.markNeedsBuild()
  }
}

export class RenderObjectWidget extends Widget {
  /** @param {Element} _context @returns {import('./asama2_render.js').RenderBox} */
  createRenderObject(_context) {
    throw new Error(`${this.constructor.name}.createRenderObject yazılmamış`)
  }

  /** @param {Element} _context @param {any} _renderObject */
  updateRenderObject(_context, _renderObject) {}
}

export class LeafRenderObjectWidget extends RenderObjectWidget {
  createElement() {
    return new LeafRenderObjectElement(this)
  }
}

export class SingleChildRenderObjectWidget extends RenderObjectWidget {
  /** @param {{ key?: unknown, child?: Widget | null }} p */
  constructor({ key, child = null } = {}) {
    super({ key })
    this.child = child
  }

  createElement() {
    return new SingleChildRenderObjectElement(this)
  }
}

export class MultiChildRenderObjectWidget extends RenderObjectWidget {
  /** @param {{ key?: unknown, children?: Widget[] }} p */
  constructor({ key, children = [] } = {}) {
    super({ key })
    this.children = children
  }

  createElement() {
    return new MultiChildRenderObjectElement(this)
  }
}

/** Çocuğunun RenderObject'ine ebeveyn verisi yazar (Expanded → flex). */
export class ParentDataWidget extends Widget {
  /** @param {{ key?: unknown, child: Widget }} p */
  constructor({ key, child }) {
    super({ key })
    this.child = child
  }

  createElement() {
    return new ParentDataElement(this)
  }

  /** @param {import('./asama2_render.js').RenderObject} _renderObject @returns {boolean} değişti mi */
  applyParentData(_renderObject) {
    return false
  }
}

/** Ağaçta aşağı doğru veri taşır; `dependOnInheritedWidgetOfExactType` ile bağımlılık kurulur. */
export class InheritedWidget extends Widget {
  /** @param {{ key?: unknown, child: Widget }} p */
  constructor({ key, child }) {
    super({ key })
    this.child = child
  }

  createElement() {
    return new InheritedElement(this)
  }

  /** @param {InheritedWidget} _eski */
  updateShouldNotify(_eski) {
    return true
  }
}

// ---------------------------------------------------------------------------------------------
// Element'ler

export class Element {
  /** @param {Widget} widget */
  constructor(widget) {
    this.widget = widget
    /** @type {Element | null} */
    this.parent = null
    /** @type {unknown} */
    this.slot = null
    this.depth = 0
    /** @type {import('./asama4_build_owner.js').BuildOwner | null} */
    this.owner = null
    this.dirty = true
    this.active = false
    this._dirtyListede = false
    /** @type {Map<Function, InheritedElement>} */
    this._inherited = new Map()
    /** @type {Set<InheritedElement> | null} bağımlı olduğum InheritedElement'ler */
    this._bagimliOlduklarim = null
  }

  /** @param {Element | null} parent @param {unknown} slot */
  mount(parent, slot) {
    this.parent = parent
    this.slot = slot
    this.depth = parent ? parent.depth + 1 : 0
    if (parent) this.owner = parent.owner
    this._inherited = parent ? parent._inherited : new Map()
    this.active = true
  }

  /** @param {Widget} yeniWidget */
  update(yeniWidget) {
    this.widget = yeniWidget
  }

  /**
   * Çerçevenin kalbi. Dört durum:
   *   yeni widget yok → çocuğu kaldır;  çocuk yok → yeni Element şişir;
   *   canUpdate → mevcut Element'i güncelle;  değilse → eskiyi kaldır, yenisini şişir.
   * @param {Element | null} cocuk @param {Widget | null} yeniWidget @param {unknown} yeniSlot
   * @returns {Element | null}
   */
  updateChild(cocuk, yeniWidget, yeniSlot) {
    if (!yeniWidget) {
      if (cocuk) this.deactivateChild(cocuk)
      return null
    }
    if (cocuk) {
      if (cocuk.widget === yeniWidget) {
        // Birebir aynı widget nesnesi (Dart'taki `const` widget'lar): alt ağaç hiç yeniden build edilmez.
        if (cocuk.slot !== yeniSlot) cocuk.slot = yeniSlot
        return cocuk
      }
      if (Widget.canUpdate(cocuk.widget, yeniWidget)) {
        if (cocuk.slot !== yeniSlot) cocuk.slot = yeniSlot
        cocuk.update(yeniWidget)
        return cocuk
      }
      this.deactivateChild(cocuk)
    }
    return this.inflateWidget(yeniWidget, yeniSlot)
  }

  /** @param {Widget} widget @param {unknown} slot */
  inflateWidget(widget, slot) {
    const e = widget.createElement()
    e.owner = this.owner
    e.mount(this, slot)
    return e
  }

  /** @param {Element} cocuk */
  deactivateChild(cocuk) {
    cocuk.detachRenderObject()
    cocuk._deactivateRecursively()
    this.owner?.inactive.add(cocuk)
  }

  _deactivateRecursively() {
    this.active = false
    this.visitChildren((c) => c._deactivateRecursively())
  }

  /** Ağaçtan kalıcı olarak çıkar (BuildOwner.finalizeTree çağırır). */
  unmount() {
    this.visitChildren((c) => c.unmount())
    for (const ie of this._bagimliOlduklarim ?? []) ie.dependents.delete(this)
  }

  /** @param {(c: Element) => void} _f */
  visitChildren(_f) {}

  markNeedsBuild() {
    if (!this.active || this.dirty) return
    this.dirty = true
    this.owner?.scheduleBuildFor(this)
  }

  rebuild() {
    if (!this.active || !this.dirty) return
    this.performRebuild()
  }

  performRebuild() {
    this.dirty = false
  }

  // --- BuildContext yüzeyi ---

  /** @template T @param {new (...a: any[]) => T} Tur @returns {T | null} */
  dependOnInheritedWidgetOfExactType(Tur) {
    const ie = this._inherited.get(Tur)
    if (!ie) return null
    ie.dependents.add(this)
    ;(this._bagimliOlduklarim ??= new Set()).add(ie)
    return /** @type {T} */ (ie.widget)
  }

  /** @returns {any} */
  findRenderObject() {
    let bulunan = null
    const ara = (e) => {
      if (bulunan) return
      if (e instanceof RenderObjectElement) bulunan = e.renderObject
      else e.visitChildren(ara)
    }
    ara(this)
    return bulunan
  }

  detachRenderObject() {
    this.visitChildren((c) => c.detachRenderObject())
  }

  /** @param {unknown} slot */
  attachRenderObject(slot) {
    this.visitChildren((c) => c.attachRenderObject(slot))
  }
}

export class ComponentElement extends Element {
  /** @type {Element | null} */
  child = null

  mount(parent, slot) {
    super.mount(parent, slot)
    this._firstBuild()
  }

  _firstBuild() {
    this.rebuild()
  }

  /** @returns {Widget} */
  build() {
    throw new Error('ComponentElement.build')
  }

  performRebuild() {
    const yeni = this.build()
    this.owner?.buildSay(this)
    this.dirty = false
    this.child = this.updateChild(this.child, yeni, this.slot)
  }

  visitChildren(f) {
    if (this.child) f(this.child)
  }
}

export class StatelessElement extends ComponentElement {
  build() {
    return /** @type {StatelessWidget} */ (this.widget).build(this)
  }

  update(yeni) {
    super.update(yeni)
    this.dirty = true
    this.rebuild()
  }
}

export class StatefulElement extends ComponentElement {
  /** @param {StatefulWidget} widget */
  constructor(widget) {
    super(widget)
    this.state = widget.createState()
    this.state.widget = widget
    this.state._element = this
  }

  _firstBuild() {
    this.state.initState()
    super._firstBuild()
  }

  build() {
    return this.state.build(this)
  }

  update(yeni) {
    const eski = this.state.widget
    super.update(yeni)
    this.state.widget = yeni
    this.state.didUpdateWidget(eski)
    this.dirty = true
    this.rebuild()
  }

  unmount() {
    super.unmount()
    this.state.dispose()
    this.state._element = null
  }
}

export class ProxyElement extends ComponentElement {
  build() {
    return /** @type {any} */ (this.widget).child
  }

  update(yeni) {
    const eski = this.widget
    super.update(yeni)
    this.updated(eski)
    this.dirty = true
    this.rebuild()
  }

  /** @param {Widget} _eski */
  updated(_eski) {}
}

export class ParentDataElement extends ProxyElement {
  /** @param {RenderObjectElement} hedef */
  applyTo(hedef) {
    const r = hedef.renderObject
    if (/** @type {ParentDataWidget} */ (this.widget).applyParentData(r)) r.parent?.markNeedsLayout()
  }

  updated() {
    // Flex değeri değiştiyse altımızdaki ilk RenderObjectElement'e yeniden uygula.
    const ilk = ilkRenderObjectElement(this)
    if (ilk) this.applyTo(ilk)
  }
}

export class InheritedElement extends ProxyElement {
  /** @type {Set<Element>} */
  dependents = new Set()

  mount(parent, slot) {
    // Kendini haritaya ekleyip alt ağaca öyle ver (gerçekte: _updateInheritance).
    this.parent = parent
    const harita = new Map(parent ? parent._inherited : [])
    harita.set(this.widget.constructor, this)
    Element.prototype.mount.call(this, parent, slot)
    this._inherited = harita
    this._firstBuild()
  }

  updated(eski) {
    if (/** @type {InheritedWidget} */ (this.widget).updateShouldNotify(/** @type {InheritedWidget} */ (eski))) {
      for (const d of this.dependents) d.markNeedsBuild()
    }
  }
}

/** @param {Element} e @returns {RenderObjectElement | null} */
function ilkRenderObjectElement(e) {
  let bulunan = null
  const ara = (x) => {
    if (bulunan) return
    if (x instanceof RenderObjectElement) bulunan = x
    else x.visitChildren(ara)
  }
  e.visitChildren(ara)
  return bulunan
}

export class RenderObjectElement extends Element {
  /** @type {any} */
  renderObject = null
  /** @type {RenderObjectElement | null} */
  _ataRenderElement = null

  mount(parent, slot) {
    super.mount(parent, slot)
    this.renderObject = /** @type {RenderObjectWidget} */ (this.widget).createRenderObject(this)
    this.attachRenderObject(slot)
    this.dirty = false
  }

  update(yeni) {
    super.update(yeni)
    const w = /** @type {RenderObjectWidget} */ (this.widget)
    w.updateRenderObject(this, this.renderObject)
    this.dirty = false
  }

  attachRenderObject(slot) {
    this.slot = slot
    let ata = this.parent
    /** @type {ParentDataElement[]} */
    const veriElemanlari = []
    while (ata && !(ata instanceof RenderObjectElement)) {
      if (ata instanceof ParentDataElement) veriElemanlari.push(ata)
      ata = ata.parent
    }
    this._ataRenderElement = /** @type {RenderObjectElement | null} */ (ata)
    for (const v of veriElemanlari) v.applyTo(this)
    this._ataRenderElement?.insertRenderObjectChild(this.renderObject, slot)
  }

  detachRenderObject() {
    this._ataRenderElement?.removeRenderObjectChild(this.renderObject, this.slot)
    this._ataRenderElement = null
  }

  /** @param {any} _cocuk @param {unknown} _slot */
  insertRenderObjectChild(_cocuk, _slot) {}
  /** @param {any} _cocuk @param {unknown} _slot */
  removeRenderObjectChild(_cocuk, _slot) {}
}

export class LeafRenderObjectElement extends RenderObjectElement {}

export class SingleChildRenderObjectElement extends RenderObjectElement {
  /** @type {Element | null} */
  child = null

  mount(parent, slot) {
    super.mount(parent, slot)
    this.child = this.updateChild(null, /** @type {SingleChildRenderObjectWidget} */ (this.widget).child, null)
  }

  update(yeni) {
    super.update(yeni)
    this.child = this.updateChild(this.child, /** @type {SingleChildRenderObjectWidget} */ (this.widget).child, null)
  }

  visitChildren(f) {
    if (this.child) f(this.child)
  }

  insertRenderObjectChild(cocuk) {
    this.renderObject.child = cocuk
  }

  removeRenderObjectChild(cocuk) {
    if (this.renderObject.child === cocuk) this.renderObject.child = null
  }
}

export class MultiChildRenderObjectElement extends RenderObjectElement {
  /** @type {Element[]} */
  children = []
  /** Çocuk listesi kurulurken araya giren ekleme bildirimlerini ertele. */
  _kuruluyor = false

  mount(parent, slot) {
    super.mount(parent, slot)
    const w = /** @type {MultiChildRenderObjectWidget} */ (this.widget)
    this._kuruluyor = true
    this.children = w.children.map((cw, i) => this.inflateWidget(cw, i))
    this._kuruluyor = false
    this._renderCocuklariniEsitle()
  }

  update(yeni) {
    super.update(yeni)
    this._kuruluyor = true
    this.children = updateChildren(this, this.children, /** @type {MultiChildRenderObjectWidget} */ (yeni).children)
    this._kuruluyor = false
    this._renderCocuklariniEsitle()
  }

  visitChildren(f) {
    this.children.forEach(f)
  }

  insertRenderObjectChild() {
    // Sıra Element listesinden kurulur: bkz. _renderCocuklariniEsitle.
    if (!this._kuruluyor) this._renderCocuklariniEsitle()
  }

  removeRenderObjectChild(cocuk) {
    this.renderObject.cocuklariAyarla(this.renderObject.cocuklar.filter((c) => c !== cocuk))
  }

  /**
   * RenderFlex'in çocuk sırasını Element sırasına eşitler. (Gerçek kod bunu IndexedSlot ve
   * insert/move/removeRenderObjectChild çağrılarıyla adım adım yapar.)
   */
  _renderCocuklariniEsitle() {
    const ro = []
    for (const e of this.children ?? []) {
      const r = e.findRenderObject()
      if (r) ro.push(r)
    }
    this.renderObject.cocuklariAyarla(ro)
  }
}

/**
 * Çoklu çocuk eşleme algoritması (framework.dart → updateChildren'ın öğretici sürümü):
 * 1) baştan eşleşebilenleri güncelle, 2) sondan eşleşebilenleri ayır, 3) ortadaki eski çocuklardan
 * key'lileri haritaya koy, key'sizleri kaldır, 4) ortadaki yeni widget'ları key ile eşle ya da yeniden şişir,
 * 5) sondakileri güncelle, 6) haritada kalan eski key'lileri kaldır.
 * @param {Element} ebeveyn @param {Element[]} eskiler @param {Widget[]} yeniler
 * @returns {Element[]}
 */
export function updateChildren(ebeveyn, eskiler, yeniler) {
  let eskiBas = 0
  let yeniBas = 0
  let eskiSon = eskiler.length - 1
  let yeniSon = yeniler.length - 1
  /** @type {Element[]} */
  const sonuc = new Array(yeniler.length)

  while (eskiBas <= eskiSon && yeniBas <= yeniSon && Widget.canUpdate(eskiler[eskiBas].widget, yeniler[yeniBas])) {
    sonuc[yeniBas] = /** @type {Element} */ (ebeveyn.updateChild(eskiler[eskiBas], yeniler[yeniBas], yeniBas))
    eskiBas++
    yeniBas++
  }
  while (eskiBas <= eskiSon && yeniBas <= yeniSon && Widget.canUpdate(eskiler[eskiSon].widget, yeniler[yeniSon])) {
    eskiSon--
    yeniSon--
  }
  /** @type {Map<unknown, Element>} */
  const keyliEskiler = new Map()
  for (let i = eskiBas; i <= eskiSon; i++) {
    const e = eskiler[i]
    if (e.widget.key !== null && e.widget.key !== undefined) keyliEskiler.set(e.widget.key, e)
    else ebeveyn.deactivateChild(e)
  }
  for (let i = yeniBas; i <= yeniSon; i++) {
    const w = yeniler[i]
    let eski = null
    if (w.key !== null && w.key !== undefined) {
      const aday = keyliEskiler.get(w.key)
      if (aday && Widget.canUpdate(aday.widget, w)) {
        eski = aday
        keyliEskiler.delete(w.key)
      }
    }
    sonuc[i] = /** @type {Element} */ (ebeveyn.updateChild(eski, w, i))
  }
  // Sondaki eşleşmiş blok
  const fark = eskiler.length - yeniler.length
  for (let i = yeniSon + 1; i < yeniler.length; i++) {
    sonuc[i] = /** @type {Element} */ (ebeveyn.updateChild(eskiler[i + fark], yeniler[i], i))
  }
  for (const e of keyliEskiler.values()) ebeveyn.deactivateChild(e)
  return sonuc
}

// ---------------------------------------------------------------------------------------------
// Somut widget'lar (Flutter adlarıyla)

/** dart:ui'daki RichText'in karşılığı: yaprak RenderObject widget'ı. */
export class RichText extends LeafRenderObjectWidget {
  /** @param {{ key?: unknown, text: string }} p */
  constructor({ key, text }) {
    super({ key })
    this.text = text
  }

  createRenderObject() {
    return new RenderParagraph(this.text)
  }

  updateRenderObject(_c, ro) {
    ro.metniDegistir(this.text)
  }
}

/** Gerçekte de Text bir StatelessWidget'tır ve RichText döndürür. */
export class Text extends StatelessWidget {
  /** @param {string} text @param {{ key?: unknown }} [p] */
  constructor(text, { key } = {}) {
    super({ key })
    this.text = text
  }

  build() {
    return new RichText({ text: this.text })
  }
}

export class Padding extends SingleChildRenderObjectWidget {
  /** @param {{ key?: unknown, padding: EdgeInsets, child?: Widget }} p */
  constructor({ key, padding, child }) {
    super({ key, child })
    this.padding = padding
  }

  createRenderObject() {
    return new RenderPadding(this.padding)
  }

  updateRenderObject(_c, ro) {
    if (ro.padding !== this.padding) {
      ro.padding = this.padding
      ro.markNeedsLayout()
    }
  }
}

export class SizedBox extends SingleChildRenderObjectWidget {
  /** @param {{ key?: unknown, width?: number, height?: number, child?: Widget }} p */
  constructor({ key, width, height, child } = {}) {
    super({ key, child })
    this.width = width
    this.height = height
  }

  _ek() {
    return new BoxConstraints({
      minWidth: this.width ?? 0,
      maxWidth: this.width ?? Infinity,
      minHeight: this.height ?? 0,
      maxHeight: this.height ?? Infinity,
    })
  }

  createRenderObject() {
    return new RenderConstrainedBox(this._ek())
  }

  updateRenderObject(_c, ro) {
    const ek = this._ek()
    if (!ek.equals(ro.ek)) {
      ro.ek = ek
      ro.markNeedsLayout()
    }
  }
}

export class ColoredBox extends SingleChildRenderObjectWidget {
  /** @param {{ key?: unknown, karakter: string, child?: Widget }} p */
  constructor({ key, karakter, child }) {
    super({ key, child })
    this.karakter = karakter
  }

  createRenderObject() {
    return new RenderColoredBox(this.karakter)
  }

  updateRenderObject(_c, ro) {
    if (ro.karakter !== this.karakter) {
      ro.karakter = this.karakter
      ro.markNeedsPaint()
    }
  }
}

/** Mini'ye özel: kenarlıklı kutu (Flutter'da Container + BoxDecoration(border: ...)). */
export class Cerceve extends SingleChildRenderObjectWidget {
  createRenderObject() {
    return new RenderCerceve()
  }
}

export class Center extends SingleChildRenderObjectWidget {
  createRenderObject() {
    return new RenderPositionedBox()
  }
}

export class GestureDetector extends SingleChildRenderObjectWidget {
  /** @param {{ key?: unknown, onTap?: () => void, child?: Widget }} p */
  constructor({ key, onTap, child }) {
    super({ key, child })
    this.onTap = onTap ?? null
  }

  createRenderObject() {
    return new RenderPointerListener(this.onTap)
  }

  updateRenderObject(_c, ro) {
    ro.onTap = this.onTap
  }
}

class Flex extends MultiChildRenderObjectWidget {
  /** @param {'yatay' | 'dikey'} yon @param {any} p */
  constructor(yon, { key, children, mainAxisAlignment = 'start', crossAxisAlignment = 'center' } = {}) {
    super({ key, children })
    this.yon = yon
    this.mainAxisAlignment = mainAxisAlignment
    this.crossAxisAlignment = crossAxisAlignment
  }

  createRenderObject() {
    return new RenderFlex({
      yon: this.yon,
      anaHizalama: this.mainAxisAlignment,
      caprazHizalama: this.crossAxisAlignment,
    })
  }

  updateRenderObject(_c, ro) {
    if (ro.anaHizalama !== this.mainAxisAlignment || ro.caprazHizalama !== this.crossAxisAlignment) {
      ro.anaHizalama = this.mainAxisAlignment
      ro.caprazHizalama = this.crossAxisAlignment
      ro.markNeedsLayout()
    }
  }
}

export class Row extends Flex {
  constructor(p = {}) {
    super('yatay', p)
  }
}

export class Column extends Flex {
  constructor(p = {}) {
    super('dikey', p)
  }
}

export class Expanded extends ParentDataWidget {
  /** @param {{ key?: unknown, flex?: number, child: Widget }} p */
  constructor({ key, flex = 1, child }) {
    super({ key, child })
    this.flex = flex
  }

  applyParentData(ro) {
    if (ro.parentData.flex === this.flex) return false
    ro.parentData.flex = this.flex
    return true
  }
}

export { EdgeInsets, Size }
