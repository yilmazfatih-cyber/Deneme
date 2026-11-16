---
baslik: Getiri ve risk ölçüleri
ozet: Basit ve log getiri, aritmetik ile geometrik ortalama, oynaklık sürüklemesi ve yıllıklaştırma, en büyük düşüş, Sharpe'ın belirsizliği, geriye dönük sınamada aşırı uydurma, kayıp serileri ve sabit kesirli risk.
etiketler: [finans, getiri, risk, oynaklik, geriye-donuk-sinama, olasilik]
duzey: orta
guncellik: 2026-11
---

# Getiri ve risk ölçüleri

> Bu notu ne zaman okumalı: bir yatırım, strateji ya da fiyat serisinin performansını hesaplarken ya da
> raporlarken; "ortalama yıllık getiri", "Sharpe", "en büyük düşüş" gibi bir sayıyı yorumlamadan önce; geçmiş
> veriyle sınanmış bir stratejiye güvenmeden önce.
>
> **Not:** Bu not ölçülerin matematiğini anlatır; yatırım tavsiyesi değildir. Geçmiş performans geleceği
> göstermez.

## Temel fikir

- Getiriler **çarpılarak** birikir: `%+50` ardından `%−50` sizi `%25` zararda bırakır. Bu yüzden "ortalama getiri"
  iki türlüdür: aritmetik (tek dönemin beklentisi) ve geometrik (gerçekte büyüme hızı). Fark, oynaklıkla büyür:
  geometrik ≈ aritmetik − σ²/2 (**oynaklık sürüklemesi**).
- **Log getiri** `ln(1 + r)` dönemler boyunca toplanır; birleştirme ve istatistik için rahattır. Raporlamada
  basit getiriye geri çevrilir.
- **Oynaklık** (volatilite, getirilerin standart sapması) riskin yalnız bir yüzüdür; yaşanan acıyı **en büyük
  düşüş** (maximum drawdown) ve toparlanma süresi daha iyi anlatır. %50 düşüşü telafi etmek %100 artış ister.
- Kısa veride getiri/risk oranlarının (Sharpe) **standart hatası çok büyüktür**; çok sayıda strateji denenince en
  iyisi neredeyse her zaman şanstır.
- Ardışık kayıp serileri sezgiden **uzundur**; işlem başına riski buna dayanacak kadar küçük tutmak gerekir.

## Karar tablosu

| Soru                               | Ölçü / hesap                                                                  | Dikkat                                             |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Dönem getirilerini birleştirmek    | `Π(1 + rᵢ) − 1` ya da log getirilerin toplamı                                 | Basit getirileri toplamak yanlış                   |
| "Yılda ortalama ne kazandırdı?"    | Geometrik ortalama (bileşik yıllık büyüme)                                    | Aritmetik ortalama, oynaklık kadar şişkindir       |
| Günlük oynaklığı yıllığa çevirmek  | `σ_gün · √252` (işlem günü)                                                   | Getiriler bağımsızsa geçerli; ilişkiliyse yanılır  |
| "En kötü ne yaşandı?"              | En büyük düşüş ve süresi                                                      | Standart sapma bunu göstermez                      |
| Getiriyi riske göre karşılaştırmak | Sharpe: (getiri − risksiz getiri) / oynaklık                                  | Kısa veride çok belirsiz; kalın kuyrukta yanıltıcı |
| Geçmiş veriyle strateji seçmek     | Örneklem dışı dönem; denenen strateji sayısını raporlayın                     | En iyi geçmiş sonuç büyük olasılıkla şans          |
| İşlem başına ne kadar risk         | Sabit kesirli: pozisyon = risk tutarı / zarar kes mesafesi                    | Kayıp serisi uzun sürebilir                        |
| Olasılıklı tahminin kalitesi       | Brier skoru, kalibrasyon ([kalibrasyon](../80-ml/kalibrasyon-ve-olasilik.md)) | İsabet oranı tek başına yetmez                     |

## Getiriyi doğru birleştirmek

