---
baslik: Kalibrasyon ve olasılık
ozet: Modelin "%80" demesinin anlamı; kalibrasyon tablosu, Brier ve ECE hesabı; kalibrasyonun neden bozulduğu, düzeltme yöntemleri, eşik ile olasılık kullanımı ve beklenen değerle karar.
etiketler: [makine-ogrenmesi, kalibrasyon, olasilik, brier, karar]
duzey: orta
guncellik: 2026-11
---

# Kalibrasyon ve olasılık

> Bu notu ne zaman okumalı: modelin olasılığı bir hesaba girecekse (beklenen kâr, eşik formülü, kullanıcıya
> gösterilen yüzde); yeniden örnekleme ya da sınıf ağırlığı kullanıldıysa; canlıda "tahmin edilen" oran ile
> gerçekleşen oran ayrıştığında.

## Temel fikir

Kalibre bir model "%80" dediği vakaların yaklaşık %80'inde haklı çıkar. Bu, **ayırma** gücünden (ROC-AUC) ayrı
bir özelliktir: sıralamayı bozmadan olasılıkları büzüp şişirebilirsiniz; AUC aynı kalır, olasılıklar yanlışlaşır.

- **Ayırma:** pozitifleri öne koyuyor mu? (ROC-AUC, PR-AUC)
- **Kalibrasyon:** söylediği olasılık gerçekleşen orana eşit mi? (kalibrasyon tablosu, ECE)
- **İkisi birlikte:** log-kayıp ve Brier puanı; ikisini de cezalandırır.

Kalibrasyon, eşleme modelin **görmediği** satırlarla öğrenilerek düzeltilir. Eğitim satırlarıyla kalibre etmek,
ezberi kalibre etmektir.

## Ne zaman gerekir?

| Kullanım | Kalibrasyon gerekli mi | Neden |
| --- | --- | --- |
| Yalnız sıralama: "en riskli 200'ü ara" | Hayır | Sıra değişmez |
| Eşik doğrulamada doğrudan seçiliyor | Şart değil | Eşik skora göre seçilir; ama dağılım kayarsa eşik bozulur |
| Eşik maliyet formülüyle: c_YP / (c_YP + c_YN) | Evet | Formül olasılığın doğru olduğunu varsayar |
| Beklenen değer: p × kazanç − maliyet | Evet | Yanlış p, yanlış karar |
| Kullanıcıya "%80 olasılıkla" göstermek | Evet | Güven ve hesap verebilirlik |
| Birkaç modelin olasılığını birleştirmek ya da karşılaştırmak | Evet | Ölçekler farklı olabilir |
| Toplam beklenen olay sayısı (gelecek ay kaç iade?) | Evet | Olasılıkların toplamı tahmindir |
| Aynı eşik farklı gruplara uygulanacak | Grup bazında denetim | Bir grupta kalibre, ötekinde değil olabilir |

## Kalibrasyon tablosu, Brier, ECE

İki model aynı sıralamayı veriyor; biri kalibre, öteki aşırı emin (olasılıkları uçlara itiyor):

```python calistir
import math
import random

random.seed(14)
sigmoid = lambda z: 1 / (1 + math.exp(-z))
truth = []
for _ in range(20_000):
    z = random.gauss(-1.0, 1.2)  # gerçek logit
    truth.append((z, random.random() < sigmoid(z)))
labels = [y for _, y in truth]
models = {
    "kalibre": [sigmoid(z) for z, _ in truth],
    "aşırı emin": [sigmoid(2.5 * z) for z, _ in truth],  # aynı sıra, sivri olasılık
}


def report(probs, bins=10):
    groups = [[] for _ in range(bins)]
    for p, y in zip(probs, labels):
        groups[min(int(p * bins), bins - 1)].append((p, y))
    ece, cells = 0.0, []
    for g in (g for g in groups if g):
        said, happened = sum(p for p, _ in g) / len(g), sum(y for _, y in g) / len(g)
        ece += len(g) / len(labels) * abs(said - happened)
        cells.append(f"{said:.2f}→{happened:.2f}")
    brier = sum((p - y) ** 2 for p, y in zip(probs, labels)) / len(labels)
    log_loss = -sum(math.log(p if y else 1 - p) for p, y in zip(probs, labels)) / len(labels)
    return brier, log_loss, ece, cells


for name, probs in models.items():
    brier, log_loss, ece, cells = report(probs)
    print(f"{name}: Brier {brier:.4f}  log-kayıp {log_loss:.3f}  ECE {ece:.3f}")
    print("  söylenen→gerçekleşen:", " ".join(cells[::2]))
order = lambda probs: sorted(range(len(probs)), key=probs.__getitem__)
assert order(models["kalibre"]) == order(models["aşırı emin"])  # ROC-AUC birebir aynı
```

