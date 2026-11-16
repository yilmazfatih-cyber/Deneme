---
baslik: Anlamsal HTML
ozet: Doğru öğe seçimi (düğme/bağlantı, başlık, liste, tablo, bölgeler), form alanı ve label, giriş türleri ve mobil klavye, lang, meta etiketleri, yerleşik dialog/details/popover ve erişilebilir ad.
etiketler: [html, erisilebilirlik, form, mobil, anlamsal]
duzey: temel
guncellik: 2026-11
---

# Anlamsal HTML

> Bu notu ne zaman okumalı: bir sayfa ya da bileşen yazarken; tıklanan bir şey eklerken; form kurarken; ekran
> okuyucu, klavye ya da telefon klavyesiyle ilgili bir şikâyet geldiğinde; modal, açılır menü ya da akordeon
> yapmadan önce.

## Temel fikir

- HTML öğesi **ne olduğunu** söyler, nasıl göründüğünü değil. Görünüm CSS'in işidir. Doğru öğe; klavye
  erişimini, ekran okuyucu duyurusunu, mobil klavyeyi, form doldurmayı ve arama motorunu **bedavaya** getirir.
- `<div onclick>` görünüşte düğmedir ama klavyeyle odaklanmaz, Enter/Boşluk ile çalışmaz, ekran okuyucuya
  "düğme" demez. Bunları elle eklemek, `<button>` yazmaktan her zaman daha uzun ve daha hatalıdır.
- Her etkileşimli öğenin bir **erişilebilir adı** olmalı: ekran okuyucunun okuduğu ad. Görünen etiket yoksa
  (yalnız simge) ad `aria-label` ile verilir.
- ARIA'nın ilk kuralı: yerleşik bir HTML öğesi işi görüyorsa ARIA kullanmayın. ARIA yalnız anlam ekler; davranış
  (odak, klavye) eklemez.

## Doğru öğe seçimi

| Yapmak istediğiniz                                   | Doğru öğe                                            | Sık yanlış                                  |
| ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Sayfada işlem (kaydet, aç, sil, menüyü aç)            | `<button type="button">`                             | `<div onclick>`, `<a href="#">`             |
| Başka sayfaya ya da adrese gitmek                     | `<a href="/yol">`                                    | `<button onclick="location=…">`             |
| Formu göndermek                                       | `<form>` içinde `<button type="submit">`             | Form dışında tıklama işleyicisi             |
| Sayfa başlığı ve alt başlıklar                        | Tek `<h1>`, sonra sırayla `<h2>`, `<h3>`             | Yazı boyutu için başlık seçmek, düzey atlamak |
| Sıralı / sırasız öğeler                               | `<ol>` / `<ul>` + `<li>`                             | `<div>` + elle madde işareti                |
| Satır ve sütunlu veri                                 | `<table>` + `<caption>` + `<th scope="col">`         | `<div>` ızgarası; düzen için tablo           |
| Sayfa bölgeleri                                       | `<header>`, `<nav>`, tek `<main>`, `<footer>`, `<aside>` | Her şey `<div>`                         |
| Başlıklı tematik bölüm                                | `<section aria-labelledby="baslik-id">`              | Adsız `<section>` (bölge sayılmaz)          |
| Tek başına anlamlı içerik (kart, yazı)                | `<article>`                                          |                                             |
| Radyo/onay kutusu grubu                               | `<fieldset>` + `<legend>`                            | Gruba ad vermemek                           |
| Aç/kapa içerik (SSS, ayrıntı)                         | `<details>` + `<summary>`                            | Elle yazılmış JS akordeon                   |
| Modal pencere                                         | `<dialog>` + `showModal()`                           | Mutlak konumlu `<div>`                      |
| Açılır menü, ipucu, küçük panel                       | `popover` özniteliği                                 | Elle odak/kapama yönetimi                   |
| Tarih/saat                                            | `<time datetime="2026-11-16">16 Kasım</time>`        |                                             |

İki sessiz hata:

- Form içindeki `<button>`'ın varsayılan türü **`submit`**'tir. "Satır ekle" düğmesi formu gönderiyorsa `type`
  yazılmamıştır. Form içindeki her düğmeye `type` yazın.
- `href`'siz `<a>` klavyeyle odaklanmaz. `href="#"` sayfayı başa kaydırır ve adres çubuğunu değiştirir.

