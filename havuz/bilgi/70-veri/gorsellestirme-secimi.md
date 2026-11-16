---
baslik: Görselleştirme seçimi
ozet: Soru → grafik türü karar tablosu; kesik eksen, çift eksen, pasta ve alan algısı gibi yanıltıcı grafikler; renk ve erişilebilirlik; tablonun grafikten iyi olduğu durumlar.
etiketler: [gorsellestirme, grafik, veri, erisilebilirlik, renk, pano]
duzey: temel
guncellik: 2026-11
---

# Görselleştirme seçimi

> Bu notu ne zaman okumalı: bir sayıyı grafiğe dökmeden önce; bir modelin ürettiği grafiği yayımlamadan önce;
> panoya yeni bir kutu eklerken; bir grafik "çarpıcı ama şüpheli" göründüğünde.

## Temel fikir

Grafik bir soruyu yanıtlar. Önce soru yazılır ("Satışlar artıyor mu?", "Hangi kanal daha iyi?"), tür sorudan çıkar.

Göz, **ortak bir eksen üzerindeki konum ve uzunluğu** iyi karşılaştırır; açıyı, alanı, hacmi ve renk tonunu kötü
karşılaştırır. Bu yüzden çubuk ve çizgi işlerin çoğunu görür; pasta, kabarcık ve 3B çoğu zaman bilgi kaybettirir.

Dört dürüstlük kuralı: çubuk sıfırdan başlar; iki seri aynı ölçekte karşılaştırılır; oran paydasıyla verilir;
başlık konuyu değil **bulguyu** söyler ("Mobil dönüşüm üç ayda yarıya indi", "Dönüşüm grafiği" değil).
Renk yalnız anlam taşıdığında kullanılır ve anlamı tek başına taşımaz: etiket, desen ya da konum da söyler.

## Karar tablosu

| Soru | Grafik | Dikkat |
| --- | --- | --- |
| Zaman içinde nasıl değişti? | Çizgi (zaman yatay eksende) | En çok 4–5 çizgi; fazlası gri ya da küçük çoklu (small multiples) |
| Kategoriler nasıl karşılaştırılır? | Yatay çubuk, büyükten küçüğe sıralı | Uzun Türkçe etiketler yatayda okunur |
| Bütünün parçaları (2–3 parça) | %100 yığılmış tek çubuk; pasta en çok 3 dilim | Açıları karşılaştırmak zordur |
| Parçalar zaman içinde | Her parçaya ayrı çizgi ya da %100 yığılmış çubuk | Yığılmış alanda ortadaki katmanlar okunmaz |
| Değerler nasıl dağılmış? | Histogram; grupları karşılaştırmak için kutu grafiği | "Ortalama çubuğu" dağılımı gizler |
| İki sayısal değişken ilişkili mi? | Saçılım grafiği; çok noktada saydamlık | İlişki neden demek değildir |
| İlk 10 hangisi? | Sıralı yatay çubuk | Sıralama ölçütü başlıkta |
| Huni nerede dökülüyor? | Adım sırasıyla yatay çubuk + adım dönüşüm oranı etiketi | Huni şekilli çizim alan algısıyla yanıltır |
| Kohortlar nasıl tutuluyor? | Isı haritası (renkli tablo) ya da kohort başına çizgi | Gözlenmemiş hücre boş kalır |
| Tek ölçüt bugün nerede? | Büyük sayı + karşılaştırma (önceki dönem, hedef) + küçük çizgi (sparkline) | Karşılaştırmasız sayı yorumlanamaz |
| Plan ile gerçekleşen | Çubuk + hedef çizgisi | İbreli gösterge yer kaplar, az söyler |
| İllere göre dağılım | Harita yalnız konum önemliyse; değer kişi başına | Ham sayıda büyük il hep koyu görünür |
| Okur kesin değere bakacak | Tablo | Aşağıya bakın |

## Yanıltıcı grafikler

**Kesik eksen.** Çubuğun boyu değeri temsil eder; eksen 100'den başlarsa boy farkı değer farkını katlar.
Çizgi grafiğinde sıfır dışı başlangıç olağandır (değişimi gösterir), ama eksen açıkça etiketlenir.

