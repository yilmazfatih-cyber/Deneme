---
baslik: CSS mimarisi
ozet: Tailwind, CSS modülleri ve düz CSS arasında seçim; özgüllük ve katmanlar; CSS değişkenleri; bileşen stilini kapsülleme; tema; ölü stil ve dinamik sınıf tuzağı; ölçeklenen adlandırma.
etiketler: [css, tailwind, katman, ozgulluk, tema, onyuz]
duzey: orta
guncellik: 2026-11
---

# CSS mimarisi

> Bu notu ne zaman okumalı: yeni projede stil yöntemini seçerken; "bu stil neden uygulanmıyor", "`className` ile
> verdiğim dolgu işe yaramıyor", "Tailwind sınıfı derlemede yok" sorularında; global CSS dosyası büyümeye başlayınca.

## Temel fikir

Büyüyen CSS'in dört derdi vardır: **tek ad alanı** (iki bileşen aynı `.title` adını kullanır), **sıra** (hangi kural
sonra yüklendiyse o kazanır), **özgüllük savaşı** (`#app .card .title` ile `!important` yarışı) ve **ölü stil** (kimse
silmeye cesaret edemez). İyi bir yöntem dördünü de yapısal olarak çözer: stili bileşene bağlar, değerleri
belirteçlerden (CSS değişkeni) alır, sırayı katmanlarla (`@layer`) açıkça belirler, kullanılmayanı derlemede atar.

Sahibin React projelerinde varsayılan Tailwind'dir (havuzdaki uygulama temeli Tailwind 4). Tailwind 4 kendi
stillerini yerel CSS katmanlarına koyar (`@layer theme, base, components, utilities`; kurulu 4.3.5'in `index.css`
dosyasında görüldü). Bunun önemli bir sonucu var: aynı CSS dosyasına **katmansız** yazdığınız bir kural, özgüllüğü
ne olursa olsun bütün Tailwind yardımcı sınıflarını ezer.

## Karar tablosu: yöntem

| Durum                                                         | Seçim                                 | Neden                                                    |
| ------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| React bileşenleri, tasarım belirteçleri, küçük ekip/küçük model | Tailwind (yardımcı sınıflar)        | Stil bileşenin yanında; ad bulma yok; kullanılmayan üretilmez |
| Karmaşık, tasarıma özel bileşen (çizim, animasyonlu kart)     | CSS modülü (`Kart.module.css`)        | Uzun seçiciler ve durumlar okunur kalır; ad otomatik tekil |
| Durağan site, az JavaScript                                   | Düz CSS + `@layer` + BEM adları       | Derleme gerekmez; katmanlar sırayı yönetir               |
| Var olan büyük düz CSS                                        | Önce `@layer` içine alın, sonra parça parça taşıyın | Sıra sorunları bir anda kaybolur          |
| Çalışma anında stil üreten CSS-in-JS                          | Yeni projede kaçının                  | Çalışma anı maliyeti; sunucu tarafı işleme karmaşası     |
| Tailwind'de aynı uzun sınıf dizisi 5+ yerde                   | Bileşen çıkarın (`<Button>`), `@apply` değil | Yeniden kullanım birimi bileşendir                 |

Yöntemleri karıştırmak sorun değildir (Tailwind + birkaç CSS modülü); sorun, **sıranın** belirsiz kalmasıdır.

## Özgüllük ve katmanlar

Bir özellik için yarışan bildirimlerde kazananı sırasıyla şunlar belirler: (1) önem (`!important`) ve köken,
(2) **katman**, (3) **özgüllük**, (4) dosyadaki sıra. Katman, özgüllükten **önce** gelir.

Özgüllük (a, b, c) üçlüsüdür: a = kimlik (`#id`), b = sınıf, öznitelik, sözde sınıf, c = öğe ve sözde öğe.
`:where()` sıfırdır; `:is()`, `:not()`, `:has()` argümanlarının en yükseğini alır.

