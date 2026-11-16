---
baslik: Duyarlı tasarım ve mobil
ozet: Telefonda kullanılan web uygulaması için mobil-önce düzen, kırılma noktası, akışkan yazı, dokunma hedefi, iOS Safari tuzakları, yatay taşma teşhisi, sabit öğeler ve yön değişimi.
etiketler: [mobil, duyarli-tasarim, css, ios, dokunma, onyuz]
duzey: orta
guncellik: 2026-11
---

# Duyarlı tasarım ve mobil

> Bu notu ne zaman okumalı: yeni bir ekranın düzenini kurarken; telefonda sayfa yana kayıyorsa, alt çubuk klavyenin
> ya da çentiğin altında kalıyorsa, giriş alanına dokununca sayfa büyüyorsa, "tam ekran" bölüm iPhone'da taşıyorsa.

## Temel fikir

Sahibin uygulamaları **önce telefonda** kullanılır. Bu yüzden CSS'in temel hâli dar ekran içindir; geniş ekran
`min-width` sorgularıyla eklenir (mobil-önce). Havuz standardı her ekranı 390×844 ve 360×800'de dener; 360 px'te
yatay kaydırma bir hatadır.

Kırılma noktasını cihaz değil **içerik** belirler: pencereyi daraltın, düzenin bozulduğu genişliğe bir kırılma noktası
koyun. Çoğu bileşen hiç sorgu istemez: `flex-wrap`, `grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr))`,
`max-width` + `margin-inline: auto` kendiliğinden uyar. Bir bileşenin düzeni sayfanın değil **kabının** genişliğine
bağlıysa kap sorgusu (container query) kullanılır.

Telefon tarayıcısı masaüstünün küçüğü değildir: görünür alan klavye ve araç çubuklarıyla değişir, çentik ve ana
ekran çubuğu vardır, `hover` yoktur, parmak fareden kalındır.

## Karar tablosu: düzen aracı

| Durum                                                         | Araç                                                  | Neden                                          |
| ------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Kartlar ekrana sığdığı kadar yan yana                         | `grid` + `repeat(auto-fit, minmax(…, 1fr))`           | Sorgusuz; her genişlikte doğru                 |
| Öğeler sığmazsa alt satıra                                    | `flex-wrap: wrap` + `gap`                             | Sorgusuz                                       |
| Sayfa iskeleti değişiyor (alt çubuk ↔ yan menü)               | Medya sorgusu (`min-width`)                           | Sayfa düzeyinde karar                          |
| Aynı kart dar sütunda dikey, geniş alanda yatay               | Kap sorgusu (`@container`)                            | Kart nerede kullanılırsa kullanılsın uyar      |
| Yazı boyutu genişlikle büyüsün                                | `clamp()` (rem + vw)                                  | Kırılma noktasız, yakınlaştırmaya saygılı      |
| Okuma metni                                                   | `max-width: 65ch` civarı                              | Uzun satır okunmaz                             |
| Tek elle kullanılan birincil eylem                            | Ekranın alt yarısı, başparmak bölgesi                 | Üst köşe tek elle zor                          |

Medya sorgularında `em` birimi kullanıcının tarayıcı yazı boyutu ayarıyla ölçeklenir; `px` ölçeklenmez. Tailwind'in
`sm:`/`md:` önekleri `min-width` sorgusudur (mobil-önce).

## Akışkan tipografi

`font-size: 5vw` yakınlaştırmayı bozar: kullanıcı yakınlaştırınca `vw` değişmez, yazı büyümez (WCAG 1.4.4). Doğrusu
`clamp(alt, rem + vw, üst)`; rem kısmı kullanıcı ayarına uyar.