## Form alanları ve label

```html
<!-- DOĞRU: görünür label, alana for/id ile bağlı; tıklanınca alan odaklanır (dokunma alanı büyür) -->
<label for="telefon">Telefon</label>
<input id="telefon" name="telefon" type="tel" autocomplete="tel" aria-describedby="telefon-ipucu" />
<p id="telefon-ipucu">Başında 0 olmadan, 10 hane.</p>

<!-- DOĞRU: radyo grubunun adı legend -->
<fieldset>
  <legend>Bildirim yolu</legend>
  <label><input type="radio" name="bildirim" value="sms" /> SMS</label>
  <label><input type="radio" name="bildirim" value="eposta" /> E-posta</label>
</fieldset>

<!-- YANLIŞ: placeholder label değildir; yazmaya başlayınca kaybolur, kontrastı düşüktür -->
<input name="telefon" placeholder="Telefon" />
```

- Hata iletisini alanın yanına yazın ve `aria-describedby` ile alana bağlayın; alanı `aria-invalid="true"` yapın.
  Hatayı yalnız kırmızı renkle göstermeyin.
- Zorunlu alanı `required` ile işaretleyin ve etikette de yazın ("Telefon (zorunlu)").

## Giriş türleri ve mobil klavye

| Alan                                      | Yazılacak                                                       | Neden                                           |
| ----------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| E-posta                                   | `type="email" autocomplete="email" autocapitalize="off" spellcheck="false"` | `@` tuşlu klavye; baş harf büyütülmez |
| Telefon                                   | `type="tel" autocomplete="tel"`                                 | Tuş takımı; kayıtlı numara önerilir             |
| TC kimlik no, posta kodu, IBAN'ın rakamları | `type="text" inputmode="numeric" pattern="[0-9]*"`              | Rakam klavyesi; baştaki 0 ve uzunluk korunur    |
| Tutar (kuruşlu)                           | `type="text" inputmode="decimal"`                               | Ondalık ayırıcılı klavye; Türkçe virgülü siz ayrıştırırsınız |
| Adet, yaş gibi gerçek sayı                 | `type="number" min max step`                                    | Sayı denetimi; ama aşağıdaki tuzaklara bakın     |
| Arama                                     | `type="search" enterkeyhint="search"`                           | Klavyede "Ara" tuşu                             |
| SMS doğrulama kodu                        | `inputmode="numeric" autocomplete="one-time-code"`              | Kod SMS'ten önerilir                            |
| Yeni parola / mevcut parola                | `autocomplete="new-password"` / `"current-password"`            | Parola yöneticisi doğru davranır                |
| Ad soyad, adres                            | `autocomplete="name"`, `"street-address"`, `"postal-code"`     | Otomatik doldurma                               |
| Tarih                                     | `type="date"`                                                   | Yerel seçici; değer her zaman `YYYY-AA-GG`      |

`type="number"` tuzakları: değer sayı olarak işlenince baştaki 0 düşer (`0532…`); `e`, `+`, `-` karakterlerine izin
verir; masaüstünde fare tekerleği değeri değiştirir; 16 haneli numaralar JavaScript sayısına sığmaz. Kimlik,
telefon, kart, posta kodu gibi "rakamlardan oluşan metinler" için **kullanmayın**.

## lang ve meta etiketleri

```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Randevularım · Köprü Klinik</title>
    <meta name="description" content="Randevularınızı görün, değiştirin ya da iptal edin." />
    <meta name="theme-color" content="#0a5c36" />
  </head>
  <body>
    <p>Bu sayfa <span lang="en">dashboard</span> değil, ana sayfadır.</p>
  </body>
</html>
```

| Etiket                         | Neden                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `lang="tr"`                    | Ekran okuyucu Türkçe okur; CSS `text-transform: uppercase` "i"yi "İ" yapar; heceleme ve yazım denetimi Türkçe olur |
| `<meta charset="utf-8">`       | `<head>`'in en başında; yoksa Türkçe harfler bozulabilir                       |
| `viewport`                     | Telefonda doğru genişlik. `user-scalable=no` ya da `maximum-scale=1` **yazmayın**: yakınlaştırmayı engeller (erişilebilirlik hatası) |
| `<title>`                      | Her sayfada farklı; önce sayfa, sonra site adı                                 |
| `description`, `theme-color`   | Arama sonucu özeti; mobil tarayıcı çubuğunun rengi                             |

