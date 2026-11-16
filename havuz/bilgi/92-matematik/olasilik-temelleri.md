---
baslik: Olasılık temelleri
ozet: Örneklem uzayı, bağımsızlık, koşullu olasılık, Bayes kuralı ve taban oranı yanılgısı, beklenen değer ve varyans, büyük sayılar yasası; kesirle tam hesap ve benzetimle doğrulama.
etiketler: [olasilik, bayes, beklenen-deger, varyans, benzetim]
duzey: temel
guncellik: 2026-11
---

# Olasılık temelleri

> Bu notu ne zaman okumalı: "Test pozitif çıktı, gerçekten hasta mı?", "30 günde en az bir kez çöker mi?",
> "Bu sigorta/garanti kârlı mı?" gibi bir soruyu hesaplamadan önce; bir modelin ya da raporun olasılık
> iddiasını denetlerken.

## Temel fikir

- **Örneklem uzayı** (sample space): olabilecek bütün sonuçların listesi. **Olay**: bu sonuçların bir alt kümesi.
  Sonuçlar eşit olasılıklıysa `P(olay) = olaydaki sonuç sayısı / bütün sonuçlar`. Emin değilseniz uzayı
  yazıp sayın; sezgi bu konuda sık yanılır.
- **Koşullu olasılık** paydayı değiştirir: `P(A|B) = P(A ve B) / P(B)`, yani "yalnız B'nin olduğu dünyalarda A".
  `P(A|B)` ile `P(B|A)` farklı şeylerdir; çoğu yanılgı bu ikisini karıştırmaktan çıkar.
- **Bağımsızlık**: `P(A ve B) = P(A) · P(B)`. Bir varsayımdır, kanıtlanmadıkça yoktur. Ortak bir neden
  (aynı güç kaynağı, aynı veri merkezi, aynı hata) bağımsızlığı bozar.
- **Bayes kuralı** koşulu tersine çevirir: `P(H|E) = P(E|H) · P(H) / P(E)`. Önsel (taban oranı) olmadan
  hesaplanamaz.
- **Beklenen değer** uzun vadeli ortalamadır; **varyans** bu ortalamanın etrafındaki oynaklıktır. Tek seferlik
  kararda ikisine birden bakılır.

## Karar tablosu

| Soru                                              | Hesap                                               | Dikkat                                        |
| ------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| "İkisi birden olur mu?"                           | `P(A ve B) = P(A) · P(B∣A)`; bağımsızsa `P(A)·P(B)` | Bağımsız demeden önce ortak neden arayın      |
| "En az bir kez olur mu?"                          | `1 − (1 − p)^n`                                     | `n · p` toplamak yanlış; 1'i bile aşar        |
| "Biri ya da öteki"                                | `P(A) + P(B) − P(A ve B)`                           | Kesişimi çıkarmayı unutmayın                  |
| "Belirti görüldü; neden ne olasılıkla?"           | Bayes                                               | Taban oranı (sıklık) olmadan hesap yapılamaz  |
| "Uzun vadede ortalama ne kazandırır/kaybettirir?" | Beklenen değer `Σ x · P(x)`                         | Tek seferde kayıp ödenemiyorsa varyansa bakın |
| "Ne kadar oynak?"                                 | Varyans, standart sapma                             | Bağımsız değillerse varyanslar toplanmaz      |
| "Ortalaması alınan sonuç güvenilir mi?"           | Büyük sayılar yasası; hata ≈ σ/√n                   | Hatayı yarıya indirmek dört kat veri ister    |

## Örneklem uzayını sayın

İki zarın 36 eşit olasılıklı sonucunu yazıp tam kesirle (`Fraction`) sayalım. Bu yöntem küçük her soruda
"hesabım doğru mu" denetimi olarak kullanılır.

```python calistir
from fractions import Fraction
from itertools import product

space = list(product(range(1, 7), repeat=2))  # (birinci zar, ikinci zar)


def prob(event):
    return Fraction(sum(1 for outcome in space if event(outcome)), len(space))


assert prob(lambda o: sum(o) == 7) == Fraction(1, 6)
# "En az bir 6": doğrudan saymak = 1 - P(hiç 6 yok)
assert prob(lambda o: 6 in o) == 1 - Fraction(5, 6) ** 2 == Fraction(11, 36)

# Koşullu olasılık yönlüdür: P(toplam 8 | ilk zar 3) ile P(ilk zar 3 | toplam 8) farklı
both = prob(lambda o: sum(o) == 8 and o[0] == 3)
assert both / prob(lambda o: o[0] == 3) == Fraction(1, 6)
assert both / prob(lambda o: sum(o) == 8) == Fraction(1, 5)

# Bağımsızlık sezgiyle bilinmez, hesapla bulunur
even_first = prob(lambda o: o[0] % 2 == 0)
assert prob(lambda o: o[0] % 2 == 0 and sum(o) == 7) == even_first * prob(lambda o: sum(o) == 7)  # bağımsız
assert prob(lambda o: o[0] % 2 == 0 and sum(o) == 8) != even_first * prob(lambda o: sum(o) == 8)  # bağımlı
print("tamam")
```

