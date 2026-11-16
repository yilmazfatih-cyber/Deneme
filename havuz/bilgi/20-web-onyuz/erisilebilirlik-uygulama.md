---
baslik: Erişilebilirlik uygulaması
ozet: Anlamsal HTML ve ARIA kuralları, odak yönetimi, klavye kalıpları, erişilebilir ad, canlı bölgeler, renk karşıtlığı hesabı, hareket azaltma ve otomatik taramanın kaçırdıkları.
etiketler: [erisilebilirlik, aria, klavye, kontrast, test, onyuz]
duzey: orta
guncellik: 2026-11
---

# Erişilebilirlik uygulaması

> Bu notu ne zaman okumalı: her yeni bileşende (özellikle düğme gibi davranan öğe, pencere, menü, sekme, açılır
> liste), renk seçerken, sayfa geçişi yazarken ve "axe temiz, o hâlde erişilebilir" denmeden önce.

## Temel fikir

Tarayıcı her sayfadan bir **erişilebilirlik ağacı** çıkarır: her öğenin rolü (düğme, bağlantı, başlık), adı
("Kaydet"), durumu (seçili, açık, geçersiz). Ekran okuyucu, ses denetimi, anahtar (switch) erişimi bu ağacı kullanır.
Anlamsal HTML (`<button>`, `<a href>`, `<label>`, `<dialog>`, başlıklar) bu ağacı **doğru ve bedava** kurar:
rol, ad, klavye, odak hepsi gelir.

ARIA yalnız ağaçtaki **anlamı** değiştirir; davranış eklemez. `role="button"` yazılmış bir `<div>` ne Tab ile
odaklanır ne Enter'la çalışır; onları siz yazmak zorundasınız. Bu yüzden sıra: önce doğru HTML öğesi, olmuyorsa
ARIA + klavye + odak birlikte.

Sahibin ürünlerinde kullanıcılar arasında motor ve dil güçlüğü yaşayanlar var (Köprü: afazi). Burada erişilebilirlik
ek özellik değil, ürünün kendisidir.

## ARIA'nın beş kuralı

| Kural (W3C "Using ARIA")                                                    | Örnek                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Yerel HTML öğesi varsa onu kullanın                                      | `<button>` ✓ · `<div role="button" tabindex="0">` ✗           |
| 2. Yerel anlamı gerekmedikçe değiştirmeyin                                  | `<h2 role="tab">` ✗ · `<div role="tab"><h2>…</h2></div>` ✓    |
| 3. Etkileşimli her ARIA denetimi klavyeyle kullanılabilmeli                 | `role="slider"` → ok tuşları, Home/End sizin işiniz           |
| 4. Odaklanabilir öğeye `aria-hidden="true"` ya da `role="presentation"` vermeyin | Gizli ama odak alan düğme = "hayalet" odak                |
| 5. Etkileşimli her öğenin erişilebilir adı olmalı                           | Yalnız simgeli düğmede `aria-label="Kapat"`                   |

## Doğru öğe

| İş                                       | Öğe                                                     | Yanlış                               |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| Başka sayfaya/adrese gitmek              | `<a href>`                                              | `<button onClick={navigate}>` (yeni sekmede açılamaz) |
| Sayfada eylem                            | `<button type="button">`                                | `<a href="#" onClick>`, `<div onClick>` |
| Aç/kapa (iki durumlu)                    | `<button aria-pressed>` ya da `role="switch"` + `aria-checked` | Yalnız renk değiştiren düğme   |
| Göster/gizle bölüm                       | `<details><summary>` ya da düğme + `aria-expanded`      | Durumu duyurulmayan düğme            |
| Kalıcı olmayan pencere (modal)           | `<dialog>` + `showModal()`                              | Odak tuzağı elle yazılmış `<div>`    |
| Sayfa bölgeleri                          | `<header> <nav> <main> <footer>`                        | Hepsi `<div>`                        |
| Başlık düzeni                            | Sayfada bir `<h1>`, düzey atlamadan `<h2>`, `<h3>`      | Görünüm için başlık düzeyi seçmek    |
| Tablo verisi                             | `<table>` + `<th scope>`                                | `<div>` ızgarası                     |

Havuzdaki uygulama temelinin pencere bileşeni yerel `<dialog>` kullanır: odak tuzağı, Esc ve arka planın
etkisizleşmesi tarayıcıdan gelir ([`Dialog.tsx`](../../uygulama/web/src/ui/Dialog.tsx)).

