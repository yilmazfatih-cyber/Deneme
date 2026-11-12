// Flutter'ın meşhur "sayaç" uygulamasının ASCII hâli: `node ornek_sayac.js`
// Aynı uygulamanın Dart karşılığı README'de.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Center,
  Cerceve,
  Column,
  EdgeInsets,
  Expanded,
  GestureDetector,
  Padding,
  Row,
  State,
  StatefulWidget,
  StatelessWidget,
  Text,
} from './asama3_widget_element.js'
import { pumpWidget } from './asama4_build_owner.js'

export class SayacSayfasi extends StatefulWidget {
  /** @param {{ baslik: string }} p */
  constructor({ baslik }) {
    super()
    this.baslik = baslik
  }

  createState() {
    return new SayacDurumu()
  }
}

export class SayacDurumu extends State {
  deger = 0

  artir() {
    this.setState(() => {
      this.deger++
    })
  }

  build() {
    return new Cerceve({
      child: new Column({
        children: [
          new Text(this.widget.baslik),
          new Expanded({ child: new Center({ child: new Text(`Basılma: ${this.deger}`) }) }),
          new Row({
            mainAxisAlignment: 'end',
            children: [new GestureDetector({ onTap: () => this.artir(), child: new Dugme('+1') })],
          }),
        ],
      }),
    })
  }
}

/** Sabit görünümlü küçük düğme: kendi durumu yok. */
export class Dugme extends StatelessWidget {
  /** @param {string} etiket */
  constructor(etiket) {
    super()
    this.etiket = etiket
  }

  build() {
    return new Cerceve({
      child: new Padding({ padding: EdgeInsets.symmetric({ horizontal: 1 }), child: new Text(this.etiket) }),
    })
  }
}

// Doğrudan çalıştırıldıysa gösteri yap.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const t = pumpWidget(new SayacSayfasi({ baslik: 'Mini Flutter' }), { genislik: 24, yukseklik: 8 })
  console.log(t.kare)
  console.log('\n(+1 düğmesine dokunuluyor: x=19, y=5)\n')
  t.dokun(19, 5)
  console.log(t.pump())
  console.log('\nBuild sayıları:', Object.fromEntries(t.binding.buildOwner.buildSayilari))
}