```cikti
kalibre: Brier 0.1729  log-kayıp 0.519  ECE 0.007
  söylenen→gerçekleşen: 0.06→0.07 0.25→0.26 0.45→0.45 0.65→0.63 0.84→0.85
aşırı emin: Brier 0.1939  log-kayıp 0.670  ECE 0.134
  söylenen→gerçekleşen: 0.02→0.16 0.25→0.40 0.45→0.49 0.65→0.55 0.85→0.66
```

Okuma: kalibrasyon tablosunda her kutu "model şunu söyledi → şu gerçekleşti" demektir. Aşırı emin model %2
dediği yerde gerçekte %16, %85 dediği yerde %66 gerçekleşiyor. ECE (beklenen kalibrasyon hatası) bu farkların
kutu büyüklüğüyle ağırlıklı ortalamasıdır. Kutu sayısı ve az örnekli kutular ECE'yi oynatır; tabloyu sayıyla
birlikte okuyun.

## Kalibrasyon neden bozulur?

| Neden | Olasılıklara etkisi |
| --- | --- |
| Yeniden örnekleme ya da sınıf ağırlığı (azınlık şişirildi) | Azınlık sınıfı yönünde sistematik şişme |
| Aşırı öğrenme (derin ağaç, zayıf düzenlileştirme, çok tur) | Aşırı emin: uçlara yığılma |
| Naive Bayes (özellikleri bağımsız sayar) | Aşırı emin olma eğiliminde |
| Rastgele orman (ağaçların ortalaması) | Uçlardan kaçma eğiliminde: 0 ve 1'e az yaklaşır |
| SVM, menteşe kaybı | Skor olasılık değildir; dönüştürmek gerekir |
| Büyük sinir ağları, uzun eğitim | Aşırı emin olabilir; sıcaklık ölçeklemesi yaygın çaredir |
| Canlıda pozitif oranı değişti (etiket kayması) | Bütün olasılıklar sistematik düşük ya da yüksek |
| Model bir alt grupta az veriyle eğitildi | O grupta kalibrasyon bozuk, genel tablo iyi görünür |

### Yeniden örneklemenin bedeli ve öncül düzeltmesi

Gerçek pozitif oranı %5. Model, negatifleri azaltılarak 50/50 yapılmış veriyle eğitilmiş (burada "ideal" model:
o dengeli dağılımın gerçek sonsal olasılığı):

```python calistir
import math
import random

random.seed(15)
TRUE_RATE = 0.05
sigmoid = lambda z: 1 / (1 + math.exp(-z))
log_lr = lambda x: 1.5 * x - 1.125  # x | 1 ~ N(1,5; 1), x | 0 ~ N(0; 1) için log olabilirlik oranı
rows = []
for _ in range(50_000):
    y = random.random() < TRUE_RATE
    rows.append((random.gauss(1.5 if y else 0.0, 1.0), y))
balanced = [sigmoid(log_lr(x)) for x, _ in rows]  # 50/50 veride öğrenilmiş ideal model
shift = math.log(TRUE_RATE / (1 - TRUE_RATE)) - math.log(0.5 / 0.5)  # logit kaydırma
corrected = [sigmoid(log_lr(x) + shift) for x, _ in rows]
actual = sum(y for _, y in rows) / len(rows)
for name, probs in (("dengeli eğitilmiş", balanced), ("öncülü düzeltilmiş", corrected)):
    brier = sum((p - y) ** 2 for p, (_, y) in zip(probs, rows)) / len(rows)
    print(f"{name:18s} ortalama tahmin {sum(probs) / len(probs):.3f}  gerçek oran {actual:.3f}  Brier {brier:.4f}")
```