```js calistir
import assert from 'node:assert/strict'

// minPx (minVw genişlikte) → maxPx (maxVw genişlikte) arasında doğrusal büyüyen yazı boyutu.
function fluidClamp(minPx, maxPx, minVw = 360, maxVw = 1280, rootPx = 16) {
  const slope = (maxPx - minPx) / (maxVw - minVw)
  const interceptPx = minPx - slope * minVw
  const r = (n) => Number(n.toFixed(4))
  return `clamp(${r(minPx / rootPx)}rem, ${r(interceptPx / rootPx)}rem + ${r(slope * 100)}vw, ${r(maxPx / rootPx)}rem)`
}
function sizeAt(minPx, maxPx, vw, minVw = 360, maxVw = 1280) {
  const slope = (maxPx - minPx) / (maxVw - minVw)
  return Math.min(maxPx, Math.max(minPx, minPx + slope * (vw - minVw)))
}

assert.equal(fluidClamp(28, 40), 'clamp(1.75rem, 1.4565rem + 1.3043vw, 2.5rem)')
assert.equal(sizeAt(28, 40, 360), 28) // telefon
assert.equal(Math.round(sizeAt(28, 40, 820)), 34) // arada doğrusal
assert.equal(sizeAt(28, 40, 2560), 40) // üst sınırda durur
console.log('tamam')
```

```cikti
tamam
```

Gövde metni için akışkan boyut çoğu zaman gereksizdir; telefonda 16–18 px sabit yeterlidir. Akışkanlık büyük
başlıklarda işe yarar. Uygulama içinde "yazı boyutu" ayarı varsa her ölçü `rem` olsun; kök yazı boyutu değişince
bütün düzen birlikte büyür (uygulama temelinde `data-font` ile yapılıyor).

## Dokunma hedefi

| Kaynak                                  | En küçük hedef                                    |
| --------------------------------------- | ------------------------------------------------- |
| WCAG 2.5.8 (AA)                         | 24×24 CSS px (ya da çevresinde o kadar boşluk)    |
| WCAG 2.5.5 (AAA), Apple yönergesi       | 44×44                                             |
| Android Material yönergesi              | 48×48 dp                                          |
| Köprü (motor güçlüğü, afazi)            | 72×72 px (≈ 11 mm)                                |

Görünen simge küçük kalabilir; **dokunma alanı** dolgu (padding) ya da görünmez bir sözde öğeyle (`::before`,
`inset: -12px`) büyütülür. Yıkıcı eylem (Sil) sık kullanılan eylemin hemen yanında durmaz. Hedefleri uçtan uca
testte ölçün:

```js calistir
import assert from 'node:assert/strict'

// Playwright'ta locator.boundingBox() ile toplanan kutular üzerinde denetim.
function touchTargetProblems(targets, minSize) {
  const problems = []
  for (const t of targets) {
    if (t.width < minSize || t.height < minSize) problems.push(`${t.name}: ${t.width}×${t.height} < ${minSize}`)
  }
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const [a, b] = [targets[i], targets[j]]
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        problems.push(`${a.name} ile ${b.name} üst üste`)
      }
    }
  }
  return problems
}

const toolbar = [
  { name: 'Geri', x: 0, y: 0, width: 72, height: 72 },
  { name: 'Evet', x: 80, y: 0, width: 72, height: 72 },
  { name: 'Hayır', x: 150, y: 0, width: 72, height: 72 }, // Evet'le 2 px çakışıyor
  { name: 'Ayarlar', x: 300, y: 20, width: 32, height: 32 }, // simge boyunda
]
assert.deepEqual(touchTargetProblems(toolbar, 72), ['Ayarlar: 32×32 < 72', 'Evet ile Hayır üst üste'])
assert.deepEqual(touchTargetProblems(toolbar, 24), ['Evet ile Hayır üst üste']) // AA geçer, Köprü kuralı geçmez
console.log('tamam')
```

## iOS Safari ve mobil tarayıcı tuzakları

