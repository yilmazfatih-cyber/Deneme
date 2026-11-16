---
baslik: Ağaç toplulukları
ozet: Karar ağacının nasıl böldüğü, rastgele orman ile gradyan artırma farkı, hangi düğmenin neyi etkilediği ve makul başlangıç değerleri, önem ölçülerinin tuzakları, kategorik ve eksik değer.
etiketler: [makine-ogrenmesi, karar-agaci, rastgele-orman, gradyan-artirma, hiperparametre, ozellik-onemi]
duzey: orta
guncellik: 2026-11
---

# Ağaç toplulukları

> Bu notu ne zaman okumalı: tablo verisinde rastgele orman ya da gradyan artırma kurarken ve ayarlarken;
> "hangi sütun önemli?" sorusuna yanıt ararken; ağaç modeli beklenmedik davrandığında.

## Temel fikir

- **Karar ağacı:** veriyi tek bir sütun ve eşikle ikiye böler; her bölmede safsızlığı en çok azaltanı seçer;
  yapraklarda ortalama (regresyon) ya da sınıf oranı (sınıflandırma) verir. Tek başına oynaktır.
- **Rastgele orman:** birçok derin ağacın ortalaması. Her ağaç satırların yerine koyarak çekilmiş bir örneklemiyle
  (bootstrap) ve her bölmede sütunların rastgele bir alt kümesiyle kurulur. Ortalama, **varyansı** düşürür.
- **Gradyan artırma:** sığ ağaçlar **sırayla** eklenir; her yeni ağaç o ana kadarki toplamın hatasını (kaybın
  gradyanını) düzeltir; katkısı öğrenme oranıyla küçültülür. **Yanlılığı** adım adım düşürür; fazla tur aşırı
  öğrenir, bu yüzden erken durdurma ister.

## Bir bölme nasıl seçilir?

10 müşteri, aylık ücret ve ayrılıp ayrılmadığı. Her ardışık iki değerin ortası eşik adayıdır; ağırlıklı Gini
safsızlığını en çok azaltan eşik seçilir:

```python calistir
rows = [(120, 0), (150, 0), (180, 0), (200, 1), (210, 0), (260, 1), (300, 1), (320, 1), (350, 0), (400, 1)]


def gini(labels):
    if not labels:
        return 0.0
    p = sum(labels) / len(labels)
    return 1 - p * p - (1 - p) ** 2


parent = gini([y for _, y in rows])
values = sorted({x for x, _ in rows})
results = []
for low, high in zip(values, values[1:]):
    cut = (low + high) / 2
    left = [y for x, y in rows if x <= cut]
    right = [y for x, y in rows if x > cut]
    weighted = (len(left) * gini(left) + len(right) * gini(right)) / len(rows)
    results.append((weighted, cut))
    print(f"eşik {cut:5.1f}: sol {len(left):2d}, sağ {len(right):2d} → ağırlıklı Gini {weighted:.3f}")
best_weighted, best_cut = min(results)
print(f"ebeveyn {parent:.3f}; seçilen eşik {best_cut:.0f}, kazanç {parent - best_weighted:.3f}")
```

```cikti
eşik 135.0: sol  1, sağ  9 → ağırlıklı Gini 0.444
eşik 165.0: sol  2, sağ  8 → ağırlıklı Gini 0.375
eşik 190.0: sol  3, sağ  7 → ağırlıklı Gini 0.286
eşik 205.0: sol  4, sağ  6 → ağırlıklı Gini 0.417
eşik 235.0: sol  5, sağ  5 → ağırlıklı Gini 0.320
eşik 280.0: sol  6, sağ  4 → ağırlıklı Gini 0.417
eşik 310.0: sol  7, sağ  3 → ağırlıklı Gini 0.476
eşik 335.0: sol  8, sağ  2 → ağırlıklı Gini 0.500
eşik 375.0: sol  9, sağ  1 → ağırlıklı Gini 0.444
ebeveyn 0.500; seçilen eşik 190, kazanç 0.214
```

