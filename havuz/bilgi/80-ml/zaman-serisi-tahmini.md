---
baslik: Zaman serisi tahmini
ozet: Naif ve mevsimsel naif tabanlar, gecikme ve hareketli özellikler, yürüyen başlangıçlı geriye dönük test, ufuk, sızıntı, mevsimsellik ve tatil, tahmin aralığı; çalışan karşılaştırmalarla.
etiketler: [makine-ogrenmesi, zaman-serisi, tahmin, geriye-donuk-test, mevsimsellik]
duzey: orta
guncellik: 2026-11
---

# Zaman serisi tahmini

> Bu notu ne zaman okumalı: satış, talep, trafik, çağrı sayısı gibi zamana bağlı bir değeri ileriye tahmin
> ederken; bir tahmin modelinin gerçekten işe yarayıp yaramadığını ölçerken.

## Temel fikir

Zaman serisinde üç kural her şeyden önce gelir:

1. **Taban çizgisi:** "dünkü değer" (naif) ve "geçen haftanın aynı günü" (mevsimsel naif). Bunları geçmek
   sanıldığından zordur; geçemeyen model kullanılmaz.
2. **Geriye dönük test (backtest):** model hep yalnız geçmişle eğitilir, sonraki dönemi tahmin eder; başlangıç
   noktası ileri kaydırılarak tekrarlanır. Rastgele çapraz doğrulama zaman serisinde geçersizdir.
3. **Tahmin anında ne biliniyor?** Her özellik ve her girdi tahmin anında elde olmalı; 7 gün sonrasını tahmin
   ederken dünkü değer var ama 3 gün sonrasının değeri yok.

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Her zaman, ilk iş | Naif + mevsimsel naif + hareketli ortalama | Taban; çoğu zaman şaşırtıcı derecede iyi |
| Tek seri, belirgin eğilim + mevsim | Üstel düzleştirme (Holt-Winters) | Az veriyle sağlam, yorumlanabilir |
| Çok sayıda seri (mağaza × ürün), ortak örüntüler | Gecikme ve takvim özellikli tek bir gradyan artırma modeli | Seriler arasında bilgi paylaşılır |
| Kampanya, fiyat, tatil gibi dış etkenler | Özellik olarak ekleyin — yalnız **tahmin anında bilinenler** | Bilinmeyen geleceği özellik yapmak sızıntıdır |
| Çok sayıda sıfırlı, kesik talep (yedek parça) | Toplam düzeyde tahmin; sıfırlara uygun ölçüt (MAE, WAPE) | MAPE tanımsızlaşır |
| Uzun ufuk (aylar), az veri | Basit model + geniş aralık; senaryo | Karmaşık model belirsizliği gizler |
| Ani kırılma (yeni şube, salgın) | Kırılma öncesini ayrı ele alın ya da ağırlığını düşürün | Eski örüntü artık geçerli değil |

## Tabanlar ve geriye dönük test

Eğilim + haftalık mevsim + gürültü içeren günlük satış. 30 başlangıç noktası, her birinde 7 günlük ufuk:

```python calistir
import random
import statistics

random.seed(38)
weekly = [0, -2, -1, 0.5, 2.5, 6, 4]
sales = [50 + 0.04 * d + weekly[d % 7] + random.gauss(0, 1.5) for d in range(520)]
HORIZON = 7
methods = {
    "naif (son değer)": lambda past, h: past[-1],
    "mevsimsel naif (geçen hafta)": lambda past, h: past[-7 + (h - 1) % 7],
    "28 günlük ortalama": lambda past, h: statistics.fmean(past[-28:]),
}
origins = range(300, 300 + 7 * 30, 7)  # yürüyen başlangıç: her seferinde yalnız geçmiş
train_part = sales[:300]
scale = statistics.fmean(abs(train_part[t] - train_part[t - 7]) for t in range(7, 300))  # MASE ölçeği
for name, forecast in methods.items():
    errors = [abs(forecast(sales[:o], h) - sales[o + h - 1]) for o in origins for h in range(1, HORIZON + 1)]
    mae = statistics.fmean(errors)
    print(f"{name:28s} MAE {mae:5.2f}   MASE {mae / scale:4.2f}")
```

