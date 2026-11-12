// Aşama 2 — Render ağacı: yerleşim (layout), boyama (paint) ve isabet testi (hit test).
//
// RenderObject'ler ekranda gerçekten yer kaplayan nesnelerdir. Her karede PipelineOwner yalnızca "kirli"
// düğümleri yeniden yerleştirir. Bir düğüm "yerleşim sınırı" (relayout boundary) ise onun değişmesi
// ebeveynini etkilemez; kirlilik sınırda durur. Bu, Flutter'ın büyük ağaçlarda hızlı kalmasının sırrıdır.
// Gerçek: packages/flutter/lib/src/rendering/object.dart (RenderObject, PipelineOwner),
//         box.dart (RenderBox), flex.dart (RenderFlex), shifted_box.dart (RenderPadding, RenderPositionedBox),
//         proxy_box.dart (RenderConstrainedBox, RenderPointerListener), paragraph.dart (RenderParagraph),
//         view.dart (RenderView), custom_paint.dart / debug_overflow_indicator.dart.

import { BoxConstraints, EdgeInsets, Offset, Size } from './asama1_kisitlar.js'

// ---------------------------------------------------------------------------------------------
// ASCII tuval

export class AsciiCanvas {
  /** @param {number} genislik @param {number} yukseklik */
  constructor(genislik, yukseklik) {
    this.genislik = genislik
    this.yukseklik = yukseklik
    /** @type {string[][]} */
    this.hucreler = Array.from({ length: yukseklik }, () => Array(genislik).fill(' '))
  }

  /** Tuval dışına düşen hücreleri sessizce yok sayar. */
  set(x, y, ch) {
    if (x >= 0 && y >= 0 && x < this.genislik && y < this.yukseklik) this.hucreler[y][x] = ch
  }

  fillRect(x, y, w, h, ch) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch)
  }

  drawText(x, y, metin) {
    ;[...metin].forEach((ch, i) => this.set(x + i, y, ch))
  }

  toString() {
    return this.hucreler.map((satir) => satir.join('').trimEnd()).join('\n')
  }
}

export class PaintingContext {
  /** @param {AsciiCanvas} canvas */
  constructor(canvas) {
    this.canvas = canvas
  }

  /** @param {RenderObject} cocuk @param {Offset} ofset */
  paintChild(cocuk, ofset) {
    cocuk.paint(this, ofset)
    cocuk._needsPaint = false
  }
}

// ---------------------------------------------------------------------------------------------
// Boru hattı sahibi

export class PipelineOwner {
  /** @type {RenderObject[]} */
  nodesNeedingLayout = []
  needsPaint = false
  /** @type {RenderObject | null} */
  rootNode = null
  /** @type {(() => void) | null} */
  onNeedVisualUpdate = null

  requestVisualUpdate() {
    this.onNeedVisualUpdate?.()
  }

  /** Kirli düğümleri derinliğe göre sırala ve yeniden yerleştir (sığdan derine). */
  flushLayout() {
    while (this.nodesNeedingLayout.length) {
      const kirliler = this.nodesNeedingLayout.sort((a, b) => a.depth - b.depth)
      this.nodesNeedingLayout = []
      for (const dugum of kirliler) {
        if (dugum._needsLayout && dugum.owner === this) dugum._layoutWithoutResize()
      }
    }
  }

  /**
   * Tüm ağacı yeni bir tuvale boyar. (Gerçek Flutter yalnızca kirli "boyama sınırlarını" yeniden boyar
   * ve sonucu katmanlar hâlinde motora verir.)
   * @returns {string}
   */
  flushPaint() {
    const kok = /** @type {RenderView} */ (this.rootNode)
    const canvas = new AsciiCanvas(kok.size.width, kok.size.height)
    new PaintingContext(canvas).paintChild(kok, Offset.zero)
    this.needsPaint = false
    return canvas.toString()
  }
}

// ---------------------------------------------------------------------------------------------
// RenderObject ve RenderBox

export class RenderObject {
  /** @type {RenderObject | null} */
  parent = null
  /** @type {{ offset: Offset, flex?: number, [k: string]: any }} */
  parentData = { offset: Offset.zero }
  depth = 0
  /** @type {PipelineOwner | null} */
  owner = null
  /** @type {BoxConstraints | null} */
  constraints = null
  _needsLayout = true
  _needsPaint = true
  /** Yerleşim sınırı mıyım? İlk layout'a kadar bilinmez (null). Gerçek: bool? _isRelayoutBoundary */
  /** @type {boolean | null} */
  _isRelayoutBoundary = null
  /** Öğretim için: performLayout kaç kez çalıştı */
  layoutSayisi = 0

