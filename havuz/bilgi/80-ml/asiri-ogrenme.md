---
baslik: Aşırı öğrenme
ozet: Yanlılık-varyans sezgisi, öğrenme ve kayıp eğrilerini okuma, düzenlileştirme yolları, erken durdurma, model karmaşıklığı ile veri miktarı ilişkisi; çok terimli uydurma ve artırmayla çalışan gösterim.
etiketler: [makine-ogrenmesi, asiri-ogrenme, duzenlilestirme, erken-durdurma, yanlilik-varyans]
duzey: orta
guncellik: 2026-11
---

# Aşırı öğrenme

> Bu notu ne zaman okumalı: eğitim başarısı yüksek, doğrulama başarısı düşük olduğunda; kayıp eğrileri
> ayrışmaya başladığında; "modeli büyütelim mi, küçültelim mi, veri mi toplayalım?" sorusunda.

## Temel fikir

Aşırı öğrenme (overfitting): model eğitim verisindeki **gürültüyü** de öğrenir; gördüğü veride çok iyi, yeni
veride kötüdür. Tersi eksik öğrenmedir (underfitting): model örüntüyü yakalayacak kadar esnek değildir.

- **Yanlılık (bias):** modelin varsayımı gerçeği taşıyamıyor. Belirti: eğitim hatası da yüksek.
- **Varyans:** model veriye fazla duyarlı; başka bir örneklemle bambaşka bir model çıkar. Belirti: eğitim ile
  doğrulama arasında büyük açıklık.

Karmaşıklığın doğru düzeyi **veri miktarına** bağlıdır: 12 noktaya fazla gelen model, 200 noktada yerindedir.
Bu yüzden "bu model fazla büyük" sorusunun yanıtı her zaman "bu veri için" diye başlar.

## Çalışan gösterim: çok terimli uydurma

Gerçek ilişki `sin(πx)`, gürültü 0,2. Derece 1 (doğru), 3 ve 9; ayrıca 9. derece + L2 cezası (ridge). Hücreler
"eğitim RMSE / sınama RMSE":

```python calistir
import math
import random

random.seed(20)
f = lambda x: math.sin(math.pi * x)


def make(n):
    return [(x, f(x) + random.gauss(0, 0.2)) for x in (random.uniform(-1, 1) for _ in range(n))]


def fit_poly(rows, degree, ridge=0.0):  # en küçük kareler, normal denklemler
    k = degree + 1
    A = [[sum(x ** (i + j) for x, _ in rows) for j in range(k)] for i in range(k)]
    v = [sum(y * x ** i for x, y in rows) for i in range(k)]
    for i in range(1, k):  # sabit terim cezalanmaz
        A[i][i] += ridge
    for col in range(k):  # Gauss-Jordan eleme, kısmi pivotlu
        pivot = max(range(col, k), key=lambda r: abs(A[r][col]))
        A[col], A[pivot], v[col], v[pivot] = A[pivot], A[col], v[pivot], v[col]
        for r in range(k):
            if r != col:
                factor = A[r][col] / A[col][col]
                A[r] = [a - factor * c for a, c in zip(A[r], A[col])]
                v[r] -= factor * v[col]
    coef = [v[i] / A[i][i] for i in range(k)]
    return lambda x: sum(c * x ** i for i, c in enumerate(coef))


def rmse(model, rows):
    return math.sqrt(sum((model(x) - y) ** 2 for x, y in rows) / len(rows))


test = make(1000)
print("n      d=1        d=3        d=9        d=9+L2")
for n in (12, 200):
    train = make(n)
    cells = []
    for degree, ridge in ((1, 0.0), (3, 0.0), (9, 0.0), (9, 1e-3)):
        model = fit_poly(train, degree, ridge)
        cells.append(f"{rmse(model, train):.2f}/{rmse(model, test):.2f}")
    print(f"{n:<6d} " + "  ".join(cells))
```

```cikti
n      d=1        d=3        d=9        d=9+L2
12     0.56/0.51  0.18/0.24  0.07/0.65  0.16/0.23
200    0.49/0.50  0.19/0.22  0.18/0.21  0.18/0.20
```

Okuma:

- **d=1:** eğitim ve sınama hatası ikisi de yüksek ve birbirine yakın → yanlılık. Daha çok veri bunu düzeltmez
  (200 satırda da aynı).
- **d=9, 12 nokta:** eğitim hatası gürültü düzeyinin (0,2) bile altında → model gürültüyü ezberledi; sınama
  hatası en kötü.
- **d=9 + L2:** aynı model, katsayılar cezalandırılınca yeniden makul.
- **d=9, 200 nokta:** aynı karmaşıklık artık sorun değil. Karmaşıklık ile veri miktarı birlikte düşünülür.

## Erken durdurma

Yinelemeli eğitilen modellerde (gradyan artırma, sinir ağı) eğitim hatası hep iner; doğrulama hatası önce iner,
sonra yükselir. Kütüklerle (tek bölmeli ağaç) gradyan artırma, 60 gürültülü nokta:

```python calistir
import math
import random

random.seed(21)
f = lambda x: math.sin(3 * x)


def make(n):
    return [(x, f(x) + random.gauss(0, 0.3)) for x in (random.uniform(0, 3) for _ in range(n))]


train, valid = sorted(make(60)), make(500)
xs, ys = [x for x, _ in train], [y for _, y in train]
pred_train, pred_valid, LEARNING_RATE = [0.0] * len(train), [0.0] * len(valid), 0.3
rmse = lambda pred, rows: math.sqrt(sum((p - y) ** 2 for p, (_, y) in zip(pred, rows)) / len(rows))
history = []
for _ in range(1000):
    residual = [y - p for y, p in zip(ys, pred_train)]
    total, left, best = sum(residual), 0.0, None
    for i in range(1, len(residual)):  # artığa en iyi uyan tek bölme
        left += residual[i - 1]
        gain = left * left / i + (total - left) ** 2 / (len(residual) - i)
        if best is None or gain > best[0]:
            best = (gain, (xs[i - 1] + xs[i]) / 2, left / i, (total - left) / (len(residual) - i))
    _, cut, low, high = best
    step = lambda x: LEARNING_RATE * (low if x <= cut else high)
    pred_train = [p + step(x) for p, x in zip(pred_train, xs)]
    pred_valid = [p + step(x) for p, (x, _) in zip(pred_valid, valid)]
    history.append((rmse(pred_train, train), rmse(pred_valid, valid)))
for rounds in (10, 30, 100, 300, 1000):
    print(f"tur {rounds:<4d}: eğitim {history[rounds - 1][0]:.3f}  doğrulama {history[rounds - 1][1]:.3f}")
best_round = min(range(len(history)), key=lambda k: history[k][1]) + 1
print(f"en iyi tur {best_round}: doğrulama {history[best_round - 1][1]:.3f}")
```

```cikti
tur 10  : eğitim 0.522  doğrulama 0.470
tur 30  : eğitim 0.359  doğrulama 0.378
tur 100 : eğitim 0.276  doğrulama 0.355
tur 300 : eğitim 0.230  doğrulama 0.370
tur 1000: eğitim 0.164  doğrulama 0.396
en iyi tur 68: doğrulama 0.352
```

Erken durdurma kuralları:

- Durdurma kararı **doğrulama** kümesine bakar (eğitimin içinden ayrılmış bir parça); sınama kümesine asla.
- "Sabır" (patience) verin: doğrulama hatası `n` tur boyunca iyileşmezse durun; en iyi turdaki modeli saklayın.
  Tek turluk dalgalanmayla durmayın.
- Durdurulan tur sayısı da bir hiperparametredir; seçildiği doğrulama puanı iyimserdir.
- Histogram tabanlı artırmada erken durdurma yerleşiktir (`early_stopping`, `n_iter_no_change`); sinir ağı
  eğitimlerinde "en iyi denetim noktası" aynı işi görür.

## Eğrileri okuma

