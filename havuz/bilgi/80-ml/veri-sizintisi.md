---
baslik: Veri sızıntısı
ozet: Hedef, zaman, grup, ön işleme ve yinelenen kayıt sızıntılarının çalışan benzetimleri; "fazla iyi sonuç" belirtileri ve önleme kuralları.
etiketler: [makine-ogrenmesi, sizinti, degerlendirme, capraz-dogrulama, veri-kalitesi]
duzey: orta
guncellik: 2026-11
---

# Veri sızıntısı

> Bu notu ne zaman okumalı: bir model şaşırtıcı derecede iyi ölçüldüğünde; özellik tablosu kurulurken; ayrım ve
> ön işleme kodu yazılırken; "çevrimdışında harikaydı, canlıda çöktü" denildiğinde.

## Temel fikir

Sızıntı (leakage): değerlendirmede, gerçek kullanımda var olmayacak bir bilginin modele ulaşması. Sonucu hep
aynıdır: ölçüm parlak, canlı başarı düşük. Sızıntı **hata vermez**; kod çalışır, sayı güzeldir. Bu yüzden tek
savunma kuraldır:

> **Tahmin anında modelin önünde ne olacaksa, eğitimde ve değerlendirmede de yalnız o olmalı.**

Aşağıdaki her bölümde aynı veri iki kez ölçülür: sızıntılı yolla ve dürüst yolla. Aradaki fark, canlıda
yaşayacağınız hayal kırıklığının büyüklüğüdür.

## Türler

| Tür | Nasıl olur | Tipik örnek | Önlem |
| --- | --- | --- | --- |
| Hedef sızıntısı | Hedeften sonra oluşan ya da hedeften türeyen bilgi özellikte | "tahsilata devredildi", "iptal_tarihi", hedef dönemini de kapsayan toplam harcama | Her özelliğe "tahmin anında bilinir mi?" sorusu ve zaman damgası |
| Zaman sızıntısı | Gelecek satırlar eğitimde ya da özellik hesabında gelecek değerler | Karıştırılmış zaman serisi, merkezli hareketli ortalama, bütün dönemin ortalaması | Zaman ayrımı; özellikleri "o güne kadar" (as-of) hesaplamak |
| Grup sızıntısı | Aynı varlığın satırları hem eğitimde hem sınamada | Aynı müşterinin ayları, aynı hastanın görüntüleri, aynı belgenin parçaları | Gruplu ayrım |
| Ön işleme sızıntısı | Veriden öğrenen adım ayrımdan önce bütün veride uyduruldu | Özellik seçimi, hedef kodlama, ölçekleme, eksik doldurma, TF-IDF sözlüğü, yeniden örnekleme | Hepsi `Pipeline` içinde, kat içinde |
| Yinelenen kayıt | Aynı ya da çok benzer kayıt iki tarafta | Çift kayıt, aynı metnin küçük farklı hâli, veri artırma kopyaları | Ayırmadan önce tekilleştirme; yakın yinelemeleri grup saymak |

Bir de **seçim sızıntısı** var: modeli, eşiği ya da erken durdurmayı sınama kümesine bakarak seçmek. Ayrıntısı
[ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md) notunda.

## Çalışan benzetimler

### 1. Hedef sızıntısı

Kredi temerrüdü tahmini. "Tahsilat birimine devredildi" sütunu geçmiş tabloda dolu, çünkü temerrütten **sonra**
yazılıyor. Tahmin anında ise hep boş.

```python calistir
import random
from collections import defaultdict

random.seed(21)


def auc(scores, labels):
    pos = [s for s, y in zip(scores, labels) if y]
    neg = [s for s, y in zip(scores, labels) if not y]
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


def customers(n, known_later):
    rows = []
    for _ in range(n):
        late = random.random() < 0.3  # geçmişte gecikme: tahmin anında bilinir
        default = random.random() < (0.35 if late else 0.10)
        transferred = known_later and default and random.random() < 0.9  # sonradan yazılır
        rows.append(((late, transferred), default))
    return rows


train, valid = customers(3000, True), customers(1500, True)
live = customers(1500, False)  # canlıda devir bilgisi henüz yok
counts = defaultdict(lambda: [1, 2])  # basit tablo modeli: hücredeki temerrüt oranı
for x, y in train:
    counts[x][0] += y
    counts[x][1] += 1
score = lambda x: counts[x][0] / counts[x][1]
for name, rows in (("doğrulama (sızıntılı)", valid), ("canlı (gerçek)", live)):
    print(f"{name:22s} ROC-AUC {auc([score(x) for x, _ in rows], [y for _, y in rows]):.2f}")
assert auc([score(x) for x, _ in valid], [y for _, y in valid]) > 0.9
```

