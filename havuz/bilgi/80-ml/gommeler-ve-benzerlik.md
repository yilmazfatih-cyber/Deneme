---
baslik: Gömmeler ve benzerlik araması
ozet: Gömmenin ne olduğu, kosinüs-iç çarpım-uzaklık ve normalleştirme, kaba kuvvet ile yaklaşık yakın komşu araması, boyut ve depolama hesabı, recall@k ile değerlendirme, alana uydurma ve sık hatalar.
etiketler: [makine-ogrenmesi, gomme, benzerlik, vektor-arama, ann, degerlendirme]
duzey: orta
guncellik: 2026-11
---

# Gömmeler ve benzerlik araması

> Bu notu ne zaman okumalı: anlamsal arama, yinelenen kayıt bulma, öneri ya da RAG için vektör araması
> kurarken; arama kalitesi düşük çıktığında; dizinin belleğe sığıp sığmayacağını hesaplarken.

## Temel fikir

Gömme (embedding): bir metni, ürünü ya da kullanıcıyı sabit uzunlukta bir sayı vektörüne çeviren öğrenilmiş bir
eşleme. İyi bir gömmede **anlamca yakın olanlar vektör olarak da yakındır**. Benzerlik araması: sorgunun
vektörüne en yakın k vektörü bulmak.

Üç karar her şeyi belirler:

1. **Hangi model?** Gömme yalnız aynı modelin uzayında anlamlıdır. Sorgu ve belgeler **aynı model, aynı sürüm,
   aynı ön işleme** ile gömülür.
2. **Hangi benzerlik?** Model hangi ölçüyle eğitildiyse o (çoğu metin gömme modeli için kosinüs).
3. **Kaba kuvvet mi, yaklaşık mı?** Yüz bin vektöre kadar kaba kuvvet çoğu zaman yeterli ve kesindir.

## Uzaklık ölçüleri ve normalleştirme

| Ölçü | Formül | Ne zaman |
| --- | --- | --- |
| Kosinüs benzerliği | a·b / (‖a‖‖b‖) | Metin gömmelerinde varsayılan; uzunluğu yok sayar |
| İç çarpım (dot) | a·b | Model iç çarpımla eğitildiyse; normalleştirilmiş vektörde kosinüsle aynı |
| Öklid uzaklığı | ‖a − b‖ | Normalleştirilmiş vektörde kosinüsle aynı sırayı verir: ‖a − b‖² = 2 − 2·kos |

```python calistir
import math


def norm(v):
    return math.sqrt(sum(x * x for x in v))


def unit(v):
    n = norm(v)
    return [x / n for x in v]


dot = lambda a, b: sum(x * y for x, y in zip(a, b))
cosine = lambda a, b: dot(a, b) / (norm(a) * norm(b))
euclid = lambda a, b: math.dist(a, b)
query = [1.0, 0.0]
docs = {"yakın, kısa": [0.8, 0.6], "uzak, uzun": [3.0, 4.0]}  # ikincisinin yönü daha uzak ama boyu 5 kat
for name, measure, best in (("iç çarpım", dot, max), ("kosinüs", cosine, max), ("öklid", euclid, min)):
    print(f"{name:9s} seçimi: {best(docs, key=lambda k: measure(query, docs[k]))}")
units = {k: unit(v) for k, v in docs.items()}
picks = {max(units, key=lambda k: dot(query, units[k])), max(units, key=lambda k: cosine(query, units[k])),
         min(units, key=lambda k: euclid(query, units[k]))}
print(f"normalleştirince üç ölçü aynı belgeyi seçiyor: {len(picks) == 1}")
```

```cikti
iç çarpım seçimi: uzak, uzun
kosinüs   seçimi: yakın, kısa
öklid     seçimi: yakın, kısa
normalleştirince üç ölçü aynı belgeyi seçiyor: True
```

Normalleştirilmemiş vektörde iç çarpım **uzun** vektörü kayırır (uzun belge, popüler ürün). Kural: dizine
yazmadan önce L2 normalleştirin ve iç çarpımla arayın; model kartı başka bir şey söylüyorsa ona uyun.

## Kaba kuvvet ↔ yaklaşık arama

Kaba kuvvet (brute force) her vektörle tek tek karşılaştırır: kesin ama N ile doğrusal büyür. Yaklaşık yakın komşu
(approximate nearest neighbour, ANN) yöntemleri aramayı vektörlerin küçük bir kısmıyla sınırlar. En basiti IVF:
vektörler kümelere ayrılır, sorgu yalnız en yakın birkaç kümede aranır (`nprobe`):