```cikti
dengeli eğitilmiş  ortalama tahmin 0.328  gerçek oran 0.049  Brier 0.1541
öncülü düzeltilmiş ortalama tahmin 0.050  gerçek oran 0.049  Brier 0.0385
```

Genel formül: negatiflerin yalnız β oranı tutulduysa (β = tutulan negatif / bütün negatif), düzeltilmiş
olasılık **p = β·p′ / (β·p′ + 1 − p′)**. Sınıf ağırlığı da aynı etkiyi yapar. Kural: yeniden örnekleme ya da
ağırlık kullandıysanız olasılığı ya bu formülle düzeltin ya da gerçek oranlı bir doğrulama kümesinde yeniden
kalibre edin. Çoğu zaman en iyisi hiç yeniden örneklememek ve eşiği seçmektir.

## Düzeltme yöntemleri

| Yöntem | Ne yapar | Ne zaman | Risk |
| --- | --- | --- | --- |
| Platt (sigmoid) | Skora iki parametreli lojistik eşleme: p = σ(a·s + b) | Az kalibrasyon verisi (yüzlerce); bozulma "S" biçimli | Bozulma S değilse yetersiz |
| İzotonik regresyon | Artan, basamaklı eşleme | Bol veri (binlerce) | Az veride aşırı öğrenir |
| Sıcaklık ölçekleme (temperature scaling) | Logitleri tek bir T ile böler | Çok sınıflı sinir ağları | Yalnız genel aşırı/eksik güveni düzeltir |
| Öncül düzeltmesi | Logite sabit ekler | Yeniden örnekleme ya da oran kayması | Ayırmayı değiştirmez, yalnız düzeyi |
| Histogram kutulama | Her skor kutusuna o kutunun gerçek oranı | Basit, açıklanır | Kutu sınırlarında sıçrama |

Platt düzeltmesi, ayrı bir kalibrasyon kümesinde (eğitimde kullanılmamış) Newton yöntemiyle:

```python calistir
import math
import random

random.seed(16)


def sigmoid(z):  # taşmasız yazım: büyük negatif z'de exp(-z) taşmasın
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    return math.exp(z) / (1 + math.exp(z))


def sample(n):
    rows = []
    for _ in range(n):
        z = random.gauss(-1.0, 1.2)
        rows.append((2.5 * z, random.random() < sigmoid(z)))  # skor: aşırı emin logit
    return rows


def ece(probs, labels, bins=10):
    groups = [[] for _ in range(bins)]
    for p, y in zip(probs, labels):
        groups[min(int(p * bins), bins - 1)].append((p, y))
    return sum(abs(sum(p for p, _ in g) - sum(y for _, y in g)) for g in groups) / len(labels)


calibration, test = sample(5000), sample(20_000)  # kalibrasyon kümesi modelin eğitim verisi DEĞİL
a, b = 0.0, 0.0  # sıfırdan başlamak Newton'u kararlı kılar (1'den başlayınca ıraksıyor)
for _ in range(8):  # y ~ σ(a·s + b) için Newton adımları
    ga = gb = haa = hab = hbb = 0.0
    for s, y in calibration:
        p = sigmoid(a * s + b)
        w = p * (1 - p)
        ga, gb = ga + (p - y) * s, gb + (p - y)
        haa, hab, hbb = haa + w * s * s, hab + w * s, hbb + w
    det = haa * hbb - hab * hab
    a, b = a - (hbb * ga - hab * gb) / det, b - (haa * gb - hab * ga) / det
labels = [y for _, y in test]
raw, fixed = [sigmoid(s) for s, _ in test], [sigmoid(a * s + b) for s, _ in test]
print(f"Platt: a = {a:.2f}, b = {b:.2f}")
print(f"sınama ECE: ham {ece(raw, labels):.3f} → düzeltilmiş {ece(fixed, labels):.3f}")
assert ece(fixed, labels) < ece(raw, labels) / 3
```