| Belirti                                                          | Neden                                                             | Çözüm                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `height: 100vh` bölümün altı araç çubuğunun arkasında kalıyor    | `vh` en büyük görünüm yüksekliğine göre hesaplanır                | `min-height: 100dvh`; hiç gizlenmemesi gereken için `100svh`          |
| İçerik çentiğin ya da ana ekran çubuğunun altına giriyor         | `viewport-fit=cover` var ama güvenli alan payı yok                | `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`            |
| Giriş alanına dokununca sayfa yakınlaşıyor                       | Alan yazı boyutu 16 px'ten küçük                                  | Alanlarda en az 16 px; yakınlaştırmayı kapatmayın                     |
| Klavye açılınca alttaki sabit çubuk klavyenin üstünde uçuyor ya da alanı örtüyor | Klavye düzen alanını değil görsel alanı küçültür  | Form ekranında alt çubuğu gizleyin; gerekirse `visualViewport` boyutunu dinleyin |
| Pencere içinde kaydırınca arkadaki sayfa kayıyor                 | Kaydırma zinciri (scroll chaining)                                | Kaydırılan kapta `overscroll-behavior: contain`; açıkken gövdeyi kilitleyin |
| Dokunduktan sonra düğme "üzerinde" (hover) rengi takılı kalıyor  | Dokunmatikte `:hover` son dokunuşta kalır                         | Hover stilini `@media (hover: hover)` içine alın (Tailwind 4'ün `hover:` öneki bunu kendisi yapıyor; kurulu 4.3.5'te görüldü) |
| Hızlı çift dokunuş sayfayı büyütüyor                             | Çift dokunuşla yakınlaştırma                                      | Etkileşimli öğelerde `touch-action: manipulation`                     |
| Sabit öğe kaydırınca sayfayla birlikte gidiyor                   | `position: fixed` öğenin atasında `transform`/`filter` var        | Sabit öğeyi dönüşümlü kabın dışına (gövdeye yakın) taşıyın            |
| `position: sticky` çalışmıyor                                    | Atalardan birinde `overflow: hidden/auto`                         | O `overflow`'u kaldırın ya da yapışkanlığı o kabın içinde kurun       |
| Uygulamadaki alanlar kaydırırken yenileme (pull-to-refresh) tetikliyor | Tarayıcının kenar kaydırma davranışı                        | Uygulama gibi tam ekran görünümde `overscroll-behavior-y: none` (gerçek sayfada değil) |

Klavye konusunda Android Chrome görünüm etiketinde `interactive-widget=resizes-content` ile düzenin klavyeyle
küçülmesini destekler; iOS desteği **doğrulanmadı**. İki platformda da gerçek cihazda deneyin.

## Yatay taşma teşhisi

1. Tarayıcı geliştirici araçlarında genişliği 360 px yapın; sayfanın sağa kaydığını görün.
2. Konsolda taşan öğeleri listeleyin:

   ```js
   // Gösterim: tarayıcı konsolunda çalıştırın.
   const vw = document.documentElement.clientWidth
   for (const el of document.querySelectorAll('body *')) {
     const box = el.getBoundingClientRect()
     if (box.right > vw + 0.5 || box.left < -0.5) console.log(Math.round(box.right - vw), el)
   }
   ```

3. En dıştaki suçluyu düzeltin (iç öğeler çoğu zaman yalnız onun yüzünden taşar), adım 2'yi yineleyin.
4. Bilerek kaydırılan kabın (tablo, kod bloğu) içindekileri listeden ayırın: onlar sorun değildir.

```js calistir
import assert from 'node:assert/strict'

// Konsol çıktısının mantığı: taşan, ama bilerek kaydırılan kabın içinde OLMAYAN öğeler; en çok taşan başta.
function overflowCulprits(elements, viewportWidth) {
  return elements
    .filter((el) => el.right > viewportWidth + 0.5 && !el.insideScrollContainer)
    .sort((a, b) => b.right - a.right)
    .map((el) => `${el.selector} (+${Math.round(el.right - viewportWidth)} px)`)
}

const page = [
  { selector: 'main', right: 360 },
  { selector: 'p.adres', right: 512 }, // kırılmayan uzun URL
  { selector: '.tablo-kabi table', right: 900, insideScrollContainer: true }, // bilerek kaydırılıyor
  { selector: '.hero', right: 375 }, // width: 100vw — kaydırma çubuğu payı kadar taşar
]
assert.deepEqual(overflowCulprits(page, 360), ['p.adres (+152 px)', '.hero (+15 px)'])
console.log('tamam')
```

