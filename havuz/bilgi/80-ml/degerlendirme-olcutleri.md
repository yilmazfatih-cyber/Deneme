---
baslik: Değerlendirme ölçütleri
ozet: Karışıklık matrisinden ölçütlere, doğruluğun yanılttığı yerler, maliyetle eşik seçimi, ROC-AUC ile PR-AUC, regresyon ve sıralama ölçütleri, önyüklemeyle güven aralığı.
etiketler: [makine-ogrenmesi, olcut, degerlendirme, esik, guven-araligi]
duzey: orta
guncellik: 2026-11
---

# Değerlendirme ölçütleri

> Bu notu ne zaman okumalı: bir modelin "iyi" olup olmadığına karar verirken; ölçüt seçerken; karar eşiği
> belirlerken; iki modelin farkını raporlarken.

## Temel fikir

Ölçüt, işin sorusunun sayıya çevrilmiş hâlidir. Yanlış ölçüt, doğru modeli kötü, kötü modeli iyi gösterir.
Üç ayrı soruyu karıştırmayın:

1. **Sıralama:** model pozitifleri negatiflerin önüne koyuyor mu? (ROC-AUC, PR-AUC, precision@k) — eşik gerekmez.
2. **Karar:** belirli bir eşikte kaç doğru, kaç yanlış alarm? (kesinlik, duyarlılık, maliyet) — eşik işten gelir.
3. **Olasılık:** "%30" dediğinde gerçekten %30 mu? (log-kayıp, Brier, ECE) — [kalibrasyon notu](kalibrasyon-ve-olasilik.md).

Her ölçüt **taban çizgisinin** yanında ve **güven aralığıyla** yazılır. Tek başına "AUC 0,87" bir şey söylemez.

## Karar tablosu: soru → ölçüt

| Soru | Ölçüt | Not |
| --- | --- | --- |
| Pozitifleri iyi sıralıyor mu? | ROC-AUC | Sınıf oranından etkilenmez; 0,5 = yazı-tura |
| Pozitif az (sahtecilik, kayıp); sıralama kalitesi | PR-AUC (ortalama kesinlik) | Taban değeri pozitif oranıdır, 0,5 değil |
| Kapasite sınırlı liste (günde 200 inceleme) | precision@k, recall@k | İşe en yakın ölçüt |
| Belirli bir eşikte karar | Kesinlik, duyarlılık, toplam maliyet | Eşik maliyetten türetilir |
| Dengesiz veride tek sayı | Dengeli doğruluk, MCC, makro F1 | Düz doğruluk yanıltır |
| Çok sınıflı | Makro F1 (az sınıflar önemliyse), log-kayıp, karışıklık matrisi | Tek etiketli çok sınıfta mikro F1 = doğruluk |
| Olasılığın kendisi kullanılacak | Log-kayıp, Brier, ECE | Kalibrasyon notu |
| Regresyon, tipik hata | MAE | Aykırıya dayanıklı; ortancayı ödüllendirir |
| Regresyon, büyük hata çok pahalı | RMSE | Ortalamayı ödüllendirir; aykırıya duyarlı |
| Göreli hata | WAPE = Σ\|hata\| / Σ\|gerçek\|; MAPE yalnız gerçek değer sıfırdan uzaksa | MAPE küçük değerlerde patlar |
| Açıklanan pay | R² | Negatif olabilir; farklı veri kümeleri arasında karşılaştırılmaz |
| Öneri ve arama sırası | nDCG@k, MRR, recall@k | k, kullanıcının gördüğü liste uzunluğudur |

## Karışıklık matrisinden ölçütlere

1000 işlem, 50'si sahte. Model 60 işlemi işaretliyor, 40'ı gerçekten sahte:

```python calistir
import math


def metrics(tp: int, fn: int, fp: int, tn: int) -> dict[str, float]:
    n = tp + fn + fp + tn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall, specificity = tp / (tp + fn), tn / (tn + fp)
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    return {
        "doğruluk": (tp + tn) / n,
        "kesinlik": precision,
        "duyarlılık": recall,
        "özgüllük": specificity,
        "F1": f1,
        "dengeli doğruluk": (recall + specificity) / 2,
        "MCC": (tp * tn - fp * fn) / denominator if denominator else 0.0,
    }


model = metrics(tp=40, fn=10, fp=20, tn=930)
always_no = metrics(tp=0, fn=50, fp=0, tn=950)  # "hep normal" tabanı
print(f"{'ölçüt':17s}model  hep-hayır")
for name in model:
    print(f"{name:17s}{model[name]:.3f}  {always_no[name]:.3f}")
assert always_no["doğruluk"] > 0.94 and always_no["MCC"] == 0
```

