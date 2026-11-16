---
baslik: Özellik mühendisliği
ozet: Sayısal, kategorik, tarih, metin ve eksik değer özelliklerini doğru kurma; hedef kodlamanın sızıntı tuzağı; ağaç ve doğrusal modellerin farklı gereksinimleri.
etiketler: [makine-ogrenmesi, ozellik, on-isleme, kodlama, eksik-deger]
duzey: orta
guncellik: 2026-11
---

# Özellik mühendisliği

> Bu notu ne zaman okumalı: ham tablodan model girdisi kurarken; kategorik, tarih ya da metin sütunu nasıl
> verilecek diye düşünürken; bir kodlamadan sonra başarı şüpheli biçimde sıçradığında.

## Temel fikir

Model yalnız verilen sütunları görür. İyi özellik, alan bilgisini **tahmin anında bilinen** veriden sayıya
çevirir: "son siparişten beri geçen gün", "borç / gelir", "son 3 aydaki şikâyet sayısı". Üç kural:

1. **Veriden öğrenen her dönüşüm** (ölçek, doldurma değeri, kategori listesi, hedef ortalaması, TF-IDF sözlüğü)
   yalnız eğitim verisinden öğrenilir ve `Pipeline` içinde durur.
2. **Model ailesi neyi istediğini belirler:** doğrusal modeller ve uzaklık tabanlı modeller ölçeğe ve biçime
   duyarlıdır; ağaçlar değildir.
3. **Kimlik ve mutlak tarih özellik değildir.** Müşteri numarası ezberletir; "2025-03-14" modelin göremeyeceği
   bir geleceğe uzanmaz. Onların yerine anlamlı türevler (süre, sıklık, mevsim) kullanılır.

## Karar tablosu

| Sütun türü | Doğrusal / k-NN / sinir ağı | Ağaç toplulukları | Not |
| --- | --- | --- | --- |
| Sayısal, ölçekleri farklı | Standartlaştır (ortalama 0, sapma 1) | Dokunma | Ağaç sıralamaya bakar; tekdüze dönüşüm sonucu değiştirmez |
| Sayısal, sağa çarpık (gelir, tutar) | `log1p` | Gerek yok | Negatif değer varsa işaretli log ya da kesme |
| Aykırı değerli sayısal | Eğitim yüzdelikleriyle kırp (ör. %1–%99) | Gerek yok | Kırpma sınırı da eğitimden öğrenilir |
| Kategorik, az değer (< ~20) | Tek-sıcak (one-hot) | Sıralı kod ya da yerel kategorik destek | Doğrusal modelde sıralı kod sahte bir sıra uydurur |
| Kategorik, çok değer (posta kodu, ürün) | Hedef kodlama (kat dışı, düzleştirilmiş), sıklık kodlama ya da karma (hashing) | Sıralı kod, sıklık ya da hedef kodlama | Hedef kodlama sızıntıya en açık dönüşümdür (aşağıda) |
| Sıralı anlamlı kategori (eğitim düzeyi, beden) | Sıralı kod | Sıralı kod | Sırayı elle verin; alfabetik sıra yanlıştır |
| Tarih / saat | Bileşenler + döngüsel (sin/cos) + geçen süre | Bileşenler + geçen süre (ham sayı) | Mutlak tarihi doğrudan vermeyin |
| Metin | TF-IDF (kelime + karakter n-gram) ya da gömme | Aynı, ya da gömmeden türetilmiş birkaç sütun | Türkçe ekler için karakter n-gram ([metin sınıflandırma](metin-siniflandirma.md)) |
| Eksik değer | Doldur + "eksikti" gösterge sütunu | Histogram tabanlı artırma eksiği kendisi işler; ötekiler için doldur + gösterge | Eksikliğin kendisi sinyal olabilir |
| Etkileşim (borç × gelir) | Elle ekle (oran, çarpım) | Ağaç kendisi bulur; oranlar yine de yardım eder | Alan bilgisinden gelen oranlar en değerlisidir |

## Hedef kodlama ve sızıntı tuzağı

Hedef kodlama (target encoding): her kategoriyi, eğitimde o kategorideki hedef ortalamasıyla değiştirmek. Çok
değerli sütunlarda güçlüdür ama satırın **kendi etiketi kendi koduna girerse** özellik, eğitimde olduğundan çok
daha bilgili görünür. 500 posta kodu, kod başına ~3 satır, gerçek etki küçük:

```python calistir
import random
import statistics

random.seed(31)
rate = {c: random.choice((0.1, 0.3)) for c in range(500)}  # posta kodunun gerçek etkisi


def make(n):
    rows = []
    for _ in range(n):
        code = random.randrange(500)
        rows.append((code, random.random() < rate[code]))
    return rows


def auc(scores, labels):
    pos = [s for s, y in zip(scores, labels) if y]
    neg = [s for s, y in zip(scores, labels) if not y]
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


def target_means(rows, m=10.0):  # m: genel orana doğru düzleştirme gücü
    prior = statistics.fmean(y for _, y in rows)
    total, count = {}, {}
    for code, y in rows:
        total[code] = total.get(code, 0) + y
        count[code] = count.get(code, 0) + 1
    return lambda code: (total.get(code, 0) + m * prior) / (count.get(code, 0) + m)


train, test = make(1500), make(1500)
labels = [y for _, y in train]
naive = target_means(train, m=0.0)  # YANLIŞ: düzleştirme yok, satır kendi kodunda
oof = [0.0] * len(train)  # DOĞRU: her satır, kendi katını görmeyen kodlamayla
for k in range(5):
    encode = target_means([row for i, row in enumerate(train) if i % 5 != k])
    for i in range(k, len(train), 5):
        oof[i] = encode(train[i][0])
final = target_means(train)
print(f"eğitimde görünen AUC: naif {auc([naive(c) for c, _ in train], labels):.2f}, kat dışı {auc(oof, labels):.2f}")
print(f"sınamada gerçek AUC:  {auc([final(c) for c, _ in test], [y for _, y in test]):.2f}")
```

```cikti
eğitimde görünen AUC: naif 0.89, kat dışı 0.54
sınamada gerçek AUC:  0.57
```

Naif kodlamayla eğitilen model bu sütuna aşırı güvenir; sınamada güven boşa çıkar. Doğrusu: eğitim satırlarının
kodu **kat dışı** (out-of-fold) hesaplanır, az örnekli kategoriler genel orana doğru **düzleştirilir** (`m`);
sınama ve canlı için kodlama bütün eğitim verisinden bir kez hesaplanır. Çapraz doğrulama yapılıyorsa bütün bu iş
her katın içinde yeniden yapılır.

## Eksiklik bir sinyaldir

Gelirini yazmayanlar daha sık temerrüde düşüyorsa, ortalamayla doldurmak bu bilgiyi siler:

```python calistir
import random
import statistics

random.seed(12)


def make(n):
    rows = []
    for _ in range(n):
        income = random.lognormvariate(10, 0.5)
        hidden = random.random() < 0.15  # geliri boş bırakanlar
        risk = 0.08 + (0.17 if hidden else 0.0) + (0.05 if income < 15_000 else 0.0)
        rows.append((None if hidden else income, random.random() < risk))
    return rows


def auc(scores, labels):
    pos = [s for s, y in zip(scores, labels) if y]
    neg = [s for s, y in zip(scores, labels) if not y]
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


train, test = make(4000), make(2000)
known = [v for v, _ in train if v is not None]
mean, cuts = statistics.fmean(known), statistics.quantiles(known, n=4)
quartile = lambda v: sum(v > c for c in cuts)
keys = {
    "ortalamayla doldur": lambda v: quartile(mean if v is None else v),
    "eksik = ayrı grup  ": lambda v: "eksik" if v is None else quartile(v),
}
for name, key in keys.items():
    stats = {}
    for v, y in train:
        n, k = stats.get(key(v), (0, 0))
        stats[key(v)] = (n + 1, k + y)
    score = lambda v: (stats[key(v)][1] + 1) / (stats[key(v)][0] + 2)  # grubun temerrüt oranı
    print(f"{name} sınama AUC {auc([score(v) for v, _ in test], [y for _, y in test]):.2f}")
```

```cikti
ortalamayla doldur sınama AUC 0.60
eksik = ayrı grup   sınama AUC 0.64
```

Kural: eksik değeri doldururken bir **"eksikti" gösterge sütunu** ekleyin (`SimpleImputer(add_indicator=True)`),
ağaçta "eksik" ayrı bir dal olsun. Önce sorun: değer neden eksik? Kullanıcı mı yazmadı, sistem mi kaydetmedi,
alan sonradan mı eklendi? Sonradan eklenen alanda eksiklik "eski kayıt" demektir; bu da bir zaman sinyalidir.

## Ölçek: uzaklık tabanlı modeller için şart

Hedef yalnız yaşa bağlı; gelir hedefle ilgisiz ama sayısal olarak bin kat büyük. k-en yakın komşu (k-NN):