```cikti
Platt: a = 0.40, b = 0.03
sınama ECE: ham 0.125 → düzeltilmiş 0.010
```

`a` yaklaşık 1/2,5 = 0,4 çıktı: eşleme aşırı güveni geri aldı. Gerçek işte kalibrasyon kümesi ya ayrı bir parça
ya da çapraz doğrulamanın kat dışı tahminleridir (`CalibratedClassifierCV` bunu yapar).

## Karar: olasılıktan beklenen değere

Kampanya teklifi 20 TL'ye mal oluyor; müşteri gerçekten ayrılacak olandıysa ve teklifle kalırsa 100 TL
kazandırıyor. Kural: **p × 100 > 20 ise teklif ver** (p > 0,2). Aynı sıralamayı veren iki model:

```python calistir
import math
import random

random.seed(17)
sigmoid = lambda z: 1 / (1 + math.exp(-z))
customers = []
for _ in range(20_000):
    z = random.gauss(-1.0, 1.2)
    customers.append((z, random.random() < sigmoid(z)))
GAIN, COST = 100, 20


def profit(probability):
    chosen = [(z, y) for z, y in customers if probability(z) * GAIN > COST]
    return sum(GAIN * y - COST for _, y in chosen), len(chosen)


for name, probability in (("kalibre", sigmoid), ("aşırı emin", lambda z: sigmoid(2.5 * z))):
    total, count = profit(probability)
    money = f"{total:,}".replace(",", ".")  # Türkçe binlik ayırıcı
    print(f"{name:10s} teklif {count:5d} kişiye, kâr {money} TL")
```

```cikti
kalibre    teklif 12535 kişiye, kâr 293.000 TL
aşırı emin teklif  7146 kişiye, kâr 249.680 TL
```

Aşırı emin model aynı müşterileri aynı sırayla diziyor ama eşik formülü onun olasılıklarıyla yanlış yerde kesiyor;
kârlı müşterilerin bir kısmı dışarıda kalıyor. Beklenen değer kuralı kalibre olasılık ister.

Pratik karar kuralları:

- Tek eylem: **p × kazanç − maliyet > 0** ise yap. Kazanç ve maliyet kişiye göre değişiyorsa satır satır hesaplayın.
- Kapasite sınırı varsa: beklenen değere göre sıralayın, kapasite dolana kadar seçin.
- Olasılık üzerine iş kuralı ekleyecekseniz (ör. "p > 0,9 ise otomatik onay") o bölgenin kalibrasyonunu ayrıca
  ölçün; uçlardaki kutularda az örnek olur.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Canlıda ortalama tahmin %40, gerçekleşen %5 | Yeniden örnekleme/ağırlıkla eğitildi | Öncül düzeltmesi ya da gerçek oranlı veride kalibrasyon |