```cikti
ölçüt            model  hep-hayır
doğruluk         0.970  0.950
kesinlik         0.667  0.000
duyarlılık       0.800  0.000
özgüllük         0.979  1.000
F1               0.727  0.000
dengeli doğruluk 0.889  0.500
MCC              0.715  0.000
```

| Ölçüt | Sorduğu soru |
| --- | --- |
| Kesinlik (precision) = DP / (DP + YP) | "Alarm verdiklerimin kaçı gerçek?" — yanlış alarm pahalıysa |
| Duyarlılık (recall) = DP / (DP + YN) | "Gerçek vakaların kaçını yakaladım?" — kaçırmak pahalıysa |
| Özgüllük = DN / (DN + YP) | "Normalleri ne kadar rahat bırakıyorum?" |
| F1 | Kesinlik ve duyarlılığın uyumlu ortalaması; iki hatayı **eşit** sayar |
| MCC | Dört hücrenin hepsini kullanır; dengesiz veride tek sayı olarak sağlam |

"Hep hayır" tabanı %95 doğruluk alıyor; model yalnız 2 puan önde görünüyor ama bütün işi o yapıyor. Doğruluğu
dengesiz veride kullanmayın.

## Eşik seçimi: maliyetle

Olasılıklar kalibre ise en ucuz eşik formülle bulunur: **eşik = c_YP / (c_YP + c_YN)**. Kaçırılan sahte işlem
50 TL, boşa inceleme 5 TL:

```python calistir
import bisect
import math
import random

random.seed(4)
rows = []
for _ in range(20_000):
    p = 1 / (1 + math.exp(-random.gauss(-2.5, 1.5)))  # kalibre olasılık
    rows.append((p, random.random() < p))
COST_FN, COST_FP = 50, 5
pos = sorted(p for p, y in rows if y)
neg = sorted(p for p, y in rows if not y)


def counts(t):
    fn = bisect.bisect_left(pos, t)  # pozitif ama eşiğin altında
    fp = len(neg) - bisect.bisect_left(neg, t)
    return len(pos) - fn, fp, fn


def cost(t):
    _, fp, fn = counts(t)
    return fn * COST_FN + fp * COST_FP


def f1(t):
    tp, fp, fn = counts(t)
    return 2 * tp / (2 * tp + fp + fn)


grid = [i / 100 for i in range(1, 100)]
choices = {
    "varsayılan 0,5": 0.5,
    "F1'i en yükselten": max(grid, key=f1),
    "maliyeti en düşüren": min(grid, key=cost),
    "formül 5/(5+50)": COST_FP / (COST_FP + COST_FN),
}
for name, t in choices.items():
    money = f"{cost(t):,}".replace(",", ".")  # Türkçe binlik ayırıcı
    print(f"{name:20s} eşik {t:.2f}  maliyet {money:>7} TL")
assert abs(choices["maliyeti en düşüren"] - choices["formül 5/(5+50)"]) < 0.03
```

```cikti
varsayılan 0,5       eşik 0.50  maliyet 110.765 TL
F1'i en yükselten    eşik 0.27  maliyet  75.065 TL
maliyeti en düşüren  eşik 0.09  maliyet  52.065 TL
formül 5/(5+50)      eşik 0.09  maliyet  52.220 TL
```

- Varsayılan 0,5 eşiği en pahalısı; F1 de maliyetleri eşit saydığı için yanlış yerde kesiyor.
- Formül yalnız **kalibre** olasılıkta doğrudur. Olasılıklar kalibre değilse eşiği doğrulama kümesinde maliyet
  eğrisinden seçin.
- Kapasite sınırı varsa (günde en çok 200 inceleme) eşik, kapasiteyi dolduran skor olur; ölçüt precision@200'dür.
- Eşik **doğrulamada** seçilir, sınamada yalnız raporlanır.