```cikti
naif (son değer)             MAE  4.76   MASE 2.91
mevsimsel naif (geçen hafta) MAE  1.77   MASE 1.08
28 günlük ortalama           MAE  2.64   MASE 1.62
```

MASE (ölçeklenmiş mutlak hata): modelin hatası / eğitim döneminde mevsimsel naifin bir adımlık hatası. 1'in altı
"mevsimsel naiften iyi", üstü "kötü" demektir; farklı ölçekteki serileri karşılaştırmaya da yarar. Burada en basit
kural (geçen haftanın aynı günü) ötekileri rahat geçiyor; kurulacak model bu satırı geçmelidir. Havuzdaki örnekte
(`ml-temel/ornekler/07_zaman_serisi.py`) Holt-Winters 7 günlük ufukta MAE 1,307 ile mevsimsel naifi (1,608) geçiyor.

Geriye dönük test tasarımı:

| Ayar | Ne demek | Kural |
| --- | --- | --- |
| Başlangıç penceresi | İlk eğitimde kullanılan geçmiş | En az 2–3 mevsim döngüsü |
| Ufuk (horizon) | Kaç adım ileri tahmin | İşin ihtiyacı (siparişin teslim süresi kadar) |
| Adım | Başlangıç noktası ne kadar kayar | Ufuk kadar ya da daha az |
| Boşluk (gap) | Eğitim sonu ile tahmin başı arası | Veri gecikmeli geliyorsa (dünün verisi bugün öğlen) o kadar boşluk |
| Yeniden eğitim | Her başlangıçta mı, ayda bir mi | Canlıda nasıl olacaksa öyle |

Hatayı **ufuk adımı başına** raporlayın: 1 gün sonrası ile 7 gün sonrası farklı zorluktadır.

## Özellikler: gecikme ve hareketli değerler

Gradyan artırma gibi bir modelle tahmin yaparken tipik özellikler: gecikmeler (`y[t−1]`, `y[t−7]`, `y[t−14]`),
hareketli ortalama ve sapma (son 7/28 gün), takvim (haftanın günü, ay, ayın günü, maaş günü), tatil ve özel gün,
planlı kampanya ve fiyat. İki kural:

- **Kaydırma:** hareketli ortalama tahmin edilen günü **içermez**. `ortalama(y[t−7 .. t−1])` doğru,
  `ortalama(y[t−6 .. t])` sızıntıdır.
- **Ufuğa uygun gecikme:** h gün sonrasını tahmin ederken en yeni kullanılabilir değer `y[t]`'dir; `y[t+h−1]`
  bilinmez. Ya her ufuk için ayrı model (doğrudan), ya tahmini geri besleyerek (özyinelemeli) çalışın.

```python calistir
import random
import statistics

random.seed(39)
level, y = 100.0, []
for d in range(500):
    level += random.gauss(0, 1)
    y.append(level + 3 * (d % 7 == 5) + random.gauss(0, 1))


def evaluate(feature):  # y[t] ~ a·özellik + b; ilk 350 gün eğitim, sonrası sınama
    train = [(feature(t), y[t]) for t in range(30, 350)]
    slope, intercept = statistics.linear_regression([f for f, _ in train], [v for _, v in train])
    return statistics.fmean(abs(slope * feature(t) + intercept - y[t]) for t in range(350, 500))


leaky = lambda t: statistics.fmean(y[t - 2:t + 1])   # YANLIŞ: bugünü de içeriyor
honest = lambda t: statistics.fmean(y[t - 3:t])      # DOĞRU: dünde biter
print(f"bugünü içeren 3 günlük ortalama:  MAE {evaluate(leaky):.2f}")
print(f"dünde biten 3 günlük ortalama:    MAE {evaluate(honest):.2f}")
```

```cikti
bugünü içeren 3 günlük ortalama:  MAE 1.09
dünde biten 3 günlük ortalama:    MAE 1.61
```