## "En az bir kez" ve ortak neden

Günlük %1 olasılıkla çöken bir iş 30 günde en az bir kez çöker mi? `30 × %1 = %30` yanlıştır; doğrusu
"hiç çökmemenin" tümleyenidir. İkinci tuzak: "iki yedek disk birden bozulmaz" hesabı bağımsızlığı varsayar.

```python calistir
from fractions import Fraction

p = 0.01
for days in (30, 100, 200):
    exact = 1 - (1 - p) ** days
    print(days, "gün:", round(exact, 3), "| yanlış toplam:", round(days * p, 2))
assert round(1 - (1 - p) ** 30, 3) == 0.26
assert 200 * p > 1  # toplama yöntemi olasılığı 1'in üstüne çıkarır

# İki disk, her biri yılda %1 bozulur. Bağımsızsa ikisi birden: %0,01
disk = Fraction(1, 100)
independent = disk * disk
# Ortak güç kaynağı yılda %0,5 olasılıkla ikisini birden yakıyorsa:
common = Fraction(5, 1000)
correlated = common + (1 - common) * disk * disk
assert independent == Fraction(1, 10_000)
assert correlated / independent > 50  # risk elli kattan fazla
```

```cikti
30 gün: 0.26 | yanlış toplam: 0.3
100 gün: 0.634 | yanlış toplam: 1.0
200 gün: 0.866 | yanlış toplam: 2.0
```

Yedeklilik hesabında ilk soru "ikisi aynı nedenle birlikte bozulabilir mi?" olmalıdır: aynı raf, aynı bölge,
aynı yazılım sürümü, aynı yanlış yapılandırma.

## Bayes kuralı: taban oranı yanılgısı

Bir hastalık nüfusun %1'inde var. Test hastaların %90'ını yakalıyor (duyarlılık), sağlamların %5'ine yanlışlıkla
pozitif diyor. Test pozitif çıkan biri ne olasılıkla hasta? Sezgi "%90" der; doğrusu ~%15'tir.

```python calistir
import random
from fractions import Fraction

prevalence = Fraction(1, 100)  # taban oranı: P(hasta)
sensitivity = Fraction(90, 100)  # P(pozitif | hasta)
false_positive = Fraction(5, 100)  # P(pozitif | sağlam)

# Bayes: P(hasta | pozitif) = P(pozitif | hasta) P(hasta) / P(pozitif)
p_positive = sensitivity * prevalence + false_positive * (1 - prevalence)
posterior = sensitivity * prevalence / p_positive
assert posterior == Fraction(2, 13)  # ≈ 0,154

# Aynı hesap "10 000 kişi" diliyle: 100 hasta → 90 pozitif; 9 900 sağlam → 495 pozitif
assert Fraction(90, 90 + 495) == posterior

# Oran (odds) biçimi: sonsal oran = önsel oran × olabilirlik oranı (LR)
prior_odds = prevalence / (1 - prevalence)  # 1 : 99
likelihood_ratio = sensitivity / false_positive  # 18
after_two = prior_odds * likelihood_ratio**2  # iki bağımsız pozitif test
assert after_two / (1 + after_two) == Fraction(36, 47)  # ≈ 0,77

# Benzetimle doğrulama
rng = random.Random(7)
positives = sick_positives = 0
for _ in range(200_000):
    sick = rng.random() < 0.01
    if rng.random() < (0.90 if sick else 0.05):
        positives += 1
        sick_positives += sick
assert abs(sick_positives / positives - float(posterior)) < 0.02
print("tamam")
```

Sahadaki karşılıkları: nadir dolandırıcılığı yakalayan model, nadir hatayı bildiren alarm, "spam" süzgeci.
Olay ne kadar nadirse, "pozitiflerin" o kadar çoğu yanlış alarmdır. Karar vermeden önce şu üçünü isteyin:
**taban oranı, duyarlılık, yanlış pozitif oranı**. Biri eksikse sonuç hesaplanamaz.