## ROC-AUC ↔ PR-AUC

Aynı skor dağılımları, yalnız pozitif oranı değişiyor:

```python calistir
import random

random.seed(10)


def roc_auc(scores, labels):
    ranked = sorted(zip(scores, labels))
    pos = sum(labels)
    rank_sum = sum(r for r, (_, y) in enumerate(ranked, start=1) if y)
    return (rank_sum - pos * (pos + 1) / 2) / (pos * (len(labels) - pos))


def average_precision(scores, labels):
    hits, total = 0, 0.0
    for i, (_, y) in enumerate(sorted(zip(scores, labels), reverse=True), start=1):
        if y:
            hits += 1
            total += hits / i
    return total / hits


for rate in (0.5, 0.1, 0.01):
    labels = [random.random() < rate for _ in range(20_000)]
    scores = [random.gauss(1.5 if y else 0.0, 1.0) for y in labels]
    label = f"%{rate * 100:g}"
    print(f"pozitif oranı {label:>3s}: ROC-AUC {roc_auc(scores, labels):.3f}"
          f"   PR-AUC {average_precision(scores, labels):.3f}")
```

```cikti
pozitif oranı %50: ROC-AUC 0.851   PR-AUC 0.854
pozitif oranı %10: ROC-AUC 0.856   PR-AUC 0.472
pozitif oranı  %1: ROC-AUC 0.843   PR-AUC 0.130
```

ROC-AUC neredeyse sabit kalıyor, çünkü pozitif-negatif çiftlerinin sırasına bakıyor; pozitif %1 olunca model, yakaladığı her
pozitif için birçok yanlış alarm veriyor ve bunu ancak PR-AUC gösteriyor. Az pozitifli işlerde PR-AUC ya da
precision@k raporlayın; PR-AUC'nin tabanı pozitif oranıdır.

## Regresyon ölçütleri ve aykırı değer

```python calistir
import math
import statistics

actual = [10, 12, 11, 13, 12, 11, 10, 300]  # bir aykırı sipariş
for name, guess in (("ortalama", statistics.fmean(actual)), ("ortanca", statistics.median(actual))):
    errors = [guess - y for y in actual]
    mae = statistics.fmean(abs(e) for e in errors)
    rmse = math.sqrt(statistics.fmean(e * e for e in errors))
    print(f"hep {name:8s} ({guess:6.2f}) → MAE {mae:6.2f}  RMSE {rmse:6.2f}")
truth, guess = [0.5, 100, 120], [5, 100, 120]
mape = statistics.fmean(abs(g - t) / abs(t) for g, t in zip(guess, truth))
wape = sum(abs(g - t) for g, t in zip(guess, truth)) / sum(abs(t) for t in truth)
print(f"tek küçük gerçek değer: MAPE %{mape * 100:.0f}, WAPE %{wape * 100:.1f}")
```

```cikti
hep ortalama ( 47.38) → MAE  63.16  RMSE  95.49
hep ortanca  ( 11.50) → MAE  36.88  RMSE 102.00
tek küçük gerçek değer: MAPE %300, WAPE %2.0
```

MAE ortancayı, RMSE ortalamayı ödüllendirir: hangi ölçütü eniyilediğiniz, modelin neyi tahmin etmeyi
öğreneceğini belirler. Tek bir aykırı RMSE'yi domine eder; MAPE tek bir küçük değerle anlamsızlaşır.

## Sıralama ölçütleri

```python calistir
import math

ranked = [1, 0, 1, 0, 0, 1, 0, 0, 0, 1]  # modelin ilk 10 önerisi; 1 = ilgili
TOTAL_RELEVANT, K = 5, 5  # bir ilgili öğe listede hiç yok
precision_k = sum(ranked[:K]) / K
recall_k = sum(ranked[:K]) / TOTAL_RELEVANT
mrr = 1 / (ranked.index(1) + 1)
dcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(ranked[:K]))
ideal = sum(1 / math.log2(i + 2) for i in range(min(K, TOTAL_RELEVANT)))
print(f"P@5 {precision_k:.2f}  R@5 {recall_k:.2f}  MRR {mrr:.2f}  nDCG@5 {dcg / ideal:.2f}")
```

