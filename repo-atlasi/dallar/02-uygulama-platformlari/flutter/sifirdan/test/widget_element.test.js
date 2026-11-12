import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  Column,
  EdgeInsets,
  Expanded,
  InheritedWidget,
  Padding,
  Row,
  SizedBox,
  State,
  StatefulWidget,
  StatelessWidget,
  Text,
  Widget,
} from '../asama3_widget_element.js'
import { pumpWidget } from '../asama4_build_owner.js'
import { SayacDurumu, SayacSayfasi } from '../ornek_sayac.js'

/** Her örneği kendine ait bir sayı tutan satır. */
class Oge extends StatefulWidget {
  constructor({ key = null, ad }) {
    super({ key })
    this.ad = ad
  }

  createState() {
    return new OgeDurumu()
  }
}

let sonrakiNo = 1
const atilanlar = []
class OgeDurumu extends State {
  no = sonrakiNo++
  dispose() {
    atilanlar.push(this.no)
  }
  build() {
    return new Text(`${this.widget.ad}#${this.no}`)
  }
}

class Liste extends StatelessWidget {
  constructor(cocuklar) {
    super()
    this.cocuklar = cocuklar
  }
  build() {
    return new Column({ crossAxisAlignment: 'start', children: this.cocuklar })
  }
}

test('Widget.canUpdate: aynı tür ve aynı key', () => {
  assert.equal(Widget.canUpdate(new Text('a'), new Text('b')), true)
  assert.equal(Widget.canUpdate(new Text('a', { key: 1 }), new Text('a', { key: 2 })), false)
  assert.equal(Widget.canUpdate(new Text('a'), new SizedBox()), false)
})

test('altın görüntü (golden) + dokunma: sayaç artar, State korunur', () => {
  const t = pumpWidget(new SayacSayfasi({ baslik: 'Mini Flutter' }), { genislik: 24, yukseklik: 8 })
  const beklenen = [
    '+----------------------+',
    '|     Mini Flutter     |',
    '|      Basılma: 0      |',
    '|                      |',
    '|                +----+|',
    '|                | +1 ||',
    '|                +----+|',
    '+----------------------+',
  ].join('\n')
  assert.equal(t.kare, beklenen)
  const durum = t.state(SayacSayfasi)
  assert.ok(durum instanceof SayacDurumu)
  assert.equal(t.dokun(2, 2), false, 'düğme dışında dokunma bir şey yapmaz')
  assert.equal(t.dokun(19, 5), true)
  assert.equal(t.binding.kareIstendi, true, 'setState kare istedi')
  assert.match(t.pump(), /Basılma: 1/)
  assert.equal(t.state(SayacSayfasi), durum, 'aynı State nesnesi')
})

test('üst widget yeniden verilince State korunur; key değişince sıfırlanır ve eski dispose edilir', () => {
  const t = pumpWidget(new Padding({ padding: EdgeInsets.all(0), child: new Oge({ ad: 'a' }) }))
  const ilk = t.state(Oge).no
  t.pumpWidget(new Padding({ padding: EdgeInsets.all(0), child: new Oge({ ad: 'b' }) }))
  assert.equal(t.state(Oge).no, ilk, 'aynı tür + key yok → aynı Element, aynı State')
  assert.match(t.kare, new RegExp(`b#${ilk}`))
  t.pumpWidget(new Padding({ padding: EdgeInsets.all(0), child: new Oge({ key: 'yeni', ad: 'b' }) }))
  assert.notEqual(t.state(Oge).no, ilk, 'key değişti → yeni State')
  assert.ok(atilanlar.includes(ilk), 'eski State finalizeTree sırasında dispose edildi')
})

test("key ile sıralama değişince State widget'ı izler; key yoksa konumda kalır (klasik tuzak)", () => {
  const keyli = pumpWidget(new Liste([new Oge({ key: 'x', ad: 'X' }), new Oge({ key: 'y', ad: 'Y' })]))
  const once = keyli.elementler(Oge).map((e) => e.state.no)
  keyli.pumpWidget(new Liste([new Oge({ key: 'y', ad: 'Y' }), new Oge({ key: 'x', ad: 'X' })]))
  const sonra = keyli.elementler(Oge).map((e) => e.state.no)
  assert.deepEqual(sonra, [once[1], once[0]], 'State nesneleri yer değiştirdi')
  assert.match(keyli.kare, new RegExp(`^Y#${once[1]}\\nX#${once[0]}`))

  const keysiz = pumpWidget(new Liste([new Oge({ ad: 'X' }), new Oge({ ad: 'Y' })]))
  const o2 = keysiz.elementler(Oge).map((e) => e.state.no)
  keysiz.pumpWidget(new Liste([new Oge({ ad: 'Y' }), new Oge({ ad: 'X' })]))
  const s2 = keysiz.elementler(Oge).map((e) => e.state.no)
  assert.deepEqual(s2, o2, 'State konumda kaldı, yalnızca widget verisi değişti')
  assert.match(keysiz.kare, new RegExp(`^Y#${o2[0]}\\nX#${o2[1]}`))
})

