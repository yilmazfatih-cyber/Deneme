---
baslik: Ayrım ve çapraz doğrulama
ozet: Eğitim, doğrulama ve sınama kümelerinin görevi; rastgele, katmanlı, gruplu ve zaman ayrımı karar tablosu; çapraz doğrulamada varyans, iç içe doğrulama ve küçük veride yapılacaklar.
etiketler: [makine-ogrenmesi, capraz-dogrulama, degerlendirme, ayrim, hiperparametre]
duzey: orta
guncellik: 2026-11
---

# Ayrım ve çapraz doğrulama

> Bu notu ne zaman okumalı: veriyi eğitim/sınama diye bölmeden önce; iki modeli ya da ayarı karşılaştırırken;
> hiperparametre araması yaparken; "çapraz doğrulama 0,86 ama sınamada 0,79" gibi bir fark görünce.

## Temel fikir

Veriye bakarak verilen her karar o veriyi "harcar". Bu yüzden üç ayrı rol vardır:

| Küme | Ne için kullanılır | Ne için kullanılmaz |
| --- | --- | --- |
| Eğitim (train) | Modelin parametrelerini öğrenmek | Başarıyı ölçmek |
| Doğrulama (validation) ya da çapraz doğrulama | Seçim ve ayar: model ailesi, hiperparametre, özellik, eşik, kalibrasyon, erken durdurma | Son raporu vermek (seçim onu iyimser yapar) |
| Sınama (test) | En sonda, **bir kez**: raporlanacak başarı | Hiçbir karar |

Çapraz doğrulama (cross-validation, CV) doğrulama kümesinin daha verimli hâlidir: veri K parçaya bölünür, her
parça bir kez doğrulama olur; K ölçümün ortalaması tek ayrımdan daha güvenilir, yayılımı belirsizliği gösterir.

İkinci ilke: **ayrım, kullanımı taklit eder.** Model yeni müşteriye uygulanacaksa doğrulamada da yeni müşteriler,
gelecek aya uygulanacaksa doğrulamada da gelecek olmalı.

## Karar tablosu: hangi ayrım?

| Verinin yapısı | Ayrım | Çapraz doğrulama | Neden |
| --- | --- | --- | --- |
| Bağımsız satırlar, regresyon | Rastgele | `KFold(5, shuffle=True)` | Varsayılan durum |
| Bağımsız satırlar, sınıflandırma | Katmanlı (stratified) | `StratifiedKFold(5, shuffle=True)` | Her katta sınıf oranı aynı; az sınıfta şart |
| Aynı varlığın (müşteri, hasta, cihaz, belge) birden çok satırı | Gruplu | `GroupKFold(5)` + `groups=` | Model varlığı tanımasın |
| Zaman sıralı, gelecek tahmin edilecek | Zamana göre (eğitim hep önce) | `TimeSeriesSplit(5)` | Geleceği görüp geçmişi tahmin etmek sızıntıdır |
| Hedef gelecekteki bir pencereden hesaplanıyor ("30 gün içinde iptal") | Zaman + boşluk | `TimeSeriesSplit(gap=ufuk)` | Eğitim etiketinin penceresi doğrulama dönemine taşmasın |
| Hem zaman hem grup | Zamana göre; doğrulamada yalnız yeni gruplar ya da çakışma raporu | `TimeSeriesSplit` + grup denetimi | İkisi birden çoğu zaman tam sağlanamaz; hangisinin önemli olduğunu yazın |
| Komşu bölgeler birbirine benziyor (mekânsal) | Bölge bloklarıyla gruplu | `GroupKFold(bölge)` | Komşu satırlar birbirinin kopyası gibidir |
| Yakın kopyalı metin ya da görüntü | Kopya grupları | `GroupKFold(kopya_grubu)` | Kopyanın eşi karşı tarafta olmasın |
| Çok az veri (birkaç yüz satırdan az) | Ayrı sınama yerine tekrarlı ya da iç içe CV | Tekrarlı `StratifiedKFold` | Tek küçük sınama kümesi çok oynak |
| Çok büyük veri (yüz binler, milyonlar) | Tek doğrulama + tek sınama kümesi | Gerekmez | Ölçüm zaten kararlı; CV pahalı |