```python calistir
import math

returns = [0.50, -0.50]
arithmetic = sum(returns) / len(returns)
growth = math.prod(1 + r for r in returns)
geometric = growth ** (1 / len(returns)) - 1
assert arithmetic == 0.0  # "ortalama getiri sıfır"...
assert round(growth, 2) == 0.75 and round(geometric, 4) == -0.1340  # ...ama para %25 eridi

# Log getiriler toplanır; basit getiriler toplanmaz
monthly = [0.04, -0.02, 0.03, -0.05, 0.06]
total_simple = math.prod(1 + r for r in monthly) - 1
total_from_logs = math.exp(sum(math.log1p(r) for r in monthly)) - 1
assert math.isclose(total_simple, total_from_logs)
assert round(sum(monthly), 4) == 0.06 and round(total_simple, 4) == 0.0571  # toplamak fazla gösterir

# Düşüşü telafi için gereken artış: 1 / (1 − d) − 1
for drop, needed in ((0.10, 0.111), (0.20, 0.25), (0.50, 1.0), (0.80, 4.0)):
    assert round(1 / (1 - drop) - 1, 3) == needed
print("tamam")
```

## Oynaklık sürüklemesi ve yıllıklaştırma

```python calistir
import math
import random
import statistics

rng = random.Random(0)
days = 252 * 20  # 20 yıl, yılda ~252 işlem günü
daily = [rng.gauss(0.0004, 0.02) for _ in range(days)]  # günlük ort. %0,04, oynaklık %2

mean = statistics.fmean(daily)
geometric = math.prod(1 + r for r in daily) ** (1 / days) - 1
drag_estimate = mean - statistics.pvariance(daily) / 2
assert geometric < mean / 1.8  # büyüme hızı ortalamanın yarısından az
assert abs(geometric - drag_estimate) < 2e-5  # geometrik ≈ aritmetik − σ²/2

annual_vol = statistics.stdev(daily) * math.sqrt(252)
assert 0.30 < annual_vol < 0.33  # %2 günlük ≈ %32 yıllık (bağımsızlık varsayımıyla)
print(f"günlük aritmetik %{mean * 100:.3f}, geometrik %{geometric * 100:.3f}; yıllık oynaklık %{annual_vol * 100:.0f}")
```

Pratik sonuç: aynı aritmetik ortalamada daha oynak olan seri daha az büyür. Kaldıraç oynaklığı büyüttüğü için
sürüklemeyi karesel artırır. `√252` kuralı getirilerin günden güne bağımsız olduğunu varsayar; eğilimli ya da
ortalamaya dönen serilerde yıllık oynaklığı doğrudan yıllık getirilerden ölçün.

## En büyük düşüş

```python calistir
def max_drawdown(prices):
    """Zirveden en derin düşüş (oran) ve o düşüşün zirve ile dip indeksleri."""
    peak_i, worst, worst_span = 0, 0.0, (0, 0)
    for i, price in enumerate(prices):
        if price > prices[peak_i]:
            peak_i = i
        drop = price / prices[peak_i] - 1
        if drop < worst:
            worst, worst_span = drop, (peak_i, i)
    return worst, worst_span


prices = [100, 120, 90, 95, 130, 104, 110, 140]
drop, (peak, trough) = max_drawdown(prices)
assert round(drop, 2) == -0.25 and (peak, trough) == (1, 2)  # 120 → 90
assert round(prices[-1] / prices[0] - 1, 2) == 0.40  # dönem getirisi güzel, ama yolda %25 düşüş yaşandı
print("tamam")
```

Düşüşü raporlarken derinliğin yanına **süreyi** (zirveden yeni zirveye kaç gün) yazın; insanların stratejiden
vazgeçtiği yer çoğu zaman derinlik değil süredir.

## Geriye dönük sınama: en iyi sonuç çoğu zaman şanstır

Hiçbir avantajı olmayan (ortalama getirisi sıfır) 200 rastgele "strateji" üretip bir yıllık günlük veride
Sharpe oranlarını hesaplayalım.

