---
baslik: Betimsel istatistik
ozet: Ortalama, ortanca ve tepe değer ne zaman; dağılım şekli, varyans ve yüzdelikler, aykırı değerin etkisi, özet tablo okumak ve "ortalama kullanıcı yoktur" — çalışan örneklerle.
etiketler: [istatistik, veri, analitik, ortalama, dagilim, yuzdelik]
duzey: temel
guncellik: 2026-11
---

# Betimsel istatistik

> Bu notu ne zaman okumalı: bir sayıyı "ortalama" diye raporlamadan önce; bir özet tablo (adet, ortalama, std,
> en küçük, %25…) okurken; tek bir müşteri bütün ortalamayı değiştirdiğinde; segment oranlarını birleştirirken.

## Temel fikir

Bir dağılımı tek sayıyla özetlemek bilgi atar. Doğru sayı, sorunun **atmaya razı olduğu** bilgiye göre seçilir:

- **Ortalama** (mean) toplamı kişilere eşit paylaştırır. Toplamla ilgili soruda (bütçe, ciro planı, kapasite)
  doğru yanıttır; tek bir büyük değer onu sürükler.
- **Ortanca** (median) tipik bireydir: verinin yarısı altında, yarısı üstünde. Aykırı değere dayanıklıdır.
- **Tepe değer** (mode) en sık görülendir; kategorik ve kesikli veride işe yarar.

Ürün verisinin çoğu **sağa çarpıktır**: tutar, süre, oturum sayısı, gecikme. Çoğu kullanıcı az, birkaçı çok
kullanır; ortalama ortancanın üstünde kalır ve "tipik" kimseyi anlatmaz. Yayılım için simetrik veride standart
sapma, çarpık veride **yüzdelikler** (p25, p75, p90, p99) kullanılır. İki tepeli (bimodal) veride ortalama iki
grubun arasındaki boşluğa düşer: **ortalama kullanıcı yoktur**.

## Karar tablosu

| Durum | Raporlanacak | Neden |
| --- | --- | --- |
| Toplam planı: bütçe, ciro tahmini, kapasite | Ortalama × adet | Toplamı ancak ortalama korur |
| Tipik kullanıcı deneyimi: sepet, süre, bekleme | Ortanca + p90 | Çarpık veride ortalama azınlığı anlatır |
| Gecikme, yanıt süresi | p50 ve p95/p99 | En kötü deneyim (kuyruk) önemlidir |
| Kategorik veri: cihaz, şehir | Tepe değer + her kategorinin payı | Ortalama anlamsız |
| 1–5 puan | Her puanın payı + ortanca | 3,0 hem "herkes kararsız" hem "yarısı 1, yarısı 5" olabilir |
| İki tepeli dağılım | Grupları ayırıp ayrı özetleyin | Ortalama boşlukta kalır |
| Segment oranlarını birleştirmek | Toplamların oranı | Oranların ortalaması küçük segmenti şişirir |
| Dönem dönem büyüme oranları | Geometrik ortalama | Aritmetik ortalama bileşik büyümeyi abartır |
| Değerler 1 TL ile 1 milyon TL arasında | Logaritmik ölçek + yüzdelikler | Doğrusal ölçekte hepsi sıfıra yapışır |

## Aykırı değerin etkisi

Yirmi müşterinin sepet tutarı ve bunlara eklenen tek bir kurumsal sipariş:

```python calistir
import statistics as st

sepet = [180, 220, 240, 250, 260, 275, 290, 300, 310, 320, 340, 350, 365, 380, 400, 420, 450, 480, 520, 600]
ile = sepet + [25000]
for ad, veri in (("20 müşteri", sepet), ("+1 kurumsal sipariş", ile)):
    print(f"{ad:20s} ortalama {st.mean(veri):7.1f}  ortanca {st.median(veri):5.0f}  std {st.stdev(veri):7.1f}")
assert st.mean(ile) > 4 * st.mean(sepet)
assert st.median(ile) - st.median(sepet) == 10
```

```cikti
20 müşteri           ortalama   347.5  ortanca   330  std   106.9
+1 kurumsal sipariş  ortalama  1521.4  ortanca   340  std  5380.6
```