Sızıntılı özellik çevrimdışında daha iyi görünür; canlıda o değer yoktur. Aynı hata merkezli hareketli ortalamada
(`t−3 .. t+3`), "bütün dönemin ortalaması"nda ve gerçekleşmiş hava durumunu (tahmin yerine) özellik yapmakta da olur.

## Mevsimsellik ve tatil

| Örüntü | Nasıl ele alınır |
| --- | --- |
| Haftalık (hafta sonu farkı) | Haftanın günü özelliği; mevsimsel naif m = 7 |
| Yıllık (yaz, kış, okul dönemi) | Ay/hafta özelliği; en az 2–3 yıllık veri; mevsimsel naif m = 365 kaba bir tabandır |
| Ay içi (maaş günü, fatura günü) | Ayın günü, "maaşa kalan gün" |
| Sabit tarihli resmî tatiller | Tatil göstergesi + tatil öncesi/sonrası günleri |
| Dinî bayramlar | Her yıl ~11 gün öne kayar; tarihleri resmî kaynaktan alın, hesapla üretmeyin; arife ve uzayan tatil (köprü) etkisini ayrı gösterge yapın |
| Kampanya dönemleri | Planlanmışsa özellik; geçmişteki kampanyalar işaretli olsun ki model onları normal sanmasın |

Aynı tarihin yıldan yıla kayması (bayram, Paskalya benzeri) yıllık mevsimsel naifi yanıltır; bu günlerde hatayı
ayrıca raporlayın.

## Tahmin aralığı

Nokta tahmin tek başına karar verdirmez: "yarın 120 ± 5" ile "yarın 120 ± 40" farklı stok kararı demektir. Basit ve
dürüst yol: geriye dönük testin hatalarından, **ufuk adımı başına** yüzdelik aralık kurmak ve sonra kapsamasını
yeni bir dönemde denetlemek:

```python calistir
import random

random.seed(40)
level, y = 100.0, []
for _ in range(900):
    level += random.gauss(0, 1)
    y.append(level + random.gauss(0, 0.5))


def errors(origins, h):  # naif tahmin: son değer
    return [y[o + h - 1] - y[o - 1] for o in origins]


def quantile(values, q):
    ordered = sorted(values)
    return ordered[int(q * (len(ordered) - 1))]


calibration, later = range(100, 600), range(600, 890)
for h in (1, 3, 7):
    past = errors(calibration, h)
    low, high = quantile(past, 0.1), quantile(past, 0.9)  # %80 aralık
    future = errors(later, h)
    coverage = sum(low <= e <= high for e in future) / len(future)
    print(f"ufuk {h}: %80 aralık genişliği {high - low:5.2f}, sonraki dönemde kapsama %{coverage * 100:.0f}")
```

```cikti
ufuk 1: %80 aralık genişliği  3.10, sonraki dönemde kapsama %81
ufuk 3: %80 aralık genişliği  4.76, sonraki dönemde kapsama %83
ufuk 7: %80 aralık genişliği  7.26, sonraki dönemde kapsama %84
```

Aralık ufukla genişler. Kapsama hedefin (burada %80) altındaysa aralıklar dar, belirsizlik eksik hesaplanmıştır;
sık nedenleri: dağılım kayması, kırılma, hataların birbirine bağlı olması.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Çapraz doğrulama mükemmel, canlı kötü | Rastgele `KFold` ile değerlendirme | Yürüyen başlangıçlı geriye dönük test |
| Model mevsimsel naifi geçemiyor | Özellikler yetersiz ya da seri gürültü baskın | Tabanı kullanın; modeli ancak geçerse alın |
| 7 günlük ufukta beklenenden iyi sonuç | Ufuktan kısa gecikme kullanılmış (`y[t−1]`, 7 gün sonrası için) | Ufka uygun gecikme; doğrudan ya da özyinelemeli kurgu |
| Bayram haftasında büyük hata | Hareketli tatil yıllık örüntüyü kaydırdı | Bayram göstergeleri; bu günlerde hatayı ayrıca raporlayın |
| MAPE patladı | Sıfır ya da küçük değerli günler | MAE, WAPE, MASE |
| Ağaç modeli büyüyen seride hep düşük tahmin | Ağaç ekstrapolasyon yapamaz | Farkı/oranı tahmin edin ya da eğilimi ayrıca modelleyin |
| Tahmin aralığı gerçekte çok dar | Aralık bir adımlık hatadan kuruldu ya da kayma var | Ufuk başına aralık; kapsamayı yeni dönemde ölçün |
| Gerçekleşmiş hava durumu özelliğiyle model harika | Canlıda yalnız hava tahmini var | Özelliği tahmin anındaki hava tahmininden kurun |

