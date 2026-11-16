---
baslik: Tahmin ve senaryo
ozet: Naif, mevsimsel naif ve hareketli ortalama tahminlerini geriye dönük sınamayla karşılaştırmak, belirsizliği aralıkla göstermek, senaryo analizi ve Monte Carlo benzetimi, tahmini karara bağlamak.
etiketler: [tahmin, zaman-serisi, monte-carlo, senaryo, karar, istatistik]
duzey: orta
guncellik: 2026-11
---

# Tahmin ve senaryo

> Bu notu ne zaman okumalı: gelecek ayın satışını, kullanıcı sayısını, sunucu yükünü ya da bütçeyi tahmin ederken;
> "iyimser ve kötümser senaryo" istendiğinde; bir tahmin modeli kurdurmadan önce basit yöntemlerin ne kadar iyi
> olduğunu ölçmek için.

## Temel fikir

Her tahmin önce **basit tabanlarla** yarışır: naif (yarın = bugün), mevsimsel naif (seasonal naive; gelecek pazartesi
= bu pazartesi), hareketli ortalama. Karmaşık bir yöntem bunları **geriye dönük sınamada** (backtest) geçemiyorsa
kullanılmaz. Geriye dönük sınama: geçmişte bir günde durup "o gün bu yöntemi kullansaydık ne kadar yanılırdık?" diye
sormak; yöntem tahmin ettiği dönemi hiç görmez.

Tahmin tek sayı değil **aralıktır**: geçmiş hataların dağılımından (ör. %80 aralığı) kurulur ve karar aralığın
uçlarına göre de denetlenir. **Senaryo analizi** varsayımları açıkça yazar; **Monte Carlo benzetimi** belirsiz
girdilerden binlerce olası sonuç üretip olasılık verir ("zarar etme olasılığı %19").

Tahmin bir karar içindir. Eksik ve fazla tahminin bedeli farklıysa ortanca değil, bedele göre seçilmiş bir
yüzdelik kullanılır.

## Karar tablosu

| Durum | Yöntem | Neden |
| --- | --- | --- |
| Gürültülü seri, belirgin döngü yok | Naif ya da kısa hareketli ortalama | Basit ve çoğu zaman yeterli |
| Haftalık döngü (hafta içi ↔ hafta sonu) | Mevsimsel naif (7 gün) ya da son birkaç aynı günün ortalaması | Döngüyü korur |
| Eğilim + mevsim, en az iki sezonluk geçmiş | Üstel düzleştirme (Holt-Winters) | Düzeyi, eğilimi ve mevsimi birlikte izler |
| Çok sayıda dış etken (kampanya, fiyat, hava) ve bol veri | Makine öğrenmesi modeli | Önce tabanları geçmeli |
| Geçmiş yok (yeni ürün) | Benzer ürünlerin eğrisi + senaryo | Veri yokken model kurulmaz |
| Girdiler belirsiz (ziyaretçi, dönüşüm, sepet) | Senaryo + Monte Carlo | Belirsizliği sonuca taşır |
| Karar asimetrik (stok tükenmesi pahalı) | Tahmin dağılımının bedele göre yüzdeliği | Ortancayla stok yarı yarıya tükenir |

## Tabanlar ve geriye dönük sınama

Günlük sipariş: haftalık döngü + hafif büyüme + gürültü (uydurma). Son 8 hafta, her hafta başında 7 gün ileriye
tahmin:

```python calistir
import random
import statistics as st

r = random.Random(3)
HAFTALIK = [1.0, 0.95, 0.97, 1.0, 1.1, 1.35, 1.25]  # Pzt … Paz (kurgusal)
seri = [round((200 + 0.5 * t) * HAFTALIK[t % 7] * r.gauss(1, 0.06)) for t in range(140)]


def naif(g: list[int], h: int) -> list[float]:
    return [g[-1]] * h


def hareketli_ort(g: list[int], h: int) -> list[float]:
    return [st.fmean(g[-7:])] * h


def mevsimsel_naif(g: list[int], h: int) -> list[float]:
    return [g[-7 + i % 7] for i in range(h)]


def ayni_gun_ort(g: list[int], h: int) -> list[float]:
    return [st.fmean(g[-7 * k + i % 7] for k in (1, 2, 3, 4)) for i in range(h)]


hatalar = {}
for ad, yontem in (("naif", naif), ("hareketli ortalama (7)", hareketli_ort),
                   ("mevsimsel naif", mevsimsel_naif), ("son 4 aynı gün ortalaması", ayni_gun_ort)):
    hata = []
    for baslangic in range(84, 140, 7):  # yöntem yalnız başlangıca kadarki veriyi görür
        tahmin = yontem(seri[:baslangic], 7)
        hata += [gercek - t for gercek, t in zip(seri[baslangic:baslangic + 7], tahmin)]
    hatalar[ad] = hata
    print(f"{ad:26s} MAE {st.fmean(abs(e) for e in hata):5.1f} · ortalama hata {st.fmean(hata):+5.1f}".replace(".", ","))

ondalik = st.quantiles(hatalar["son 4 aynı gün ortalaması"], n=10)
alt, ust = ondalik[0], ondalik[-1]
for gun, t in zip(["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"], ayni_gun_ort(seri, 7)):
    print(f"{gun}: tahmin {t:4.0f} · %80 aralık {t + alt:4.0f} – {t + ust:4.0f}")
```