  /** @param {(c: RenderObject) => void} _f */
  visitChildren(_f) {}

  /** @param {PipelineOwner} owner */
  attach(owner) {
    this.owner = owner
    if (this._needsLayout && this._isRelayoutBoundary !== null) {
      // Daha önce yerleşmiş ama kirli bir düğüm yeniden bağlanıyor: kuyruğa doğru yoldan gir.
      this._needsLayout = false
      this.markNeedsLayout()
    }
    this.visitChildren((c) => c.attach(owner))
  }

  detach() {
    this.owner = null
    this.visitChildren((c) => c.detach())
  }

  /** @param {RenderObject} cocuk */
  adoptChild(cocuk) {
    // parentData korunur: ParentDataWidget (ör. Expanded) flex değerini buraya yazmış olabilir.
    cocuk.parent = this
    this._derinlikVer(cocuk, this.depth + 1)
    if (this.owner) cocuk.attach(this.owner)
    this.markNeedsLayout()
  }

  _derinlikVer(c, d) {
    c.depth = d
    c.visitChildren((x) => this._derinlikVer(x, d + 1))
  }

  /** @param {RenderObject} cocuk */
  dropChild(cocuk) {
    cocuk.parent = null
    if (cocuk.owner) cocuk.detach()
    this.markNeedsLayout()
  }

  markNeedsLayout() {
    if (this._needsLayout) return
    this._needsLayout = true
    if (this.owner && this._isRelayoutBoundary) {
      // Sınırım: yalnızca kendimi kuyruğa koyarım, ebeveynim etkilenmez.
      this.owner.nodesNeedingLayout.push(this)
      this.owner.requestVisualUpdate()
    } else if (this.parent) {
      // Sınır değilsem boyutum ebeveynimi etkiler: kirliliği yukarı taşı.
      this.parent.markNeedsLayout()
    }
  }

  /**
   * Ebeveynin çağırdığı giriş noktası.
   * @param {BoxConstraints} constraints
   * @param {{ parentUsesSize?: boolean }} [secenek]
   */
  layout(constraints, { parentUsesSize = false } = {}) {
    // Ebeveyn boyutumu kullanmıyorsa ya da kısıt sıkıysa ya da kök isem: ben bir yerleşim sınırıyım
    // (gerçekte bir de sizedByParent koşulu var).
    this._isRelayoutBoundary = !parentUsesSize || constraints.isTight || !this.parent
    if (!this._needsLayout && constraints.equals(this.constraints)) {
      return // Erken çıkış: aynı kısıt, temiz düğüm → hiçbir şey yapma.
    }
    this.constraints = constraints
    this.layoutSayisi++
    this.performLayout()
    this._needsLayout = false
    this.markNeedsPaint()
  }

  /** Sınır düğümünün kendi kısıtıyla yeniden yerleşmesi (gerçek: _layoutWithoutResize). */
  _layoutWithoutResize() {
    this.layoutSayisi++
    this.performLayout()
    this._needsLayout = false
    this.markNeedsPaint()
  }

  performLayout() {
    throw new Error(`${this.constructor.name}.performLayout yazılmamış`)
  }

  markNeedsPaint() {
    if (this._needsPaint) return
    this._needsPaint = true
    if (this.owner) {
      this.owner.needsPaint = true
      this.owner.requestVisualUpdate()
    }
  }

  /** @param {PaintingContext} _baglam @param {Offset} _ofset */
  paint(_baglam, _ofset) {}
}

export class RenderBox extends RenderObject {
  /** @type {Size} */
  size = Size.zero

  /** @param {RenderBox} cocuk @param {BoxConstraints} kisit */
  layoutCocuk(cocuk, kisit) {
    cocuk.layout(kisit, { parentUsesSize: true })
    return cocuk.size
  }

  /**
   * İsabet testi: nokta bendeyse önce çocuklara (üstteki önce), sonra kendime bak.
   * @param {{ yol: RenderBox[] }} sonuc
   * @param {Offset} konum bu kutunun koordinatlarında
   */
  hitTest(sonuc, konum) {
    if (konum.dx < 0 || konum.dy < 0 || konum.dx >= this.size.width || konum.dy >= this.size.height) return false
    const cocuklar = []
    this.visitChildren((c) => cocuklar.push(c))
    for (const c of cocuklar.reverse()) {
      const o = c.parentData.offset
      if (/** @type {RenderBox} */ (c).hitTest(sonuc, new Offset(konum.dx - o.dx, konum.dy - o.dy))) break
    }
    sonuc.yol.push(this)
    return true
  }
}