**Alan algısı.** Değeri dairenin yarıçapına bağlarsanız iki katı değer dört katı alan olur.

```python calistir
import math

a, b = 102, 108  # iki dönemin değeri
gercek_fark = (b - a) / a
alt = 100  # eksen 100'den başlıyor
gorunen_fark = ((b - alt) - (a - alt)) / (a - alt)
print(f"gerçek fark %{100 * gercek_fark:.1f}, kesik eksende görünen %{100 * gorunen_fark:.0f}, "
      f"abartma katsayısı {gorunen_fark / gercek_fark:.0f}")

deger_orani = 2.0
print(f"yarıçap değerle ölçeklenirse alan oranı {deger_orani ** 2:.0f}; "
      f"doğrusu yarıçap ∝ √değer: yarıçap oranı {math.sqrt(deger_orani):.2f}")
assert gorunen_fark / gercek_fark > 50
```

```cikti
gerçek fark %5.9, kesik eksende görünen %300, abartma katsayısı 51
yarıçap değerle ölçeklenirse alan oranı 4; doğrusu yarıçap ∝ √değer: yarıçap oranı 1.41
```

**Çift eksen.** Sağ ve sol eksenin aralığını grafiği yapan seçer; iki serinin "birlikte" ya da "ayrışarak"
hareket etmesi bu seçimin sonucudur:

```python calistir
ziyaret = [100, 120, 140, 160, 180]
gelir = [50, 52, 54, 56, 58]


def ekranda_yukselis(seri: list[float], alt: float, ust: float) -> float:
    return (seri[-1] - seri[0]) / (ust - alt)  # çizginin grafik yüksekliğine oranla tırmanışı


for sol, sag in (((0, 200), (0, 100)), ((100, 180), (50, 58))):
    print(f"sol eksen {sol}, sağ eksen {sag}: ziyaret çizgisi %{100 * ekranda_yukselis(ziyaret, *sol):.0f}, "
          f"gelir çizgisi %{100 * ekranda_yukselis(gelir, *sag):.0f} tırmanıyor")
print(f"gerçek artış: ziyaret %{100 * (ziyaret[-1] / ziyaret[0] - 1):.0f}, gelir %{100 * (gelir[-1] / gelir[0] - 1):.0f}")
```

```cikti
sol eksen (0, 200), sağ eksen (0, 100): ziyaret çizgisi %40, gelir çizgisi %8 tırmanıyor
sol eksen (100, 180), sağ eksen (50, 58): ziyaret çizgisi %100, gelir çizgisi %100 tırmanıyor
gerçek artış: ziyaret %80, gelir %16
```

İkinci ayarda iki çizgi üst üste biner ve "gelir ziyaretle aynı hızda büyüyor" izlenimi verir; oysa ziyaret %80,
gelir %16 arttı. Çözüm: iki seriyi aynı başlangıca endeksleyin (ilk dönem = 100) ve tek eksende çizin ya da iki
grafiği alt alta, aynı zaman ekseniyle koyun.

Diğer sık yanıltmalar:

- **Pasta:** beşten çok dilim ya da birbirine yakın dilimler karşılaştırılamaz; 3B pasta öndeki dilimi büyütür.
- **Birikimli seri:** hep artar; yavaşlamayı gizler. Dönemlik değeri de gösterin.
- **Eşit çizilen eşitsiz aralıklar:** Ocak, Şubat, Haziran, Aralık yan yana eşit aralıkla çizilince eğim değişir.
- **Sayı yerine oran gerekirken sayı:** haritada ve kategori karşılaştırmasında büyük olan hep büyük çıkar.
- **Düzleştirme:** hareketli ortalama, tek günlük kesintiyi ve kampanya sıçramasını siler; ham seriyi soluk çizin.
- **Seçilmiş dönem:** başlangıç noktası hikâyeyi belirler; grafiğin neden o tarihte başladığını yazın.

## Renk ve erişilebilirlik

| Veri türü | Renk düzeni | Örnek |
| --- | --- | --- |
| Kategorik (kanal, cihaz) | Ayırt edilebilir en çok ~6 renk; renk körlüğüne dayanıklı palet | Okabe–Ito paleti |
| Sıralı (az → çok) | Tek tonun açıktan koyuya | Kohort ısı haritası |
| Iraksak (negatif ↔ pozitif) | İki ton, ortada nötr | Hedeften sapma |
| Vurgu | Bir renk + geri kalanı gri | "Bu ay" çizgisi |