```python calistir
import random
import statistics

random.seed(6)


def person():
    age, income = random.uniform(20, 70), random.gauss(30_000, 8_000)
    return [age, income], age > 45


train = [person() for _ in range(300)]
test = [person() for _ in range(200)]


def knn_accuracy(train, test, k=5):
    def predict(x):
        near = sorted(train, key=lambda r: sum((a - b) ** 2 for a, b in zip(r[0], x)))[:k]
        return sum(y for _, y in near) * 2 > k
    return statistics.fmean(predict(x) == y for x, y in test)


means = [statistics.fmean(x[j] for x, _ in train) for j in (0, 1)]  # yalnız eğitimden
stds = [statistics.stdev(x[j] for x, _ in train) for j in (0, 1)]
scale = lambda rows: [([(x[j] - means[j]) / stds[j] for j in (0, 1)], y) for x, y in rows]
print(f"ölçeksiz k-NN {knn_accuracy(train, test):.2f}, ölçekli k-NN {knn_accuracy(scale(train), scale(test)):.2f}")
```

```cikti
ölçeksiz k-NN 0.53, ölçekli k-NN 0.98
```

Aynı ders düzenlileştirilmiş doğrusal modeller (ceza, katsayının büyüklüğüne göre işler), sinir ağları ve
kümeleme için de geçerlidir. Ağaçlarda ölçekleme gereksizdir ama zararsızdır.

## Tarih ve saat

| Türev | Örnek | Ne zaman |
| --- | --- | --- |
| Geçen süre | "son siparişten beri gün", "üyelik süresi (ay)" | Hemen her zaman en değerli tarih özelliği |
| Takvim bileşeni | ay, haftanın günü, ayın günü, saat | Mevsimsel davranış |
| Özel gün | resmî tatil, bayram öncesi gün, maaş günü, kampanya | Talep, trafik, satış |
| Döngüsel kodlama | `sin(2π·saat/24)`, `cos(2π·saat/24)` | Doğrusal modeller ve sinir ağları; ağaçlarda gerekmez |
| Sıklık ve eğilim | "son 30 günde işlem sayısı", "son 3 ay / önceki 3 ay" | Davranış değişimi |

Döngüsel kodlama neden: saat 23 ile 01 arası 2 saattir, sayı farkı 22'dir.

```python calistir
import math


def cyclic(hour: float) -> tuple[float, float]:
    angle = 2 * math.pi * hour / 24
    return math.sin(angle), math.cos(angle)


print(f"ham fark: 23↔1 = {abs(23 - 1)}, 11↔13 = {abs(11 - 13)}")
print(f"döngüsel: 23↔1 = {math.dist(cyclic(23), cyclic(1)):.3f}, 11↔13 = {math.dist(cyclic(11), cyclic(13)):.3f}")
assert math.isclose(math.dist(cyclic(23), cyclic(1)), math.dist(cyclic(11), cyclic(13)))
```

```cikti
ham fark: 23↔1 = 22, 11↔13 = 2
döngüsel: 23↔1 = 0.518, 11↔13 = 0.518
```

Bütün tarih türevleri **tahmin anına göre** hesaplanır: "son siparişten beri gün" eğitimde de o satırın tahmin
gününe göredir, bugüne göre değil. Dinî bayramlar her yıl ~11 gün kayar; sabit tarihli tatil listesi yetmez.

## Metin ve Türkçe kategoriler

- "İstanbul", "ISTANBUL", "istanbul", "Istanbul" dört ayrı kategori olarak kodlanır. Kodlamadan önce Türkçe
  kurallı küçültme ve katlama yapın ([Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)).
- Kategori adlarının sonundaki boşluk, "Ltd. Şti." / "LTD ŞTİ" gibi yazım farkları da aynı sorundur; temizlik
  kodlamadan önce, kuralla yapılır.
