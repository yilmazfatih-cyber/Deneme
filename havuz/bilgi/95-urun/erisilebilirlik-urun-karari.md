---
baslik: Erişilebilirlik ürün kararı
ozet: Erişilebilirliği ürün kapsamına almak; kimlerin etkilendiği, kitleye göre alt sınır seçmek, en çok kazandıran on madde, kabul ölçütüne ve bitti tanımına yazmak, test yöntemi.
etiketler: [urun, erisilebilirlik, kapsam, kabul-olcutu, test]
duzey: temel
guncellik: 2026-11
---

# Erişilebilirlik ürün kararı

> Bu notu ne zaman okumalı: bir ürünün kapsamını ve "bitti" tanımını yazarken; marka rengi, yazı boyutu ve düğme
> boyutu seçerken; "erişilebilirliği sonra yaparız" cümlesi duyulduğunda. Uygulama ayrıntısı (ARIA, odak, klavye,
> karşıtlık hesabı): [erişilebilirlik uygulaması](../20-web-onyuz/erisilebilirlik-uygulama.md).

## Temel fikir

Erişilebilirlik bir özellik değil, **kalite tabanıdır**: ürünü kimlerin kullanabileceğini belirler. Bu yüzden kapsamın
içine yazılır: kabul ölçütüne, "bitti" tanımına ve otomatik teste. Sonradan eklemek pahalıdır, çünkü renk, boyut, dil
ve akış kararları baştan yeniden verilir.

Etkilenenler yalnız "engelli kullanıcılar" değildir. Aynı ihtiyaç **kalıcı** (görme kaybı, inme sonrası tek el,
afazi), **geçici** (kolu alçıda, göz ameliyatı sonrası) ve **durumsal** (güneş altında ekran, gürültülü otobüs, kucakta
bebek, yavaş internet) olabilir. Büyük düğme, iyi karşıtlık ve sade dil herkese yarar.

Taban olarak yaygın standart **WCAG 2.2 AA** düzeyidir. Kitlenizde belirli bir güçlük varsa taban yetmez; alt sınırı
**ürün kararı** olarak yükseltirsiniz: Köprü afazili ve tek elle kullanan yetişkinler için dokunma alanını 72 px,
her öğeyi resim + kelime + ses olarak koymuştur (depo kökündeki `CLAUDE.md`, ilke 1 ve 3).

## Karar tablosu