```python calistir
import math
import random
import statistics

rng = random.Random(0)


def annual_sharpe(daily):
    return statistics.fmean(daily) / statistics.stdev(daily) * math.sqrt(252)


sharpes = [annual_sharpe([rng.gauss(0, 0.01) for _ in range(252)]) for _ in range(200)]
best = max(sharpes)
print(f"200 avantajsız stratejinin en iyisi: Sharpe {best:.2f}; ortalaması {statistics.fmean(sharpes):.2f}")
assert best > 2.0  # "harika" görünen sonuç tamamen şans
assert abs(statistics.fmean(sharpes)) < 0.3
# Bir yıllık günlük veride yıllık Sharpe'ın standart hatası ≈ 1: 200 denemenin en büyüğü ≈ 2,5–3 olur
assert 0.8 < statistics.stdev(sharpes) < 1.2
```

Kurallar: (1) kaç strateji/ayar denendiğini yazın; (2) seçimi bir dönemde yapıp **hiç bakılmamış** sonraki
dönemde ölçün; (3) geleceği gören veri (karar anından sonra yayımlanan rakam, sonradan düzeltilen fiyat) ve
yalnız bugün hâlâ var olan şirketlerle sınama (hayatta kalan yanlılığı) sonuçları şişirir. Çoklu karşılaştırma:
[anlamlılık ve güven aralığı](../70-veri/anlamlilik-ve-guven-araligi.md); hayatta kalan yanlılığı:
[korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md).

## Kayıp serileri ve sabit kesirli risk

```python calistir
import random


def p_losing_streak(trials, k, p_loss=0.5):
    """trials işlemde en az bir kez art arda k kayıp olasılığı (seri uzunluğu üzerinde dinamik programlama)."""
    runs, hit = [1.0] + [0.0] * (k - 1), 0.0  # runs[j]: şu an j'lik kayıp serisindeyiz
    for _ in range(trials):
        new = [0.0] * k
        for length, prob in enumerate(runs):
            new[0] += prob * (1 - p_loss)
            if length + 1 >= k:
                hit += prob * p_loss
            else:
                new[length + 1] += prob * p_loss
        runs = new
    return hit


# Yarı yarıya kazanan bir sistemde, 250 işlemde
assert p_losing_streak(250, 5) > 0.95  # 5'li kayıp serisi neredeyse kesin
assert 0.35 < p_losing_streak(250, 8) < 0.42  # 8'li seri: ~%38

rng = random.Random(1)
hits = 0
for _ in range(10_000):  # benzetimle doğrulama
    run = 0
    for _ in range(250):
        run = run + 1 if rng.random() < 0.5 else 0
        if run >= 8:
            hits += 1
            break
assert abs(hits / 10_000 - p_losing_streak(250, 8)) < 0.02

# Sabit kesirli risk: sermaye 100 000, işlem başına %1 risk, zarar kes %5 uzakta
capital, risk_fraction, stop_distance = 100_000, 0.01, 0.05
position = capital * risk_fraction / stop_distance
assert position == 20_000  # zarar kes tetiklenirse kayıp 1 000 TL
# 10 art arda kayıp: %1 riskle −%9,6; %5 riskle −%40 (telafisi için +%67 gerekir)
assert round(1 - 0.99**10, 3) == 0.096 and round(1 - 0.95**10, 2) == 0.40
print("tamam")
```

Zarar kes fiyatı her zaman tutmaz (boşluklu açılış, düşük likidite); gerçek kayıp hesaplanandan büyük olabilir.
Risk sınırlarını kodda sabit kurallarla uygulayın ve benzetimde uzun kayıp serileriyle sınayın.

## Tuzaklar