```cikti
doğrulama (sızıntılı)  ROC-AUC 0.97
canlı (gerçek)         ROC-AUC 0.69
```

Belirti: neredeyse kusursuz puan ve tek bir sütunun bütün işi taşıması. Denetim: o sütunun değeri **ne zaman**
yazılıyor? Kayıt tarihi tahmin anından sonraysa sütun atılır.

### 2. Zaman sızıntısı

Bir seri bugün dünkü değerine yakındır. Satırları karıştırıp ayırırsanız model sınama gününün iki yanındaki
günleri görür ve **ara değer bulmayı** (interpolasyon) ölçersiniz; oysa iş geleceği tahmin etmektir.

```python calistir
import random

random.seed(4)
level, series = 100.0, []
for day in range(400):
    level += random.gauss(0, 1.0)  # rastgele yürüyüş
    series.append((day, level + random.gauss(0, 0.3)))


def nearest_day_model(train):  # tek özellik: gün numarası
    return lambda day: min(train, key=lambda row: abs(row[0] - day))[1]


def mae(model, rows):
    return sum(abs(model(day) - y) for day, y in rows) / len(rows)


shuffled = series[:]
random.shuffle(shuffled)
random_mae = mae(nearest_day_model(shuffled[:320]), shuffled[320:])
time_mae = mae(nearest_day_model(series[:320]), series[320:])
print(f"rastgele ayrım MAE {random_mae:.2f}")
print(f"zaman ayrımı MAE   {time_mae:.2f}")
assert time_mae > 3 * random_mae
```

```cikti
rastgele ayrım MAE 0.85
zaman ayrımı MAE   6.71
```

Aynı model, aynı veri: hata yaklaşık 8 kat büyüyor. Zaman sıralı her veride (satış, işlem, abonelik, günlük)
eğitim hep sınamadan **önce** olmalı. Özellik hesabında da: "müşterinin ortalama harcaması" bütün tablodan değil,
tahmin gününe kadarki satırlardan hesaplanır.

### 3. Grup sızıntısı

Her müşterinin 8 satırı var. Özellikler müşteriye özgü bir "imza" taşıyor ama sonuçla ilgisiz. Satırları
rastgele ayırınca model sınamadaki müşteriyi eğitimdeki kendi satırından **tanıyor**:

```python calistir
import random

random.seed(8)
rows = []  # (özellikler, etiket, müşteri)
for customer in range(120):
    signature = [random.gauss(0, 1) for _ in range(5)]  # müşteriye özgü, hedefle ilgisiz
    label = random.random() < 0.5
    for _ in range(8):
        rows.append(([s + random.gauss(0, 0.2) for s in signature], label, customer))


def one_nn_accuracy(train, test):
    def predict(x):
        return min(train, key=lambda r: sum((a - b) ** 2 for a, b in zip(r[0], x)))[1]
    return sum(predict(x) == y for x, y, _ in test) / len(test)


shuffled = rows[:]
random.shuffle(shuffled)
by_row = one_nn_accuracy(shuffled[:768], shuffled[768:])
held_out = set(range(96, 120))  # 24 müşteri bütünüyle sınamada
by_group = one_nn_accuracy([r for r in rows if r[2] not in held_out], [r for r in rows if r[2] in held_out])
print(f"satıra göre ayrım:    {by_row:.2f}")
print(f"müşteriye göre ayrım: {by_group:.2f}")
assert by_row > 0.9 and by_group < 0.7
```

```cikti
satıra göre ayrım:    0.96
müşteriye göre ayrım: 0.46
```