Kırmızı–yeşil zıtlığı renk körü okurların önemli bir kısmında aynı görünür. Renk körü dostu palet bile beyaz zeminde
yetmeyebilir: grafik öğeleri için en az 3:1, metin için 4,5:1 kontrast gerekir (WCAG 2.1).

```python calistir
def parlaklik(hex_renk: str) -> float:
    kanallar = [int(hex_renk[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    dogrusal = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in kanallar]
    return 0.2126 * dogrusal[0] + 0.7152 * dogrusal[1] + 0.0722 * dogrusal[2]


def kontrast(a: str, b: str) -> float:
    ust, alt = sorted((parlaklik(a), parlaklik(b)), reverse=True)
    return (ust + 0.05) / (alt + 0.05)


okabe_ito = {"turuncu": "#E69F00", "gök mavisi": "#56B4E9", "yeşil": "#009E73", "sarı": "#F0E442",
             "mavi": "#0072B2", "kızıl": "#D55E00", "pembe-mor": "#CC79A7"}
for ad, renk in okabe_ito.items():
    k_beyaz, k_koyu = kontrast(renk, "#FFFFFF"), kontrast(renk, "#1E1E1E")
    print(f"{ad:11s} beyazda {k_beyaz:4.2f}:1 {'yeter' if k_beyaz >= 3 else 'YETMEZ'} · "
          f"koyuda {k_koyu:4.2f}:1 {'yeter' if k_koyu >= 3 else 'YETMEZ'}")
```

```cikti
turuncu     beyazda 2.25:1 YETMEZ · koyuda 7.40:1 yeter
gök mavisi  beyazda 2.31:1 YETMEZ · koyuda 7.22:1 yeter
yeşil       beyazda 3.42:1 yeter · koyuda 4.87:1 yeter
sarı        beyazda 1.32:1 YETMEZ · koyuda 12.61:1 yeter
mavi        beyazda 5.19:1 yeter · koyuda 3.21:1 yeter
kızıl       beyazda 3.87:1 yeter · koyuda 4.31:1 yeter
pembe-mor   beyazda 3.06:1 yeter · koyuda 5.45:1 yeter
```

Sonuç: beyaz zeminde sarı, turuncu ve gök mavisini ince çizgi ya da metin için kullanmayın; dolgu (çubuk) olarak
kenarlıkla ya da koyu zeminde kullanın. Koyu temada mavi zayıflar. Paleti her iki temada bu hesapla denetleyin.

Diğer kurallar:

- **Doğrudan etiket:** seri adını açıklama kutusu (legend) yerine çizginin ucuna yazın; göz gidip gelmez, renk
  körü okur da ayırır.
- **Aynı kategori her grafikte aynı renk:** kategori → renk sözlüğü sabit tutulur.
- **Türkçe biçim:** ondalık virgül, binlik nokta (`1.234,5`), birim eksen başlığında, kısa ay adları ("16 Kas").
- **Ekran okuyucu:** grafiğin bulgusunu söyleyen metin özeti ve altında ya da bağlantıda veri tablosu.

## Tablo ne zaman grafikten iyidir

- Okur **kesin değere** bakacaksa (fiyat, bütçe kalemi, hedef).
- Sayı azsa: iki sayı için grafik değil cümle; on hücreye kadar tablo.
- Farklı birimlerdeki ölçütler yan yana duracaksa.
- Hem desen hem değer gerekiyorsa: tablo + koşullu renk (kohort ısı haritası).