| Durum                                                         | Karar                                                                      | Neden                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| Yeni ürün                                                     | WCAG 2.2 AA tabanı ilk günden "bitti" tanımında ve otomatik testte         | Sonradan düzeltmek renk, dil ve akışı baştan açar  |
| Kitlede belirli bir güçlük var (yaşlı, motor, dil, okuma)     | Tabanın üstünde yazılı alt sınırlar: dokunma, yazı boyutu, dil, ses        | Kitleyi tanımlayan karar                           |
| Marka rengi metin için yetersiz karşıtlıkta                   | Metin ve düğmede rengin koyu tonu, markanın kendi tonu yalnız süste        | Kimlik korunur, okunabilirlik de                   |
| Zaman ve kaynak az                                            | Aşağıdaki on madde önce                                                    | Kazancın çoğu buradadır                            |
| Avrupa Birliği'ne satış var                                   | Avrupa Erişilebilirlik Yasası'nın kapsamını doğrulayın (2025'ten beri yürürlükte; ayrıntı doğrulanmadı) | Yasal yükümlülük olabilir |
| Kamu ya da büyük kurumsal müşteri                             | Uygunluk beyanı ve test raporu istenebilir                                 | Satın alma şartı                                   |
| Türkiye'deki yükümlülük                                       | Sektörünüz için bir hukukçuya sorun (doğrulanmadı)                         | Kurallar sektöre göre değişir                      |
| "Sonra yaparız"                                               | Hayır: tabanı şimdi, ileri iyileştirmeleri yol haritasına                  | Biriken borç her ekranda büyür                     |

## En çok kazandıran on madde

| #   | Madde                                                                                       | Kime yarar                               |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Metin ve arayüz öğelerinde yeterli renk karşıtlığı; marka renkleri buna göre seçilir         | Az gören, yaşlı, güneş altındaki herkes  |
| 2   | Büyük dokunma hedefleri ve aralarında boşluk                                                 | Titreyen el, tek el, yürürken kullanan   |
| 3   | Yazı büyütmeye ve dar ekrana dayanıklı düzen (200 % yakınlaştırma, 360 px'te taşma yok)      | Az gören, küçük telefon                  |
| 4   | Her form alanının görünür etiketi; hata metni alanın yanında ve ne yapılacağını söylüyor     | Herkes; ekran okuyucu kullananlar        |
| 5   | Klavyeyle tam kullanım ve görünür odak                                                       | Motor güçlük, anahtar (switch) kullanıcı |
| 6   | Anlamsal yapı: başlıklar, gerçek düğme ve bağlantılar, simge düğmelerinde ad                 | Ekran okuyucu kullananlar                |
| 7   | Anlamlı görsellerde alt metin; süs görsellerinde boş alt metin                               | Görmeyen, görseli yüklenmeyen            |
| 8   | Anlamı yalnız renkle vermemek (kırmızı/yeşil yerine simge + metin)                           | Renk körlüğü, siyah-beyaz ekran          |
| 9   | Sade dil: kısa cümle, bilinen sözcük, tek fikir                                              | Okuma ve dil güçlüğü, yabancı dilli      |
| 10  | Süre baskısı yok ya da uzatılabilir; hareketi azaltma; otomatik oynayan ses yok; videoda altyazı | Bilişsel güçlük, işitme kaybı, baş dönmesi |

## Alt sınırı kitleye göre seçmek

Aynı bileşen takımı, farklı kitle kararlarıyla farklı sonuç verir. Alt sınırları yazılı bir profil olarak tutun ve her
yeni bileşeni ona karşı denetleyin (eşikler örnektir; kendi ürününüz için karar verin):

```python calistir
# Alt sınırlar bir ÜRÜN kararıdır: kitleye göre seçilir, sonra testle korunur (örnek eşikler)
PROFILES = {
    "Sedir (genel kitle)": {"touch": 48, "text": 16, "contrast": 4.5},
    "Köprü (afazi, tek el)": {"touch": 72, "text": 22, "contrast": 4.5},
}
# (bileşen, dokunma px — dokunulmuyorsa 0, yazı px, karşıtlık oranı, adı/etiketi var, anlamı yalnız renkle)
components = [
    ("Liste kartı", 72, 18, 7.1, True, False),
    ("Sil simgesi", 40, 0, 4.6, False, False),
    ("Durum rozeti", 0, 14, 3.2, True, True),
    ("Ana düğme", 56, 18, 5.2, True, False),
]


def audit(profile: dict[str, float]) -> list[str]:
    issues = []
    for name, touch, text, ratio, labelled, color_only in components:
        if touch and touch < profile["touch"]:
            issues.append(f"{name}: dokunma {touch} px < {profile['touch']}")
        if text and text < profile["text"]:
            issues.append(f"{name}: yazı {text} px < {profile['text']}")
        if ratio < profile["contrast"]:
            issues.append(f"{name}: karşıtlık {ratio} < {profile['contrast']}")
        if not labelled:
            issues.append(f"{name}: erişilebilir adı yok")
        if color_only:
            issues.append(f"{name}: anlam yalnız renkle")
    return issues


for profile_name, profile in PROFILES.items():
    print(f"{profile_name}: {len(audit(profile))} sorun")
assert len(audit(PROFILES["Köprü (afazi, tek el)"])) > len(audit(PROFILES["Sedir (genel kitle)"]))
for issue in audit(PROFILES["Köprü (afazi, tek el)"]):
    print(" -", issue)
```

```cikti
Sedir (genel kitle): 5 sorun
Köprü (afazi, tek el): 8 sorun
 - Liste kartı: yazı 18 px < 22
 - Sil simgesi: dokunma 40 px < 72
 - Sil simgesi: erişilebilir adı yok
 - Durum rozeti: yazı 14 px < 22
 - Durum rozeti: karşıtlık 3.2 < 4.5
 - Durum rozeti: anlam yalnız renkle
 - Ana düğme: dokunma 56 px < 72
 - Ana düğme: yazı 18 px < 22
```

Referans noktaları: WCAG 2.2 AA en küçük hedef için 24 × 24 CSS pikseli ister; platform yönergeleri yaklaşık 44–48
birim önerir; havuzdaki [`uygulama`](../../uygulama/AGENTS.md) temeli 48 px'i kural olarak koyar, Köprü 72 px'i. Karşıtlık
oranının nasıl hesaplandığı ve test edildiği: [erişilebilirlik uygulaması](../20-web-onyuz/erisilebilirlik-uygulama.md)
→ "Renk karşıtlığı".

## Kapsama yazmak: ölçüt ve bitti tanımı

Erişilebilirlik ayrı bir iş kalemi olursa hep sona kalır. Her hikâyenin kabul ölçütüne ve ortak "bitti" tanımına girer:

```text
Bitti tanımı — erişilebilirlik maddeleri (her ekran)
[ ] Dokunma alanları ürünün alt sınırının üstünde; 360 px'te yatay kaydırma yok
[ ] Metin/zemin ve arayüz öğesi karşıtlıkları otomatik testte geçiyor (açık ve koyu tema)
[ ] Her düğme ve alanın erişilebilir adı var; simge düğmeleri dâhil
[ ] Yalnız klavyeyle ana akış baştan sona yapılabiliyor; odak her an görünür
[ ] Hata iletisi alanın yanında, suçlamıyor, ne yapılacağını söylüyor
[ ] Anlam yalnız renkle verilmiyor
[ ] axe taramasında kritik bulgu yok; ekran okuyucuyla ana akış denendi
```

Köprü'nün "bitti" tanımı (depo kökü, `CLAUDE.md`) aynı yaklaşımın kitleye uyarlanmış hâlidir: ≥ 72 px, her öğe resim +
kelime + ses, cümleler en çok 6 kelime, ekran okuyucu etiketleri, kırmızı çarpı ya da suçlayıcı metin yok. Gereksinim
biçimi için: [gereksinim yazma](gereksinim-yazma.md).

## Test yöntemi

| Katman                    | Ne yakalar                                                            | Nasıl                                                                   |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Otomatik tarama (axe)     | Eksik alt metin, adsız düğme, düşük karşıtlık, geçersiz ARIA          | Uçtan uca testte; havuzdaki `site` ve `uygulama` temellerinde hazır      |
| Kural testi               | Ürünün kendi alt sınırları (dokunma, karşıtlık çiftleri)               | Örnek: [`contrast.test.ts`](../../uygulama/web/test/rules/contrast.test.ts) |
| Elle denetim              | Odak sırası, anlamsız alt metin, klavye tuzağı, yakınlaştırmada taşma | Yalnız klavye; 200 % yakınlaştırma; sistem yazı boyutu en büyük          |
| Ekran okuyucu             | Okunuş sırası, adlar, canlı bildirimler                               | Telefonda TalkBack ya da VoiceOver ile ana akış                          |
| Gerçek kullanıcı          | Gerçek engeller ve beklenmedik kullanım                               | Kitlenizden kişilerle [kullanılabilirlik testi](kullanilabilirlik-testi.md) |

Otomatik tarama sorunların bir kısmını yakalar; "axe temiz" erişilebilir demek değildir. En değerli test, kitlenizden
gerçek kişilerle yapılan testtir; Köprü planı Faz 1 ve 2 sonunda afazili kullanıcılarla test öngörür.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Erişilebilirlik hep "sonraki sürüm"e kalıyor                     | Ayrı iş kalemi yapıldı                                   | Kabul ölçütüne ve bitti tanımına yazın; otomatik test kırmızıysa iş bitmez |
| Marka rengi beyaz yazıyla okunmuyor                              | Renk karşıtlık hesaplanmadan seçildi                     | Metin için koyu ton; marka tonu süs ve büyük alanlarda                     |
| Gri, ince, küçük yazı "şık" bulundu                              | Estetik karar okunabilirliği ezdi                        | Alt sınırlar yazılı; tasarım incelemesinde denetlenir                      |
| axe temiz ama ekran okuyucu kullanan kişi formu dolduramıyor     | Otomatik tarama odak ve anlamı ölçemez                   | Elle ve ekran okuyucuyla test                                              |
| Yaşlı kullanıcılar düğmeleri ıskalıyor                           | Genel alt sınır kitleye yetmedi                          | Kitleye göre profil; dokunma alanını büyütün                              |
| Durum yalnız kırmızı/yeşil noktayla gösteriliyor                 | Anlam renge yüklendi                                     | Simge + metin                                                             |
| Hata iletisi teknik ve suçlayıcı                                 | Metin geliştirici diliyle yazıldı                        | Sade, suçlamayan, ne yapılacağını söyleyen metin                           |
| Süreli işlemde kullanıcı zaman doldu uyarısı alıyor              | Süre baskısı tasarlandı                                  | Süreyi kaldırın ya da uzatılabilir yapın                                  |
| Video eğitimlerinde altyazı yok                                  | Medya erişilebilirliği unutuldu                          | Altyazı ve metin karşılığı                                                |

## Denetim listesi

- [ ] Ürünün erişilebilirlik tabanı (ör. WCAG 2.2 AA) ve kitleye göre alt sınırları yazılı.
- [ ] Alt sınırlar (dokunma, yazı boyutu, karşıtlık) kural testiyle korunuyor.
- [ ] Marka renkleri karşıtlık hesabıyla seçildi; metin tonları ayrı.
- [ ] Her hikâyenin kabul ölçütünde ilgili erişilebilirlik maddesi var; bitti tanımında ortak maddeler var.
- [ ] Uçtan uca testte axe taraması açık ve koyu temada çalışıyor.
- [ ] Her yeni ekranda elle denetim (klavye, yakınlaştırma, ekran okuyucu) yapıldı.
- [ ] Kitleden gerçek kişilerle en az bir test turu planlandı ya da yapıldı.
- [ ] Hedef pazarlardaki yasal yükümlülük soruldu.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ürünün alt sınırları: dokunma ≥ <N> px, yazı ≥ <N> px, karşıtlık ≥ 4.5:1 (büyük metin ve arayüz
  öğesi 3:1). Her düğmenin erişilebilir adı olsun; anlamı yalnız renkle verme; form alanlarının görünür etiketi olsun.
  Testleri çalıştır ve axe çıktısını göster."
- **Modelin tipik hatası:** simge düğmesine ad vermez; yer tutucu metni etiket yerine kullanır; `div`'i düğme yapar;
  odak halkasını "çirkin" diye kaldırır; renk seçerken karşıtlığı hesaplamaz; "erişilebilirlik" diye yalnız ARIA ekler.
- **Çıktıda denetleyin:** uçtan uca testteki axe sonucu; kural testinin geçtiği; ekranı yalnız klavyeyle kullanıp
  kullanamadığınız; 360 px ekran görüntüsü.
- **İnceleme istemi:** "Bu ekranı en çok kazandıran on maddeye göre incele; her bulgu için önem (Engel / Önemli /
  Öneri), yer ve somut düzeltme yaz."

## İlgili

- [Erişilebilirlik uygulaması](../20-web-onyuz/erisilebilirlik-uygulama.md): ARIA, odak, klavye, karşıtlık hesabı, test.
- [UX temelleri](ux-temelleri.md): Fitts, hata affetme, tek birincil eylem.
- [Gereksinim yazma](gereksinim-yazma.md): erişilebilirliği kabul ölçütüne çevirmek.
- [Kullanılabilirlik testi](kullanilabilirlik-testi.md): kitleden gerçek kişilerle test.
- [MVP kapsamı](mvp-kapsami.md): erişilebilirlik kesilemez tabandadır.
- Hazır temeller: [`site`](../../site/) (renkler AA karşıtlığını kendiliğinden sağlar), [`uygulama`](../../uygulama/).