Model yeni müşterilere uygulanacaksa sınama da yeni müşterilerden oluşmalı. Aynı ilke: aynı hastanın
görüntüleri, aynı cihazın ölçümleri, aynı belgenin parçaları, aynı kullanıcının iletileri.

### 4. Ön işleme sızıntısı: özellik seçimi

60 satır, 500 tamamen rastgele özellik; etiket hiçbir özellikle ilgili değil. Dürüst başarı 0,50 olmalı.
Hedefle en ilişkili 10 özellik **bütün veride** seçilip sonra çapraz doğrulanırsa:

```python calistir
import random
import statistics

random.seed(13)
N, P, KEEP = 60, 500, 10
X = [[random.gauss(0, 1) for _ in range(P)] for _ in range(N)]
y = [i % 2 for i in range(N)]  # özelliklerden bağımsız etiket


def top_features(rows):
    labels = [y[i] for i in rows]
    strength = lambda j: abs(statistics.correlation([X[i][j] for i in rows], labels))
    return sorted(range(P), key=strength, reverse=True)[:KEEP]


def centroid_accuracy(train, test, features):
    def centroid(label):
        members = [i for i in train if y[i] == label]
        return [statistics.fmean(X[i][j] for i in members) for j in features]
    c0, c1 = centroid(0), centroid(1)
    dist = lambda i, c: sum((X[i][j] - v) ** 2 for j, v in zip(features, c))
    return sum((dist(i, c1) < dist(i, c0)) == y[i] for i in test) / len(test)


everyone = list(range(N))
folds = [everyone[k::5] for k in range(5)]
chosen_on_all = top_features(everyone)  # YANLIŞ: seçim çapraz doğrulamadan önce
leaky, honest = [], []
for test in folds:
    train = [i for i in everyone if i not in test]
    leaky.append(centroid_accuracy(train, test, chosen_on_all))
    honest.append(centroid_accuracy(train, test, top_features(train)))  # DOĞRU: kat içinde
print(f"seçim bütün veride: {statistics.fmean(leaky):.2f}")
print(f"seçim kat içinde:   {statistics.fmean(honest):.2f}")
assert statistics.fmean(leaky) > 0.75 and statistics.fmean(honest) < 0.65
```

```cikti
seçim bütün veride: 0.82
seçim kat içinde:   0.43
```

Saf gürültüden "başarılı" bir model çıktı. Aynı şey hedef kodlama, ölçekleme, eksik doldurma, PCA, TF-IDF
sözlüğü ve yeniden örneklemede de olur; etkisi özellik seçimi ve hedef kodlamada en büyüktür. Kural: veriden
bir şey **öğrenen** her adım modelle aynı `Pipeline` içinde, her katta yalnız o katın eğitim satırlarıyla uydurulur.

### 5. Yinelenen kayıt

Kayıtların bir kısmı iki kez yazılmış. Ezberleyen bir model (1-en yakın komşu; derin ağaç ve büyük sinir ağı da
böyledir) sınamadaki kopyanın eşini eğitimde bulur:

```python calistir
import random

random.seed(17)
base = []
for _ in range(400):
    x = tuple(random.gauss(0, 1) for _ in range(4))
    base.append((x, x[0] + random.gauss(0, 1.5) > 0))  # zayıf sinyal, çok gürültü
rows = base + random.sample(base, 200)  # 200 kayıt iki kez yazılmış


def one_nn_accuracy(train, test):
    def predict(x):
        return min(train, key=lambda r: sum((a - b) ** 2 for a, b in zip(r[0], x)))[1]
    return sum(predict(x) == y for x, y in test) / len(test)


random.shuffle(rows)
with_duplicates = one_nn_accuracy(rows[:450], rows[450:])
unique = list(dict.fromkeys(rows))  # birebir kopyaları at, SONRA ayır
random.shuffle(unique)
deduplicated = one_nn_accuracy(unique[:300], unique[300:])
print(f"yinelemeli ayrım:    {with_duplicates:.2f}")
print(f"tekilleştirip ayrım: {deduplicated:.2f}")
assert with_duplicates > deduplicated + 0.1
```