`K` seçimi: 5 ya da 10 yaygındır. K büyüdükçe eğitim kümeleri büyür (daha az kötümser) ama süre artar. Birini
dışarıda bırak (LOOCV) pahalı ve oynaktır; küçük veride tekrarlı 5 kat daha iyidir.

## Çapraz doğrulamada varyans

Aynı model, aynı veri; yalnız katlara dağıtım değişiyor:

```python calistir
import random
import statistics

random.seed(2)
rows = []
for _ in range(200):
    y = random.random() < 0.5
    rows.append(((random.gauss(0.8 if y else 0, 1), random.gauss(0.4 if y else 0, 1)), y))


def centroid_accuracy(train, test):
    def mean(points):
        return [statistics.fmean(p[i] for p in points) for i in (0, 1)]
    c1, c0 = mean([x for x, y in train if y]), mean([x for x, y in train if not y])
    dist = lambda x, c: (x[0] - c[0]) ** 2 + (x[1] - c[1]) ** 2
    return statistics.fmean((dist(x, c1) < dist(x, c0)) == y for x, y in test)


def cross_validate(data, k, seed):
    order = data[:]
    random.Random(seed).shuffle(order)
    folds = [order[i::k] for i in range(k)]
    return [centroid_accuracy([r for f in folds if f is not fold for r in f], fold) for fold in folds]


one = cross_validate(rows, 5, seed=0)
print("tek CV, kat puanları:", " ".join(f"{s:.2f}" for s in one))
means = [statistics.fmean(cross_validate(rows, 5, seed=s)) for s in range(30)]
print(f"30 farklı karıştırmada CV ortalaması: {min(means):.3f} – {max(means):.3f}")
```

```cikti
tek CV, kat puanları: 0.60 0.60 0.65 0.60 0.68
30 farklı karıştırmada CV ortalaması: 0.610 – 0.640
```

Okuma kuralları:

- **Kat puanlarının yayılımı** tek bir 40 satırlık doğrulama kümesinin ne kadar oynak olduğunu gösterir.
- **Karıştırmalar arası fark**, raporladığınız ortalamanın şansa bağlı kısmıdır. İki model arasındaki fark
  bundan küçükse "biri daha iyi" denemez.
- İki modeli **aynı katlarla** karşılaştırın (eşleştirilmiş); kat kat farka bakın. Her model için ayrı
  karıştırma, farkı gürültüye boğar.
- Katlar bağımsız değildir (eğitim kümeleri büyük ölçüde örtüşür); kat puanlarının standart sapması
  belirsizliği olduğundan küçük gösterir. Kaba bir gösterge sayın.

## Seçim iyimserdir: sınama kümesine dokunmama

50 kural deneniyor; etiket hiçbir özellikle ilgili değil. Sınama kümesinde en iyi olan seçilirse:

```python calistir
import random

random.seed(5)
FEATURES, N = 50, 200


def dataset():
    return [([random.random() < 0.5 for _ in range(FEATURES)], random.random() < 0.5) for _ in range(N)]


test, fresh = dataset(), dataset()  # etiket hiçbir özellikle ilgili değil
accuracy = lambda j, rows: sum(x[j] == y for x, y in rows) / len(rows)
best = max(range(FEATURES), key=lambda j: accuracy(j, test))
print(f"sınamada seçilen kural: {accuracy(best, test):.3f}")
print(f"aynı kural yeni veride: {accuracy(best, fresh):.3f}")
assert accuracy(best, test) > 0.55
```

```cikti
sınamada seçilen kural: 0.585
aynı kural yeni veride: 0.520
```

Seçilenin puanı, seçimin yapıldığı veride hep iyimserdir ("kazananın laneti"). Bu yüzden:

- Model, ayar, eşik, kalibrasyon ve erken durdurma kararları **doğrulamada** verilir.
- Sınama kümesine dokunmak şunları da kapsar: hatalarına bakıp özellik eklemek, birkaç modeli orada
  karşılaştırmak, eşiği orada seçmek.
- Dokunulduysa o artık doğrulama kümesidir; yeni bir sınama kümesi (ör. yeni ay) gerekir ya da rapor
  "iyimser" diye işaretlenir.
- Pratik: sınama kümesini ayrı dosyada tutun; her değerlendirmeyi günlüğe yazın. Sayı 1'i geçtiyse sorun vardır.

## Az sınıfta katmanlama

300 satır, 12 pozitif. Katmanlama olmadan katlara düşen pozitif sayısı:

```python calistir
import random

random.seed(9)
labels = [1] * 12 + [0] * 288
random.shuffle(labels)
plain = [sum(labels[k::5]) for k in range(5)]  # karıştırılmış veride düz 5 kat
positives = [i for i, y in enumerate(labels) if y]
negatives = [i for i, y in enumerate(labels) if not y]
stratified = [len(positives[k::5]) for k in range(5)]  # her sınıf katlara ayrı ayrı dağıtılır
print("katmanlamasız, katlardaki pozitif:", plain)
print("katmanlı, katlardaki pozitif:     ", stratified)
assert max(plain) - min(plain) > max(stratified) - min(stratified)
```

```cikti
katmanlamasız, katlardaki pozitif: [4, 3, 1, 1, 3]
katmanlı, katlardaki pozitif:      [3, 3, 2, 2, 2]
```

Pozitifi 1 olan bir katta duyarlılık ya 0 ya 1 çıkar; hiç pozitif yoksa ROC-AUC tanımsızdır. Sınıflandırmada
katmanlamayı varsayılan yapın; pozitif sayısı katta 10'un altına iniyorsa kat sayısını azaltın ya da tekrarlı CV
kullanın.

## İç içe çapraz doğrulama

Hiperparametre araması (`GridSearchCV`) en iyi ayarı katlara bakarak seçer; `best_score_` bu yüzden iyimserdir.
Dürüst ölçüm için arama, dış bir çapraz doğrulamanın **içinde** yapılır: dış kat yalnız ölçer, iç katlar seçer.

```python
# ml-temel ile (numpy gerekir; havuzda denendi). scikit-learn'de aynı adlarla çalışır.
from ml_temel.klasik import KNeighborsClassifier
from ml_temel.onisleme import StandardScaler, make_pipeline
from ml_temel.secim import GridSearchCV, StratifiedKFold, cross_validate

pipe = make_pipeline(StandardScaler(), KNeighborsClassifier())
search = GridSearchCV(pipe, {"kneighborsclassifier__n_neighbors": [1, 5, 15]},
                      cv=StratifiedKFold(4, shuffle=True, random_state=0))       # iç: seçim
result = cross_validate(search, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=1))  # dış: ölçüm
print(result["test_score"].mean())   # dürüst tahmin
search.fit(X, y)                     # son model: bütün eğitim verisiyle, seçilen ayarla
```

Ne zaman gerekir: veri küçükse (ayrı sınama kümesi ayıramıyorsanız) ya da çok sayıda ayar/model denediyseniz.
Veri büyükse ayrı bir sınama kümesi aynı işi görür.

## Küçük veride ne yapılır

| Durum | Ne yapılır |
| --- | --- |
| Birkaç yüz satır | Ayrı sınama yerine iç içe CV; tekrarlı katmanlı 5 kat; ortalama ± yayılım raporu |
| Birkaç on pozitif | Az kat (3–5), katmanlı; ölçütün güven aralığını yazın ([önyükleme](degerlendirme-olcutleri.md)) |
| Çok sayıda aday model | Adayları azaltın; seçimi iç CV'de yapın; basit modelleri tercih edin |
| Grup sayısı az (ör. 12 mağaza) | Bir grubu dışarıda bırakmalı CV (her seferinde bir mağaza); sonucun mağazadan mağazaya oynadığını yazın |
| Zaman serisi kısa | Yürüyen başlangıçla tek adımlık birçok küçük sınama ([zaman serisi](zaman-serisi-tahmini.md)) |