```js calistir
import assert from 'node:assert/strict'

// Sadeleştirilmiş özgüllük hesabı (iç içe ayraçlı seçicileri desteklemez).
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
function specificity(selector) {
  let [a, b, c] = [0, 0, 0]
  let s = selector.trim().replace(/:where\([^()]*\)/g, ' ') // :where → 0
  s = s.replace(/:(?:is|not|has)\(([^()]*)\)/g, (_, args) => {
    const best = args.split(',').map(specificity).sort(cmp).at(-1) // en yüksek argüman
    a += best[0]; b += best[1]; c += best[2]
    return ' '
  })
  const take = (re) => { const n = (s.match(re) ?? []).length; s = s.replace(re, ' '); return n }
  a += take(/#[\w-]+/g)
  c += take(/::[\w-]+/g) // sözde öğe
  b += take(/\.[\w-]+|\[[^\]]*\]|:[\w-]+(?:\([^()]*\))?/g) // sınıf, öznitelik, sözde sınıf
  c += take(/\b[a-z][\w-]*/gi) // öğe adları
  return [a, b, c]
}

assert.deepEqual(specificity('#app .btn'), [1, 1, 0])
assert.deepEqual(specificity('button.primary:hover'), [0, 2, 1])
assert.deepEqual(specificity('.card::before'), [0, 1, 1])
assert.deepEqual(specificity('input[type="text"]:focus-visible'), [0, 2, 1])
assert.deepEqual(specificity(':where(#app) a'), [0, 0, 1]) // :where özgüllüğü siler
assert.deepEqual(specificity(':is(#app, .x) p'), [1, 0, 1]) // :is en yükseği alır
console.log('tamam')
```

```cikti
tamam
```

Katmanlar özgüllük savaşını bitirir: sonra tanımlanan katman, önceki katmanın daha özgül kuralını da yener.
`!important`'ta sıra **tersine** döner (önceki katmanın önemlisi kazanır):

```js calistir
import assert from 'node:assert/strict'

const LAYERS = ['reset', 'base', 'components', 'utilities'] // @layer reset, base, components, utilities;
const cmpSpec = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
function rank(decl) {
  const layer = decl.layer === null ? LAYERS.length : LAYERS.indexOf(decl.layer) // katmansız en sonda
  return decl.important ? [1, LAYERS.length - layer] : [0, layer] // önemlide sıra tersine
}
const winner = (decls) =>
  decls.toSorted((x, y) => {
    const [rx, ry] = [rank(x), rank(y)]
    return rx[0] - ry[0] || rx[1] - ry[1] || cmpSpec(x.spec, y.spec) || x.order - y.order
  }).at(-1).value

const component = { layer: 'components', spec: [1, 1, 0], order: 1, value: 'bileşen (#app .btn)' }
const utility = { layer: 'utilities', spec: [0, 1, 0], order: 2, value: 'yardımcı (.text-ink)' }
const unlayered = { layer: null, spec: [0, 1, 0], order: 0, value: 'katmansız (.eski)' }

assert.equal(winner([component, utility]), 'yardımcı (.text-ink)') // katman özgüllüğü yener
assert.equal(winner([component, utility, unlayered]), 'katmansız (.eski)') // katmansız her katmanı yener
assert.equal(
  winner([{ ...component, important: true }, { ...utility, important: true }]),
  'bileşen (#app .btn)', // !important'ta ÖNCEKİ katman kazanır
)
// Aynı katman, aynı özgüllük: HTML'deki sınıf sırası değil, CSS dosyasındaki sıra belirler
const px2 = { layer: 'utilities', spec: [0, 1, 0], order: 10, value: 'px-2' }
const px4 = { layer: 'utilities', spec: [0, 1, 0], order: 11, value: 'px-4' }
assert.equal(winner([px4, px2]), 'px-4') // class="px-4 px-2" de olsa px-4
console.log('tamam')
```

Kurallar: seçiciler tek sınıf düzeyinde düz kalsın; CSS'te `#id` kullanmayın; sıfırlama ve temel stiller
`:where()` içinde ya da `base` katmanında; `!important` yalnız yardımcı sınıflarda ve bilerek.

## CSS değişkenleri

- Değişkenler kalıtılır ve **kapsamlanabilir**: `.card { --pad: 1rem }` yalnız o kartın içini etkiler. Bileşen bir
  "ayar düğmesi" sunabilir: `.btn { background: var(--btn-bg, var(--accent)) }`.
- `var(--x, yedek)` yedeği yalnız değişken **tanımsızsa** kullanır. Tanımlı ama özellik için geçersiz bir değer
  (ör. `--gap: kırmızı` → `gap: var(--gap)`) "hesaplanan değer anında geçersiz" olur: özellik `unset`'e düşer;
  önceki bildirime **dönmez**. Belirti: kural uygulanıyor görünür ama renk/boşluk kalıtılan değerde kalır.
- Birimsiz sayı tutup kullanırken birim ekleyin: `calc(var(--adim) * 1rem)`.
- `@property` ile tipli değişken (renk, uzunluk) tanımlanır; ancak o zaman değişken canlandırılabilir (gradyan
  geçişi). Desteği hedef tarayıcılarda doğrulayın.
- JavaScript'ten tema değiştirmek: `document.documentElement.dataset.theme = 'dark'`; tek tek renk yazmayın.

## Bileşen stilini kapsülleme