PWA bildirimi (`manifest`) ve simgeler: [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md); başlık, açıklama ve
önizleme etiketleri: [SEO temelleri](../95-urun/seo-temelleri.md).

## Yerleşik dialog, details, popover

```html
<button type="button" id="ac">Randevuyu iptal et</button>
<dialog id="onay" aria-labelledby="onay-baslik">
  <h2 id="onay-baslik">Randevu iptal edilsin mi?</h2>
  <form method="dialog">
    <button value="vazgec">Vazgeç</button>
    <button value="iptal">İptal et</button>
  </form>
</dialog>
<script type="module">
  const onay = document.querySelector('#onay')
  document.querySelector('#ac').addEventListener('click', () => onay.showModal())
  onay.addEventListener('close', () => {
    if (onay.returnValue === 'iptal') {
      /* iptal isteğini gönder */
    }
  })
</script>

<details>
  <summary>Randevumu nasıl değiştiririm?</summary>
  <p>Randevularım sayfasında randevuya dokunun.</p>
</details>

<button type="button" popovertarget="menu">Menü</button>
<div id="menu" popover>…</div>
```

- `showModal()` arka planı etkisizleştirir, odağı pencerede tutar, Esc ile kapatır, `::backdrop` verir. `show()`
  bunların hiçbirini yapmaz; modal için kullanmayın.
- `<form method="dialog">` içindeki düğme pencereyi kapatır ve `returnValue`'ya kendi `value`'sunu yazar.
- Pencere kapanınca odağın açan düğmeye döndüğünü klavyeyle deneyerek doğrulayın.
- `popover` dışarı tıklayınca ve Esc ile kendiliğinden kapanır, en üst katmanda açılır (`z-index` gerekmez).
  Güncel tarayıcıların hepsinde olduğunu varsayıyoruz (doğrulanmadı); hedef tarayıcılarınızda deneyin.

## Erişilebilir ad

Ekran okuyucu bir öğenin adını şu sırayla arar; **ilk bulunan** kazanır:

1. `aria-labelledby` (gösterdiği öğelerin metni)
2. `aria-label`
3. Öğenin kendi kaynağı: alan için `<label>`, görsel için `alt`, düğme ve bağlantı için içindeki metin, tablo için
   `<caption>`, grup için `<legend>`
4. Son çare: `title`, alanlarda `placeholder`

Kurallar: görünür metin varsa ad o metni **içermeli** (sesle komut veren kullanıcı gördüğünü söyler); simge düğmesine
`aria-label` verin ve simgeyi `aria-hidden="true"` yapın; bilgi taşımayan süs görseline `alt=""` yazın (`alt`'ı
hiç yazmamak dosya adının okunmasına yol açar).

## Küçük bir denetçi

Tarayıcı ve gerçek ekran okuyucu denetiminin yerine geçmez; ama modelin en sık yaptığı hataları saniyede yakalar
(yalnız standart kütüphane):