| Kalibrasyon sonrası sınamada ECE kötüleşti | Eşleme eğitim tahminleriyle öğrenildi ya da izotonik az veride | Kat dışı tahminler; az veride Platt |
| ROC-AUC aynı kaldı ama kâr düştü | Yeni sürüm farklı kalibre; eski eşik kullanılıyor | Her sürümde eşiği ve kalibrasyonu yeniden doğrulayın |
| Model "%99" diyor, yarısı yanlış | Aşırı emin model (aşırı öğrenme, Naive Bayes) | Kalibrasyon; düzenlileştirme |
| Rastgele orman hiç %95'in üstünü söylemiyor | Ortalama uçlardan kaçar | Kalibrasyon (izotonik ya da sigmoid) |
| Genel kalibrasyon iyi, bir bölgede kötü | Alt grup kalibrasyonu ayrı | Grup bazında tablo; gerekirse grup bazında eşik |
| Pozitif oranı değişti, olasılıklar kaydı | Etiket kayması | Yakın dönem verisiyle yeniden kalibre; oranı izleyin |
| ECE kutu sayısına göre çok değişiyor | Az örnekli kutular | Kutu başına sayıyı yazın; eşit sayılı kutular deneyin |

## Denetim listesi

- [ ] Olasılığın nasıl kullanılacağı yazıldı (sıralama mı, eşik mi, beklenen değer mi).
- [ ] Sınama kümesinde kalibrasyon tablosu (kutu başına söylenen, gerçekleşen, sayı) ve Brier/ECE raporlandı.
- [ ] Kalibrasyon eşlemesi eğitimde kullanılmamış satırlarla öğrenildi.
- [ ] Yeniden örnekleme ya da sınıf ağırlığı varsa olasılık düzeltildi ya da yeniden kalibre edildi.
- [ ] Az veride Platt, bol veride izotonik seçildi; seçim doğrulamada karşılaştırıldı.
- [ ] Önemli alt gruplarda kalibrasyon ayrıca denetlendi.
- [ ] Karar kuralı (p × kazanç > maliyet ya da kapasite) yazıldı ve doğrulamada kârla sınandı.
- [ ] Canlıda ortalama tahmin ile gerçekleşen oran izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sınama kümesinde 10 kutulu kalibrasyon tablosu (söylenen, gerçekleşen, satır sayısı), Brier
  ve ECE hesapla. Kalibrasyon gerekiyorsa eşlemeyi yalnız kat dışı tahminlerle öğren (`CalibratedClassifierCV`,
  cv=5); sınama kümesini kalibrasyonda kullanma. Yeniden örnekleme kullandıysan olasılığı öncül düzeltmesiyle geri çevir."
- **Modelin tipik hatası:** `CalibratedClassifierCV`'yi önceden eğitilmiş modelle aynı eğitim verisinde kullanır;
  izotonik regresyonu birkaç yüz örnekle kurar; SMOTE sonrası olasılıkları olduğu gibi raporlar; ROC-AUC'yi
  kalibrasyon kanıtı sayar.
- **Çıktıda denetleyin:** kalibrasyonun hangi satırlarla öğrenildiği; tabloda satır sayıları; düzeltme öncesi ve
  sonrası ECE sınama kümesinde mi; ortalama tahmin ≈ gerçek oran mı.

## İlgili

- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — maliyetle eşik, log-kayıp
- [Veri ve etiket kalitesi](veri-ve-etiket.md) — dengesizlik ne zaman sorun değildir
- [Aşırı öğrenme](asiri-ogrenme.md) · [Model kartı](model-karti-ve-sorumluluk.md) — alt grup denetimi
- Platt, izotonik ve `CalibratedClassifierCV`: [`ml_temel/klasik/calibration.py`](../../ml-temel/ml_temel/klasik/calibration.py)
- Log-kayıp, Brier, kalibrasyon eğrisi, ECE: [`ml_temel/olcut/probability.py`](../../ml-temel/ml_temel/olcut/probability.py)
- Kalibrasyonun matematiği ve sızıntısız seçimi: [`ml-temel/docs/NASIL_CALISIR.md`](../../ml-temel/docs/NASIL_CALISIR.md#5-kalibrasyon)
- Uçtan uca örnek (izotonik düzeltmeyle Brier 0,1530 → 0,1488, ECE 0,0436 → 0,0364):
  [`ml-temel/ornekler/03_musteri_kaybi.py`](../../ml-temel/ornekler/03_musteri_kaybi.py)