| Yol                           | Nasıl kapsüller                                  | Dikkat                                                  |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Tailwind sınıfları            | Stil öğenin üzerinde; global ad yok              | Tekrar eden diziyi bileşene alın                        |
| CSS modülü                    | Sınıf adı derlemede tekilleştirilir (`title_x7a`) | Global seçici (`:global`) kaçış kapısıdır; az kullanın |
| BEM adlandırma (düz CSS)      | `.kart`, `.kart__baslik`, `.kart--vurgulu`       | Disiplin ister; kural testi/lint ile koruyun            |
| `@scope`                      | Seçiciyi bir alt ağaca bağlar                    | Yeni; hedef tarayıcılarda desteği doğrulayın            |
| Gölge DOM (web bileşeni)      | Tam yalıtım                                      | Dış tema yalnız CSS değişkeniyle girer                  |

Bileşen CSS'inde çıplak öğe seçicisi (`button { … }`) yazmayın; o kural uygulamanın bütün düğmelerini etkiler.
Öğe seçicileri yalnız `base` katmanında durur.

## Tema

Renkler `:root`'ta ve `[data-theme='dark']`'ta değişken olarak tanımlanır, bileşenler yalnız değişken adını kullanır
(ayrıntı: [tasarım sistemi](tasarim-sistemi.md)). Tailwind 4'te bağlama `@theme inline { --color-surface:
var(--surface) }` ile yapılır ve `bg-surface` sınıfı doğar; koyu tema `@custom-variant dark (…)` ile tanımlanır.
Çalışan örnek: [`index.css`](../../uygulama/web/src/styles/index.css). Belirteçler temaya göre değiştiği için
bileşenlerde `dark:` öneki çoğu zaman **gereksizdir**; `dark:` yalnız temaya göre farklı **davranış** (ör. görsel
değiştirme) için kalır.

## Ölü stil ve dinamik sınıf tuzağı

Tailwind kaynak dosyalarını **metin olarak** tarar ve yalnız orada tam yazılmış sınıf adlarını üretir. Çalışma anında
birleştirilen ad derlemede yoktur:

```js calistir
import assert from 'node:assert/strict'