Ağaç yalnız **sırayı** kullanır: ücretin logaritmasını alsanız ya da 100 ile çarpsanız aynı bölme seçilir. Bu
yüzden ağaçlar ölçeklemeye ihtiyaç duymaz ve eğitimde gördüğü aralığın dışına tahmin yapamaz
([model seçimi](model-secimi.md)).

## Torbalama varyansı düşürür

Tek bir derin ağaç ile 30 bootstrap ağacının ortalaması, aynı gürültülü veride:

```python calistir
import math
import random
import statistics

random.seed(22)


def fit_tree(rows, depth, min_leaf=1):  # tek değişkenli regresyon ağacı
    rows = sorted(rows)
    ys = [y for _, y in rows]
    mean, total, best, left = statistics.fmean(ys), sum(ys), None, 0.0
    for i in range(1, len(rows)):
        left += ys[i - 1]
        if depth > 0 and min_leaf <= i <= len(rows) - min_leaf and rows[i][0] > rows[i - 1][0]:
            gain = left * left / i + (total - left) ** 2 / (len(rows) - i)
            if best is None or gain > best[0]:
                best = (gain, i)
    if best is None:
        return lambda x: mean
    i = best[1]
    cut, lo, hi = (rows[i - 1][0] + rows[i][0]) / 2, fit_tree(rows[:i], depth - 1), fit_tree(rows[i:], depth - 1)
    return lambda x: lo(x) if x <= cut else hi(x)


def make(n):
    return [(x, math.sin(2 * x) + random.gauss(0, 0.4)) for x in (random.uniform(0, 3) for _ in range(n))]


train, test = make(150), make(1000)
rmse = lambda predict: math.sqrt(statistics.fmean((predict(x) - y) ** 2 for x, y in test))
single = fit_tree(train, depth=12)
bag = [fit_tree(random.choices(train, k=len(train)), depth=12) for _ in range(30)]
print(f"tek derin ağaç        RMSE {rmse(single):.3f}")
print(f"30 ağacın ortalaması  RMSE {rmse(lambda x: statistics.fmean(t(x) for t in bag)):.3f}")
print("gürültü tabanı        RMSE 0.400")
```

```cikti
tek derin ağaç        RMSE 0.561
30 ağacın ortalaması  RMSE 0.481
gürültü tabanı        RMSE 0.400
```

Ağaçlar aynı veriden kurulduğu için birbirine benzer; ortalama, ağaçlar ne kadar **farklıysa** o kadar işe yarar.
Rastgele ormandaki sütun alt örneklemesi (`max_features`) bu farkı artırmak içindir. Ağaç sayısını artırmak
ormanı aşırı öğrenmeye götürmez; yalnız yavaşlatır.

## Rastgele orman ↔ gradyan artırma