Oran biçimi pratikte en kullanışlısıdır: her bağımsız kanıt önsel oranı kendi olabilirlik oranıyla çarpar.
Ama "bağımsız" kısmına dikkat: aynı testi aynı kişiye iki kez yapmak çoğu zaman bağımsız kanıt değildir.

## Beklenen değer ve varyans

```python calistir
from fractions import Fraction

# Kargo sigortası: paket 2 000 TL, kaybolma olasılığı %1, sigorta 30 TL
loss = {0: Fraction(99, 100), 2000: Fraction(1, 100)}
expected = sum(x * p for x, p in loss.items())
variance = sum(x * x * p for x, p in loss.items()) - expected**2
assert expected == 20  # ortalama kayıp 20 TL < 30 TL sigorta
assert round(float(variance) ** 0.5) == 199  # ama tek pakette kayıp ya 0 ya 2 000

# Zar: E = 7/2, Var = E[X²] − E[X]² = 35/12
die = {k: Fraction(1, 6) for k in range(1, 7)}
mean = sum(k * p for k, p in die.items())
var = sum(k * k * p for k, p in die.items()) - mean**2
assert (mean, var) == (Fraction(7, 2), Fraction(35, 12))
# Beklenen değer her zaman toplanır; varyans yalnız bağımsızlıkta:
assert 2 * var == Fraction(35, 6)  # iki AYRI zarın toplamı
assert 4 * var == Fraction(35, 3)  # aynı zarın iki katı (tam bağımlı): varyans dört kat

# Ortalamanın fonksiyonu ≠ fonksiyonun ortalaması: gidişte 60, dönüşte 40 km/sa
distance = 120
average_speed = 2 * distance / (distance / 60 + distance / 40)
assert average_speed == 48  # 50 değil

# Oranların ortalaması ≠ toplam oran
days = [(1000, 50), (10, 5)]  # (ziyaret, satın alma)
mean_of_rates = sum(b / a for a, b in days) / len(days)
pooled = sum(b for _, b in days) / sum(a for a, _ in days)
assert round(mean_of_rates, 3) == 0.275 and round(pooled, 3) == 0.054
print("tamam")
```

Karar kuralı: kayıp küçük ve sık tekrarlanıyorsa beklenen değere göre karar verin (çok paket gönderen
işletme sigortasız daha kârlıdır). Kayıp büyük ve tek seferlikse varyans belirleyicidir: ortalama kâr, iflası
önlemez.

## Büyük sayılar yasası ve kumarbaz yanılgısı

Deneme sayısı arttıkça **oran** beklenen değere yaklaşır; ama **mutlak sapma** küçülmez, büyür. Yasa geçmişteki
sapmayı "düzeltmez", yalnız seyreltir. Para atışı belleksizdir: beş yazıdan sonra tura olasılığı yine 1/2'dir.

```python calistir
import random
import re

rng = random.Random(2026)


def heads(n):
    return rng.getrandbits(n).bit_count()  # n adil para atışında yazı sayısı


summary = {}
for n in (100, 10_000, 1_000_000):
    deviations = [abs(heads(n) - n / 2) for _ in range(30)]
    mean_abs = sum(deviations) / len(deviations)
    summary[n] = (mean_abs, mean_abs / n)
    print(f"n={n:>9}: ortalama |yazı - n/2| = {mean_abs:8.1f}   oran hatası = {mean_abs / n:.5f}")
assert summary[1_000_000][0] > 10 * summary[100][0]  # mutlak sapma büyüdü (~√n)
assert summary[1_000_000][1] < summary[100][1] / 10  # oran hatası küçüldü (~1/√n)

# Beş "1"den sonra gelen bit: hâlâ yarı yarıya
bits = format(rng.getrandbits(1_000_000), "01000000b")
after_five = len(re.findall("(?=111111)", bits)) / len(re.findall("(?=11111.)", bits))
assert abs(after_five - 0.5) < 0.03
print("beş yazıdan sonra yazı oranı:", round(after_five, 2))
```

Sonuç: benzetimde ya da ölçümde hata yaklaşık `σ / √n` hızında küçülür. 100 örnekte ±%5 olan hata için ±%0,5
isterseniz 10 000 örnek gerekir. Örnek sayısını bu hesapla seçin ([rastgelelik ve benzetim](rastgelelik-ve-benzetim.md)).

## Tuzaklar