| Sık suçlu                                         | Düzeltme                                                       |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Uzun sözcük, URL, e-posta, IBAN                   | `overflow-wrap: anywhere` (ya da `break-words`)                |
| `width: 100vw`                                    | `width: 100%` (`vw` kaydırma çubuğunu da sayar)                |
| Esnek (flex) çocuk küçülmüyor                     | Çocuğa `min-width: 0` (`min-w-0`); varsayılan `min-width: auto` |
| Izgara sütunu içeriğe göre genişliyor             | `minmax(0, 1fr)`                                               |
| Sabit genişlik (`width: 400px`), resim            | `max-width: 100%`; resimlerde `height: auto`                   |
| Negatif kenar boşluğu, `translateX` ile gizlenmiş menü | Kapalı menüyü `hidden`/`inert` ile kaldırın                |
| Tablo, `<pre>`                                    | Kendi kabında `overflow-x: auto`                               |

`body { overflow-x: hidden }` çözüm değildir: taşmayı gizler, nedenini bırakır ve `position: sticky`'yi bozabilir.

## Sabit konumlu öğeler

- Alt gezinme çubuğu: yüksekliği bir değişkende (`--bottom-nav-height`) tutun; içerik o kadar alt dolgu alsın;
  çubuk `env(safe-area-inset-bottom)` kadar uzasın. Uygulama temelinin kabuğu böyle kurulu
  ([`index.css`](../../uygulama/web/src/styles/index.css), `Shell.tsx`).
- Sabit üst çubuk odaklanan öğeyi örtmesin: `html { scroll-padding-top: <çubuk yüksekliği> }`.
- Bildirimler (toast) alt çubuğun **üstünde** çıksın, birincil düğmeyi örtmesin.
- Katman sırası (z-index) için birkaç adlandırılmış düzey (içerik, çubuk, açılır menü, pencere, bildirim) tanımlayın;
  rastgele `z-index: 9999` yazmayın. Pencere için yerel `<dialog>` üst katmanda (top layer) açılır, z-index derdi yoktur.

## Yön değişimi

- Yatay telefonda yükseklik ~360 px'e iner: sabit üst + alt çubuk ekranın yarısını yer. Yatayda çubukları inceltin
  ya da alt çubuğu yana alın (`@media (orientation: landscape) and (max-height: 500px)`).
- Yönü kilitlemeyin (WCAG 1.3.4); kilit ancak gerçekten zorunluysa (ör. yalnız dikey çalışabilen bir iletişim panosu)
  ve gerekçesi yazılıysa. Manifest'teki `orientation` yalnız kurulmuş uygulamada geçerlidir; Köprü dikey kilit
  kullanıyor — bu bilinçli bir ödünleşimdir.
- Yön değişimine JavaScript ile değil CSS ile tepki verin; JavaScript gerekiyorsa `matchMedia('(orientation:
  landscape)')` dinleyin, `orientationchange` olayına güvenmeyin.
- Yön değişince form alanındaki yazı, kaydırma yeri ve açık pencere korunmalı (yeniden render durumu sıfırlamamalı).

## Tuzaklar