## Odak yönetimi

| An                                     | Odak nereye                                                   | Neden                                          |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Pencere açıldı                         | İlk anlamlı denetim (silme onayında "Vazgeç") ya da başlık    | Kullanıcı pencerenin içinde başlamalı          |
| Pencere kapandı                        | Pencereyi açan öğe                                            | Yoksa odak sayfa başına düşer, yer kaybolur    |
| Menü açıldı / kapandı                  | İlk menü öğesi / menü düğmesi                                 | APG menü kalıbı                                |
| Rota (sayfa) değişti                   | Yeni sayfanın `<h1>`'i (`tabIndex={-1}`)                      | Ekran okuyucu yeni sayfaya geldiğini duyar     |
| Listeden öğe silindi                   | Sonraki öğe; yoksa önceki; liste boşsa liste başlığı          | Odak silinen öğeyle birlikte kaybolmasın       |
| Form gönderildi, hata var              | İlk hatalı alan                                               | Kullanıcı hatayı aramasın                      |
| Bildirim (toast) çıktı                 | Odak **değişmez**; metin canlı bölgeden okunur                | Yazarken odağı çalmak işi böler                |

Görünür odak: `:focus-visible` ile en az 2 px, zeminle 3:1 karşıtlıklı halka; `outline: none` yazılan yerde yerine
başka bir gösterge olmalı. Sabit üst/alt çubuk odaklı öğeyi örtmesin (`scroll-padding-top`). Uzun gezinmeden
önce "Ana içeriğe geç" bağlantısı. Rota odağının çalışan örneği:
[`useRouteFocus.ts`](../../uygulama/web/src/app/useRouteFocus.ts) (kullanıcı bir alana yazıyorsa odağı çalmaz).

## Klavye etkileşim kalıpları

| Bileşen (WAI-ARIA APG)    | Tuşlar                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Düğme                     | Enter ve Boşluk etkinleştirir                                                 |
| Bağlantı                  | Enter (Boşluk sayfayı kaydırır)                                               |
| Onay kutusu / anahtar     | Boşluk değiştirir                                                             |
| Radyo grubu               | Tab gruba girer (seçili öğeye); oklar seçimi taşır                            |
| Sekmeler                  | Oklar sekmeler arasında; Home/End; Tab sekmeden panele geçer                  |
| Menü                      | Oklar; Enter/Boşluk seçer; Esc kapatır ve odak düğmeye döner; harfle atlama   |
| Pencere (dialog)          | Tab içeride döner; Esc kapatır                                                |
| Açılır seçim (combobox)   | Aşağı ok açar; oklar gezer; Enter seçer; Esc kapatır                          |
| Kaydırıcı (slider)        | Oklar adım; Page Up/Down büyük adım; Home/End uçlar                           |
| Ağaç / ızgara             | Oklar dört yöne; Home/End; ayrıntı APG'de                                     |

Bileşik bileşenlerde (sekmeler, menü, araç çubuğu) **gezici tabindex** (roving tabindex): grupta yalnız bir öğe
`tabIndex={0}`, ötekiler `-1`; Tab gruba bir kez girer, oklar içeride dolaşır.

```js calistir
import assert from 'node:assert/strict'

// Sekme listesinde ok tuşları: sona gelince başa sarar; Home/End uçlara; diğer tuşlar tarayıcıya kalır.
function nextTab(key, index, count, dir = 'ltr') {
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight' // sağdan sola düzende yönler yer değiştirir
  const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  if (key === forward) return (index + 1) % count
  if (key === backward) return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null // Tab dahil: preventDefault YAPMAYIN
}
const tabIndexes = (selected, count) => Array.from({ length: count }, (_, i) => (i === selected ? 0 : -1))

assert.equal(nextTab('ArrowRight', 2, 3), 0)
assert.equal(nextTab('ArrowLeft', 0, 3), 2)
assert.equal(nextTab('End', 0, 3), 2)
assert.equal(nextTab('Tab', 1, 3), null)
assert.equal(nextTab('ArrowLeft', 0, 3, 'rtl'), 1)
assert.deepEqual(tabIndexes(1, 3), [-1, 0, -1]) // yalnız seçili sekme Tab sırasında
console.log('tamam')
```

```cikti
tamam
```