Tablo kuralları: sayılar sağa yaslı ve aynı ondalık basamakta; birim sütun başlığında; sıralama anlamlı; toplam
satırı ayrık; vurgulanacak tek satır vurgulu.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| %6'lık fark dev görünüyor | Çubuk ekseni sıfırdan başlamıyor | Sıfırdan başlatın ya da çizgi + açık eksen etiketi |
| İki seri "birlikte" hareket ediyor | Çift eksen aralıkları seçilmiş | Endeksleyin (ilk dönem = 100), tek eksen |
| Kabarcık farkları abartılı | Yarıçap değerle ölçeklenmiş | Alan değerle ölçeklenir: yarıçap ∝ √değer |
| Haritada büyük iller hep koyu | Ham sayı gösterilmiş | Kişi başına ya da yüz bin kişide oran |
| Yavaşlama görünmüyor | Birikimli seri | Dönemlik değerleri gösterin |
| Renk körü okur serileri ayıramıyor | Kırmızı–yeşil; yalnız renge dayalı açıklama | Okabe–Ito + doğrudan etiket |
| Açık renk çizgi beyazda kayboluyor | Kontrast 3:1'in altında | Koyu ton; açık renkleri dolgu olarak kullanın |
| Pastada dilimler sıralanamıyor | Çok dilim ya da yakın değerler | Sıralı yatay çubuk |
| Aynı kanal iki grafikte iki renk | Renk otomatik atanıyor | Sabit kategori → renk sözlüğü |
| Başlık "Satışlar", okur ne bakacağını bilmiyor | Başlık konu, bulgu değil | Başlığa bulguyu yazın |
| Zaman ekseninde boşluk sıkışmış | Eksik dönemler eşit aralıkla çizilmiş | Gerçek zaman ekseni; eksik dönem boş görünsün |

## Denetim listesi

- [ ] Grafiğin yanıtladığı soru yazılı; başlık bulguyu söylüyor.
- [ ] Tür karar tablosundan seçildi; pasta en çok 3 dilim, 3B yok.
- [ ] Çubuk grafiklerin ekseni sıfırdan başlıyor; çizgide sıfır dışı başlangıç açıkça etiketli.
- [ ] Çift eksen yok; gerekiyorsa endekslenmiş tek eksen.
- [ ] Birimler, tarih aralığı, kaynak ve n grafikte yazılı.
- [ ] Oranlar paydasıyla birlikte; haritada kişi başına değer.
- [ ] Renk sayısı ≤ 6; renk körlüğüne dayanıklı; çizgi ve metin kontrastı açık ve koyu temada denetlendi.
- [ ] Seri adları doğrudan etiketli; aynı kategori her yerde aynı renk.
- [ ] Türkçe sayı ve tarih biçimi kullanıldı.
- [ ] Metin özeti ve veri tablosu erişilebilir.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce grafiğin yanıtladığı soruyu ve başlık olacak bulguyu yaz. Türü şu tablodan seç ve
  nedenini bir cümleyle söyle. Çubuk ekseni sıfırdan başlasın, çift eksen kullanma, en çok 6 renk ve şu paleti
  kullan: (palet). Seri adlarını çizginin ucuna yaz. Sayıları Türkçe biçimde göster. Grafiğin altına tek cümlelik
  metin özeti ekle."
- **Modelin tipik hatası:** kütüphane varsayılanına güvenir (otomatik kesik eksen, gökkuşağı renkler, açıklama
  kutusu); pasta seçer; başlığa konu yazar; birikimli seri çizer; sayı biçimini İngilizce bırakır; çift eksenle
  "ilişki" gösterir.
- **Çıktıda denetleyin:** y ekseninin alt sınırı; renk sayısı ve kontrast; başlık cümle mi; birim, kaynak, tarih
  aralığı var mı. Grafiği gri tonlamada ve telefonda bir kez açın.
- **Sorun:** "Bu grafikten okur hangi kararı verecek?" Yanıt yoksa grafik panodan çıkar.

## İlgili

- [Pano tasarımı](pano-tasarimi.md) — grafiklerin panodaki düzeni ve karşılaştırma bağlamı
- [Betimsel istatistik](betimsel-istatistik.md) — histogram ve dağılım okuma
- [Analiz raporu yazma](analiz-raporu-yazma.md) — başlık, yüzde ↔ yüzde puan, yuvarlama
- [Ürün ölçütleri](urun-olcutleri.md) — grafikteki ölçütün tanımı
- WCAG kontrastı, okunur metin rengi seçimi, rengi istenen kontrasta ayarlama:
  [`kutuphane/ts/src/renk.ts`](../../kutuphane/ts/src/renk.ts)
