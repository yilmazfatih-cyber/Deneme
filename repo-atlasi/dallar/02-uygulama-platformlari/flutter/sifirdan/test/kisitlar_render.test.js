import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoxConstraints, EdgeInsets, Size } from '../asama1_kisitlar.js'
import {
  PipelineOwner,
  RenderConstrainedBox,
  RenderPadding,
  RenderParagraph,
  RenderPositionedBox,
  RenderView,
} from '../asama2_render.js'

test('BoxConstraints: sıkı, gevşek, sıkıştırma, daraltma, gevşetme, sığdırma', () => {
  const k = new BoxConstraints({ minWidth: 10, maxWidth: 20, minHeight: 0, maxHeight: 5 })
  assert.deepEqual(k.constrain(new Size(30, 3)), new Size(20, 3))
  assert.deepEqual(k.constrain(new Size(1, 9)), new Size(10, 5))
  assert.equal(BoxConstraints.tight(new Size(4, 2)).isTight, true)
  assert.equal(BoxConstraints.loose(new Size(4, 2)).isTight, false)
  assert.equal(k.deflate(EdgeInsets.all(2)).toString(), 'BoxConstraints(w=6..16, h=0..1)')
  assert.equal(k.loosen().toString(), 'BoxConstraints(w=0..20, h=0..5)')
  const ek = BoxConstraints.tight(new Size(50, 1)).enforce(k)
  assert.equal(ek.toString(), 'BoxConstraints(w=20, h=1)', 'SizedBox(50) ebeveynin 20 sınırını aşamaz')
  assert.equal(new BoxConstraints().hasBoundedWidth, false)
  assert.throws(() => new BoxConstraints({ minWidth: 5, maxWidth: 2 }), RangeError)
})

/** Kök + boru hattını elle kurar; widget katmanı olmadan render ağacını test etmek için. */
function kok(cocuk, genislik = 20, yukseklik = 4) {
  const owner = new PipelineOwner()
  const view = new RenderView(new Size(genislik, yukseklik))
  owner.rootNode = view
  view.attach(owner)
  view.child = cocuk
  owner.flushLayout()
  return { owner, view }
}

test('kısıtlar aşağı iner, boyutlar yukarı çıkar, konumu ebeveyn belirler', () => {
  const metin = new RenderParagraph('merhaba dünya')
  const dolgu = new RenderPadding(new EdgeInsets(2, 1, 0, 0))
  dolgu.child = metin
  const { owner } = kok(dolgu)
  // Kök sıkı 20x4 verdi → dolgu 20x4 olmak zorunda ve çocuğuna da sıkı 18x3 verir;
  // metin 13 karakter olsa da kutusu 18x3 olur (Flutter'da da sıkı kısıt pazarlık kabul etmez).
  assert.deepEqual(dolgu.size, new Size(20, 4))
  assert.equal(metin.constraints?.toString(), 'BoxConstraints(w=18, h=3)')
  assert.deepEqual(metin.size, new Size(18, 3), 'sıkı kısıtta metin de tam o boyutu alır')
  assert.equal(metin.parentData.offset.toString(), 'Offset(2, 1)')
  assert.equal(owner.flushPaint().split('\n')[1], '  merhaba dünya')
})

test('metin dar alanda kelime kelime kırılır; Center gevşetir, SizedBox sıkı kısıtı gevşetemez', () => {
  const metin = new RenderParagraph('bir iki üç dört')
  const kutu = new RenderConstrainedBox(new BoxConstraints({ maxWidth: 7 }))
  kutu.child = metin
  const merkez = new RenderPositionedBox()
  merkez.child = kutu
  const { owner } = kok(merkez, 20, 5)
  assert.deepEqual(metin.satirlar, ['bir iki', 'üç dört'])
  assert.equal(owner.flushPaint(), '\n      bir iki\n      üç dört\n\n')

  // Aynı kutu doğrudan köke bağlanırsa kök sıkı 20x5 verir; maxWidth: 7 bunu gevşetemez.
  const metin2 = new RenderParagraph('bir iki üç dört')
  const kutu2 = new RenderConstrainedBox(new BoxConstraints({ maxWidth: 7 }))
  kutu2.child = metin2
  kok(kutu2, 20, 5)
  assert.deepEqual(metin2.satirlar, ['bir iki üç dört'])
})

test('yerleşim sınırı: sıkı kısıtlı alt ağaçtaki değişiklik ebeveyni yeniden yerleştirmez', () => {
  const metin = new RenderParagraph('a')
  const kutu = new RenderConstrainedBox(BoxConstraints.tight(new Size(5, 1)))
  kutu.child = metin
  const dolgu = new RenderPadding(EdgeInsets.all(1))
  dolgu.child = kutu
  const { owner } = kok(dolgu)
  const once = { dolgu: dolgu.layoutSayisi, kutu: kutu.layoutSayisi, metin: metin.layoutSayisi }
  metin.metniDegistir('abc')
  assert.deepEqual(
    owner.nodesNeedingLayout.map((n) => n.constructor.name),
    ['RenderParagraph'],
    'metin sıkı kısıt aldığı için kendi sınırıdır; kirlilik yukarı taşınmaz',
  )
  owner.flushLayout()
  assert.equal(metin.layoutSayisi, once.metin + 1)
  assert.equal(kutu.layoutSayisi, once.kutu, 'kutu yeniden yerleşmedi')
  assert.equal(dolgu.layoutSayisi, once.dolgu, 'dolgu yeniden yerleşmedi')
})

test('aynı kısıtla tekrar layout çağrısı erken çıkar', () => {
  const metin = new RenderParagraph('x')
  kok(metin)
  const n = metin.layoutSayisi
  metin.layout(/** @type {BoxConstraints} */ (metin.constraints))
  assert.equal(metin.layoutSayisi, n)
})