| Belirti                                                    | Neden                                                      | Çözüm                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| "Test %90 doğru, pozitif çıktı, demek %90 hasta" denmiş    | Taban oranı yok sayılmış; `P(E∣H)` ile `P(H∣E)` karışmış   | Bayes; "10 000 kişi" tablosunu kurun                           |
| Alarm sisteminin uyarılarının çoğu boş çıkıyor             | Olay nadir; yanlış pozitif oranı küçük görünse de baskın   | Pozitif öngörü değerini (PPV) hesaplayın; eşiği ona göre seçin |
| "En az bir kez" olasılığı %100'ü aştı                      | `n · p` toplanmış                                          | `1 − (1 − p)^n`                                                |
| Yedekli sistem hesaptan çok daha sık birlikte çöküyor      | Ortak neden; bağımsızlık varsayımı                         | Ortak nedenleri ayrı olay olarak modelleyin                    |
| "Beş kez kaybettim, sıradaki kesin kazanır" mantığıyla kod | Kumarbaz yanılgısı; bağımsız denemeler belleksiz           | Geçmiş sonuçları olasılık hesabına katmayın                    |
| Günlük oranların ortalaması toplam orandan çok farklı      | Ağırlıksız ortalama; küçük günler büyük günle eşit sayıldı | Toplam pay / toplam payda; ya da hacimle ağırlıklandırın       |
| Ortalama hız, ortalama gecikme hesabı tutmuyor             | `E[f(X)] ≠ f(E[X])`                                        | Önce toplamları (yol, süre) hesaplayın, sonra bölün            |
| Beklenen değeri pozitif plan felakete yol açtı             | Varyans ve tek seferlik büyük kayıp gözden kaçtı           | Beklenen değerin yanında en kötü durum ve standart sapma       |
| Benzetim sonucu her çalıştırmada başka                     | Örnek sayısı az; hata ≈ σ/√n                               | Hata payını raporlayın; gerekirse örneği 4 kat artırın         |

## Denetim listesi

- [ ] Örneklem uzayı ve olaylar açıkça yazılmış; küçük durumda sayılarak (`Fraction`) doğrulanmış.
- [ ] Her "bağımsız" varsayımı yazılı ve gerekçeli; ortak neden arandı.
- [ ] "En az bir" soruları tümleyenle hesaplanmış.
- [ ] Bayes hesabında taban oranı, duyarlılık ve yanlış pozitif oranı kaynağıyla birlikte verilmiş.
- [ ] Beklenen değerin yanında varyans ya da en kötü durum raporlanmış.
- [ ] Oranlar ağırlıklı (toplam pay / toplam payda) hesaplanmış.
- [ ] Benzetim tohumlu; sonuç hata payıyla (`± σ/√n`) verilmiş ve tam hesapla karşılaştırılmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce örneklem uzayını ve varsayımları (bağımsızlık, taban oranı) listele. Sonucu
  `fractions.Fraction` ile tam hesapla, sonra tohumlu bir benzetimle doğrula; ikisi tutmazsa dur ve söyle."
- **Modelin tipik hatası:** `P(A|B)` ile `P(B|A)`'yı karıştırır; "en az bir" için olasılıkları toplar; bağımsızlığı
  sessizce varsayar; benzetim sonucunu hata payı olmadan, tek sayı olarak verir.
- **Çıktıda denetleyin:** sonuç 0 ile 1 arasında mı; taban oranı hesaba girmiş mi; tam hesap ile benzetim
  `4 · σ/√n` içinde tutuyor mu.
- **Sınır durum isteyin:** "taban oranı 0 ve 1 olunca sonuç ne oluyor?" sorusu formül hatasını hemen gösterir.

## İlgili

- [Dağılımlar](dagilimlar.md): binom, Poisson, normal; merkezi limit teoremi
- [Kombinatorik](kombinatorik.md): olasılık hesabında sayma, doğum günü problemi
- [İstatistiksel kestirim](istatistiksel-kestirim.md): olasılığı veriden kestirmek
- [Rastgelelik ve benzetim](rastgelelik-ve-benzetim.md): Monte Carlo ve örnek sayısı
- [Bilgi kuramı](bilgi-kurami.md): olasılıktan bilgi miktarına
- [Getiri ve risk ölçüleri](getiri-ve-risk.md): kayıp serileri, geriye dönük sınamada şans
- [Betimsel istatistik](../70-veri/betimsel-istatistik.md): oranları ve büyümeleri doğru birleştirmek
- [Korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md): karıştırıcı değişken, Simpson paradoksu
- [Kalibrasyon ve olasılık](../80-ml/kalibrasyon-ve-olasilik.md): modelin "%80" demesi ve beklenen değerle karar
- Kalibrasyonun gerçeklemesi: [`ml-temel/docs/NASIL_CALISIR.md`](../../ml-temel/docs/NASIL_CALISIR.md) → "Kalibrasyon"