| Konu | Rastgele orman | Gradyan artırma |
| --- | --- | --- |
| Ağaçlar | Derin, bağımsız, paralel | Sığ, sıralı, birbirini düzeltir |
| Neyi düşürür | Varyans | Yanlılık (ve dikkatli ayarla varyans) |
| Daha çok ağaç | Zararsız, yalnız yavaş | Bir noktadan sonra aşırı öğrenir → erken durdurma |
| Ayar duyarlılığı | Düşük; varsayılanlar çoğu zaman iyi | Orta; öğrenme oranı × tur sayısı birlikte |
| Tipik başarı (tablo verisi) | Sağlam taban | Çoğu zaman en iyi |
| Ücretsiz doğrulama | Torba dışı (OOB) puanı | Yok (ayrı doğrulama parçası) |
| Olasılıklar | Uçlardan kaçma eğiliminde | Log-kayıpla genelde makul; çok turda aşırı emin olabilir |
| Eksik değer | Uygulamaya bağlı (ml-temel'de önce doldurulur) | Histogram türünde yerleşik |
| Büyük veri hızı | Ağaç başına pahalı (kesin bölme) | Histogram (kutulama) ile hızlı |

## Ayar rehberi

Aşağıdakiler yaygın uygulamadan **başlangıç** değerleridir, ölçüm değildir; çapraz doğrulamayla ayarlayın.

### Rastgele orman

| Düğme | Ne etkiler | Başlangıç | Ne zaman değiştir |
| --- | --- | --- | --- |
| `n_estimators` | Kararlılık; süre | 200–500 | OOB puanı hâlâ oynuyorsa artırın |
| `max_features` | Ağaçların çeşitliliği | sınıflandırma `sqrt`; regresyon 0,3–1,0 | Çok gürültülü sütun varsa küçültün |
| `min_samples_leaf` | Yaprak büyüklüğü, olasılık pürüzsüzlüğü | 1–5 | Gürültülü hedefte ve olasılık önemliyse büyütün |
| `max_depth` | Ağaç derinliği | sınırsız | Bellek/süre için sınırlayın |

### Gradyan artırma (histogram tabanlı)

| Düğme | Ne etkiler | Başlangıç | Not |
| --- | --- | --- | --- |
| `learning_rate` | Adım büyüklüğü | 0,05–0,1 | Küçüldükçe daha çok tur gerekir, genelde biraz daha iyi |
| `max_iter` / `n_estimators` | Tur sayısı | Erken durdurmayla belirlenir (yüzlerden binlere) | Elle sabitlemeyin |
| `max_leaf_nodes` / `num_leaves` | Ağaç başına karmaşıklık | 31 | Büyük veride artırın; aşırı öğrenmede azaltın |
| `max_depth` | Etkileşim derinliği | sınırsız (yaprak sayısı sınırlar) ya da 6–8 | Yaprak sayısıyla birlikte düşünün |
| `min_samples_leaf` | Yapraktaki en az satır | 20 | Küçük veride azaltın, gürültüde artırın |
| `l2_regularization` | Yaprak değerlerini büzme | 0 → 0,1–1 | Aşırı öğrenmede artırın |
| Satır/sütun alt örnekleme | Çeşitlilik | 0,8 | Kütüphaneye göre adı değişir |
| `max_bins` | Kutulama inceliği | 255 | Nadiren değişir |

### Sırayla ayar

1. Öğrenme oranını 0,1'de sabitleyin; tur sayısını erken durdurmayla bulun.
2. Ağaç karmaşıklığını ayarlayın (`max_leaf_nodes`, `min_samples_leaf`); erken durdurma açık kalsın.
3. Alt örneklemeyi deneyin (satır ve sütun).
4. Düzenlileştirmeyi (`l2_regularization`) deneyin.
5. Son olarak öğrenme oranını yarıya ya da beşte bire indirip tur sayısını yeniden erken durdurmayla bulun.

Her adımda kazanç kat yayılımından küçükse ayarı geri alın. Geniş ızgara yerine bu sıra hem hızlı hem dürüsttür.

## Önem ölçülerinin tuzakları

Sinyal yalnız `sozlesme` sütununda; `kimlik_benzeri` her satırda farklı rastgele bir sayı, `kategori_gurultu`
üç değerli rastgele bir sütun. Derin bir ağacın kazanç (gain) önemi ile sınama verisinde permütasyon önemi:

```python calistir
import random

random.seed(23)
NAMES = ("sozlesme", "kimlik_benzeri", "kategori_gurultu")


def make(n):
    rows = []
    for _ in range(n):
        contract = random.random() < 0.5
        x = (float(contract), random.random(), float(random.randrange(3)))
        rows.append((x, random.random() < (0.15 if contract else 0.45)))
    return rows


gain = [0.0, 0.0, 0.0]


def weighted_gini(pos, n):  # n × Gini
    return 2 * pos * (n - pos) / n if n else 0.0


def grow(rows, depth):
    n, pos = len(rows), sum(y for _, y in rows)
    best = None
    for j in range(3) if depth > 0 and n >= 10 else ():
        ordered, left = sorted(rows, key=lambda r: r[0][j]), 0
        for i in range(1, n):
            left += ordered[i - 1][1]
            if 5 <= i <= n - 5 and ordered[i][0][j] != ordered[i - 1][0][j]:
                g = weighted_gini(pos, n) - weighted_gini(left, i) - weighted_gini(pos - left, n - i)
                if best is None or g > best[0]:
                    best = (g, j, (ordered[i - 1][0][j] + ordered[i][0][j]) / 2)
    if best is None:
        return pos / n
    g, j, cut = best
    gain[j] += g
    return (j, cut, grow([r for r in rows if r[0][j] <= cut], depth - 1), grow([r for r in rows if r[0][j] > cut], depth - 1))


def predict(node, x):
    while isinstance(node, tuple):
        node = node[2] if x[node[0]] <= node[1] else node[3]
    return node


train, test = make(600), make(3000)
tree = grow(train, depth=8)
brier = lambda rows: sum((predict(tree, x) - y) ** 2 for x, y in rows) / len(rows)
base = brier(test)
print("sütun              kazanç payı   permütasyon (Brier artışı)")
for j, name in enumerate(NAMES):
    column = [x[j] for x, _ in test]
    random.shuffle(column)
    shuffled = [(x[:j] + (v,) + x[j + 1:], y) for (x, y), v in zip(test, column)]
    print(f"{name:18s} {gain[j] / sum(gain):10.2f}   {brier(shuffled) - base:+.4f}")
```

```cikti
sütun              kazanç payı   permütasyon (Brier artışı)
sozlesme                 0.52   +0.0489
kimlik_benzeri           0.48   +0.0028
kategori_gurultu         0.00   +0.0000
```

Kazanç önemi **eğitim** verisindeki bölmelerden hesaplanır ve çok değerli (sürekli, kimlik benzeri) sütunları
kayırır: ağaç onlarla gürültüyü ezberledikçe "kazanç" toplar. Permütasyon önemi **sınama** verisinde sütunu
karıştırıp kötüleşmeyi ölçer; gürültü sütunları sıfıra yakın çıkar. Üç değerli gürültü sütunu hiç seçilmedi:
sürekli bir sütun ezber için çok daha fazla eşik sunar, kazancı o toplar.

| Ölçü | Nasıl | Tuzak |
| --- | --- | --- |
| Kazanç (gain, safsızlık azalışı) | Eğitimde bölmelerin toplam kazancı | Çok değerli sütunları kayırır; aşırı öğrenmeyi önem sanır |
| Bölme sayısı | Sütun kaç kez kullanıldı | Kazançtan da yanıltıcı |
| Permütasyon | Sınamada sütunu karıştır, kötüleşmeyi ölç | Birbirine benzeyen iki sütun birbirini gizler (ikisi de önemsiz görünür); yavaş |
| Sütunu çıkarıp yeniden eğitme | En dürüst ama pahalı | Her sütun için yeniden eğitim |
| SHAP benzeri katkılar | Tahmini sütun katkılarına böler | Bağımlı sütunlarda yorum zor; neden-sonuç değildir |

Hiçbir önem ölçüsü **neden-sonuç** söylemez: "bu sütunu değiştirirsek sonuç değişir" anlamına gelmez; yalnız
modelin neye dayandığını gösterir. Bir sütun beklenmedik derecede önemliyse önce sızıntıdan şüphelenin.

## Kategorik ve eksik değer

| Durum | Yapılacak |
| --- | --- |
| Az değerli kategori | Sıralı kod yeterli; ağaç gerekli bölmeleri bulur |
| Çok değerli kategori (binlerce) | Sıralı kod + yeterli derinlik, sıklık ya da kat dışı hedef kodlama; tek-sıcaktan kaçının |
| Kütüphanenin yerel kategorik desteği | Varsa kullanın; az örnekli kategorilerde aşırı öğrenmeye dikkat |
| Eksik değer, histogram tabanlı artırma | Yerleşik: her bölmede eksiklerin gideceği yön öğrenilir |
| Eksik değer, orman/tek ağaç (ml-temel) | Önce doldurun; "eksikti" gösterge sütunu ekleyin |
| Eksiklik bilgi taşıyor | Gösterge sütunu ya da eksiğe özel değer; ağaç onu ayrı dala koyar |

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Artırmada daha çok tur, daha kötü sınama | Erken durdurma yok | `early_stopping` açık; turu doğrulamayla seçin |
| Orman olasılıkları hiç uçlara gitmiyor | Ortalama etkisi | Kalibrasyon |
| Kimlik ya da tarih sütunu en önemli | Ezber ya da sızıntı | Sütunu çıkarın; gruplu/zaman ayrımıyla ölçün |
| Önem sıralaması her eğitimde değişiyor | Birbirine benzeyen sütunlar, kazanç önemi | Permütasyon önemi; benzer sütunları grup olarak karıştırın |
| Tek-sıcak sonrası ağaç yavaş ve zayıf | Çok değerli kategoriler binlerce seyrek sütun | Sıralı kod ya da hedef kodlama |
| Fiyat tahmini en yüksek değerde takılıyor | Ağaç ekstrapolasyon yapamaz | Değişimi/oranı tahmin edin ya da doğrusal bileşen ekleyin |
| `ValueError: NaN` (orman) | Eksik değer desteklenmiyor | Doldurun ya da histogram tabanlı artırma |
| Küçük veride artırma ormandan kötü | `min_samples_leaf` ve yaprak sayısı büyük veriye göre | Küçük veride daha sığ ağaç, daha çok düzenlileştirme; orman tabanını koruyun |

## Denetim listesi

- [ ] Gradyan artırmada erken durdurma açık ve doğrulama parçası eğitimden ayrılıyor.
- [ ] Ayar sırayla yapıldı; her adımın kazancı kat yayılımıyla karşılaştırıldı.
- [ ] Orman için torba dışı (OOB) puanı ile çapraz doğrulama tutarlı.
- [ ] Önem raporu permütasyon önemiyle ve sınama verisinde hesaplandı; kazanç önemi tek başına kullanılmadı.
- [ ] En önemli sütunlar sızıntı açısından denetlendi.
- [ ] Hedefin eğitim aralığı dışına çıkıp çıkmayacağı düşünüldü.
- [ ] Olasılık kullanılacaksa kalibrasyon ölçüldü.
- [ ] Eksik değer ve kategorik sütunların nasıl verildiği yazıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "HistGradientBoosting'i `learning_rate=0.1`, `early_stopping=True` ile kur; önce yalnız tur
  sayısını, sonra `max_leaf_nodes` ve `min_samples_leaf`'i ayarla. Her adımda 5 katlı CV ortalaması ± std'yi yaz.
  Özellik önemini sınama verisinde permütasyonla ver."
- **Modelin tipik hatası:** `n_estimators=1000` yazıp erken durdurmayı unutur; `feature_importances_`'ı (kazanç)
  neden-sonuç gibi yorumlar; büyük bir ızgarayı tek seferde arar; çok değerli kategorilere tek-sıcak uygular.
- **Çıktıda denetleyin:** erken durdurmanın hangi veriye baktığı; önem tablosunun kaynağı (eğitim/sınama); en
  önemli sütunun tahmin anında bilinip bilinmediği; seçilen ayarın ızgara kenarında olup olmadığı.

## İlgili

- [Model seçimi](model-secimi.md) · [Aşırı öğrenme](asiri-ogrenme.md) · [Özellik mühendisliği](ozellik-muhendisligi.md)
- [Kalibrasyon ve olasılık](kalibrasyon-ve-olasilik.md) · [Veri sızıntısı](veri-sizintisi.md)
- Karar ağacı ve kesin bölme: [`ml_temel/klasik/tree.py`](../../ml-temel/ml_temel/klasik/tree.py),
  [`_cart.py`](../../ml-temel/ml_temel/klasik/_cart.py); rastgele orman (OOB):
  [`forest.py`](../../ml-temel/ml_temel/klasik/forest.py); histogram tabanlı artırma:
  [`boosting.py`](../../ml-temel/ml_temel/klasik/boosting.py), [`_hist_grower.py`](../../ml-temel/ml_temel/klasik/_hist_grower.py)
- Bölme ve artırmanın matematiği: [`ml-temel/docs/NASIL_CALISIR.md`](../../ml-temel/docs/NASIL_CALISIR.md)
- Permütasyon önemi: [`ml_temel/tablo/importance.py`](../../ml-temel/ml_temel/tablo/importance.py)
- Hız ölçümü: [`ml-temel/scripts/bench_boosting.py`](../../ml-temel/scripts/bench_boosting.py)