Son model: seçilen ayarla **bütün eğitim verisinde** yeniden eğitilir; sınama kümesi bu son modelle bir kez ölçülür.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| CV puanı sınamadan belirgin yüksek | Ön işleme katların dışında uyduruldu ya da seçim iyimserliği | `Pipeline`; iç içe CV ([sızıntı](veri-sizintisi.md)) |
| Bir katta tek sınıf var, ölçüt tanımsız | `shuffle=False` ve veri etikete göre sıralı; ya da katmanlama yok | `StratifiedKFold(shuffle=True)` |
| İki model arasındaki fark her çalıştırmada yön değiştiriyor | Fark, CV gürültüsünden küçük | Aynı katlarla eşleştirilmiş karşılaştırma; tekrarlı CV; farkın aralığı |
| `GridSearchCV.best_score_` rapora son başarı diye girdi | Seçim yapılan katlarla ölçüm | Ayrı sınama ya da iç içe CV |
| Zaman verisinde CV parlak, canlı kötü | `KFold` kullanıldı | `TimeSeriesSplit`; gerekirse `gap` |
| Yeni müşterilerde başarı düşük | Aynı müşterinin satırları iki tarafta | `GroupKFold` |
| Erken durdurma CV içinde doğrulama katına bakıyor | Ölçülen kat aynı zamanda durdurma kararını veriyor | Eğitim katının içinden ayrı bir parça ayırın |
| Sınama sonucu her yeni denemede biraz daha iyi | Sınamaya bakıp karar verildi | Sınamayı kilitleyin; yeni dönemden yeni sınama |
| Sonuçlar makineden makineye değişiyor | Tohum sabit değil | `random_state` sabitleyin; tohum değişince yayılımı ayrıca raporlayın |

## Denetim listesi

- [ ] Ayrım türü (rastgele/katmanlı/gruplu/zaman) seçildi ve gerekçesi kullanım senaryosuyla yazıldı.
- [ ] Sınama kümesi en başta ayrıldı, ayrı dosyada ve yalnız bir kez kullanıldı.
- [ ] Bütün öğrenen adımlar katların içinde uyduruluyor (`Pipeline`).
- [ ] Bütün adaylar ve taban çizgisi aynı katlarla değerlendirildi.
- [ ] Rapor kat ortalaması ± yayılım veriyor; farklar bu yayılımla birlikte yorumlandı.
- [ ] Hiperparametre seçildiyse dürüst ölçüm ayrı sınama ya da iç içe CV ile yapıldı.
- [ ] Katlarda az sınıfın en az ~10 örneği var; yoksa kat sayısı azaltıldı.
- [ ] Hedef geleceğe uzanan bir pencereden hesaplanıyorsa `gap` kullanıldı.
- [ ] Tohumlar sabit; sonuç tekrar üretilebiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Veriyi önce sınama (%20) ve geliştirme olarak ayır; sınamayı ayrı dosyaya yaz ve en sona
  kadar kullanma. Geliştirme kümesinde [katmanlı/gruplu/zaman] 5 katlı çapraz doğrulama yap; bütün modelleri aynı
  katlarla değerlendir; kat ortalaması ve standart sapmasını tablo hâlinde yaz."
- **Modelin tipik hatası:** Her şeye `train_test_split(..., random_state=42)` uygular ve gruplu/zaman yapısını
  görmezden gelir; `GridSearchCV.best_score_`'u son sonuç diye yazar; eşiği ve erken durdurmayı sınama kümesinde seçer.
- **Çıktıda denetleyin:** sınama kümesine kaç kez `predict`/`score` çağrıldığını sayın (1 olmalı); `groups=` ve
  `TimeSeriesSplit` kullanımına bakın; karşılaştırma tablosunda ± değerleri var mı.
- **Sorun:** "Bu model hangi satırlara uygulanacak ve doğrulama satırları onlara benziyor mu?"

## İlgili

- [Veri sızıntısı](veri-sizintisi.md) — ayrımın neden kullanımı taklit etmesi gerektiğinin gösterimleri
- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — önyükleme güven aralığı, eşleştirilmiş fark
- [Zaman serisi tahmini](zaman-serisi-tahmini.md) — yürüyen başlangıçlı geriye dönük test
- Bölücüler: [`ml_temel/secim/splitters.py`](../../ml-temel/ml_temel/secim/splitters.py); çapraz doğrulama:
  [`validate.py`](../../ml-temel/ml_temel/secim/validate.py); ızgara araması ve iyimserlik notu:
  [`search.py`](../../ml-temel/ml_temel/secim/search.py)
- Ayrım seçim tablosu ve `tablo` aracının izlediği sıra: [`ml-temel/docs/DEGERLENDIRME.md`](../../ml-temel/docs/DEGERLENDIRME.md)
- Komut satırından sızıntısız ayırma: [`verihavuzu/kalite/split.py`](../../veri/verihavuzu/kalite/split.py)
  (`python -m verihavuzu ayir`)
- Metin verisinde yakın kopyaları aynı tarafa koyan ayrım: [`ince_ayar/data/split.py`](../../ince-ayar/ince_ayar/data/split.py)