Aynalanan düzende (sağdan sola dil ya da Köprü'deki sol el modu) ok tuşlarının anlamı da **görsel** yöne uyar.

## Erişilebilir ad hesaplama

Sadeleştirilmiş öncelik sırası (tam algoritma: W3C "Accessible Name and Description Computation"):
`aria-labelledby` → `aria-label` → yerel kaynak (`<label>`, `alt`, `<legend>`, `<caption>`) → içerik (düğme,
bağlantı) → `title` / `placeholder` (son çare).

```js calistir
import assert from 'node:assert/strict'

function textOf(node) {
  if (!node || node.hidden) return '' // aria-hidden içerik ada girmez
  if (typeof node === 'string') return node
  if (node.tag === 'img') return node.alt ?? ''
  return (node.children ?? []).map(textOf).join(' ').replace(/\s+/g, ' ').trim()
}
function accessibleName(el, byId = {}) {
  if (el.labelledby) return el.labelledby.split(' ').map((id) => textOf(byId[id])).join(' ').trim()
  if (el.ariaLabel?.trim()) return el.ariaLabel.trim()
  if (el.tag === 'img') return el.alt ?? ''
  if (el.tag === 'input' && el.label) return textOf(el.label)
  if (el.tag === 'button' || el.tag === 'a') { const text = textOf(el); if (text) return text }
  return (el.title ?? el.placeholder ?? '').trim()
}

const icon = { tag: 'svg', hidden: true }
assert.equal(accessibleName({ tag: 'button', children: [icon] }), '') // YANLIŞ: adsız düğme
assert.equal(accessibleName({ tag: 'button', ariaLabel: 'Kapat', children: [icon] }), 'Kapat')
assert.equal(accessibleName({ tag: 'button', children: [icon, { tag: 'span', children: ['Kapat'] }] }), 'Kapat')
// aria-labelledby her şeyi ezer; birden çok parça birleştirilebilir: "Sil Süt al"
const byId = { sil: { tag: 'span', children: ['Sil'] }, gorev: { tag: 'span', children: ['Süt al'] } }
assert.equal(accessibleName({ tag: 'button', ariaLabel: 'X', labelledby: 'sil gorev' }, byId), 'Sil Süt al')
assert.equal(accessibleName({ tag: 'a', children: [{ tag: 'img', alt: 'Ana sayfa' }] }), 'Ana sayfa')
assert.equal(accessibleName({ tag: 'img', alt: '' }), '') // süs görseli: bilerek adsız
assert.equal(accessibleName({ tag: 'input', label: { children: ['E-posta'] }, placeholder: 'ad@ornek.com' }), 'E-posta')
assert.equal(accessibleName({ tag: 'input', placeholder: 'ad@ornek.com' }), 'ad@ornek.com') // çalışır ama kötü

// Görünür metin adın İÇİNDE olmalı (ses denetimi "Gönder" der): WCAG 2.5.3
const visible = 'Gönder'
assert.equal(accessibleName({ tag: 'button', ariaLabel: 'Formu ilet', children: [visible] }).includes(visible), false)
console.log('tamam')
```

Kurallar: simgeli düğmenin adı eylemdir ("Sil"), simgenin adı değil ("Çöp kutusu"). Listede tekrarlanan düğmeler
bağlam alır ("Sil: Süt al"). `alt` görselin işlevini anlatır; süs görselinde `alt=""`. `aria-label` çevrilmesi
unutulan metindir; sözlükten gelsin.

## Canlı bölgeler (live regions)

- `role="status"` (kibar: okunan cümle bitince söyler) — "Kaydedildi", "3 sonuç bulundu", eşitleme durumu.
- `role="alert"` (hemen keser) — yalnız gerçekten acil: oturum kapandı, gönderim başarısız.
- Bölge **içerik değişmeden önce** sayfada olmalı. Bölgeyi metniyle birlikte eklemek çoğu ekran okuyucuda okunmaz:
  boş kabı baştan koyun, sonra metni değiştirin.
- Aynı metni iki kez duyurmak için önce boşaltıp bir karede yeniden yazın.
- Her şeyi duyurmayın; sürekli konuşan sayfa susturulur.

## Renk karşıtlığı

Eşikler (WCAG 2.x): normal metin **4.5:1**; büyük metin (≥ 24 px ya da ≥ 18.66 px kalın) **3:1**; arayüz öğeleri
(alan kenarı, odak halkası, simge) **3:1**; AAA için 7:1 / 4.5:1.

```js calistir
import assert from 'node:assert/strict'

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

assert.equal(contrast('#000000', '#ffffff'), 21)
assert.ok(contrast('#767676', '#ffffff') >= 4.5) // 4.54: beyaz üstünde geçen en açık gri
assert.ok(contrast('#777777', '#ffffff') < 4.5) // 4.48: bir ton açığı KALIR
assert.equal(contrast('#777777', '#ffffff').toFixed(1), '4.5') // yuvarlanınca "4.5" görünür: yuvarlamadan karşılaştırın
assert.ok(contrast('#949494', '#ffffff') >= 3) // kenar/simge için yeter, metin için yetmez
assert.ok(contrast('#ffffff', '#ff8800') < 3) // turuncu düğmede beyaz yazı: 2.39, büyük metinde bile kalır
console.log('tamam')
```

Karşıtlığı göz kararıyla değil **testle** koruyun: havuzdaki uygulama temeli bütün metin/zemin çiftlerini açık ve
koyu temada denetleyen bir kural testi taşır ([`contrast.test.ts`](../../uygulama/web/test/rules/contrast.test.ts));
rengi istenen orana ayarlayan yardımcı: [`renk.ts`](../../kutuphane/ts/src/renk.ts). Yarı saydam renkler ve
görsel üstündeki yazı ölçülemez; düz renkli bir alt zemin ekleyin.

## Hareket azaltma

```css
/* Gösterim: sistemde "hareketi azalt" açıksa kayma/büyüme yerine anında geçiş */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

JavaScript ile yapılan hareket bu kuraldan etkilenmez: `matchMedia('(prefers-reduced-motion: reduce)').matches`
denetleyin. Uygulama içinde ayrıca bir "hareketi azalt" ayarı sunmak iyi olur (uygulama temelinde var). Ayrıntı:
[animasyon ve etkileşim](animasyon-ve-etkilesim.md).

## Test: otomatik tarama neyi yakalamaz

axe gibi tarayıcılar ölçülebilen kuralları yakalar: eksik `alt`, adsız düğme, düşük karşıtlık, geçersiz ARIA,
yinelenen kimlik, eksik `lang`. Şunları **yakalayamaz**:

| Kaçan                                       | Elle nasıl denetlenir                                              |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `alt` var ama anlamsız ("resim1.png")       | Görseli görmeden metni okuyun: anlam geçiyor mu?                   |
| Odak sırası mantıksız, odak kayboluyor      | Yalnız klavyeyle bütün akışı baştan sona yapın                     |
| Özel bileşende klavye tuzağı/eksik tuş      | APG tablosundaki tuşları tek tek deneyin                           |
| Canlı bölge gerçekten okunuyor mu           | Ekran okuyucuyla deneyin                                           |
| Pencere kapanınca odak geri dönüyor mu      | Klavyeyle açıp kapatın                                             |
| 200 % yakınlaştırmada ve 320 px'te taşma    | Tarayıcı yakınlaştırması; dar pencere                              |
| Hata metni anlaşılır mı                     | Yüksek sesle okuyun; ne yapılacağını söylüyor mu                   |
| Dokunma hedefi gerçekten rahat mı           | Telefonda tek elle deneyin                                         |

Elle denetim listesi (her yeni ekranda bir kez): yalnız klavye (Tab, Shift+Tab, Enter, Boşluk, Esc, oklar);
telefonda TalkBack (Android) ya da VoiceOver (iOS) ile ana akış; tarayıcı 200 % yakınlaştırma; sistem yazı boyutu en
büyük; koyu tema ve yüksek karşıtlık; hareketi azalt açık. Uçtan uca testte axe taraması: [ön yüz testi](onyuz-testi.md).

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Ekran okuyucu yalnız "düğme" diyor                            | Simgeli düğmenin adı yok                                | `aria-label` (sözlükten) ya da gizli metin                 |
| Kart tıklanıyor ama klavyeyle ulaşılamıyor                    | `<div onClick>`                                         | İçinde gerçek `<a>`/`<button>`; kartın tamamı ona bağlı    |
| Pencere kapanınca odak sayfanın en üstüne düşüyor             | Odak açan öğeye geri verilmiyor                         | Açan öğeyi saklayın, kapanınca odaklayın (yerel `<dialog>` çoğunu yapar) |
| Sayfa değişiyor ama ekran okuyucu bir şey demiyor             | SPA'da rota odağı yok                                   | Yeni `<h1>`'e odak + belge başlığı                         |
| "Kaydedildi" iletisi okunmuyor                                | Canlı bölge metinle aynı anda eklendi                   | Boş `role="status"` kabı baştan dursun                     |
| Odak halkası görünmüyor                                       | `outline: none` + yerine bir şey yok                    | `:focus-visible` halkası, 3:1                              |
| Gizlenen menü öğeleri hâlâ Tab'la geziliyor                   | Görsel gizleme (opacity/transform) odağı kapatmaz       | `hidden`, `inert` ya da `display: none`                    |
| Ses denetimi "Gönder" komutunu anlamıyor                      | `aria-label` görünür metinden farklı                    | Görünür metni ada dahil edin                               |
| Karşıtlık aracı "4.5" diyor ama denetim kalıyor               | Oran yuvarlanmış (4.48)                                 | Yuvarlamadan karşılaştırın                                 |
| `aria-hidden` kapsayıcıda düğmeye odak gidiyor                | Odaklanabilir öğe gizli ağaçta                          | `inert` kullanın                                           |
| Yalnız renk ile "hata" / "seçili" anlatılıyor                 | Renk körlüğü, yüksek karşıtlık kipi                     | Simge + metin + durum özniteliği                           |

## Denetim listesi

- [ ] Etkileşimli her öğe `<button>`, `<a href>` ya da form denetimi; `div`/`span` + `onClick` yok.
- [ ] Her etkileşimli öğenin adı var; simgeli düğmelerin adı eylemi söylüyor; görünür metin adın içinde.
- [ ] Sayfada tek `<h1>`, başlık düzeyleri atlamıyor; `<main>` ve `<nav>` var; `<html lang="tr">`.
- [ ] Pencere, menü ve rota değişiminde odak tablodaki yere gidiyor ve geri dönüyor.
- [ ] Odak halkası her yerde görünür ve 3:1 karşıtlıkta.
- [ ] Metin/zemin çiftleri 4.5:1, kenar/simge 3:1; açık ve koyu temada kural testiyle korunuyor.
- [ ] Bildirimler önceden var olan `role="status"`/`role="alert"` bölgesinden okunuyor.
- [ ] Hareket `prefers-reduced-motion` ve uygulama ayarına uyuyor.
- [ ] Uçtan uca testlerde axe taraması var ve kritik/ciddi bulgu yok.
- [ ] Bu ekran klavyeyle ve telefonda ekran okuyucuyla bir kez baştan sona denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce yerel HTML öğesini kullan (`button`, `a`, `dialog`, `details`). Simgeli düğmeye sözlükten
  `aria-label` ver. Pencere/menü için projedeki `Dialog`/`Menu` bileşenini kullan; kendin odak tuzağı yazma. Renkleri
  yalnız anlamlı belirteçlerden seç."
- **Modelin tipik hatası:** `div onClick` + `role="button"` yazar ama `tabIndex` ve Enter/Boşluk desteği eklemez;
  her şeye `aria-label` serper (görünür metni ezerek); `outline: none` koyar; `aria-live` bölgesini metinle birlikte
  ekler.
- **Çıktıda arayın:** `onClick` olan `div`/`span`; `outline: none`/`outline-0` (yerine `focus-visible` var mı);
  `aria-label` ile sabit Türkçe metin (sözlükte olmalı); `tabIndex` değeri 0'dan büyük (sıra bozar); `aria-hidden`
  içinde düğme.
- **Test isteyin:** Testing Library ile `getByRole('button', { name: 'Sil: Süt al' })` gibi rol + adla sorgulayan
  testler; ad yoksa test zaten kırılır.

## İlgili

- [Formlar](formlar.md) — etiket, hata bağlama, odak
- [Duyarlı tasarım ve mobil](duyarli-tasarim-ve-mobil.md) — dokunma hedefi, yakınlaştırma
- [Tasarım sistemi](tasarim-sistemi.md) — anlamlı renk belirteçleri, yüksek karşıtlık teması
- [Ön yüz testi](onyuz-testi.md) — rol ile sorgulama, axe
- Çalışan örnekler: [`Dialog.tsx`](../../uygulama/web/src/ui/Dialog.tsx), [`Field.tsx`](../../uygulama/web/src/ui/Field.tsx),
  [`Tabs.tsx`](../../uygulama/web/src/ui/Tabs.tsx), [`Menu.tsx`](../../uygulama/web/src/ui/Menu.tsx)
- [Dokunma ve işaretçi olayları](dokunma-ve-isaretci-olaylari.md) — hareketlerin düğme karşılığı (WCAG 2.5.x)
- Başka kümelerde: [Anlamsal HTML](../10-diller/html-anlamsal.md), [UX temelleri](../95-urun/ux-temelleri.md)