```cikti
yinelemeli ayrım:    0.79
tekilleştirip ayrım: 0.59
```

Birebir kopya kolay bulunur; asıl tehlike **yakın kopyadır**: aynı ürünün iki ilanı, aynı şikâyetin küçük
farklarla iki kez yazılması, aynı belgenin iki sürümü. Yakın kopyalar bir grup sayılır ve aynı tarafa konur.

## "Fazla iyi" sonucun belirtileri

| Belirti | Ne düşündürmeli | İlk denetim |
| --- | --- | --- |
| Zor bir işte ROC-AUC ya da R² ≥ 0,99 | Hedef sızıntısı | Tek özellikli modellerle hangi sütunun bunu yaptığını bulun |
| Tek özellik önemin çoğunu taşıyor | Hedef sızıntısı | O sütunun yazılma zamanı |
| Kimlik, tarih, sıra numarası önemli çıkıyor | Grup ya da zaman sızıntısı | Sütunu atın; gruplu/zaman ayrımıyla yeniden ölçün |
| Çapraz doğrulama sınamadan ya da canlıdan belirgin iyi | Ön işleme ya da seçim sızıntısı | Her öğrenen adım kat içinde mi |
| Rastgele ayrım ile zaman ayrımı arasında büyük fark | Zaman sızıntısı | Zaman ayrımı asıl ölçümdür |
| Yeni müşteride/üründe başarı düşük | Grup sızıntısı | Gruplu ayrımla yeniden ölçün |
| Doğrulama başarısı eğitimden yüksek | Yineleme, artırma farkı ya da şans | Kopya taraması; kat sayısını artırın |
| Sonuç, işi bilenlerin beklediğinden çok iyi | Hepsi | Kanıtlanana kadar hata sayın |

## Önleme kuralları

1. **Önce ayır, sonra her şeyi yap.** Kodun ilk adımı ayrımdır; keşif ve ön işleme yalnız eğitim kısmında.
2. **Her özelliğin zaman damgası olsun.** Özellik tablosu "tahmin anına kadar" bilgiyle kurulur (as-of birleştirme).
3. **Öğrenen her adım `Pipeline` içinde.** Ölçekleme, doldurma, kodlama, seçim, yeniden örnekleme: kat içinde.
4. **Ayrım kullanımı taklit eder.** Yeni müşteri → gruplu; gelecek → zaman; ikisi → zaman + grup denetimi.
5. **Tekilleştir.** Birebir ve yakın kopyaları ayrımdan önce bul; yakın kopyaları grup say.
6. **Sınama kümesi bir kez.** Model, eşik, kalibrasyon kararı doğrulamada verilir.
7. **Son söz zamanın ilerisinde.** Mümkünse en yeni dönemden ayrılmış (out-of-time) bir sınama kümesi tutun.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Zamana göre ayrıldı ama sonuç yine fazla iyi | Özellikler (müşteri ortalaması, toplam iade) bütün tablodan hesaplanmış | Toplamları tahmin gününe kadarki satırlardan hesaplayın |
| Hedef kodlamalı kategori çok önemli çıkıyor | Satırın kendi etiketi kendi kodunda | Kat dışı (out-of-fold) hedef kodlama ([özellik mühendisliği](ozellik-muhendisligi.md)) |
| Veri artırılınca doğrulama sıçradı | Artırma ayrımdan önce yapıldı; kopyalar iki tarafta | Artırmayı yalnız eğitim katına uygulayın |
| Soru-cevap ya da arama değerlendirmesi çok iyi | Aynı belgenin parçaları iki tarafta | Belge düzeyinde gruplu ayrım |
| Eski modelin skoru özellik olarak eklenince başarı fırladı | Eski skor, etiketin oluştuğu dönemi de görmüş olabilir | Skorun hesaplandığı tarihi denetleyin; tahmin anındaki değeri kullanın |
| Erken durdurma ile sınama sonucu uyumlu ama canlı kötü | Erken durdurma sınama kümesine bakıyor | Ayrı bir doğrulama kümesi |
| Zaman serisinde normalleştirme sonrası tahmin "kusursuz" | Ölçek bütün seriden (gelecek dahil) hesaplandı | Ölçeği yalnız eğitim döneminden hesaplayın |
| `tablo` raporu "kopya satırlar" uyarısı veriyor | Sınama satırları eğitimde birebir var | `--grup` ile ya da tekilleştirerek yeniden eğitin |

