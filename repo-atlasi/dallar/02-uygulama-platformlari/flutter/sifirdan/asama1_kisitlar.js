// Aşama 1 — Geometri ve kutu kısıtları (BoxConstraints).
//
// Flutter yerleşiminin tek cümlelik özeti: "Kısıtlar aşağı iner, boyutlar yukarı çıkar, konumu ebeveyn belirler."
// Ebeveyn çocuğuna "genişliğin min..max, yüksekliğin min..max arasında olsun" der (kısıt), çocuk bu aralıkta
// kendine bir boyut seçer ve bildirir; ebeveyn de çocuğu nereye koyacağına karar verir.
// Gerçek: packages/flutter/lib/src/rendering/box.dart (BoxConstraints),
//         engine/src/flutter/lib/ui/geometry.dart (Size, Offset — dart:ui).
// Bu mini'de birim "karakter hücresi"dir; ekran ASCII tuvaldir.

export class Size {
  /** @param {number} width @param {number} height */
  constructor(width, height) {
    this.width = width
    this.height = height
  }

  static zero = new Size(0, 0)

  /** @param {Size} o */
  equals(o) {
    return o instanceof Size && o.width === this.width && o.height === this.height
  }

  toString() {
    return `Size(${this.width}, ${this.height})`
  }
}

export class Offset {
  /** @param {number} dx @param {number} dy */
  constructor(dx, dy) {
    this.dx = dx
    this.dy = dy
  }

  static zero = new Offset(0, 0)

  /** @param {Offset} o */
  plus(o) {
    return new Offset(this.dx + o.dx, this.dy + o.dy)
  }

  toString() {
    return `Offset(${this.dx}, ${this.dy})`
  }
}

export class EdgeInsets {
  /** @param {number} left @param {number} top @param {number} right @param {number} bottom */
  constructor(left, top, right, bottom) {
    this.left = left
    this.top = top
    this.right = right
    this.bottom = bottom
  }

  /** @param {number} v */
  static all(v) {
    return new EdgeInsets(v, v, v, v)
  }

  /** @param {{ horizontal?: number, vertical?: number }} p */
  static symmetric({ horizontal = 0, vertical = 0 }) {
    return new EdgeInsets(horizontal, vertical, horizontal, vertical)
  }

  get horizontal() {
    return this.left + this.right
  }

  get vertical() {
    return this.top + this.bottom
  }
}

const sinirla = (x, min, max) => Math.min(Math.max(x, min), max)

export class BoxConstraints {
  /** @param {{ minWidth?: number, maxWidth?: number, minHeight?: number, maxHeight?: number }} [p] */
  constructor({ minWidth = 0, maxWidth = Infinity, minHeight = 0, maxHeight = Infinity } = {}) {
    if (minWidth > maxWidth || minHeight > maxHeight) {
      throw new RangeError(`Geçersiz kısıt: w ${minWidth}..${maxWidth}, h ${minHeight}..${maxHeight}`)
    }
    this.minWidth = minWidth
    this.maxWidth = maxWidth
    this.minHeight = minHeight
    this.maxHeight = maxHeight
  }

  /** Tam olarak bu boyut (sıkı kısıt). @param {Size} s */
  static tight(s) {
    return new BoxConstraints({ minWidth: s.width, maxWidth: s.width, minHeight: s.height, maxHeight: s.height })
  }

  /** 0..s arası (gevşek kısıt). @param {Size} s */
  static loose(s) {
    return new BoxConstraints({ maxWidth: s.width, maxHeight: s.height })
  }

  /** Boyutu kısıt aralığına sıkıştırır. @param {Size} s */
  constrain(s) {
    return new Size(sinirla(s.width, this.minWidth, this.maxWidth), sinirla(s.height, this.minHeight, this.maxHeight))
  }

  /** Dolgu kadar küçültülmüş kısıt (Padding çocuğuna bunu verir). @param {EdgeInsets} e */
  deflate(e) {
    const w = Math.max(0, this.minWidth - e.horizontal)
    const h = Math.max(0, this.minHeight - e.vertical)
    return new BoxConstraints({
      minWidth: w,
      maxWidth: Math.max(w, this.maxWidth - e.horizontal),
      minHeight: h,
      maxHeight: Math.max(h, this.maxHeight - e.vertical),
    })
  }

  /** Alt sınırları kaldırır (Center çocuğuna bunu verir). */
  loosen() {
    return new BoxConstraints({ maxWidth: this.maxWidth, maxHeight: this.maxHeight })
  }

  /** Bu kısıtı `ust` kısıtın içine sığdırır (SizedBox'ın ek kısıtı ebeveyninkini aşamaz). @param {BoxConstraints} ust */
  enforce(ust) {
    return new BoxConstraints({
      minWidth: sinirla(this.minWidth, ust.minWidth, ust.maxWidth),
      maxWidth: sinirla(this.maxWidth, ust.minWidth, ust.maxWidth),
      minHeight: sinirla(this.minHeight, ust.minHeight, ust.maxHeight),
      maxHeight: sinirla(this.maxHeight, ust.minHeight, ust.maxHeight),
    })
  }

  get biggest() {
    return this.constrain(new Size(Infinity, Infinity))
  }

  get smallest() {
    return new Size(this.minWidth, this.minHeight)
  }

  get isTight() {
    return this.minWidth === this.maxWidth && this.minHeight === this.maxHeight
  }

  get hasBoundedWidth() {
    return this.maxWidth < Infinity
  }

  get hasBoundedHeight() {
    return this.maxHeight < Infinity
  }

  /** @param {BoxConstraints | null} o */
  equals(o) {
    return (
      o instanceof BoxConstraints &&
      o.minWidth === this.minWidth &&
      o.maxWidth === this.maxWidth &&
      o.minHeight === this.minHeight &&
      o.maxHeight === this.maxHeight
    )
  }

  toString() {
    const a = (min, max) => (min === max ? `${min}` : `${min}..${max === Infinity ? '∞' : max}`)
    return `BoxConstraints(w=${a(this.minWidth, this.maxWidth)}, h=${a(this.minHeight, this.maxHeight)})`
  }
}