| Görünüş | Teşhis | Ne yapılır |
| --- | --- | --- |
| Eğitim ve doğrulama hatası yüksek, birbirine yakın | Yanlılık | Daha esnek model, daha iyi özellik, daha az düzenlileştirme, daha uzun eğitim |
| Eğitim düşük, doğrulama yüksek, aradaki açıklık büyük | Varyans | Daha çok veri, düzenlileştirme, daha basit model, erken durdurma |
| Doğrulama önce iniyor sonra yükseliyor | Aşırı eğitim | En iyi noktada durun |
| Doğrulama, eğitimden iyi | Düzenlileştirme yalnız eğitimde açık (bırakma, artırma) ya da kopyalar/şans | Düzenlileştirme kapalıyken eğitim hatasını ölçün; kopya taraması |
| Doğrulama kaybı yükseliyor ama doğruluk hâlâ artıyor | Model aşırı emin olmaya başladı (log-kayıp kötüleşiyor) | Kararı işin ölçütüne göre verin; kalibrasyonu ölçün |
| Eğitim hatası gürültü düzeyinin altında | Ezber | Karmaşıklığı azaltın ya da veri ekleyin |
| İkisi de iyi, canlı kötü | Aşırı öğrenme değil: sızıntı ya da dağılım farkı | [Veri sızıntısı](veri-sizintisi.md), [veri ve etiket](veri-ve-etiket.md) |

Büyük sinir ağlarında klasik U eğrisi her zaman geçerli değildir: parametre sayısı çok arttıkça sınama hatası
yeniden düşebilir ("çift iniş"). Bu, düzenlileştirmeyi gereksiz kılmaz; yalnız "küçük model hep daha güvenli"
sezgisinin her ölçekte geçerli olmadığını söyler.

## Düzenlileştirme yolları

| Yol | Hangi model | Düğme (örnek ad) | Etkisi |
| --- | --- | --- | --- |
| L2 cezası / ağırlık çürümesi | Doğrusal, sinir ağı | `alpha`, `C` (tersi), `weight_decay` | Katsayıları küçültür; kararlılık |
| L1 cezası | Doğrusal | `alpha` (lasso) | Bazı katsayıları sıfırlar (özellik seçer) |
| Erken durdurma | Artırma, sinir ağı | `early_stopping`, `n_iter_no_change`, sabır | Tur sayısını doğrulamaya göre keser |
| Ağaç karmaşıklığı | Ağaçlar | `max_depth`, `min_samples_leaf`, `max_leaf_nodes` | Yaprak başına daha çok örnek |
| Küçük öğrenme oranı + çok tur | Artırma, sinir ağı | `learning_rate` | Daha pürüzsüz model (erken durdurmayla) |
| Satır/sütun alt örnekleme | Orman, artırma | `subsample`, `max_features` | Ağaçlar çeşitlenir, varyans düşer |
| Torbalama ve topluluk ortalaması | Yüksek varyanslı modeller | ağaç/model sayısı | Ortalama varyansı azaltır |
| Bırakma (dropout) | Sinir ağı | `p` | Nöronların birlikte ezber yapmasını kırar |
| Veri artırma | Görüntü, ses, metin | dönüşümler | Yalnız eğitim kümesine uygulanır |
| Etiket yumuşatma | Sınıflandırma ağları | `epsilon` | Aşırı güveni azaltır |
| Daha az özellik | Hepsi | — | Gürültülü sütunlar ezberi besler |
| k'yı büyütmek | k-NN | `n_neighbors` | Daha pürüzsüz karar sınırı |
| Daha küçük bağdaştırıcı | LoRA ince ayarı | `r`, `dropout` | Eğitilen parametre azalır |
| **Daha çok veri** | Hepsi | — | En güvenilir çare; öğrenme eğrisiyle doğrulayın |