```python calistir
from html.parser import HTMLParser


class Denetci(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sorunlar: list[str] = []
        self.bagli_label: set[str] = set()
        self.alanlar: list[tuple[str, bool, str]] = []  # (id, adı var mı, name)
        self.label_icinde = 0
        self.son_baslik = 0
        self.dugme: dict[str, str] | None = None

    def handle_starttag(self, etiket: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: v or "" for k, v in attrs}
        if etiket == "html" and not a.get("lang"):
            self.sorunlar.append("html: lang yok")
        if etiket == "meta" and a.get("name") == "viewport":
            icerik = a.get("content", "").replace(" ", "")
            if "user-scalable=no" in icerik or "maximum-scale=1" in icerik:
                self.sorunlar.append("viewport: yakınlaştırma kapatılmış")
        if etiket in ("h1", "h2", "h3", "h4", "h5", "h6"):
            duzey = int(etiket[1])
            if self.son_baslik and duzey > self.son_baslik + 1:
                self.sorunlar.append(f"{etiket}: başlık düzeyi atlandı")
            self.son_baslik = duzey
        if etiket == "img" and "alt" not in a:
            self.sorunlar.append(f"img: alt yok ({a.get('src', '?')})")
        if etiket in ("div", "span") and "onclick" in a:
            self.sorunlar.append(f"{etiket}: onclick var; <button> kullanın")
        href = a.get("href", "")
        if etiket == "a" and (href in ("", "#") or href.startswith("javascript:")):
            self.sorunlar.append("a: gerçek href yok; işlem için <button> kullanın")
        if etiket == "label":
            self.label_icinde += 1
            if a.get("for"):
                self.bagli_label.add(a["for"])
        if etiket in ("input", "select", "textarea") and a.get("type") not in ("hidden", "submit", "button"):
            adli = self.label_icinde > 0 or bool(a.get("aria-label") or a.get("aria-labelledby"))
            self.alanlar.append((a.get("id", ""), adli, a.get("name", etiket)))
        if etiket == "button":
            self.dugme = {"ad": a.get("aria-label", ""), "metin": ""}

    def handle_endtag(self, etiket: str) -> None:
        if etiket == "label":
            self.label_icinde -= 1
        if etiket == "button" and self.dugme is not None:
            if not (self.dugme["ad"] or self.dugme["metin"].strip()):
                self.sorunlar.append("button: erişilebilir adı yok")
            self.dugme = None

    def handle_data(self, veri: str) -> None:
        if self.dugme is not None:
            self.dugme["metin"] += veri

    def sonuc(self) -> list[str]:
        for kimlik, adli, ad in self.alanlar:
            if not adli and kimlik not in self.bagli_label:
                self.sorunlar.append(f"alan '{ad}': label yok (placeholder label sayılmaz)")
        return self.sorunlar


def denetle(html: str) -> list[str]:
    denetci = Denetci()
    denetci.feed(html)
    return denetci.sonuc()


KOTU = """<html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head>
<body><h1>Randevu</h1><h3>Bilgiler</h3><img src="logo.png">
<input name="telefon" placeholder="Telefon"><div onclick="kaydet()">Kaydet</div>
<a onclick="sil()">Sil</a><button><svg aria-hidden="true"></svg></button></body></html>"""

IYI = """<html lang="tr"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><h1>Randevu</h1><h2>Bilgiler</h2><img src="logo.png" alt="Köprü Klinik">
<label for="tel">Telefon</label><input id="tel" name="telefon" type="tel" autocomplete="tel">
<label>E-posta <input name="eposta" type="email" autocomplete="email"></label>
<button type="submit">Kaydet</button><a href="/randevular">Randevularım</a>
<button type="button" aria-label="Menüyü aç"><svg aria-hidden="true"></svg></button></body></html>"""

assert denetle(KOTU) == [
    "html: lang yok",
    "viewport: yakınlaştırma kapatılmış",
    "h3: başlık düzeyi atlandı",
    "img: alt yok (logo.png)",
    "div: onclick var; <button> kullanın",
    "a: gerçek href yok; işlem için <button> kullanın",
    "button: erişilebilir adı yok",
    "alan 'telefon': label yok (placeholder label sayılmaz)",
]
assert denetle(IYI) == []
print("tamam")
```

Gerçek denetim için tarayıcıda axe taraması ve klavyeyle (yalnız Tab, Shift+Tab, Enter, Boşluk, Esc) gezinti şarttır;
ayrıntısı: [Erişilebilirlik uygulaması](../20-web-onyuz/erisilebilirlik-uygulama.md).

## Tuzaklar