```cikti
naif                       MAE  49,7 · ortalama hata -33,2
hareketli ortalama (7)     MAE  37,3 · ortalama hata  +5,6
mevsimsel naif             MAE  19,9 · ortalama hata  +5,6
son 4 aynı gün ortalaması  MAE  16,6 · ortalama hata  +9,7
Pzt: tahmin  259 · %80 aralık  243 –  295
Sal: tahmin  244 · %80 aralık  227 –  279
Çar: tahmin  245 · %80 aralık  228 –  280
Per: tahmin  251 · %80 aralık  234 –  286
Cum: tahmin  296 · %80 aralık  279 –  331
Cmt: tahmin  359 · %80 aralık  342 –  394
Paz: tahmin  322 · %80 aralık  306 –  358
```

Okuma: mevsimsel yöntemler hatayı yarıdan fazla düşürdü; naif ve düz ortalama haftalık döngüyü göremiyor. "Ortalama
hata" sütunu yanlılığı gösterir: naif yöntem pazarın yüksek değerini bütün haftaya yayıyor (−33); dört haftanın
ortalaması ise seri büyürken geride kalıyor ve tahmini sistematik olarak düşük tutuyor (+9,7). Aralık bu yüzden
tahminin üstüne kaymış; geçmiş hatalardan kurulan aralık bunu dürüstçe yansıtır. Daha iyisi yanlılığı gidermektir
(eğilimi izleyen bir yöntem, örneğin Holt-Winters).

Hata ölçütü seçimi: MAE (ortalama mutlak hata) birimiyle okunur. Yüzde hata (MAPE) sıfıra yakın günlerde patlar;
yüzde gerekiyorsa toplam mutlak hatayı toplam gerçekleşene bölün (WAPE).

## Belirsizliği göstermek

- Tahmin aralıkla yazılır: "Aralık ayında 9.000–11.500 sipariş (%80)"; "10.214 sipariş" yazılmaz.
- Ufuk uzadıkça aralık genişler; grafikte yelpaze (fan chart) olarak çizilir.
- Aralığın kapsaması denetlenir: geçmişte %80 aralığı gerçekleşenlerin yaklaşık %80'ini kapsamış mı?
- Nokta tahmin anlamlı basamağa yuvarlanır (10.214 → yaklaşık 10.200).

## Senaryo analizi ve Monte Carlo

Gelecek ayın geliri = ziyaretçi × dönüşüm × sepet; sabit gider 300.000 TL. Her girdi için en düşük, en olası ve en
yüksek değer tahmin edildi:

```python calistir
import random

r = random.Random(7)
GIDER = 300_000
girdiler = {"ziyaretçi": (40_000, 50_000, 60_000), "dönüşüm": (0.015, 0.022, 0.03), "sepet (TL)": (250, 320, 400)}


def carp(degerler: list[float]) -> float:
    sonuc = 1.0
    for d in degerler:
        sonuc *= d
    return sonuc


for ad, sira in (("kötümser (hepsi en düşük)", 0), ("temel (hepsi en olası)", 1), ("iyimser (hepsi en yüksek)", 2)):
    print(f"{ad:27s} {carp([g[sira] for g in girdiler.values()]):9,.0f} TL".replace(",", "."))

gelir = sorted(carp([r.triangular(dusuk, yuksek, olasi) for dusuk, olasi, yuksek in girdiler.values()])
               for _ in range(20000))
dilim = lambda q: gelir[int(q * len(gelir))]
print(f"Monte Carlo: p10 {dilim(0.1):,.0f} · p50 {dilim(0.5):,.0f} · p90 {dilim(0.9):,.0f} TL".replace(",", "."))
print(f"gelirin giderin altında kalma olasılığı: %{100 * sum(g < GIDER for g in gelir) / len(gelir):.0f}")
print(f"kötümser senaryodan kötü sonuç: {sum(g <= 150_000 for g in gelir)} / {len(gelir)}")
```