```python calistir
import math
import random

random.seed(33)
DIM, N, LISTS = 8, 2000, 25
unit = lambda v: [x / math.sqrt(sum(y * y for y in v)) for x in v] if any(v) else v
centers = [[random.gauss(0, 1) for _ in range(DIM)] for _ in range(40)]
data = [unit([c + random.gauss(0, 0.4) for c in random.choice(centers)]) for _ in range(N)]
queries = [unit([x + random.gauss(0, 0.1) for x in random.choice(data)]) for _ in range(40)]
dot = lambda a, b: sum(x * y for x, y in zip(a, b))


def top_k(query, ids, k=10):
    return sorted(ids, key=lambda i: -dot(query, data[i]))[:k]


everyone = range(N)
exact = [set(top_k(q, everyone)) for q in queries]
centroids = [data[i] for i in random.sample(range(N), LISTS)]  # kaba IVF: rastgele seçilmiş merkezler
lists = [[] for _ in range(LISTS)]
for i, v in enumerate(data):
    lists[max(range(LISTS), key=lambda c: dot(v, centroids[c]))].append(i)
for nprobe in (1, 3, 8):
    recall = scanned = 0
    for q, truth in zip(queries, exact):
        nearest = sorted(range(LISTS), key=lambda c: -dot(q, centroids[c]))[:nprobe]
        candidates = [i for c in nearest for i in lists[c]]
        scanned += len(candidates)
        recall += len(truth & set(top_k(q, candidates))) / 10
    print(f"nprobe {nprobe}: kesin ilk 10'u bulma oranı {recall / len(queries):.2f}, taranan vektör %{100 * scanned / len(queries) / N:.0f}")
```

```cikti
nprobe 1: kesin ilk 10'u bulma oranı 0.64, taranan vektör %5
nprobe 3: kesin ilk 10'u bulma oranı 0.90, taranan vektör %14
nprobe 8: kesin ilk 10'u bulma oranı 0.99, taranan vektör %34
```