Bir sipariş ortalamayı dört katına çıkardı, ortancayı 10 TL oynattı. "Ortalama sepet %338 arttı" cümlesi doğru ama
yanıltıcıdır. Önce aykırı değerin **hata mı gerçek mi** olduğuna karar verin ([veri temizleme](veri-temizleme-yontemi.md)):
gerçekse silmeyin; ortanca ve yüzdelikle raporlayın, büyük değeri ayrıca adıyla söyleyin.

## Ortalama kullanıcı yoktur

Oturum süreleri: bildirime bakıp çıkanlar ve oturup çalışanlar.

```python calistir
import random
import statistics as st

r = random.Random(7)
hizli = [max(0.2, r.gauss(1.5, 0.5)) for _ in range(600)]  # bildirime bakıp çıkanlar
derin = [max(5.0, r.gauss(25, 5)) for _ in range(400)]  # oturup çalışanlar
sure = hizli + derin
ort, ortanca = st.mean(sure), st.median(sure)
yakin = sum(abs(x - ort) < 2 for x in sure)
print(f"ortalama {ort:.1f} dk, ortanca {ortanca:.1f} dk; ortalamanın ±2 dk yakınındaki oturum: {yakin}/{len(sure)}")
for alt in range(0, 40, 5):
    n = sum(alt <= x < alt + 5 for x in sure)
    print(f"{alt:2d}–{alt + 5:<2d} dk {'#' * (n // 20):<30s} {n}")
assert yakin < 0.02 * len(sure)
```

```cikti
ortalama 11.0 dk, ortanca 2.0 dk; ortalamanın ±2 dk yakınındaki oturum: 3/1000
 0–5  dk ############################## 600
 5–10 dk                                1
10–15 dk                                7
15–20 dk ##                             49
20–25 dk ######                         134
25–30 dk #######                        158
30–35 dk #                              38
35–40 dk                                13
```

Ortalama 11 dakika civarında; o sürede neredeyse hiç oturum yok. Ortanca da yardım etmez (kısa grubun içine düşer).
Doğru özet iki satırdır: "oturumların %60'ı 1–2 dakikalık bakış, %40'ı ortalama 25 dakikalık çalışma". Histogram
çizmeden tek sayı raporlamayın; iki tepe görürseniz grubu tanımlayan değişkeni (kaynak, cihaz, plan) arayın.

## Oranları ve büyümeleri birleştirmek

```python calistir
segment = {"kampanya_sayfasi": (2, 4), "ana_sayfa": (30, 1000)}  # (dönüşen, ziyaret)
oranlarin_ort = sum(d / z for d, z in segment.values()) / len(segment)
toplamlarin_orani = sum(d for d, _ in segment.values()) / sum(z for _, z in segment.values())
print(f"oranların ortalaması   %{100 * oranlarin_ort:.1f}")
print(f"toplamların oranı      %{100 * toplamlarin_orani:.1f}")

buyume = [0.50, -0.50]  # bir ay %50 artış, ertesi ay %50 düşüş
aritmetik = sum(buyume) / len(buyume)
bilesik = (1 + buyume[0]) * (1 + buyume[1]) - 1
geometrik = ((1 + buyume[0]) * (1 + buyume[1])) ** (1 / len(buyume)) - 1
print(f"aritmetik ortalama büyüme %{100 * aritmetik:.1f}; gerçek iki aylık değişim %{100 * bilesik:.1f}; "
      f"geometrik ortalama aylık %{100 * geometrik:.1f}")
assert abs(bilesik + 0.25) < 1e-12
```

```cikti
oranların ortalaması   %26.5
toplamların oranı      %3.2
aritmetik ortalama büyüme %0.0; gerçek iki aylık değişim %-25.0; geometrik ortalama aylık %-13.4
```

Dört ziyaretli sayfanın %50'si, bin ziyaretli sayfanın %3'üyle aynı ağırlığı aldı. Günlük ortalamaların ortalaması,
mağaza ortalamalarının ortalaması da aynı hatadır. Büyümede: 100 → 150 → 75; "ortalama büyüme %0" denemez.

## Yüzdelik ve standart sapma yöntemleri

Aynı veriden iki araç farklı çeyrek verebilir; ikisi de "doğru"dur, tanımları farklıdır:

```python calistir
import statistics as st

veri = [3, 5, 7, 8, 9, 11, 13, 15, 40]
print("exclusive (Python varsayılanı, Excel PERCENTILE.EXC):", st.quantiles(veri, n=4))
print("inclusive (Excel PERCENTILE.INC, NumPy varsayılanı): ", st.quantiles(veri, n=4, method="inclusive"))
print(f"örneklem std (n−1) {st.stdev(veri):.2f} · anakütle std (n) {st.pstdev(veri):.2f}")
```

```cikti
exclusive (Python varsayılanı, Excel PERCENTILE.EXC): [6.0, 9.0, 14.0]
inclusive (Excel PERCENTILE.INC, NumPy varsayılanı):  [7.0, 9.0, 13.0]
örneklem std (n−1) 11.03 · anakütle std (n) 10.40
```

Excel ya da NumPy ile karşılaştırılacak raporda `method="inclusive"` yazın. Standart sapmada örneklem (n−1;
`stdev`, Excel `STDEV.S`) ile anakütle (n; `pstdev`, `STDEV.P`) farkı az veride büyüktür; elinizdeki bir
örneklemse n−1 kullanın. Standart sapma simetrik, tek tepeli veride anlamlıdır; çarpık veride p25–p75 aralığını
(çeyrekler arası açıklık, IQR) verin.

## Özet tablo okumak

Bir aracın verdiği "describe" tablosunda şu işaretlere bakın:

```python calistir
import statistics as st


def ozet(ad: str, veri: list[float]) -> list[str]:
    q1, q2, q3 = st.quantiles(veri, n=4, method="inclusive")
    print(f"{ad}: n={len(veri)} ort={st.mean(veri):.1f} std={st.stdev(veri):.1f} min={min(veri)} "
          f"%25={q1:g} %50={q2:g} %75={q3:g} max={max(veri)}")
    uyarilar = []
    if st.mean(veri) > 1.5 * q2:
        uyarilar.append("ortalama ortancanın çok üstünde: sağa çarpık ya da aykırı")
    if max(veri) > q3 + 3 * (q3 - q1):
        uyarilar.append("en büyük değer çeyreklerin çok dışında: aykırı ya da kod değeri (999?)")
    if min(veri) < 0:
        uyarilar.append("negatif değer: bu alanda olabilir mi?")
    if q1 == q2 == q3:
        uyarilar.append("çeyrekler eşit: tek değerde yığılma (0 ya da varsayılan değer?)")
    return uyarilar


teslim_gun = [1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 6, -1, 999]
for uyari in ozet("teslim süresi (gün)", teslim_gun):
    print(" -", uyari)
```

```cikti
teslim süresi (gün): n=14 ort=74.0 std=266.2 min=-1 %25=2 %50=3 %75=4 max=999
 - ortalama ortancanın çok üstünde: sağa çarpık ya da aykırı
 - en büyük değer çeyreklerin çok dışında: aykırı ya da kod değeri (999?)
 - negatif değer: bu alanda olabilir mi?
```