```cikti
kötümser (hepsi en düşük)     150.000 TL
temel (hepsi en olası)        352.000 TL
iyimser (hepsi en yüksek)     720.000 TL
Monte Carlo: p10 277.464 · p50 355.621 · p90 449.418 TL
gelirin giderin altında kalma olasılığı: %19
kötümser senaryodan kötü sonuç: 0 / 20000
```

"Kötümser" senaryo, 20.000 benzetimin hiçbirinde görülmeyecek kadar kötü: üç girdinin aynı anda en kötü ucunda
olması çok olasılık dışıdır. "İyimser" için de aynısı geçerlidir. Senaryo tablosu varsayımları konuşmak için iyidir;
"ne kadar olası?" sorusunu ise Monte Carlo yanıtlar: zarar olasılığı yaklaşık beşte bir.

Dikkat: girdiler bağımsız örneklendi. Gerçekte bağımlı olabilirler (reklam ziyaretçiyi artırınca dönüşüm düşer);
o zaman birlikte örneklenir ya da senaryo olarak ayrılır. Hangi girdinin sonucu en çok oynattığını görmek için
girdileri tek tek uçlara çekin (duyarlılık analizi, sensitivity analysis).

## Tahmini karara bağlamak

Günlük talep belirsiz; eksik stokta satış başına 30 TL kâr kaçıyor, fazla stokta adet başına 10 TL ziyan oluyor.
En iyi stok, talep dağılımının **eksik / (eksik + fazla)** yüzdeliğidir (kritik oran; "gazete satıcısı" problemi,
newsvendor):

```python calistir
import random
import statistics as st

r = random.Random(5)
talep = sorted(max(0, round(r.gauss(100, 20))) for _ in range(20000))  # tahmin dağılımı
EKSIK, FAZLA = 30, 10  # TL/adet: kaçan kâr, elde kalan ziyan


def maliyet(stok: int) -> float:
    return st.fmean(EKSIK * max(0, t - stok) + FAZLA * max(0, stok - t) for t in talep)


kritik = EKSIK / (EKSIK + FAZLA)
for ad, q in (("ortanca", 0.5), (f"kritik oran ({kritik:.2f})", kritik), ("p90", 0.9)):
    stok = talep[int(q * len(talep))]
    print(f"{ad:22s} stok {stok:3d} → ortalama günlük maliyet {maliyet(stok):5.1f} TL".replace(".", ","))
en_iyi = min(range(80, 140), key=maliyet)
print("tek tek denenince en iyi stok:", en_iyi)
```

```cikti
ortanca                stok 100 → ortalama günlük maliyet 316,3 TL
kritik oran (0,75)     stok 113 → ortalama günlük maliyet 254,4 TL
p90                    stok 125 → ortalama günlük maliyet 292,2 TL
tek tek denenince en iyi stok: 113
```

Ortanca tahminle stok tutmak, eksik kalmanın bedeli üç kat olduğu hâlde iki tarafa eşit davranmaktır. Aynı mantık
sunucu kapasitesine (yetersizlik pahalıysa p95), personel planına ve nakit tamponuna uygulanır.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Karmaşık model kuruldu, naif tahminden kötü | Taban karşılaştırması yapılmadı | Geriye dönük sınamada tabanlarla yarıştırın |
| Sınamada harika, gerçekte kötü | Gelecek bilgisi sızdı (merkezli ortalama, bütün seriden ölçek) | Her başlangıçta yalnız o güne kadarki veri |
| Tahmin sistematik olarak düşük | Yöntem eğilimi izlemiyor | Ortalama hatayı izleyin; eğilimli yöntem |
| Tek sayı kesin sanıldı | Aralık verilmedi | Geçmiş hatalardan %80 aralığı |
| "Kötümser senaryo" hiç gerçekleşmiyor | Bütün girdiler birlikte uca çekildi | Monte Carlo; tek tek duyarlılık |
| Bayram haftasında tahmin çöktü | Özel gün modelde yok; dinî bayramlar her yıl yaklaşık 11 gün öne kayar | Tatil takvimi; "geçen yılın aynı tarihi" değil "geçen yılın aynı bayramı" |
| Tatil sonrası hafta bozuk tahmin | Mevsimsel naif tatil haftasını kopyaladı | Tatil günlerini dışlayın; bir önceki normal haftayı kullanın |
| Monte Carlo sonucu her çalıştırmada farklı | Tohum yok, örnek az | Tohum + en az 10.000 örnek |
| Ortanca stokla sık sık tükeniyor | Eksik ve fazla bedeli farklı | Kritik oran yüzdeliği |
| Yüzde hata bazı günlerde yüzlerce | Sıfıra yakın payda (MAPE) | MAE ya da WAPE |