## Denetim listesi

- [ ] Kodda ayrım, her türlü uydurma (fit) işleminden önce geliyor.
- [ ] Her özellik için "tahmin anında bilinir mi?" sorusu yanıtlandı ve yazıldı.
- [ ] Toplama özellikleri (ortalama, sayı, son değer) tahmin gününe kadarki veriden hesaplanıyor.
- [ ] Ölçekleme, doldurma, kodlama, seçim ve yeniden örnekleme `Pipeline` içinde, kat içinde.
- [ ] Ayrım türü kullanımı taklit ediyor (grup/zaman) ve neden seçildiği yazıldı.
- [ ] Birebir ve yakın kopyalar ayrımdan önce tarandı; iki taraf arasında ortak anahtar sayısı 0.
- [ ] Başarı beklenenden çok iyiyse tek özellikli modellerle kaynağı arandı.
- [ ] Sınama kümesine yalnız en sonda, bir kez bakıldı.
- [ ] Mümkünse en yeni dönemden ayrılmış ek bir sınama yapıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce veriyi ayır. Ölçekleme, eksik doldurma, kodlama, özellik seçimi ve yeniden örneklemeyi
  yalnız `Pipeline` içinde yap; çapraz doğrulamaya `Pipeline`'ı ver. Veri zaman sıralıysa zamana göre, aynı
  müşterinin birden çok satırı varsa müşteriye göre ayır. Her özelliğin tahmin anında bilinip bilinmediğini
  tabloda yaz."
- **Modelin tipik hatası:** `scaler.fit_transform(X)` ya da `SelectKBest(...).fit(X, y)` satırını ayrımdan önce
  yazar; `train_test_split(..., shuffle=True)`'yu zaman verisinde kullanır; "AUC 0,99" sonucunu başarı diye sunar.
- **Çıktıda denetleyin:** `fit` geçen her satırın hangi veriyle çağrıldığını izleyin; `shuffle`, `groups`,
  `TimeSeriesSplit` kullanımına bakın; çok iyi sonuçta önem tablosunu isteyin.
- **Sorun:** "Bu sütun, tahmin yapılan gün sabah elimizde var mı?" Her sütun için ayrı ayrı.

## İlgili

- [Ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md) — hangi ayrım ne zaman, seçim sızıntısı
- [Özellik mühendisliği](ozellik-muhendisligi.md) — hedef kodlamanın sızıntı tuzağı
- [Zaman serisi tahmini](zaman-serisi-tahmini.md) — gecikmeli özellik ve geriye dönük test
- Sızıntı tablosu ve doğru ayrım: [`ml-temel/docs/DEGERLENDIRME.md`](../../ml-temel/docs/DEGERLENDIRME.md)
- Hedef kodlama sızıntısının çalışan gösterimi (ROC-AUC 1,000 ↔ 0,500):
  [`ml-temel/ornekler/03_musteri_kaybi.py`](../../ml-temel/ornekler/03_musteri_kaybi.py)
- Kat içinde uydurma kuralı: [`ml_temel/secim/validate.py`](../../ml-temel/ml_temel/secim/validate.py);
  sızıntı uyarıları: [`ml_temel/tablo/checks.py`](../../ml-temel/ml_temel/tablo/checks.py)
- Zaman/grup/katmanlı sızıntısız ayırma ve ortak anahtar sayımı:
  [`verihavuzu/kalite/split.py`](../../veri/verihavuzu/kalite/split.py); bulanık yineleme:
  [`verihavuzu/kalite/dedupe.py`](../../veri/verihavuzu/kalite/dedupe.py)
- Metinde yakın yineleme (MinHash) ile ayrım: [`ince_ayar/data/neardup.py`](../../ince-ayar/ince_ayar/data/neardup.py),
  [`ince_ayar/data/split.py`](../../ince-ayar/ince_ayar/data/split.py)