Ceza katsayıları ölçeğe duyarlıdır: L2 cezası ölçeklenmemiş sütunlara eşitsiz uygulanır. Doğrusal modellerde
önce standartlaştırın.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Erken durdurma ile sınama sonucu uyumlu, canlı kötü | Durdurma sınama kümesine bakıyor | Eğitimden ayrı doğrulama parçası |
| Yüzlerce ayar denendi, doğrulama puanı yükseldi, sınama yerinde | Doğrulama kümesine aşırı uyum | Az ve anlamlı deneme; ayrı sınama; iç içe CV |
| Gürültülü etiketle eğitim doğruluğu %100 | Model gürültüyü ezberliyor | Karmaşıklığı azaltın; etiket kalitesine bakın |
| "Aşırı öğrenme" sanılan düşüş aslında başka dönemde | Doğrulama kümesi farklı dağılımdan | Eğitim içinde rastgele ayrımla da ölçün; dağılımı karşılaştırın |
| L2 cezası hiç etki etmiyor ya da her şeyi düzleştiriyor | Ölçek farkı ya da ceza aralığı yanlış | Standartlaştırın; cezayı logaritmik ızgarada arayın (1e-4 … 1e2) |
| Veri artırma sonrası doğrulama da "artırılmış" | Artırma bütün veriye uygulandı | Yalnız eğitim katına uygulayın |
| Daha büyük model denenip kötü çıkınca bırakıldı | Düzenlileştirme ve erken durdurma ayarlanmadan karşılaştırıldı | Her boyutu kendi en iyi düzenlileştirmesiyle karşılaştırın |
| İnce ayarda doğrulama kaybı 2. dönemde yükseliyor | Küçük veride çok dönem | Dönemi azaltın, en iyi denetimi saklayın |

## Denetim listesi

- [ ] Eğitim ve doğrulama hatası yan yana raporlandı; açıklık yorumlandı.
- [ ] En az üç veri büyüklüğünde öğrenme eğrisi çizildi (karar "veri mi, model mi" ise).
- [ ] Yinelemeli eğitimde erken durdurma doğrulama parçasına bakıyor; en iyi nokta saklanıyor.
- [ ] Düzenlileştirme gücü logaritmik ızgarada, çapraz doğrulamayla seçildi.
- [ ] Doğrusal modellerde ceza öncesi ölçekleme yapıldı.
- [ ] Veri artırma ve bırakma yalnız eğitimde açık.
- [ ] Eğitim hatası gürültü düzeyinin altına indiyse karmaşıklık azaltıldı ya da veri eklendi.
- [ ] Denenen ayar sayısı kaydedildi; son sonuç ayrı sınamada ölçüldü.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her denemede eğitim ve doğrulama ölçütünü birlikte yaz. Yinelemeli modellerde erken
  durdurmayı eğitim verisinden ayırdığın %10'luk doğrulama parçasıyla yap ve en iyi turu raporla. Düzenlileştirme
  gücünü 1e-4 ile 1e2 arasında logaritmik ızgarada çapraz doğrulamayla seç."
- **Modelin tipik hatası:** Yalnız doğrulama puanını yazar, eğitim puanını göstermez; erken durdurmaya sınama
  kümesini verir; aşırı öğrenmeyi görünce hemen "daha çok veri" ya da "dropout ekle" der, eğriyi okumaz.
- **Çıktıda denetleyin:** `eval_set`, `validation_data`, `early_stopping` parametrelerine hangi kümenin verildiği;
  eğitim-doğrulama açıklığı; seçilen ayarın ızgaranın kenarında olup olmadığı (kenardaysa aralık genişletilir).

## İlgili

- [Veri ve etiket kalitesi](veri-ve-etiket.md) — öğrenme eğrisiyle "veri mi, model mi" kararı
- [Ağaç toplulukları](agac-topluluklari.md) — ağaç düğmeleri · [Derin öğrenme temelleri](derin-ogrenme-temelleri.md)
- [Eğitim hata ayıklama](egitim-hata-ayiklama.md) — kayıp eğrisi belirtileri
- Ridge (L2) ve lojistik (L2): [`ml_temel/klasik/linear.py`](../../ml-temel/ml_temel/klasik/linear.py),
  [`logistic.py`](../../ml-temel/ml_temel/klasik/logistic.py); erken durdurmalı artırma:
  [`boosting.py`](../../ml-temel/ml_temel/klasik/boosting.py)
- Dil modeli kayıp eğrisini okuma ve ezberleme belirtisi: [`dil-modeli/docs/EGITIM_REHBERI.md`](../../dil-modeli/docs/EGITIM_REHBERI.md)
- İnce ayarda belirtiye göre ayar: [`ince-ayar/docs/HIPERPARAMETRE.md`](../../ince-ayar/docs/HIPERPARAMETRE.md)