```cikti
P@5 0.40  R@5 0.40  MRR 1.00  nDCG@5 0.51
```

MRR yalnız ilk doğruya bakar (tek doğru yanıtlı arama); nDCG sıranın tamamını, üsttekileri daha ağır sayarak
ölçer (öneri listesi); recall@k "doğruların kaçı listeye girdi" sorusudur (RAG'de getirme adımı).

## Güven aralığı: önyükleme

Sınama kümesi olası verilerden yalnız bir örneklemdir. Önyükleme (bootstrap): satırları yerine koyarak yeniden
örnekle, ölçütü yeniden hesapla, dağılımın %2,5 ve %97,5 dilimlerini al. İki modeli karşılaştırırken **farkın**
aralığına bakılır ve iki model **aynı** yeniden örneklemde ölçülür (eşleştirilmiş):

```python calistir
import random
import statistics

random.seed(8)
n = 400
truth = [random.random() < 0.4 for _ in range(n)]
model_a = [y if random.random() < 0.82 else not y for y in truth]  # gerçek doğruluğu ~0,82
model_b = [y if random.random() < 0.80 else not y for y in truth]  # gerçek doğruluğu ~0,80


def accuracy(pred, idx):
    return statistics.fmean(pred[i] == truth[i] for i in idx)


rng = random.Random(0)
acc_a, diff = [], []
for _ in range(1000):
    idx = [rng.randrange(n) for _ in range(n)]
    acc_a.append(accuracy(model_a, idx))
    diff.append(accuracy(model_a, idx) - accuracy(model_b, idx))


def interval(values):
    cuts = statistics.quantiles(values, n=40)  # 2,5. ve 97,5. yüzdelikler
    return cuts[0], cuts[-1]


everyone = range(n)
print(f"A doğruluk {accuracy(model_a, everyone):.3f}  (%95 GA {interval(acc_a)[0]:.3f}–{interval(acc_a)[1]:.3f})")
low, high = interval(diff)
print(f"A − B fark {accuracy(model_a, everyone) - accuracy(model_b, everyone):+.3f}  (%95 GA {low:+.3f} – {high:+.3f})")
print("fark kanıtlandı" if low > 0 else "aralık 0'ı içeriyor: fark kanıtlanmadı")
```

```cikti
A doğruluk 0.815  (%95 GA 0.777–0.853)
A − B fark -0.018  (%95 GA -0.068 – +0.032)
aralık 0'ı içeriyor: fark kanıtlanmadı
```

Gerçekte A 2 puan daha iyi; ama bu 400 satırlık örneklemde B önde bile görünüyor. Farkın aralığı yaklaşık
−7 ile +3 puan arası: 400 satırla 2 puanlık fark ayırt edilemez. "Yeni model daha iyi" demeden önce bu
aralığı hesaplayın; yetmiyorsa sınama kümesini büyütün.

| Durum | Önyükleme nasıl yapılır |
| --- | --- |
| Sınıflandırma, az pozitif | Katmanlı: her sınıf kendi içinde örneklenir |
| Aynı müşterinin birden çok satırı | Gruplu: müşteriler örneklenir, satırları birlikte gelir; yoksa aralık dar çıkar |
| İki model | Aynı örneklemde farkı hesaplayın; iki ayrı aralığın örtüşmesine bakmak zayıf bir testtir |
| Zaman serisi | Satır önyüklemesi uygun değil; geriye dönük testteki dönem sonuçlarının yayılımına bakın |

Aralık yalnız örnekleme belirsizliğini kapsar; veri toplamadaki yanlılığı (yalnız bir bölgenin müşterileri)
kapsamaz.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Doğruluk %97, model işe yaramıyor | Dengesiz sınıf; taban da %95 | Dengeli doğruluk, MCC, PR-AUC; tabanı yanına yazın |
| ROC-AUC 0,95, alarmların çoğu yanlış | Az pozitifte ROC iyimser | PR-AUC, precision@k |
| F1 ile seçilen eşikte maliyet yüksek | F1 iki hatayı eşit sayar | Maliyet fonksiyonuyla eşik |
| Eşik ve ölçüt aynı kümede: rapor iyimser | Eşik sınamada seçildi | Eşiği doğrulamada seçin, sınamada raporlayın |
| MAPE sonsuz ya da %300 | Sıfıra yakın gerçek değer | WAPE ya da MAE |
| RMSE bir günde fırladı | Tek aykırı değer | MAE'ye de bakın; aykırıyı ayrıca inceleyin |
| "0,5 puan iyileşme" raporu | Güven aralığı yok | Eşleştirilmiş önyüklemeyle farkın aralığı |
| Gruplu veride çok dar güven aralığı | Satır bazında önyükleme | Grup bazında önyükleme |
| Kesinlik beklenmedik derecede düşük ya da yüksek | Kütüphane yanlış sınıfı pozitif saydı ("evet"/"hayır") | Pozitif sınıfı açıkça verin |
| Makro ve mikro F1 karıştırıldı | Ortalama türü yazılmadı | Hangi ortalama olduğunu ölçüt adına yazın |
| R² iki farklı veri kümesi arasında karşılaştırıldı | R² hedefin varyansına bağlı | Aynı veri kümesinde ve aynı birimde karşılaştırın |

## Denetim listesi

- [ ] Ölçüt işin sorusundan türetildi (sıralama mı, karar mı, olasılık mı) ve yazıldı.
- [ ] Taban çizgisi aynı ölçütle, aynı satırlarda yanında raporlandı.
- [ ] Dengesiz veride doğruluk tek başına kullanılmadı; pozitif sayısı yazıldı.
- [ ] Eşik, maliyet ya da kapasiteden doğrulama kümesinde seçildi.
- [ ] Karışıklık matrisi (satır = gerçek, sütun = tahmin) rapora eklendi.
- [ ] Ana ölçütün %95 güven aralığı var; iki model karşılaştırıldıysa farkın aralığı var.
- [ ] Gruplu veride önyükleme grup bazında yapıldı.
- [ ] Regresyonda MAE ile RMSE birlikte verildi; MAPE yalnız sıfırdan uzak değerlerde kullanıldı.
- [ ] Çok sınıflıda ortalama türü (makro/mikro/ağırlıklı) yazıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ölçütleri taban çizgisiyle yan yana ver; karışıklık matrisini yaz; eşiği doğrulama
  kümesinde şu maliyetlerle seç: kaçırma = X TL, boşa alarm = Y TL. Ana ölçütün ve iki model farkının %95
  güven aralığını eşleştirilmiş önyüklemeyle (1000 tekrar) hesapla."
- **Modelin tipik hatası:** Dengesiz veride doğruluğu ve 0,5 eşiğini kullanır; "ROC-AUC yüksek, model iyi" der;
  güven aralığı vermez; eşiği sınama kümesinde seçer; iki modelin ayrı aralıklarının örtüşüp örtüşmediğine bakar.
- **Çıktıda denetleyin:** taban satırı; pozitif sayısı; eşiğin hangi kümede seçildiği; farkın aralığı 0'ı
  içeriyor mu; karışıklık matrisinde satır/sütun yönü belirtilmiş mi.
- **Sorun:** "Bu sayı yarın sabah kimin hangi kararını değiştirir?" Ölçüt bu soruya bağlı değilse yanlış ölçüttür.

## İlgili

- [Problem çerçeveleme](problem-cerceveleme.md) — ölçütü işe bağlama
- [Kalibrasyon ve olasılık](kalibrasyon-ve-olasilik.md) — log-kayıp, Brier, ECE, beklenen değerle karar
- [Ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md) · [Hata analizi](hata-analizi.md)
- Ölçütlerin numpy gerçeklemeleri: [`ml_temel/olcut/`](../../ml-temel/ml_temel/olcut/__init__.py)
  (sınıflandırma, sıralama, regresyon, olasılık; önyükleme: [`bootstrap.py`](../../ml-temel/ml_temel/olcut/bootstrap.py))
- Ölçüt seçimi ve güven aralığı okuma: [`ml-temel/docs/DEGERLENDIRME.md`](../../ml-temel/docs/DEGERLENDIRME.md)
- Eşik ayarı ve güven eşiğiyle kapsama: [`ince_ayar/metrics/classification.py`](../../ince-ayar/ince_ayar/metrics/classification.py);
  arama ölçütleri: [`ince_ayar/metrics/retrieval.py`](../../ince-ayar/ince_ayar/metrics/retrieval.py)
