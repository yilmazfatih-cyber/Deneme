---
baslik: CSS düzen
ozet: Kutu modeli, flex ile grid arasında seçim ve sık kalıplar, birimler (rem, vw, dvh, clamp), kapsayıcı sorguları, yığın bağlamı ve z-index, yatay taşma teşhisi, sticky'nin çalışmaması ve özgüllük savaşları.
etiketler: [css, duzen, flexbox, grid, mobil]
duzey: orta
guncellik: 2026-11
---

# CSS düzen

> Bu notu ne zaman okumalı: sayfa telefonda yana kayıyorsa; bir öğe sığmıyor, ortalanmıyor ya da üste çıkmıyorsa;
> `position: sticky` yapışmıyorsa; bir stil "işlemiyor" ve `!important` eklemek üzereyseniz; flex mi grid mi
> diye düşünüyorsanız.

## Temel fikir

- Her öğe bir kutudur: içerik + iç boşluk (padding) + kenarlık (border) + dış boşluk (margin). `box-sizing:
  border-box` olmadan `width: 100%` + `padding` kutuyu taşırır; projenin başında herkese verin.
- **Flex tek eksende** (satır ya da sütun) dağıtır, içerik boyutundan yola çıkar. **Grid iki eksende** ızgara kurar,
  ızgaradan yola çıkar.
- Flex ve grid öğelerinin en küçük genişliği varsayılan olarak **içeriğidir** (`min-width: auto`). Uzun bir
  adres, e-posta ya da kırılmayan metin öğeyi ve sayfayı taşırır. Bu, mobilde yatay kaymanın bir numaralı nedenidir.
- `z-index` yalnız aynı **yığın bağlamı** (stacking context) içinde karşılaştırılır; 9999 vermek bağlamın dışına
  çıkarmaz.
- Bu nottaki tarayıcı davranışları Chromium 153 (başsız) ile denendi; Safari ve Firefox bu ortamda denenmedi.

## Flex mi grid mi

| Durum                                                        | Seçim                                       | Neden                                       |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| Bir satırda düğmeler, simge + metin, araç çubuğu               | Flex                                        | Tek eksen, içerik boyutlu                    |
| Kart ızgarası, galeri                                         | Grid `repeat(auto-fit, minmax(…, 1fr))`     | Sütunlar eşit ve hizalı kalır                |
| Sayfa iskeleti (üst bilgi, içerik, alt bilgi, yan menü)        | Grid `grid-template-rows/areas`             | İki eksen, adlandırılmış bölgeler            |
| Öğeler sığmayınca alt satıra geçsin, her satır kendi düzeninde  | Flex + `flex-wrap: wrap`                    | Satırlar birbirinden bağımsız                |
| Bir öğeyi ortala                                              | Grid `place-items: center`                  | Tek satır                                    |
| Form: etiket + alan sütunları hizalı                           | Grid                                        | Sütun hizası                                 |
| Satırın sonuna it (ör. "Çıkış" sağda)                          | Flex + `margin-inline-start: auto`          |                                             |

## Sık kalıplar

```css
*, *::before, *::after { box-sizing: border-box; }
img, svg, video { max-width: 100%; height: auto; display: block; }

/* Ortalama */
.orta { display: grid; place-items: center; }

/* Yapışkan alt bilgi: içerik kısa olsa da alt bilgi en altta */
body { min-height: 100dvh; display: grid; grid-template-rows: auto 1fr auto; margin: 0; }

/* Eşit sütunlu, kendiliğinden saran kart ızgarası; min() dar ekranda taşmayı önler */
.kartlar { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); }

/* Satır içi araç çubuğu; sığmayan alt satıra geçer */
.arac { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }

/* Esnek sütun içinde uzun metin taşmasın */
.esnek > * { min-width: 0; }
.metin { overflow-wrap: anywhere; }
```

Mantıksal özellikler (`margin-inline-start`, `padding-block`, `inset-inline-end`) sağdan sola dillerde ve "sol el
kipi" gibi aynalanan düzenlerde kendiliğinden doğru davranır; yeni kodda `left/right` yerine bunları tercih edin.