/** Tek çocuklu kutular için ortak taban (gerçek: RenderObjectWithChildMixin). */
export class RenderTekCocuklu extends RenderBox {
  /** @type {RenderBox | null} */
  #child = null

  get child() {
    return this.#child
  }

  set child(c) {
    if (c === this.#child) return
    if (this.#child) this.dropChild(this.#child)
    this.#child = c
    if (c) this.adoptChild(c)
  }

  visitChildren(f) {
    if (this.#child) f(this.#child)
  }

  paint(baglam, ofset) {
    if (this.#child) baglam.paintChild(this.#child, ofset.plus(this.#child.parentData.offset))
  }
}

/** Ağacın kökü: ekran boyutunu sıkı kısıt olarak çocuğuna verir. */
export class RenderView extends RenderTekCocuklu {
  /** @param {Size} ekran */
  constructor(ekran) {
    super()
    this.ekran = ekran
    this._isRelayoutBoundary = true // kök her zaman yerleşim sınırıdır (gerçek: scheduleInitialLayout)
  }

  performLayout() {
    this.size = this.ekran
    if (this.child) this.child.layout(BoxConstraints.tight(this.ekran))
  }
}

export class RenderPadding extends RenderTekCocuklu {
  /** @param {import('./asama1_kisitlar.js').EdgeInsets} padding */
  constructor(padding) {
    super()
    this.padding = padding
  }

  performLayout() {
    const p = this.padding
    const k = /** @type {BoxConstraints} */ (this.constraints)
    if (!this.child) {
      this.size = k.constrain(new Size(p.horizontal, p.vertical))
      return
    }
    const s = this.layoutCocuk(this.child, k.deflate(p))
    this.child.parentData.offset = new Offset(p.left, p.top)
    this.size = k.constrain(new Size(s.width + p.horizontal, s.height + p.vertical))
  }
}

/** SizedBox'ın render nesnesi: ek kısıtı ebeveyn kısıtına sığdırıp uygular. */
export class RenderConstrainedBox extends RenderTekCocuklu {
  /** @param {BoxConstraints} ek */
  constructor(ek) {
    super()
    this.ek = ek
  }

  performLayout() {
    const k = this.ek.enforce(/** @type {BoxConstraints} */ (this.constraints))
    this.size = this.child ? this.layoutCocuk(this.child, k) : k.constrain(Size.zero)
  }
}

/** Arka planı bir karakterle doldurur (ColoredBox). */
export class RenderColoredBox extends RenderTekCocuklu {
  /** @param {string} karakter */
  constructor(karakter) {
    super()
    this.karakter = karakter
  }

  performLayout() {
    const k = /** @type {BoxConstraints} */ (this.constraints)
    this.size = this.child ? this.layoutCocuk(this.child, k) : k.smallest
  }

  paint(baglam, ofset) {
    baglam.canvas.fillRect(ofset.dx, ofset.dy, this.size.width, this.size.height, this.karakter)
    super.paint(baglam, ofset)
  }
}

/** Çerçeve: 1 hücrelik kenarlık çizer ve çocuğunu içeri iter (Container + BoxDecoration'ın sadesi). */
export class RenderCerceve extends RenderTekCocuklu {
  performLayout() {
    const k = /** @type {BoxConstraints} */ (this.constraints)
    if (!this.child) {
      this.size = k.constrain(new Size(2, 2))
      return
    }
    const s = this.layoutCocuk(this.child, k.deflate(EdgeInsets.all(1)))
    this.child.parentData.offset = new Offset(1, 1)
    this.size = k.constrain(new Size(s.width + 2, s.height + 2))
  }

  paint(baglam, ofset) {
    const { width: w, height: h } = this.size
    const c = baglam.canvas
    for (let i = 1; i < w - 1; i++) {
      c.set(ofset.dx + i, ofset.dy, '-')
      c.set(ofset.dx + i, ofset.dy + h - 1, '-')
    }
    for (let j = 1; j < h - 1; j++) {
      c.set(ofset.dx, ofset.dy + j, '|')
      c.set(ofset.dx + w - 1, ofset.dy + j, '|')
    }
    for (const [x, y] of [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ]) {
      c.set(ofset.dx + x, ofset.dy + y, '+')
    }
    super.paint(baglam, ofset)
  }
}

/** Çocuğunu gevşek kısıtla yerleştirip ortalar (Center / Align). */
export class RenderPositionedBox extends RenderTekCocuklu {
  performLayout() {
    const k = /** @type {BoxConstraints} */ (this.constraints)
    if (!this.child) {
      this.size = k.biggest
      return
    }
    const s = this.layoutCocuk(this.child, k.loosen())
    this.size = k.constrain(new Size(k.hasBoundedWidth ? Infinity : s.width, k.hasBoundedHeight ? Infinity : s.height))
    this.child.parentData.offset = new Offset(
      Math.floor((this.size.width - s.width) / 2),
      Math.floor((this.size.height - s.height) / 2),
    )
  }
}

/** Dokunmaları yakalayan şeffaf kutu (GestureDetector'ın altındaki RenderPointerListener). */
export class RenderPointerListener extends RenderTekCocuklu {
  /** @param {(() => void) | null} onTap */
  constructor(onTap) {
    super()
    this.onTap = onTap
  }

  performLayout() {
    const k = /** @type {BoxConstraints} */ (this.constraints)
    this.size = this.child ? this.layoutCocuk(this.child, k) : k.smallest
  }
}

/** Metin: sığmazsa kelime kelime alt satıra kayar (RenderParagraph'ın çok sadesi). */
export class RenderParagraph extends RenderBox {
  /** @param {string} metin */
  constructor(metin) {
    super()
    this.metin = metin
    /** @type {string[]} */
    this.satirlar = []
  }

  /** Metin değişince yeniden yerleşim iste (gerçekte setter'lar böyle çalışır). @param {string} yeni */
  metniDegistir(yeni) {
    if (yeni === this.metin) return
    this.metin = yeni
    this.markNeedsLayout()
  }

  performLayout() {
    const k = /** @type {BoxConstraints} */ (this.constraints)
    const max = k.hasBoundedWidth ? Math.max(1, k.maxWidth) : Infinity
    this.satirlar = satirlaraBol(this.metin, max)
    const en = Math.max(0, ...this.satirlar.map((s) => [...s].length))
    this.size = k.constrain(new Size(en, this.satirlar.length))
  }

  paint(baglam, ofset) {
    this.satirlar.slice(0, this.size.height).forEach((s, i) => {
      baglam.canvas.drawText(ofset.dx, ofset.dy + i, [...s].slice(0, this.size.width).join(''))
    })
  }
}

/** @param {string} metin @param {number} max */
function satirlaraBol(metin, max) {
  if (max === Infinity) return [metin]
  const satirlar = []
  let satir = ''
  for (const kelime of metin.split(' ')) {
    const aday = satir ? `${satir} ${kelime}` : kelime
    if ([...aday].length <= max) satir = aday
    else {
      if (satir) satirlar.push(satir)
      satir = kelime
      while ([...satir].length > max) {
        satirlar.push([...satir].slice(0, max).join(''))
        satir = [...satir].slice(max).join('')
      }
    }
  }
  satirlar.push(satir)
  return satirlar
}

// ---------------------------------------------------------------------------------------------
// Flex: Row ve Column'un ortak motoru

export class RenderFlex extends RenderBox {
  /** @type {RenderBox[]} */
  cocuklar = []
  /** Taşma miktarı (0 değilse ekranda "!" şeridi görünür) */
  tasma = 0

  /**
   * @param {{ yon: 'yatay' | 'dikey', anaHizalama?: 'start' | 'center' | 'end' | 'spaceBetween',
   *           caprazHizalama?: 'start' | 'center' | 'end' | 'stretch' }} p
   */
  constructor({ yon, anaHizalama = 'start', caprazHizalama = 'center' }) {
    super()
    this.yon = yon
    this.anaHizalama = anaHizalama
    this.caprazHizalama = caprazHizalama
  }

  visitChildren(f) {
    this.cocuklar.forEach(f)
  }

  /** Çocuk listesini yeniden ayarla: eskileri bırak, yenileri sahiplen, sırayı koru. @param {RenderBox[]} yeni */
  cocuklariAyarla(yeni) {
    const ayni = yeni.length === this.cocuklar.length && yeni.every((c, i) => c === this.cocuklar[i])
    if (ayni) return
    for (const eski of this.cocuklar) if (!yeni.includes(eski)) this.dropChild(eski)
    for (const c of yeni) if (!this.cocuklar.includes(c)) this.adoptChild(c)
    this.cocuklar = [...yeni]
    this.markNeedsLayout()
  }

  performLayout() {
    const k = /** @type {BoxConstraints} */ (this.constraints)
    const yatay = this.yon === 'yatay'
    const maxAna = yatay ? k.maxWidth : k.maxHeight
    const maxCapraz = yatay ? k.maxHeight : k.maxWidth
    const kisit = (anaMin, anaMax) => {
      const caprazMin = this.caprazHizalama === 'stretch' ? maxCapraz : 0
      return yatay
        ? new BoxConstraints({ minWidth: anaMin, maxWidth: anaMax, minHeight: caprazMin, maxHeight: maxCapraz })
        : new BoxConstraints({ minWidth: caprazMin, maxWidth: maxCapraz, minHeight: anaMin, maxHeight: anaMax })
    }
    const ana = (s) => (yatay ? s.width : s.height)
    const capraz = (s) => (yatay ? s.height : s.width)

    // 1. geçiş: esnek olmayan çocuklar ana eksende sınırsız kısıtla yerleşir.
    let kullanilan = 0
    let toplamFlex = 0
    let enBuyukCapraz = 0
    for (const c of this.cocuklar) {
      const flex = c.parentData.flex ?? 0
      if (flex > 0) {
        toplamFlex += flex
        continue
      }
      const s = this.layoutCocuk(c, kisit(0, Infinity))
      kullanilan += ana(s)
      enBuyukCapraz = Math.max(enBuyukCapraz, capraz(s))
    }

    // 2. geçiş: kalan alan esnek çocuklara flex oranında dağıtılır.
    if (toplamFlex > 0) {
      if (maxAna === Infinity) {
        throw new Error(
          'RenderFlex: çocuklarda flex var ama ana eksen kısıtı sınırsız. ' +
            '(Flutter\'daki "children have non-zero flex but incoming constraints are unbounded" hatası)',
        )
      }
      const kalan = Math.max(0, maxAna - kullanilan)
      const birim = Math.floor(kalan / toplamFlex)
      let artik = kalan - birim * toplamFlex
      for (const c of this.cocuklar) {
        const flex = c.parentData.flex ?? 0
        if (flex === 0) continue
        let pay = birim * flex
        if (artik > 0 && c === this.cocuklar.filter((x) => (x.parentData.flex ?? 0) > 0).at(-1)) {
          pay += artik
          artik = 0
        }
        const s = this.layoutCocuk(c, kisit(pay, pay))
        kullanilan += ana(s)
        enBuyukCapraz = Math.max(enBuyukCapraz, capraz(s))
      }
    }

    // Boyut: ana eksende alabildiği kadar (mainAxisSize.max), çapraz eksende en büyük çocuk.
    const anaBoyut = maxAna === Infinity ? kullanilan : maxAna
    const caprazBoyut = this.caprazHizalama === 'stretch' ? maxCapraz : enBuyukCapraz
    this.size = k.constrain(yatay ? new Size(anaBoyut, caprazBoyut) : new Size(caprazBoyut, anaBoyut))
    const gercekAna = ana(this.size)
    this.tasma = Math.max(0, kullanilan - gercekAna)

    // 3. konumlandırma: ebeveyn çocukların ofsetini belirler.
    const bos = Math.max(0, gercekAna - kullanilan)
    let bas = 0
    let ara = 0
    if (this.anaHizalama === 'center') bas = Math.floor(bos / 2)
    else if (this.anaHizalama === 'end') bas = bos
    else if (this.anaHizalama === 'spaceBetween' && this.cocuklar.length > 1) {
      ara = Math.floor(bos / (this.cocuklar.length - 1))
    }
    let konum = bas
    for (const c of this.cocuklar) {
      const cs = capraz(c.size)
      const caprazAlan = capraz(this.size)
      let cOfset = 0
      if (this.caprazHizalama === 'center') cOfset = Math.floor((caprazAlan - cs) / 2)
      else if (this.caprazHizalama === 'end') cOfset = caprazAlan - cs
      c.parentData.offset = yatay ? new Offset(konum, cOfset) : new Offset(cOfset, konum)
      konum += ana(c.size) + ara
    }
  }

  paint(baglam, ofset) {
    for (const c of this.cocuklar) baglam.paintChild(c, ofset.plus(c.parentData.offset))
    if (this.tasma > 0) {
      // Flutter'ın sarı-siyah taşma şeridinin ASCII hâli: taşan kenara "!" çiz.
      const { width: w, height: h } = this.size
      if (this.yon === 'yatay') for (let j = 0; j < h; j++) baglam.canvas.set(ofset.dx + w - 1, ofset.dy + j, '!')
      else for (let i = 0; i < w; i++) baglam.canvas.set(ofset.dx + i, ofset.dy + h - 1, '!')
    }
  }
}