- Canlıda eğitimde görülmemiş kategori gelir. Kodlayıcı hata vermemeli; "bilinmeyen" grubu olmalı. Nadir
  kategorileri (ör. 20'den az satır) eğitimde "diğer" altında toplamak bu durumu da sınar.
- Metin alanından basit sayılar da çıkar: uzunluk, rakam sayısı, büyük harf oranı, ünlem; çoğu zaman şaşırtıcı
  derecede işe yarar.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Hedef kodlamalı sütun en önemli özellik, sınama kötü | Kat dışı yapılmamış, düzleştirme yok | Kat dışı + düzleştirilmiş hedef kodlama, `Pipeline` içinde |
| Canlıda `ValueError: bilinmeyen kategori` | Kodlayıcı yeni değeri tanımıyor | Hoşgörülü kodlayıcı; "bilinmeyen/diğer" grubu |
| Aynı şehir birkaç sütuna dağılmış | Yazım ve büyük/küçük harf farkı | Türkçe kurallı katlama, sonra kodlama |
| Model "müşteri_no"ya dayanıyor | Kimlik sütunu özellik olarak girmiş | Kimlikleri çıkarın; gerekiyorsa gruplu ayrımda kullanın |
| Tarih sütunu önemli, gelecek ayda başarı düşüyor | Mutlak tarih ya da sıra numarası özellik | Göreli süre ve takvim bileşenleri |
| Oran özelliğinde `inf` ya da `NaN` | Sıfıra bölme (gelir 0) | Paydayı koruyun; "payda sıfır" göstergesi ekleyin |
| `log` dönüşümünden sonra hata | Sıfır ya da negatif değer | `log1p`; negatifte işaretli dönüşüm |
| Log-hedefle regresyonda toplam tahmin hep düşük | `exp(tahmin)` ortalamayı değil ortancayı verir | Toplamlar gerekiyorsa düzeltme yapın ya da hedefi dönüştürmeyin; ölçütü özgün ölçekte hesaplayın |
| Tek-sıcak sonrası binlerce sütun, ağaç yavaş ve zayıf | Çok değerli kategoride tek-sıcak | Sıralı kod, sıklık ya da hedef kodlama |
| Ölçekleme sonrası çapraz doğrulama biraz iyimser | Ölçek bütün veriden | Ölçekleyiciyi `Pipeline`'a koyun |

## Denetim listesi

- [ ] Her özellik tahmin anında biliniyor; tarih türevleri tahmin gününe göre hesaplanıyor.
- [ ] Kimlik, sıra numarası ve mutlak tarih özellik listesinde yok.
- [ ] Veriden öğrenen her dönüşüm `Pipeline` içinde; çapraz doğrulama hattın kendisine uygulanıyor.
- [ ] Hedef kodlama varsa kat dışı ve düzleştirilmiş; bir sınama ile doğrulandı.
- [ ] Eksik değerli sütunlarda "eksikti" göstergesi var; eksikliğin nedeni yazıldı.
- [ ] Kategoriler Türkçe kurallı katlandı; canlıda yeni kategori için davranış sınandı.
- [ ] Doğrusal/k-NN/sinir ağı modellerinde sayısal sütunlar ölçeklendi; çarpık sütunlara `log1p` uygulandı.
- [ ] Oran ve bölme özelliklerinde sıfıra bölme korundu.
- [ ] Eklenen her özelliğin katkısı aynı katlarla çapraz doğrulamada ölçüldü (eklemeden önce ↔ sonra).

## Küçük modele yaptırırken

- **İsteme yazın:** "Her sütun için tür (sayısal/kategorik/tarih/metin/kimlik), tahmin anında bilinip bilinmediği
  ve uygulanacak dönüşümü tablo hâlinde öner. Dönüşümleri `ColumnTransformer` + `Pipeline` ile kur; hiçbir şeyi
  bütün veride `fit` etme. Kimlik sütunlarını at."
- **Modelin tipik hatası:** `df['sehir'].map(df.groupby('sehir')['hedef'].mean())` gibi bütün veride hedef
  kodlama yazar; tarihi `toordinal()` ile sayıya çevirip verir; `.lower()` ile Türkçe kategorileri bozar;
  `get_dummies`'i eğitim ve sınamaya ayrı ayrı uygulayıp sütunları uyumsuz bırakır.
- **Çıktıda denetleyin:** `groupby(...)[hedef]` ve `fit_transform` geçen satırların hangi veriyle çalıştığı;
  `.lower()` / `.upper()` çağrıları; sınama ve canlı için aynı sütun sırasının üretilip üretilmediği.
- **Ölçün:** her yeni özellik için "önce/sonra" çapraz doğrulama sonucunu isteyin; katkısı kat yayılımından
  küçük olan özellik çıkarılır.

## İlgili

- [Veri sızıntısı](veri-sizintisi.md) · [Model seçimi](model-secimi.md) · [Ağaç toplulukları](agac-topluluklari.md)
- Kodlayıcılar (hedef kodlama uyarısı başlıkta): [`ml_temel/onisleme/encoders.py`](../../ml-temel/ml_temel/onisleme/encoders.py)
- Eksik doldurma ve gösterge: [`impute.py`](../../ml-temel/ml_temel/onisleme/impute.py); ölçekleyiciler:
  [`scalers.py`](../../ml-temel/ml_temel/onisleme/scalers.py); hat: [`pipeline.py`](../../ml-temel/ml_temel/onisleme/pipeline.py)
- Türkçe belirteçleme ve TF-IDF: [`text.py`](../../ml-temel/ml_temel/onisleme/text.py),
  [`vectorizers.py`](../../ml-temel/ml_temel/onisleme/vectorizers.py)
- Sütun türü sezme ve tarih türevleri: [`ml_temel/tablo/schema.py`](../../ml-temel/ml_temel/tablo/schema.py)
- Hedef kodlama sızıntısının uçtan uca örneği: [`ml-temel/ornekler/03_musteri_kaybi.py`](../../ml-temel/ornekler/03_musteri_kaybi.py)
- Veri temizliği (boşluk, bozuk kodlama, tarih/sayı biçimi): [`verihavuzu/kalite/clean.py`](../../veri/verihavuzu/kalite/clean.py)
- Türkçe metin dönüşümü: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)