| Belirti                                          | Neden                                                    | Çözüm                                                |
| ------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| "Ortalama getiri pozitif" ama hesap küçülmüş     | Aritmetik ortalama; oynaklık sürüklemesi                 | Geometrik ortalama (bileşik büyüme) raporlayın       |
| Aylık getiriler toplanıp yıllık getiri bulunmuş  | Basit getiriler toplanmaz                                | `Π(1 + r) − 1` ya da log getiriler                   |
| Yıllık oynaklık gerçekte yaşanandan küçük        | `√252` kuralı ilişkili getirilerde yanılır               | Yıllık getirilerden doğrudan ölçün; düşüşe de bakın  |
| Geçmişte harika strateji canlıda sıradan         | Çoklu deneme, aşırı uydurma, geleceği gören veri         | Örneklem dışı dönem; deneme sayısını raporlayın      |
| Sharpe "2" diye övülen sonuç kısa veriden        | Bir yıllık günlük veride standart hata ≈ 1               | Güven aralığıyla verin; daha uzun ve farklı dönemler |
| Sınamada hiç iflas olmuyor, canlıda büyük kayıp  | Yalnız bugün var olan varlıklar; kayıp serisi sınanmamış | Hayatta kalan yanlılığını giderin; seri benzetimi    |
| Zarar kes hesaplanan kaybı aşıyor                | Fiyat boşluğu, kayma (slippage)                          | Riski kayma payıyla hesaplayın; pozisyon sınırı      |
| Yüzde değişimler karşılaştırılırken yanlış sonuç | Düşüş ve telafi asimetrik                                | Gerekli artışı `1/(1 − d) − 1` ile gösterin          |

## Denetim listesi

- [ ] Dönem getirileri çarpımla birleştirilmiş; "yıllık ortalama" geometrik.
- [ ] Oynaklığın yanında en büyük düşüş ve süresi raporlanmış.
- [ ] Yıllıklaştırma varsayımı (bağımsızlık, gün sayısı) yazılı.
- [ ] Sharpe gibi oranlar güven aralığı ya da veri uzunluğuyla birlikte verilmiş.
- [ ] Geriye dönük sınamada denenen strateji/ayar sayısı ve örneklem dışı dönem sonucu raporlanmış.
- [ ] Karar anından sonra bilinen hiçbir veri sınamaya girmemiş (zaman kilidi testi var).
- [ ] İşlem başına risk sabit kuralla sınırlı; uzun kayıp serisi benzetimi yapılmış.
- [ ] Ekranda "yatırım tavsiyesi değildir" uyarısı var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Getirileri `math.prod(1 + r)` ile birleştir; yıllık ortalamayı geometrik ver; en büyük
  düşüşü ve süresini hesapla. Strateji karşılaştırmasında kaç deneme yapıldığını ve örneklem dışı sonucu yaz.
  Tavsiye cümlesi kurma; yalnız ölçüleri raporla."
- **Modelin tipik hatası:** aylık getirileri toplar; aritmetik ortalamayı "yıllık getiri" diye sunar; en iyi
  geriye dönük sonucu seçip örneklem dışı dönem yapmaz; günlük fiyatı karar anından sonra gelen veriyle
  hizalar; kesin dille "bu strateji kazandırır" yazar.
- **Çıktıda denetleyin:** `sum(` ile getiri birleştirme; "ortalama getiri" ifadesinin hangi ortalama olduğu;
  deneme sayısı; tarih hizalaması (karar anı ≥ veri anı); uyarı metni.
- **Akıl sağlığı testi isteyin:** "ortalaması sıfır rastgele getirilerle aynı hattı çalıştır; sonuç anlamlı
  çıkıyorsa hatta hata ya da aşırı uydurma vardır."

## İlgili

- [Finans matematiği](finans-matematigi.md): bileşik faiz, reel getiri, bugünkü değer
- [Dağılımlar](dagilimlar.md): kalın kuyruk, ortalamanın yanıltması
- [Olasılık temelleri](olasilik-temelleri.md): kumarbaz yanılgısı, beklenen değer ve varyans
- [İstatistiksel kestirim](istatistiksel-kestirim.md): standart hata, önyükleme
- [Kalibrasyon ve olasılık](../80-ml/kalibrasyon-ve-olasilik.md): olasılıklı tahminleri Brier ve kalibrasyonla puanlama
- [Zaman serisi tahmini](../80-ml/zaman-serisi-tahmini.md): zamana saygılı doğrulama