test("ortadan eleman silme ve ekleme: key'li eşleme doğru State'leri korur", () => {
  const t = pumpWidget(new Liste(['a', 'b', 'c', 'd'].map((k) => new Oge({ key: k, ad: k.toUpperCase() }))), {
    yukseklik: 6,
  })
  const no = Object.fromEntries(t.elementler(Oge).map((e) => [e.widget.key, e.state.no]))
  t.pumpWidget(new Liste(['a', 'e', 'c', 'd'].map((k) => new Oge({ key: k, ad: k.toUpperCase() }))))
  const yeni = Object.fromEntries(t.elementler(Oge).map((e) => [e.widget.key, e.state.no]))
  assert.equal(yeni.a, no.a)
  assert.equal(yeni.c, no.c)
  assert.equal(yeni.d, no.d)
  assert.ok(!Object.values(no).includes(yeni.e), 'e yeni State aldı')
  assert.ok(atilanlar.includes(no.b), 'b dispose edildi')
  assert.deepEqual(t.kare.split('\n').slice(0, 4), [`A#${no.a}`, `E#${yeni.e}`, `C#${no.c}`, `D#${no.d}`])
})

test('setState yalnızca kirli alt ağacı yeniden build eder', () => {
  let digerBuild = 0
  class Diger extends StatelessWidget {
    build() {
      digerBuild++
      return new Text('sabit')
    }
  }
  // SayacSayfasi içinde Expanded var; Column'a doğrudan konsaydı yüksekliği sınırsız kalır ve
  // Flutter'daki gibi "flex var ama kısıt sınırsız" hatası alırdık. Bu yüzden Expanded ile sarıyoruz.
  const t = pumpWidget(
    new Column({ children: [new Diger(), new Expanded({ child: new SayacSayfasi({ baslik: 's' }) })] }),
    {
      genislik: 20,
      yukseklik: 9,
    },
  )
  const sayacBuild = t.binding.buildOwner.buildSayilari.get('SayacSayfasi')
  t.state(SayacSayfasi).artir()
  t.pump()
  assert.equal(digerBuild, 1, 'kardeş widget yeniden build edilmedi')
  assert.equal(t.binding.buildOwner.buildSayilari.get('SayacSayfasi'), sayacBuild + 1)
})

test('aynı widget nesnesi (Dart const) alt ağacı hiç build ettirmez', () => {
  let n = 0
  class Pahali extends StatelessWidget {
    build() {
      n++
      return new Text('p')
    }
  }
  const sabit = new Pahali()
  class Kap extends StatefulWidget {
    createState() {
      return new KapDurumu()
    }
  }
  class KapDurumu extends State {
    sayi = 0
    build() {
      return new Column({ children: [new Text(String(this.sayi)), sabit] })
    }
  }
  const t = pumpWidget(new Kap())
  t.state(Kap).setState(() => t.state(Kap).sayi++)
  t.pump()
  assert.equal(n, 1)
})

test('InheritedWidget: yalnızca bağımlı olanlar yeniden build edilir', () => {
  class Tema extends InheritedWidget {
    constructor({ karakter, child }) {
      super({ child })
      this.karakter = karakter
    }
    updateShouldNotify(eski) {
      return eski.karakter !== this.karakter
    }
  }
  let bagimli = 0
  let bagimsiz = 0
  class TemaliYazi extends StatelessWidget {
    build(context) {
      bagimli++
      return new Text(`tema:${context.dependOnInheritedWidgetOfExactType(Tema).karakter}`)
    }
  }
  class SadeYazi extends StatelessWidget {
    build() {
      bagimsiz++
      return new Text('sade')
    }
  }
  const govde = new Column({ children: [new TemaliYazi(), new SadeYazi()] })
  const t = pumpWidget(new Tema({ karakter: '*', child: govde }))
  t.pumpWidget(new Tema({ karakter: '#', child: govde }))
  assert.match(t.kare, /tema:#/)
  assert.equal(bagimli, 2)
  assert.equal(bagimsiz, 1, 'aynı govde nesnesi → bağımsız widget build edilmedi')
  t.pumpWidget(new Tema({ karakter: '#', child: govde }))
  assert.equal(bagimli, 2, 'updateShouldNotify false → bildirim yok')
})

test('Expanded flex oranında böler; taşma "!" ile görünür; sınırsız eksende flex hata verir', () => {
  const t = pumpWidget(
    new Row({
      children: [
        new SizedBox({ width: 6, child: new Text('sabit') }),
        new Expanded({ flex: 1, child: new Text('bir') }),
        new Expanded({ flex: 2, child: new Text('iki') }),
      ],
    }),
    { genislik: 30, yukseklik: 1 },
  )
  const genislikler = t.elementler(Text).map((e) => e.findRenderObject().size.width)
  assert.deepEqual(genislikler, [6, 8, 16])
  assert.equal(t.kare, 'sabit bir     iki')

  const tasan = pumpWidget(new Row({ children: [new Text('uzun bir metin'), new Text('daha da uzun')] }), {
    genislik: 20,
    yukseklik: 1,
  })
  const flex = tasan.binding.renderView.child
  assert.equal(flex.tasma, 6)
  assert.ok(tasan.kare.endsWith('!'))

  assert.throws(
    () =>
      pumpWidget(new Row({ children: [new Row({ children: [new Expanded({ child: new Text('x') })] })] }), {
        genislik: 10,
        yukseklik: 1,
      }),
    /ana eksen kısıtı sınırsız/,
  )
})

test('dispose edilmiş State üzerinde setState hata verir', () => {
  const t = pumpWidget(new Oge({ ad: 'z' }))
  const durum = t.state(Oge)
  t.pumpWidget(new Text('başka'))
  assert.throws(() => durum.setState(() => {}), /dispose edilmiş/)
})