## Denetim listesi

- [ ] En az iki taban (naif, mevsimsel naif) geriye dönük sınamada ölçüldü; seçilen yöntem ikisini de geçiyor.
- [ ] Sınamada yöntem hiçbir zaman tahmin ettiği dönemi görmedi.
- [ ] Ortalama hata (yanlılık) raporlandı.
- [ ] Tahmin aralıkla verildi; aralığın kapsaması geçmişte denetlendi.
- [ ] Resmî ve dinî bayramlar, kampanyalar ayrı ele alındı.
- [ ] Senaryo varsayımları tabloda; Monte Carlo tohumlu ve yeterli örnekli; girdilerin bağımlılığı tartışıldı.
- [ ] Kararın bedel yapısı yazıldı; kullanılan yüzdelik ona göre seçildi.
- [ ] Tahminler bir günlüğe yazılıyor ve gerçekleşenle düzenli karşılaştırılıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce naif ve mevsimsel naif (7 gün) tabanlarını son 8 haftada, her hafta başında 7 gün
  ileriye geriye dönük sına; MAE ve ortalama hatayı ver. Yeni yöntemi aynı sınamayla karşılaştır. Tahmini geçmiş
  hataların %10 ve %90 dilimleriyle aralık olarak ver. Monte Carlo'da tohum kullan, 10.000 örnek çiz ve
  varsayımları tabloda yaz."
- **Modelin tipik hatası:** zaman serisini rastgele ayırarak değerlendirir; merkezli hareketli ortalama kullanır;
  MAPE'yi sıfırlı günlerde kullanır; tek sayı verir; kötümser senaryoyu bütün girdileri uca çekerek kurar; bayramı
  geçen yılın aynı tarihiyle eşler.
- **Çıktıda denetleyin:** sınama başlangıç noktaları ve "yalnız geçmiş veri" kuralı; tabanların hatası tabloda mı;
  aralık var mı; tohum var mı; varsayım tablosu var mı.

## İlgili

- Mevsimsel naif ve Holt-Winters:
  [`ml-temel/ml_temel/zaman/baselines.py`](../../ml-temel/ml_temel/zaman/baselines.py); kayan başlangıçlı geriye dönük
  sınama: [`ml-temel/ml_temel/zaman/backtest.py`](../../ml-temel/ml_temel/zaman/backtest.py); çalışan örnek:
  [`ml-temel/ornekler/07_zaman_serisi.py`](../../ml-temel/ornekler/07_zaman_serisi.py)
- Bileşenleri ve anomalileri etiketli sentetik seri (`beklenen` sütunu doğru cevaptır):
  [`veri/ornekler/zaman_serisi/`](../../veri/ornekler/zaman_serisi/VERI_KARTI.md)
- [Veri sızıntısı](../80-ml/veri-sizintisi.md) — zaman sızıntısının benzetimi
- [Betimsel istatistik](betimsel-istatistik.md) — yüzdelikler
- [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md) — belirsizlik ve önyükleme
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — SQL'de hareketli ortalama ve takvim omurgası
- [Pano tasarımı](pano-tasarimi.md) — hedefe göre ilerleme
- [Analiz raporu yazma](analiz-raporu-yazma.md) — aralıkla ve doğru yuvarlamayla yazmak
- [Zaman serisi tahmini](../80-ml/zaman-serisi-tahmini.md) — gecikmeli özellikler, modelle tahmin, tahmin aralığı
- [Rastgelelik ve benzetim](../92-matematik/rastgelelik-ve-benzetim.md) — Monte Carlo hata payı, tohum
- [Tahmin ve büyüklük sezgisi](../92-matematik/tahmin-ve-buyukluk-sezgisi.md) — Fermi tahmini, makullük denetimi
- [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md) — yükten kaynağa tahmin