| Belirti                                                     | Neden                                                     | Çözüm                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 360 px'te sayfa yana kayıyor                                | Tablodaki suçlulardan biri                                | Teşhis adımları; `overflow-x: hidden` ile örtmeyin       |
| Telefonda masaüstü düzeni küçülmüş görünüyor                | `<meta name="viewport">` eksik                            | `width=device-width, initial-scale=1, viewport-fit=cover` |
| Yakınlaştırma çalışmıyor                                    | `maximum-scale=1` ya da `user-scalable=no`                | Kaldırın (erişilebilirlik ihlali)                        |
| Başlık yakınlaştırınca büyümüyor                            | Yalnız `vw` ile yazı boyutu                               | `clamp()` içinde rem                                     |
| Düğmeye basmak zor, yanlış düğmeye basılıyor                | Dokunma alanı küçük, aralık yok                           | Alanı büyütün; ölçen test yazın                          |
| Tam ekran bölüm iPhone'da taşıyor                           | `100vh`                                                   | `100dvh`                                                 |
| Alt çubuk ana ekran çizgisinin altında                      | Güvenli alan payı yok                                     | `env(safe-area-inset-bottom)`                            |
| Masaüstünde güzel, telefonda kalabalık                      | Masaüstü-önce yazılmış CSS                                | Temel stil dar ekran; genişi `min-width` ile ekleyin     |
| Yatay telefonda içerik görünmüyor                           | İki sabit çubuk yüksekliği yiyor                          | Yatay için ayrı düzen                                    |

## Denetim listesi

- [ ] Görünüm etiketi doğru; yakınlaştırma kapatılmamış.
- [ ] 360×800 ve 390×844'te yatay kaydırma yok (uçtan uca testle ölçülüyor).
- [ ] Bütün dokunma hedefleri ürünün kuralına uyuyor (en az 24 px; Köprü'de 72 px) ve çakışmıyor.
- [ ] Tam yükseklik bölümlerde `dvh`/`svh`; çentik ve alt çizgi için `env(safe-area-inset-*)` payı var.
- [ ] Giriş alanlarının yazı boyutu ≥ 16 px; klavye açılınca alan ve gönder düğmesi görünür.
- [ ] Hover stilleri yalnız hover destekleyen aygıtlarda.
- [ ] Yatay yönde ana akış kullanılabilir; yön kilidi varsa gerekçesi yazılı.
- [ ] 200 % yakınlaştırmada ve sistem yazı boyutu en büyükken metin kesilmiyor, üst üste binmiyor.
- [ ] Gerçek bir iPhone ve bir Android telefonda en az bir kez denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Mobil-önce yaz: temel stil 360 px içindir, genişi `sm:`/`md:` ile ekle. `100vh` değil `100dvh`.
  Dokunma hedefi en az N px. Uzun metinlere `break-words`, esnek çocuklara `min-w-0`. Sabit genişlik verme."
- **Modelin tipik hatası:** Masaüstü düzeni yazıp sonra `max-width` sorgularıyla küçültür; `w-screen`/`100vw`
  kullanır; simge düğmelerini 24–32 px bırakır; `h-screen` ile tam ekran yapar; taşmayı `overflow-x-hidden` ile örter.
- **Çıktıda arayın:** `100vh`, `h-screen`, `w-screen`, `100vw`; sabit `px` genişlikler; `user-scalable`; `text-xs`/
  `text-sm` giriş alanları; `hover:` dışında hover stili veren düz CSS.
- **Test isteyin:** Playwright'ta 360 ve 390 genişlikte "belge genişliği görünüm genişliğini aşmıyor"
  (`scrollWidth <= clientWidth`) ve dokunma hedefi ölçen test.

## İlgili

- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — yakınlaştırma, odak, hareket
- [Formlar](formlar.md) — mobilde giriş türleri ve klavye
- [CSS mimarisi](css-mimarisi.md) — katmanlar, değişkenler
- [Animasyon ve etkileşim](animasyon-ve-etkilesim.md) — basılı durum, dokunma geri bildirimi
- Çalışan örnek: telefon boyutlarında koşan uçtan uca test ayarı
  [`playwright.config.ts`](../../uygulama/playwright.config.ts)
- [Dokunma ve işaretçi olayları](dokunma-ve-isaretci-olaylari.md) — basılı tutma, kaydırma hareketleri, `touch-action`
- Başka kümelerde: [CSS düzeni](../10-diller/css-duzen.md) (flex/grid, birimler, kap sorguları, z-index), [Bilgi mimarisi ve akış](../95-urun/bilgi-mimarisi-ve-akis.md)