## Denetim listesi

- [ ] Naif, mevsimsel naif ve hareketli ortalama aynı geriye dönük testle ölçüldü.
- [ ] Geriye dönük test yürüyen başlangıçlı; başlangıç penceresi, ufuk, adım ve boşluk yazıldı.
- [ ] Hata ufuk adımı başına raporlandı; MAE + MASE (ya da WAPE) birlikte verildi.
- [ ] Bütün özellikler tahmin anında biliniyor; hareketli değerler bir adım kaydırılmış.
- [ ] Gecikmeler ufka uygun; çok adımlı strateji (doğrudan/özyinelemeli) yazıldı.
- [ ] Tatil ve bayram günleri işaretli; bu günlerin hatası ayrıca raporlandı.
- [ ] Tahmin aralığı var ve kapsaması daha sonraki bir dönemde ölçüldü.
- [ ] Model mevsimsel naifi anlamlı farkla geçmiyorsa kullanılmıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce naif, mevsimsel naif (m=7) ve 28 günlük ortalamayı yürüyen başlangıçlı geriye dönük
  testle ölç: başlangıç 365 gün, ufuk 7, adım 7. Hatayı ufuk adımı başına MAE ve MASE olarak tablo yap. Model
  özelliklerinde hareketli değerleri `shift(1)` ile kaydır; ufuktan kısa gecikme kullanma."
- **Modelin tipik hatası:** `train_test_split(shuffle=True)` ya da `KFold` kullanır; `rolling(7).mean()`'i kaydırmadan
  özellik yapar; 7 gün sonrası için `lag_1` kullanır; tabanı atlar; MAPE'yi sıfırlı seride raporlar.
- **Çıktıda denetleyin:** `shift` çağrıları; her özelliğin hangi günlere baktığı; geriye dönük testte modelin her
  başlangıçta yalnız geçmişle eğitildiği; taban satırının tabloda olduğu.

## İlgili

- [Veri sızıntısı](veri-sizintisi.md) — zaman sızıntısı benzetimi · [Ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md)
- [Aykırı değer ve anomali](aykiri-deger-ve-anomali.md) — mevsimsel artıkta anomali · [Değerlendirme ölçütleri](degerlendirme-olcutleri.md)
- Mevsimsel naif, Holt-Winters ve geriye dönük sınama: [`ml_temel/zaman/baselines.py`](../../ml-temel/ml_temel/zaman/baselines.py),
  [`backtest.py`](../../ml-temel/ml_temel/zaman/backtest.py); çalışan örnek ve beklenen çıktısı:
  [`07_zaman_serisi.py`](../../ml-temel/ornekler/07_zaman_serisi.py), [`beklenen/07_zaman_serisi.txt`](../../ml-temel/ornekler/beklenen/07_zaman_serisi.txt)
- Boşluklu zaman bölücüsü (`TimeSeriesSplit(gap=…)`): [`ml_temel/secim/splitters.py`](../../ml-temel/ml_temel/secim/splitters.py)
- Eğilim, mevsim, tatil ve etiketli anomali içeren örnek seri: [`veri/ornekler/zaman_serisi/VERI_KARTI.md`](../../veri/ornekler/zaman_serisi/VERI_KARTI.md);
  sabit tarihli tatiller: [`veri/tr/resmi_tatiller.meta.json`](../../veri/tr/resmi_tatiller.meta.json),
  takvim yardımcıları: [`verihavuzu/calendar_tr.py`](../../veri/verihavuzu/calendar_tr.py)