// Tarayıcının (scanner) kaba benzetimi: kaynaktaki tam sözcükleri aday sınıf sayar.
const candidates = (source) => new Set(source.split(/[\s"'`{}()<>=,;:]+/).filter((token) => /^[a-z][a-z0-9/-]*$/.test(token)))

const wrong = 'const cls = `bg-${tone} text-white`' // tone = "danger" olsa da "bg-danger" metinde YOK
const right = "const TONE = { hata: 'bg-danger', tamam: 'bg-ok' }; const cls = TONE[tone]"

assert.equal(candidates(wrong).has('bg-danger'), false) // derlemede üretilmez: renk gelmez, hata da vermez
assert.equal(candidates(right).has('bg-danger'), true) // tam adlar bir eşlemede: üretilir
console.log('tamam')
```

Çözüm her zaman tam sınıf adlarını bir eşlemede tutmaktır (yukarıdaki `TONE` ya da [tasarım
sistemi](tasarim-sistemi.md) notundaki `VARIANT`). Veriden gelen ve önceden bilinemeyen bir değer (kullanıcının
seçtiği liste rengi) sınıf değil **CSS değişkeni** olur: `style={{ '--list-color': color }}` + `bg-(--list-color)`
gibi bir kullanım. Tailwind 4.3.5'te `@source inline("…")` ile sınıfı zorla üretmek de mümkündür (kurulu paketin
kaynağında görüldü); son çaredir.

Düz CSS'te ölü stil: bileşen klasöründe kendi CSS dosyası olsun, bileşen silinince stili de silinsin. Tarayıcının
"Coverage" aracı kullanılmayan kuralları gösterir (bir sayfada kullanılmaması hiç kullanılmadığı anlamına gelmez).

## Ölçeklenen adlandırma

- Bileşen öneki: `.kart`, `.kart__baslik`, `.kart--vurgulu` (BEM). `.title`, `.container`, `.active` gibi genel adlar
  çakışır.
- Durumu sınıfla değil özniteliğe göre biçimleyin: `[aria-expanded='true']`, `[aria-invalid='true']`,
  `[data-state='open']`. Hem erişilebilirlik bilgisi doğru kalır hem durum tek yerden gelir. Tailwind'de karşılığı
  `aria-expanded:`, `aria-invalid:`, `data-[state=open]:` önekleri (uygulama temelinin alanları
  `aria-invalid:border-danger` kullanır).
- Katman adları projede sabit ve tektir: `reset, base, components, utilities`.

## Sınıf çakışması

`cx('px-4', className)` iki sınıfı yan yana yazar; çakışmayı **çözmez**. `className="px-6"` verilince hangisinin
kazanacağını Tailwind'in ürettiği CSS'teki sıra belirler (yukarıdaki örnek). İki yol:

1. Bileşen dışarıdan yalnız **yerleşim** almaya izin verir (genişlik, hizalama, dış boşluk); renk ve dolgu
   `variant`/`size` ile değişir. Uygulama temelinin `cx.ts` dosyası bu yolu seçmiştir.
2. Çakışmaları birleştiren bir yardımcı kütüphane (`tailwind-merge` gibi) eklemek; bir bağımlılık daha ve çalışma anı
   maliyeti demektir.

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| Yazdığım Tailwind sınıfı hiç uygulanmıyor                     | `index.css`'te katmansız bir kural aynı özelliği veriyor      | Özel kuralı `@layer components` (ya da `base`) içine alın |
| Sınıf derlemede yok, renk gelmiyor                            | Ad çalışma anında birleştirildi (`bg-${x}`)                   | Tam adlar eşlemede; veri değeri için CSS değişkeni        |
| `className="px-6"` bileşenin dolgusunu değiştirmiyor          | Aynı katman/özgüllükte CSS sırası `px-4`'ü kazandırıyor       | Dolgu `size` ile; ya da birleştirme yardımcısı            |
| Stil yalnız bir sayfada bozuk                                 | O sayfanın CSS'i sonra yükleniyor (sıra)                      | Katmanlar; global seçicileri kaldırın                     |
| `!important` zinciri                                          | Özgüllük savaşı                                               | Katman + düz seçiciler                                    |
| `var(--x, yedek)` yedeği çalışmıyor                           | Değişken tanımlı ama geçersiz değerli                         | Değişkenin değerini düzeltin; yedek yalnız tanımsızda     |
| Koyu temada bir bileşen açık kalıyor                          | Bileşende ham renk; `dark:` öneki unutulmuş                   | Anlamsal belirteç; `dark:` gerekmez                       |
| Silinmiş bileşenin stili duruyor                              | Stiller merkezi dosyada                                       | Bileşenle aynı klasörde stil; birlikte silinir            |
| Düğmenin stili uygulamadaki her düğmeyi değiştirdi            | Bileşen CSS'inde `button { }`                                 | Sınıf seçicisi; öğe seçicileri yalnız `base`'te           |

## Denetim listesi

- [ ] Projede tek bir yöntem seçili ve `docs/KARARLAR.md`'de yazılı; karışım varsa sınırı belli.
- [ ] Bütün özel CSS bir katmanda (`@layer base/components`); katmansız kural yok (bilinçli istisnalar yorumlu).
- [ ] Seçiciler düz (en çok iki sınıf); CSS'te `#id` ve gereksiz `!important` yok.
- [ ] Renk, boşluk, yarıçap değerleri değişkenlerden; ham değer yalnız belirteç dosyasında.
- [ ] Dinamik sınıf adı birleştirilmiyor; değişkenler eşlemede tam adla.
- [ ] Durum biçimleri `aria-*`/`data-*` özniteliklerine bağlı.
- [ ] Bileşenin stili bileşenle aynı yerde; bileşen silinince stili de gidiyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Stil için yalnız Tailwind sınıfları ve `index.css`'teki belirteçler. Sınıf adını dizgi
  birleştirerek üretme; değişkenleri tam adlı bir eşlemede tut. `index.css`'e yeni kural gerekiyorsa `@layer
  components` içine yaz. `!important` ve `#id` seçici kullanma."
- **Modelin tipik hatası:** `` `text-${renk}-600` `` gibi dinamik sınıf; `index.css`'e katmansız kural ekleyip
  Tailwind'i ezmek; çakışmayı `!important` ile çözmek; her bileşene `dark:` öneki serpmek.
- **Çıktıda arayın:** şablon dizgisi içinde `bg-`, `text-`, `border-`; `!important`; `@layer` dışındaki yeni CSS
  kuralları; `style={{ color: … }}` ile ham renkler.
- **Doğrulama isteyin:** derleme sonrası üretilen CSS'te yeni sınıfın bulunduğunu (`dist/assets/*.css` içinde
  arama) ve ekran görüntüsünü.

## İlgili

- [Tasarım sistemi](tasarim-sistemi.md) — belirteçler, değişkenler, tema
- [Duyarlı tasarım ve mobil](duyarli-tasarim-ve-mobil.md) — yerleşim araçları
- [Web performansı](web-performansi.md) — CSS'in çizimi engellemesi
- Çalışan örnekler: [`index.css`](../../uygulama/web/src/styles/index.css) (katmanlar, tema, belirteçler),
  [`cx.ts`](../../uygulama/web/src/ui/cx.ts)