Yaklaşık arama **hız için kesinlikten** vazgeçer; ayarı (`nprobe`, HNSW'de `ef`) bu ödünleşimi belirler. İki ayrı
"recall" vardır, karıştırmayın:

- **ANN recall:** yaklaşık arama, kesin aramanın bulduğu ilk k'yı ne oranda buluyor? (dizinin kalitesi)
- **Getirme recall@k:** ilgili belgelerin kaçı ilk k'da? (gömme modelinin ve tüm sistemin kalitesi; insan etiketi ister)

| Durum | Seçim |
| --- | --- |
| ~100 bine kadar vektör, etkileşimli arama | Kaba kuvvet (tek matris çarpımı); kesin ve basit |
| Yüz binler – milyonlar | HNSW (çizge) ya da IVF; recall'ı ölçerek ayarlayın |
| Bellek dar, çok büyük dizin | IVF + ürün nicemleme (PQ) ya da int8 vektör |
| Süzgeçli arama (yalnız bir kategori) | Önce süzgeç, sonra kaba kuvvet; ya da süzgeci destekleyen dizin |
| Sık güncellenen küçük dizin | Kaba kuvvet; ANN dizinini yeniden kurma maliyetinden kaçının |

## Boyut ve depolama

```python calistir
for count in (100_000, 1_000_000):
    for dim in (384, 768, 1024):
        cells = [f"{name} {count * dim * size / 2**20:7.0f} MiB" for name, size in (("float32", 4), ("float16", 2), ("int8", 1))]
        print(f"{count:<9,} × {dim:4d}: ".replace(",", ".") + "  ".join(cells))
```

```cikti
100.000   ×  384: float32     146 MiB  float16      73 MiB  int8      37 MiB
100.000   ×  768: float32     293 MiB  float16     146 MiB  int8      73 MiB
100.000   × 1024: float32     391 MiB  float16     195 MiB  int8      98 MiB
1.000.000 ×  384: float32    1465 MiB  float16     732 MiB  int8     366 MiB
1.000.000 ×  768: float32    2930 MiB  float16    1465 MiB  int8     732 MiB
1.000.000 × 1024: float32    3906 MiB  float16    1953 MiB  int8     977 MiB
```

Kaba kuvvet aramada bellek = vektör sayısı × boyut × bayt; ANN dizinleri bunun üstüne ek yapı ister. Daha küçük
boyut ve int8 nicemleme belleği düşürür ama kaliteyi biraz düşürebilir: değişiklikten sonra recall@k'yı yeniden
ölçün. Havuzdaki ölçüm: 100 bin × 768 boyutta kaba kuvvet arama ~22 ms, matris ~293 MB (`yz` temeli, K-11).

## Değerlendirme

Gömme modelini ya da arama ayarını değiştirmeden önce küçük bir değerlendirme kümesi kurun:

1. Gerçek kullanıcı sorgularından 50–200 tane seçin.
2. Her sorgu için ilgili belgeleri işaretleyin (birden çok olabilir).
3. Derlem **gerçek büyüklükte** olsun: az rakip belgeyle ölçüm iyimserdir.
4. recall@k (k = sonraki adıma giden belge sayısı, ör. 5 ya da 10), MRR ve nDCG@k hesaplayın.
5. Her değişiklikte (model, parça boyu, normalleştirme, ANN ayarı) aynı kümeyle önce/sonra karşılaştırın.

Ölçüt tanımları ve güven aralığı: [değerlendirme ölçütleri](degerlendirme-olcutleri.md).

## Farklı modellerin vektörlerini karıştırmak

İki model aynı anlamı farklı eksenlerde kodlar. Belgeler bir modelle, sorgular ötekiyle gömülürse:

```python calistir
import math
import random

random.seed(34)
DIM, ITEMS = 8, 200
meaning = [[random.gauss(0, 1) for _ in range(DIM)] for _ in range(ITEMS)]
unit = lambda v: [x / math.sqrt(sum(y * y for y in v)) for x in v]
perm, signs = random.sample(range(DIM), DIM), [random.choice((-1, 1)) for _ in range(DIM)]
model_a = lambda v: unit(v)  # A modeli
model_b = lambda v: unit([signs[i] * v[perm[i]] for i in range(DIM)])  # B: aynı bilgi, başka eksenler
dot = lambda a, b: sum(x * y for x, y in zip(a, b))


def recall_at_1(query_model, doc_model):
    docs = [doc_model(m) for m in meaning]
    hits = 0
    for i, m in enumerate(meaning):
        q = query_model([x + random.gauss(0, 0.3) for x in m])  # sorgu: anlamın gürültülü hâli
        hits += max(range(ITEMS), key=lambda j: dot(q, docs[j])) == i
    return hits / ITEMS


print(f"sorgu A, belgeler A: recall@1 {recall_at_1(model_a, model_a):.2f}")
print(f"sorgu A, belgeler B: recall@1 {recall_at_1(model_a, model_b):.2f}")
```

```cikti
sorgu A, belgeler A: recall@1 0.94
sorgu A, belgeler B: recall@1 0.01
```

Kod hata vermez, sonuç sessizce çöpe döner. Model değiştiğinde (sürüm yükseltme dahil) **bütün dizin yeniden
gömülür**; dizin dosyasının yanında model adı, sürümü, boyutu ve normalleştirme bilgisi saklanır ve sorgu anında
denetlenir.

## Alana uydurma

| Sorun | İlk çare | Sonra |
| --- | --- | --- |
| Alan terimleri (ürün kodu, mevzuat maddesi) kaçıyor | Sözcük tabanlı arama (BM25) ile karma arama | Gömme modeline ince ayar |
| Türkçe sorgular zayıf | Çok dilli ya da Türkçe destekli bir model; ASCII'leştirilmiş yazımı ("cok guzel") da sınayın | İnce ayar |
| Sorgu kısa, belge uzun | Modelin sorgu/belge öneklerini kullanın (model kartına göre) | Sorgu-belge çiftleriyle ince ayar |
| Benzer ama yanlış belgeler üstte | Yeniden sıralayıcı (çapraz kodlayıcı) | Zor olumsuzlarla ince ayar |
| Uzun belgeler kayboluyor | Parçalama (ör. paragraf), parça başına gömme | Parça boyunu değerlendirmeyle seçin |

İnce ayar için birkaç yüz–birkaç bin (sorgu, ilgili belge) çifti ve önce/sonra ölçümü gerekir; havuzda hazır hat
vardır (`ince-ayar` temeli, `gomme` görevi). RAG tasarımı ve getirme değerlendirmesi `85-llm` kümesindedir.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Sonuçlar alakasız, hata yok | Sorgu ve belgeler farklı modelle/sürümle gömülmüş | Dizinle birlikte model kimliğini saklayın ve denetleyin |
| Hep uzun belgeler ya da popüler öğeler üstte | Normalleştirmesiz iç çarpım | L2 normalleştirme |
| Model güncellendi, kalite düştü | Eski dizin yeni sorgularla aranıyor | Yeniden gömme; dizin sürümleme |
| Uzun belgede ilgili bölüm bulunmuyor | Model azami uzunluğu aştı, sessizce kırpıldı | Parçalayın; belirteç sayısını denetleyin |
| Önek isteyen model önek almadan kullanıldı | Model kartı okunmadı | Sorgu/belge öneklerini ekleyin |
| Değerlendirmede çok iyi, canlıda zayıf | Derlem küçük, sorgular yapay | Gerçek sorgular, gerçek boyutta derlem |
| ANN'e geçince bazı sonuçlar kayboldu | Yaklaşık aramanın recall'ı düşük | `nprobe`/`ef` artırın; ANN recall'ını ölçün |
| Aynı belge birkaç kez dönüyor | Dizinde yinelenen parçalar | Dizinlemeden önce tekilleştirin |
| Bellek doldu | Boyut × sayı × 4 bayt hesaplanmadı | float16/int8; daha küçük model; ANN + nicemleme |

## Denetim listesi

- [ ] Sorgu ve belgeler aynı model, sürüm, önek ve normalleştirmeyle gömülüyor; bu bilgi dizinle saklanıyor.
- [ ] Vektörler L2 normalleştirildi; arama ölçüsü modelin eğitim ölçüsüyle uyumlu.
- [ ] Belge uzunluğu modelin azami uzunluğunu aşmıyor (parçalama yapıldı).
- [ ] Bellek hesabı yapıldı: sayı × boyut × bayt (+ ANN ek yükü).
- [ ] Gerçek sorgulardan değerlendirme kümesi var; recall@k ve MRR ölçülüyor.
- [ ] ANN kullanılıyorsa kesin aramaya göre recall ölçüldü ve ayar seçildi.
- [ ] Model değişikliğinde yeniden gömme ve önce/sonra karşılaştırması planlandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Gömmeleri L2 normalleştir, iç çarpımla ara. Dizin dosyasına model adı, boyut ve
  normalleştirme bilgisini yaz; sorgu anında aynı olduğunu denetle. Değişiklikten önce ve sonra
  `degerlendirme.jsonl` üzerinde recall@5 ve MRR hesapla."
- **Modelin tipik hatası:** Sorgu ve belge için farklı model kullanır; normalleştirmeyi unutur; uzun belgeyi tek
  parça gömer; 10 bin vektör için gereksiz bir ANN kütüphanesi kurar; ANN recall'ını getirme recall'ı sanır.
- **Çıktıda denetleyin:** gömme fonksiyonunun tek bir yerde tanımlı olması; dizin üst bilgisi; değerlendirme
  derleminin boyutu; model değişince yeniden gömme adımı.

## İlgili

- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — recall@k, MRR, nDCG · [Öneri sistemleri](oneri-sistemleri.md) ·
  [Metin sınıflandırma](metin-siniflandirma.md) · [Transformer](transformer.md)
- Bağımlılıksız karma gömme ve sağlayıcılar: [`yz/rag/gomme.py`](../../yz/yz/rag/gomme.py); kaba kuvvet vektör deposu:
  [`vektor_deposu.py`](../../yz/yz/rag/vektor_deposu.py); getirme ölçümü: [`degerlendir.py`](../../yz/yz/rag/degerlendir.py);
  ölçülen arama süreleri: [`yz/docs/KARARLAR.md`](../../yz/docs/KARARLAR.md) (K-11)
- Gömme modeline ince ayar ve önce/sonra ölçümü: [`ince_ayar/tasks/embedding/evaluate.py`](../../ince-ayar/ince_ayar/tasks/embedding/evaluate.py),
  ölçütler: [`metrics/retrieval.py`](../../ince-ayar/ince_ayar/metrics/retrieval.py), ayarlar:
  [`ince-ayar/docs/HIPERPARAMETRE.md`](../../ince-ayar/docs/HIPERPARAMETRE.md)
- RAG: [RAG tasarımı](../85-llm/rag-tasarimi.md), [RAG değerlendirme](../85-llm/rag-degerlendirme.md)