## Birimler

| Birim          | Ne zaman                                                        | Tuzak                                                        |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `rem`          | Yazı boyutu, boşluk                                             | `px` yazı boyutu, tarayıcıdaki "yazı boyutu" ayarını yok sayar |
| `%`            | Kapsayıcıya göre genişlik                                       | Yükseklikte ebeveynin yüksekliği belli değilse işlemez        |
| `vw`           | Nadiren; akışkan değerin bir parçası olarak                     | `100vw` dikey kaydırma çubuğunu da içerir → yatay kayma (aşağıda) |
| `vh`           | Kullanmayın                                                     | Mobilde adres çubuğu gizliyken ölçülür; içerik alttan kesilir  |
| `dvh` / `svh`  | Tam ekran bölüm: `min-height: 100dvh` (`svh`: en küçük görünür alan) | Eski tarayıcı için önce `100vh` yazıp ardından `100dvh` yazın |
| `ch`           | Okunur satır uzunluğu: `max-width: 65ch`                        |                                                              |
| `cqi`          | Kapsayıcı sorgusu içinde kapsayıcı genişliğine göre              | Kapsayıcıda `container-type` yoksa görünüm alanına düşer       |
| `clamp(a, b, c)` | Akışkan yazı ve boşluk: en az `a`, tercihen `b`, en çok `c`    | `b` yalnız `vw` olursa yakınlaştırma yazıyı büyütmez          |

Akışkan yazı boyutunun hesabı (iki ekran genişliği arasında doğrusal büyüme):

```python calistir
def akiskan(en_kucuk_px: float, en_buyuk_px: float, dar_ekran: float = 360, genis_ekran: float = 1200) -> str:
    egim = (en_buyuk_px - en_kucuk_px) / (genis_ekran - dar_ekran)
    kesisim = en_kucuk_px - egim * dar_ekran
    return f"clamp({en_kucuk_px / 16:g}rem, {kesisim / 16:.4f}rem + {egim * 100:.4f}vw, {en_buyuk_px / 16:g}rem)"


def hesapla(ifade: str, ekran: float) -> float:
    """clamp ifadesini verilen ekran genişliğinde piksele çevirir (kök yazı boyutu 16px)."""
    ic = ifade.removeprefix("clamp(").removesuffix(")").split(", ")
    en_az, en_cok = float(ic[0].removesuffix("rem")) * 16, float(ic[2].removesuffix("rem")) * 16
    rem_kisim, vw_kisim = ic[1].split(" + ")
    tercih = float(rem_kisim.removesuffix("rem")) * 16 + float(vw_kisim.removesuffix("vw")) * ekran / 100
    return min(max(en_az, tercih), en_cok)


ifade = akiskan(16, 20)
assert ifade == "clamp(1rem, 0.8929rem + 0.4762vw, 1.25rem)"
assert round(hesapla(ifade, 360), 2) == 16.0
assert round(hesapla(ifade, 780), 2) == 18.0
assert round(hesapla(ifade, 1600), 2) == 20.0  # üst sınırda durur
print(ifade)
```

```cikti
clamp(1rem, 0.8929rem + 0.4762vw, 1.25rem)
```

Tercih edilen değerde `rem` parçası bulunduğu için kullanıcı yakınlaştırınca yazı büyür; yalnız `vw` ile yazılmış
yazı boyutu yakınlaştırmaya tepki vermez (erişilebilirlik hatası).

## Kapsayıcı sorguları

Bileşen, ekranın değil **içinde durduğu kutunun** genişliğine göre düzen değiştirsin istiyorsanız:

```css
.kart-kap { container-type: inline-size; }
.kart { display: block; }
@container (min-width: 25rem) {
  .kart { display: flex; gap: 1rem; }
}
```