| İşaret | Olası anlam | Ne yapılır |
| --- | --- | --- |
| Ortalama ortancadan çok büyük | Sağa çarpık; birkaç büyük değer | Ortanca + p90; büyük değerleri ayrıca inceleyin |
| En büyük değer %75'ten onlarca kat büyük | Aykırı, birim hatası ya da kod değeri (999) | Kaynağına bakın; kod değeri eksik sayılır |
| Olamayacak alanda negatif değer (yaş, adet) | İade kaydı, hata, kod değeri (−1) | Kural yazın, ayırın |
| Standart sapma ortalamadan büyük (negatif olmayan veri) | Güçlü çarpıklık ya da sıfır yığılması | Dağılıma bakın; sıfır oranını ayrı verin |
| Adet satır sayısından az | Eksik değer | Eksik oranını raporlayın |
| %25 = %50 = %75 | Çoğu değer aynı (0 ya da varsayılan) | Tepe değeri ve payını ayrıca verin |
| Yuvarlak değerlerde yığılma (100, 500, 1000) | Elle girilmiş tahmini değer | Ayrı işaretleyin |

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Ortalama sepet %300 arttı", sipariş sayısı aynı | Tek büyük sipariş | Ortanca ve p90 ile birlikte; aykırıyı adıyla söyleyin |
| Puan ortalaması 3,1, yorum "orta hâlli" | Puanlar iki uçta toplanmış | Her puanın payını gösterin |
| Segment oranlarının ortalaması genel oranla tutmuyor | Oranların ortalaması alındı | Toplamların oranı |
| Python ile Excel'in çeyrekleri farklı | Yüzdelik yöntemi farklı | `method="inclusive"`; yöntemi yazın |
| Standart sapma başka araçta farklı | Örneklem (n−1) ↔ anakütle (n) | `stdev` ↔ `pstdev`; hangisi olduğunu yazın |
| Ortalama oturum süresi çok kısa | Tek olaylı oturumlar 0 süre | Onları ayrı sayın; ortanca verin |
| Ortalama teslim süresi 74 gün, ortanca 3 | "Bilinmiyor" için 999 yazılmış | Kod değerini eksik sayın |
| "Ortalama büyüme %0" ama gelir düştü | Büyüme oranlarının aritmetik ortalaması | Geometrik ortalama ya da baştan sona değişim |
| Ortalama, hiçbir kullanıcıya benzemiyor | İki tepeli dağılım | Histogram; grupları ayırın |

## Denetim listesi

- [ ] Merkez ölçüsü sorunun türüne göre seçildi: toplam → ortalama, tipik birey → ortanca.
- [ ] Çarpık veride ortanca ve en az bir üst yüzdelik (p90) birlikte raporlandı.
- [ ] Her sayının yanında n (gözlem sayısı) yazıyor.
- [ ] En büyük ve en küçük beş değer gözle incelendi; aykırı değer kararı gerekçesiyle yazıldı.
- [ ] Kod değerleri (999, −1, "bilinmiyor" için 0) eksik olarak işlendi.
- [ ] Segment oranları birleştirilirken toplamların oranı kullanıldı.
- [ ] Yüzdelik yöntemi ve standart sapma türü yazılı.
- [ ] En az bir histogram ya da dağılım tablosu görüldü; iki tepe varsa gruplar ayrı özetlendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Özet istatistikte ortalamanın yanında n, ortanca, p25, p75, p90, en küçük ve en büyük beş
  değeri ver. Çeyreklerde `method='inclusive'` kullan ve yaz. Segment oranlarını toplamların oranıyla birleştir.
  999 ve −1 gibi kod değerlerini eksik say. Aykırı değeri silme; ayrıca listele."
- **Modelin tipik hatası:** yalnız ortalama raporlar; `statistics.quantiles` varsayılanının Excel'le aynı olduğunu
  sanır; `stdev`/`pstdev` ayrımını yapmaz; oranların ortalamasını alır; aykırı değeri sessizce atar ve söylemez.
- **Çıktıda denetleyin:** ortalama ile ortanca arasındaki fark yorumlanmış mı; n yazılı mı; aykırı değerlerin
  listesi ve kararı var mı; "ortalama" kelimesinin geçtiği her cümlede dağılım çarpık mı diye bakın.
- **Sorun:** "Bu sayıyı tipik bir kullanıcıya söylesem kendini tanır mı?"

## İlgili

- [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md) — ortalamanın ve oranın belirsizliği
- [Görselleştirme seçimi](gorsellestirme-secimi.md) — histogram ve kutu grafiği ne zaman
- [Veri temizleme yöntemi](veri-temizleme-yontemi.md) — aykırı değer: hata mı gerçek mi
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — SQL'de yüzdelik
- [Ürün ölçütleri](urun-olcutleri.md) — oran ölçütlerinin pay ve paydası
- Ortalama, ortanca, çeyrek (R7), std, histogram, hareketli ortalama (Python + TypeScript):
  [`kutuphane/py/kutuphane/istatistik.py`](../../kutuphane/py/kutuphane/istatistik.py)
- Sütun profili, IQR ve sağlam z ile aykırı değer: [`veri/verihavuzu/kalite/profile.py`](../../veri/verihavuzu/kalite/profile.py)
  (`python -m verihavuzu profil dosya.csv`)