| Belirti                                                   | Neden                                                    | Çözüm                                                       |
| --------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Öğe fareyle çalışıyor, klavyeyle çalışmıyor                | `<div onclick>` / `<span onclick>`                       | `<button type="button">`                                    |
| "Ekle" düğmesi formu gönderiyor, sayfa yenileniyor         | Form içindeki düğmenin varsayılan türü `submit`          | `type="button"`                                             |
| Bağlantı Tab ile odaklanmıyor; tıklayınca sayfa başa kayıyor | `href`'siz ya da `href="#"` bağlantı                     | Gidiyorsa gerçek `href`, işlemse `<button>`                 |
| Ekran okuyucu simge düğmesinde yalnız "düğme" diyor          | Erişilebilir ad yok                                      | `aria-label` + simgeye `aria-hidden="true"`                 |
| Form alanının ne olduğu okunmuyor                           | Yalnız `placeholder` var                                 | Görünür `<label for>`                                       |
| Telefonla girilen kimlik numarasının baştaki 0'ı kayboldu    | `type="number"`                                          | `type="text" inputmode="numeric"`                           |
| E-posta alanı ilk harfi büyütüyor, giriş yapılamıyor          | Mobil otomatik büyük harf                                | `type="email" autocapitalize="off"`                         |
| Başlıklarda "İ" yerine "I" görünüyor                         | `lang="tr"` yok, CSS büyük harf İngilizce kuralı uyguluyor | `<html lang="tr">`                                       |
| Telefonda sayfa yakınlaştırılamıyor                          | `user-scalable=no` / `maximum-scale=1`                   | Viewport'u yalnız `width=device-width, initial-scale=1` yapın |
| Ekran okuyucu ekranda görünmeyen modalın içeriğini okuyor    | Modal `<div>` ile yapılmış, arka plan etkisizleştirilmemiş | `<dialog>` + `showModal()`                                 |
| Ekran okuyucu "logo-final-2.png" diye okuyor                  | `alt` yazılmamış                                         | Anlamlı `alt`; süs görselinde `alt=""`                      |
| Başlıklar listesinde (ekran okuyucu) sayfa yapısı anlaşılmıyor | Başlık düzeyleri atlanmış ya da başlık yerine kalın yazı | Sıralı `h1`–`h3`; görünümü CSS'le ayarlayın               |

## Denetim listesi

- [ ] `<html lang="tr">`, `<meta charset="utf-8">` ve yakınlaştırmayı engellemeyen viewport var.
- [ ] Her sayfada tek `<h1>`, başlık düzeyleri atlanmıyor; tek `<main>` var.
- [ ] Tıklanan her şey `<button>` ya da `href`'li `<a>`; `onclick`'li `div`/`span` yok.
- [ ] Form içindeki her `<button>`'da `type` yazılı.
- [ ] Her form alanının görünür ve bağlı bir `<label>`'ı var; radyo grupları `<fieldset>` + `<legend>` içinde.
- [ ] Alan türleri ve `autocomplete`/`inputmode` tabloya göre seçilmiş; rakamlı kimlikler `type="number"` değil.
- [ ] Simge düğmelerinin `aria-label`'ı var; her `<img>`'de `alt` (süs ise boş).
- [ ] Modal `<dialog>` + `showModal()` ile; Esc ile kapanıyor, odak geri dönüyor.
- [ ] Sayfa yalnız klavyeyle baştan sona kullanılabiliyor; axe taramasında kritik bulgu yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Anlamsal HTML kullan: işlem için `<button type=\"button\">`, gezinme için `<a href>`; her alana
  görünür `<label for>`; alan türü ve `autocomplete` ver; modal için `<dialog>` + `showModal()`; `div onclick`
  ve yalnız `placeholder` yasak; `<html lang=\"tr\">`."
- **Modelin tipik hatası:** Bileşeni `div` ile kurup üstüne `role="button" tabindex="0"` ekler ama klavye
  işleyicisini unutur; simge düğmesine ad vermez; formu `placeholder` ile etiketler; kimlik ve telefon için
  `type="number"` kullanır; modalı `div` ile yapar; form içindeki düğmeye `type` yazmaz.
- **Çıktıda arayın:** `onclick=` (div/span üzerinde), `role="button"`, `href="#"`, `placeholder=` (yanında label var
  mı), `type="number"`, `<button>` (`type` var mı), `<img` (`alt` var mı), `user-scalable`.
- **Doğrulama:** yukarıdaki denetçiyi çalıştırın; sonra sayfayı faresiz, yalnız klavyeyle kullanın.

## İlgili

- [CSS düzen](css-duzen.md): görünüm, düzen, taşma
- [Unicode ve kodlama](unicode-ve-kodlama.md): `charset`, kodlama sorunları
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md): `lang="tr"` ve CSS büyük harf
- Örnek bileşenler (anlamsal HTML, erişilebilir ad): [`site/src/components/SearchDialog.astro`](../../site/src/components/SearchDialog.astro),
  [`site/src/components/ContactForm.astro`](../../site/src/components/ContactForm.astro)
- [Erişilebilirlik uygulaması](../20-web-onyuz/erisilebilirlik-uygulama.md): odak yönetimi, klavye kalıpları, canlı bölgeler
- [Formlar](../20-web-onyuz/formlar.md): doğrulama zamanlaması, erişilebilir hata gösterimi