Aynı kart dar yan menüde alt alta, geniş içerik alanında yan yana dizilir (Chromium 153 ile denendi: 300 px
kapsayıcıda `block`, 500 px'te `flex`). Ekran genelini ilgilendiren düzen (menünün gizlenmesi) için medya sorgusu
kalır.

## Yığın bağlamı ve z-index

- `z-index` yalnız konumlandırılmış (`position` `static` dışı) öğelerde ve flex/grid **öğelerinde** işler.
- Yeni yığın bağlamı açanlar: `z-index` verilmiş konumlandırılmış öğe, `opacity < 1`, `transform`, `filter`,
  `position: fixed/sticky`, `isolation: isolate`, `will-change: transform`.
- Bağlamın içindeki çocuk ne kadar büyük `z-index` alırsa alsın, bağlamın **kardeşleriyle** ebeveyni üzerinden
  karşılaştırılır. Denendi: `z-index: 1` olan ebeveynin içindeki `z-index: 9999` çocuk, `z-index: 2` olan komşunun
  **altında** kaldı.
- Çözüm sıralaması: (1) modal ve açılır menü için `<dialog>` / `popover` (en üst katmanda açılır, `z-index`
  gerekmez); (2) bileşene `isolation: isolate` verip iç sıralamayı kapsülleyin; (3) projede az sayıda adlandırılmış
  katman tanımlayın (`--z-menu: 10; --z-modal: 20`).

## Yatay taşma teşhisi

Telefonda sayfa yana kayıyorsa bir öğe görünüm alanından geniştir. Tarayıcı konsoluna yapıştırın (Chromium 153'te
denendi; sabit genişlikli öğeyi de, `nowrap` taşan metni de buldu):

```js
const genislik = document.documentElement.clientWidth
for (const el of document.querySelectorAll('body *')) {
  const r = el.getBoundingClientRect()
  const disari = r.right > genislik + 1 || r.left < -1
  const icerik = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible'
  if (disari || icerik) console.log(el, Math.round(r.right - genislik), el.scrollWidth - el.clientWidth)
}
```

| Neden                                               | Çözüm                                                       |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Sabit genişlik (`width: 400px`)                      | `max-width: 100%` ya da `width: min(400px, 100%)`           |
| `width: 100vw` (kaydırma çubuğu da sayılır)          | `width: 100%`                                               |
| Flex/grid öğesinde uzun kelime, adres, e-posta        | `min-width: 0`; grid'de `minmax(0, 1fr)`; metne `overflow-wrap: anywhere` |
| Görsel, video, iframe                                | `max-width: 100%; height: auto`                             |
| `white-space: nowrap`, uzun `<pre>` kod bloğu         | Kod bloğuna `overflow-x: auto` (kendi içinde kaysın)        |
| Tablo                                                | Tabloyu `overflow-x: auto` olan bir kutuya alın             |
| Eksi margin, `translateX` ile ekran dışına itilmiş menü | Kapalı menüyü `display: none` / `hidden` ile gizleyin     |

Denendi: 200 px genişlikli flex kapsayıcıdaki `flex: 1` öğe, kırılmayan bir adres yüzünden 416 px'e çıktı;
`min-width: 0` ile 200 px'te kaldı. Grid'de `1fr` sütun aynı şekilde 416 px oldu, `minmax(0, 1fr)` 200 px'te kaldı.
`body { overflow-x: hidden }` taşmayı **gizler**, düzeltmez; ayrıca `sticky`'yi bozabilir.

## position: sticky neden çalışmaz

| Neden                                                         | Çözüm                                                |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| Eşik yok                                                      | `top: 0` (ya da `bottom`, `inset-block-start`) yazın  |
| Bir üst öğede `overflow: hidden/auto/scroll` var                | O üst öğe kaydırma kutusu olur; yapışma onun içinde olur, sayfada değil. Taşmayı başka yolla çözün |
| Ebeveyn öğe, yapışan öğe kadar kısa                            | Yapışacak yer yok; sticky'yi daha uzun bir kapsayıcıya taşıyın |
| Flex/grid içinde öğe gerilmiş (`align-items: stretch`)          | Yapışan öğeye `align-self: start`                     |

Denendi: kaydırılan kutuda `top: 0` olan öğe yapıştı (0 px); aynı öğenin ebeveynine `overflow: hidden` verilince
yapışmadı ve 450 px yukarı kaydı.

## Özgüllük savaşları

Hangi kuralın kazandığı sırasıyla: önem (`!important`), **katman** (`@layer`), özgüllük (specificity), kaynak
sırası. Özgüllük üç sayıdır: (kimlik, sınıf/öznitelik/sözde-sınıf, öğe/sözde-öğe); soldan karşılaştırılır.

```python calistir
import re


def ozgulluk(secici: str) -> tuple[int, int, int]:
    """Basit seçiciler için özgüllük. :where() 0 sayar; :is/:not/:has en özgül argümanı kadar sayar."""
    toplam = [0, 0, 0]
    i = 0
    while i < len(secici):
        m = re.match(r":(where|is|not|has)\(", secici[i:])
        if m:
            derinlik, j = 1, i + m.end()
            while derinlik:
                derinlik += {"(": 1, ")": -1}.get(secici[j], 0)
                j += 1
            argumanlar = secici[i + m.end() : j - 1].split(",")
            if m.group(1) != "where":
                en_ozgul = max(ozgulluk(a.strip()) for a in argumanlar)
                toplam = [t + e for t, e in zip(toplam, en_ozgul, strict=True)]
            i = j
            continue
        for desen, yer in ((r"#[\w-]+", 0), (r"\.[\w-]+|\[[^\]]*\]", 1), (r"::[\w-]+", 2), (r":[\w-]+(\([^)]*\))?", 1), (r"[a-zA-Z][\w-]*", 2)):
            m = re.match(desen, secici[i:])
            if m:
                toplam[yer] += 1
                i += m.end()
                break
        else:
            i += 1  # boşluk, >, +, ~, *
    return (toplam[0], toplam[1], toplam[2])


assert ozgulluk("a") == (0, 0, 1)
assert ozgulluk("nav ul li a.aktif:hover") == (0, 2, 4)
assert ozgulluk('input[type="email"]:focus') == (0, 2, 1)
assert ozgulluk("li:nth-child(2n+1)") == (0, 1, 1)
assert ozgulluk("a::before") == (0, 0, 2)
assert ozgulluk(":where(#menu) a") == (0, 0, 1)  # :where sıfır sayar: geçersiz kılması kolay taban stil
assert ozgulluk(":is(#menu, .ust) a") == (1, 0, 1)
# Kimlik her zaman kazanır: on sınıf bile bir kimliği yenemez
assert ozgulluk("#ust .dugme") > ozgulluk(".dugme.aktif.buyuk.birincil")
print("tamam")
```

- `@layer` tuzağı: katmana konmamış (unlayered) her kural, katman içindeki her kuralı yener. Denendi: katmandaki
  `#dugme.birincil.buyuk` (1,2,0), katmansız `button` (0,0,1) kuralına yenildi. Tailwind 4 gibi katman kullanan
  araçlarla yazılan stil, katmansız eski CSS'e yenilir.
- Savaşı kazanmanın yolu `!important` ya da daha uzun seçici değil, **düz ve tek sınıflı** seçicilerdir. Bileşen
  stilini tek sınıfla yazın, durumları `[aria-expanded="true"]`, `:disabled` gibi gerçek durumlara bağlayın.

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Telefonda sayfa yana kayıyor                                 | Görünüm alanından geniş bir öğe                           | Konsol taramasıyla bulun; tablodaki çözümler               |
| Flex/grid öğesi küçülmüyor, metin dışarı taşıyor              | `min-width: auto`                                        | `min-width: 0` / `minmax(0, 1fr)` + `overflow-wrap: anywhere` |
| Masaüstünde 15 px yatay kaydırma                              | `100vw` kaydırma çubuğunu içerir                         | `100%`                                                     |
| Mobilde tam ekran bölümün altı adres çubuğunun altında kalıyor | `100vh`                                                  | `100dvh` (önce `100vh` yedek)                              |
| `z-index: 9999` öğe yine altta                               | Ebeveyn başka bir yığın bağlamında                        | Bağlamı bulun; `isolation: isolate`; modalda `<dialog>`    |
| `z-index` hiç etki etmiyor                                    | Öğe konumlandırılmamış ve flex/grid öğesi değil           | `position: relative`                                       |
| `position: sticky` yapışmıyor                                 | Üst öğede `overflow`, eşik yok ya da kısa ebeveyn         | Sticky tablosu                                             |
| `width: 100%` + `padding` taşıyor                             | `content-box`                                            | `box-sizing: border-box`                                   |
| Üstteki iki kutu arasındaki boşluk beklenenden az             | Dikey margin çöküşü (margin collapse)                     | `gap` kullanın (flex/grid'de çöküş yok)                    |
| Stil işlemiyor, `!important` ekleniyor                         | Özgüllük ya da katman farkı                               | Geliştirici araçlarında üstü çizili kuralın nedenine bakın |
| Yakınlaştırınca yazı büyümüyor                                | Yazı boyutu yalnız `vw` ile                               | `clamp()` içinde `rem` parçası                             |
| Dokunma alanı küçük, yanlış düğmeye basılıyor                  | Düğme boyutu metne göre                                  | `min-block-size` / `min-inline-size` ile en az boyut       |

## Denetim listesi

- [ ] `box-sizing: border-box` ve `img { max-width: 100% }` tabanda var.
- [ ] 360 px genişlikte yatay kaydırma yok (konsol taraması boş, `scrollWidth <= clientWidth`).
- [ ] Flex/grid içindeki metin taşıyan öğelerde `min-width: 0` / `minmax(0, 1fr)` var.
- [ ] `100vw` ve `100vh` yok; tam ekran için `dvh`.
- [ ] Yazı boyutları `rem` ya da `rem` içeren `clamp()`; tarayıcı yakınlaştırması %200'de düzen bozulmuyor.
- [ ] Modal ve açılır menü `<dialog>` / `popover`; `z-index` değerleri adlandırılmış birkaç değişkenden.
- [ ] `!important` yok (yardımcı sınıflar dışında); seçiciler en çok iki düzey.
- [ ] Sol/sağ yerine mantıksal özellikler; aynalanan düzen denendi.
- [ ] Dokunma alanları projenin en az boyutunu karşılıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Mobil öncelikli yaz; 360 px'te yatay kaydırma olmasın. Tek eksen için flex, ızgara için grid.
  `100vw`, `100vh`, `!important` ve sabit piksel genişlik kullanma; flex/grid öğelerine `min-width: 0` ver; yazı
  boyutları `rem`."
- **Modelin tipik hatası:** taşmayı `overflow-x: hidden` ile gizler; `width: 100vw` yazar; `z-index: 9999` ile
  katman sorununu çözmeye çalışır; sticky çalışmayınca `position: fixed`'e geçer; özgüllük sorununu `!important`
  ile bastırır; sabit `px` genişlikli kart yazar.
- **Çıktıda arayın:** `100vw`, `100vh`, `!important`, `z-index: 9`, `overflow-x: hidden`, `width: [0-9]+px`,
  `left:`/`right:` (mantıksal özellik yerine).
- **Doğrulama:** 360×800 ve 390×844'te ekran görüntüsü + konsol taraması isteyin; "taşma yok" iddiasını görüntüsüz
  kabul etmeyin.

## İlgili

- [Anlamsal HTML](html-anlamsal.md)
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md): `text-transform` ve `lang`
- Tasarım belirteçleri ve küresel stil örneği: [`site/src/styles/global.css`](../../site/src/styles/global.css)
- [Duyarlı tasarım ve mobil](../20-web-onyuz/duyarli-tasarim-ve-mobil.md): mobil-önce düzen, dokunma hedefi, iOS Safari
- [CSS mimarisi](../20-web-onyuz/css-mimarisi.md): Tailwind, CSS modülleri, katmanlar ve tema seçimi
