---
baslik: Bilgi kuramı
ozet: Bilgi miktarı, entropi, çapraz entropi ve KL ıraksaması, şaşkınlık (perplexity) ve karakter başına bit, karşılıklı bilgi, sıkıştırmanın sınırı; dil modeli değerlendirmesinde hangi ölçünün ne zaman karşılaştırılabileceği.
etiketler: [bilgi-kurami, entropi, capraz-entropi, kl-iraksamasi, saskinlik, sikistirma]
duzey: orta
guncellik: 2026-11
---

# Bilgi kuramı

> Bu notu ne zaman okumalı: bir modelin kaybını (log-kayıp, çapraz entropi) ya da bir dil modelinin şaşkınlığını
> yorumlarken; iki dil modelini karşılaştırırken; "bu veri ne kadar sıkışır", "bu sütun hedef hakkında bilgi
> taşıyor mu" sorularında; sıcaklık ayarının ne yaptığını anlamak istediğinizde.

## Temel fikir

- Olasılığı `p` olan bir sonucun **bilgi miktarı** (şaşırtıcılığı) `−log₂ p` bittir. Kesin olay 0 bit, yazı-tura
  1 bit, 1/8 olasılıklı sonuç 3 bit.
- **Entropi** `H(p) = Σ −pᵢ log pᵢ`: ortalama şaşırtıcılık, yani belirsizlik. Aynı zamanda kayıpsız
  sıkıştırmada sembol başına gereken **en az ortalama bit** sayısıdır; hiçbir sıkıştırıcı bunun altına inemez.
- **Çapraz entropi** `H(p, q) = Σ −pᵢ log qᵢ`: veri `p`'den gelirken `q`'ya göre kodlarsanız ödediğiniz ortalama
  bit. Sınıflandırmadaki log-kayıp ve dil modeli eğitim kaybı budur.
- **KL ıraksaması** `KL(p‖q) = H(p, q) − H(p) ≥ 0`: yanlış modelin fazladan maliyeti. Simetrik değildir ve
  `p > 0` iken `q = 0` ise sonsuzdur.
- **Şaşkınlık** (perplexity) `= e^(ortalama kayıp)` (kayıp nat ise) `= 2^(bit cinsinden kayıp)`: modelin her
  adımda "kaç eşit olası seçenek arasında kararsız" olduğu. Belirteçleyiciye bağlıdır.
- **Logaritmanın tabanı birimdir**: `log₂` → bit, `ln` → nat (1 nat ≈ 1,443 bit). Kütüphaneler (PyTorch kaybı)
  genellikle `ln` kullanır.

## Karar tablosu

| Soru                                           | Ölçü                                  | Dikkat                                                       |
| ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| "Bu dağılım ne kadar belirsiz?"                | Entropi                               | Küçük örneklemden kestirilen entropi düşük çıkar             |
| "Modelin olasılıkları gerçeğe ne kadar yakın?" | Çapraz entropi / log-kayıp            | Aynı veri kümesinde karşılaştırın                            |
| "İki dağılımın farkı?" (yön önemli)            | KL ıraksaması                         | `q = 0` olan yerde sonsuz; yumuşatın                         |
| "İki dağılımın farkı?" (simetrik, sınırlı)     | Jensen–Shannon ıraksaması             | Değeri 0–1 bit arası                                         |
| Aynı belirteçleyicili iki dil modeli           | Şaşkınlık                             | Aynı sınama metni, aynı bağlam uzunluğu                      |
| Farklı belirteçleyicili iki dil modeli         | Karakter (ya da bayt) başına bit      | Şaşkınlık burada yanıltır                                    |
| "Bu sütun hedef hakkında bilgi taşıyor mu?"    | Karşılıklı bilgi                      | Doğrusal olmayan ilişkiyi de yakalar; korelasyondan geniş    |
| "Bu veri ne kadar sıkışabilir?"                | Entropi (sembol başına bit) × uzunluk | Bağımlılıklı veride sembol entropisi üst sınırdır, alt değil |

## Entropi

```python calistir
import math
import random


def entropy(probs):
    return sum(-p * math.log2(p) for p in probs if p > 0)


assert entropy([0.5, 0.5]) == 1.0  # adil para: 1 bit
assert round(entropy([0.9, 0.1]), 3) == 0.469  # hileli para: daha az belirsiz
assert entropy([1 / 8] * 8) == 3.0  # 8 eşit seçenek: 3 bit
assert entropy([1.0]) == 0.0  # kesin sonuç: bilgi yok
assert entropy([0.25] * 4) > entropy([0.7, 0.1, 0.1, 0.1])  # eşit dağılım en belirsizdir

# Örneklemden kestirilen entropi düşük çıkar: 64 eşit sembolden 30 çekiliş
rng = random.Random(0)
sample = [rng.randrange(64) for _ in range(30)]
counts = {s: sample.count(s) / len(sample) for s in set(sample)}
assert entropy(counts.values()) <= math.log2(30) < 6.0  # gerçek değer 6 bit
print("tamam")
```

## Çapraz entropi, KL ve log-kayıp

```python calistir
import math

p = [0.7, 0.2, 0.1]  # gerçek dağılım
q = [0.5, 0.3, 0.2]  # modelin dağılımı


def H(a):
    return sum(-x * math.log2(x) for x in a if x > 0)


def cross_entropy(a, b):
    return sum(-x * math.log2(y) for x, y in zip(a, b) if x > 0)


def kl(a, b):
    return sum(x * math.log2(x / y) for x, y in zip(a, b) if x > 0)


assert cross_entropy(p, q) > H(p)  # yanlış modelle kodlamak pahalı
assert math.isclose(kl(p, q), cross_entropy(p, q) - H(p))  # KL = fazladan maliyet
assert kl(p, p) == 0 and kl(p, q) > 0
assert not math.isclose(kl(p, q), kl(q, p))  # simetrik değil

# Model gerçekleşen bir sonuca 0 olasılık verirse kayıp sonsuz olur
try:
    cross_entropy(p, [0.8, 0.2, 0.0])
    raise AssertionError("hata bekleniyordu")
except ValueError:  # log2(0) → math domain error
    pass
eps = 1e-12  # kırpma: olasılıkları [eps, 1−eps] aralığına sıkıştırmak sonsuzu önler
clipped = [min(max(x, eps), 1 - eps) for x in [0.8, 0.2, 0.0]]
assert cross_entropy(p, clipped) > 3  # sonlu ama çok büyük: ağır ceza

# Sınıflandırmada log-kayıp: doğru sınıfa verilen olasılıkların −log ortalaması (nat)
given = [0.9, 0.6, 0.95, 0.2]  # dört örnekte doğru sınıfa verilen olasılık
log_loss = sum(-math.log(x) for x in given) / len(given)
assert round(log_loss, 3) == 0.569
assert -math.log(0.2) / (log_loss * len(given)) > 0.7  # tek kötü tahmin, kaybın %70'inden fazlası
assert round(math.log(3), 3) == 1.099  # 3 sınıfta "hiçbir şey bilmeyen" modelin kaybı: ln 3
print("tamam")
```

Log-kayıp emin ve yanlış tahmini çok sert cezalandırır: doğru sınıfa 0,2 verilen tek örnek, dört örneklik
kaybın %70'inden fazlasını oluşturuyor. Rastgele bir modelin kaybı `ln K`'dır (`K` sınıf); eğitimin ilk
adımındaki kayıp bundan çok farklıysa başlatma ya da kayıp hesabında hata vardır.

## Şaşkınlık ve karakter başına bit

Dil modelinin kaybı, sınama metnindeki her gerçek sonraki belirtece verdiği olasılığın `−ln` ortalamasıdır.
Şaşkınlık `e^kayıp`. Ama belirteç sayısı belirteçleyiciye bağlıdır; farklı belirteçleyicili iki model ancak
**aynı metnin toplam bilgisini karakter sayısına bölerek** karşılaştırılır.

```python calistir
import math

# Tek düze tahmin yapan (her şeye eşit olasılık veren) model: şaşkınlık = sözlük boyu
vocab = 50_000
assert math.isclose(math.exp(-math.log(1 / vocab)), vocab)

# Aynı 15 karakterlik metin, iki model:
# A metni 3 belirtece böler, toplam kayıp 12,0 nat; B 6 belirtece böler, toplam kayıp 13,0 nat
chars = 15
ppl_a, ppl_b = math.exp(12.0 / 3), math.exp(13.0 / 6)
bpc_a, bpc_b = 12.0 / chars / math.log(2), 13.0 / chars / math.log(2)
print(f"şaşkınlık  A {ppl_a:.1f} | B {ppl_b:.1f}")
print(f"kar./bit   A {bpc_a:.3f} | B {bpc_b:.3f}")
assert ppl_b < ppl_a  # şaşkınlığa bakan B'yi seçer...
assert bpc_a < bpc_b  # ...ama aynı metni A daha az bitle "açıklıyor": A daha iyi


# Sıcaklık, dağılımın entropisini ayarlar: düşük sıcaklık belirlenimci, yüksek sıcaklık dağınık
def softmax_entropy(logits, temperature):
    scaled = [x / temperature for x in logits]
    m = max(scaled)
    e = [math.exp(x - m) for x in scaled]
    total = sum(e)
    return sum(-(x / total) * math.log2(x / total) for x in e if x > 0)


logits = [4.0, 2.0, 1.0, 0.5]
cold, normal, hot = (softmax_entropy(logits, t) for t in (0.2, 1.0, 5.0))
assert cold < 0.01 < normal < hot < math.log2(len(logits))
```

```cikti
şaşkınlık  A 54.6 | B 8.7
kar./bit   A 1.154 | B 1.250
```

Havuzdaki gerçek değerlendirme `dil-modeli` temelindedir: şaşkınlık ve karakter başına bit birlikte raporlanır;
örnek model için doğrulama verisinde şaşkınlık 51,2, karakter başına 1,83 bit yazılıdır
([`dil-modeli/README.md`](../../dil-modeli/README.md)). Örnekleme ayarları (sıcaklık, top-p):
[dil modeli nasıl çalışır](../85-llm/llm-nasil-calisir.md).

## Karşılıklı bilgi: sütun hedef hakkında ne söylüyor

`I(X; Y) = H(Y) − H(Y | X)`: `X`'i bilmek `Y`'deki belirsizliği ne kadar azaltıyor. Bağımsızsa 0, `X` `Y`'yi
tam belirliyorsa `H(Y)`.

```python calistir
import math
from collections import Counter


def mutual_information(pairs):
    n = len(pairs)
    joint, xs, ys = Counter(pairs), Counter(x for x, _ in pairs), Counter(y for _, y in pairs)
    return sum((c / n) * math.log2((c / n) / ((xs[x] / n) * (ys[y] / n))) for (x, y), c in joint.items())


# (e-postayı açtı mı, satın aldı mı)
independent = [(0, 0)] * 40 + [(0, 1)] * 10 + [(1, 0)] * 40 + [(1, 1)] * 10
informative = [(0, 0)] * 45 + [(0, 1)] * 5 + [(1, 0)] * 20 + [(1, 1)] * 30
copy_of_label = [(y, y) for _, y in informative]
assert abs(mutual_information(independent)) < 1e-12
assert 0.1 < mutual_information(informative) < 1.0
label_entropy = -sum(p * math.log2(p) for p in (35 / 100, 65 / 100))
assert math.isclose(mutual_information(copy_of_label), label_entropy)  # en fazla H(Y)

# Korelasyonun kaçırdığı ilişki: y = x² (simetrik), doğrusal korelasyon 0, bilgi tam
pairs = [(x, x * x) for x in (-2, -1, 0, 1, 2)] * 20
xs, ys = [x for x, _ in pairs], [y for _, y in pairs]
mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
assert sum((x - mx) * (y - my) for x, y in pairs) == 0  # kovaryans 0
assert mutual_information(pairs) > 1.0  # ama x, y'yi tamamen belirliyor
print("tamam")
```

Hedefle karşılıklı bilgisi şüpheli derecede yüksek bir sütun (neredeyse `H(Y)`) çoğu zaman sızıntıdır:
hedeften sonra oluşan bir bilgi ([veri sızıntısı](../80-ml/veri-sizintisi.md)).

## Sıkıştırma: entropi alt sınırdır

```python calistir
import bz2
import heapq
import lzma
import math
import random
import zlib

probs = {"a": 0.5, "b": 0.25, "c": 0.125, "d": 0.125}
H = sum(-p * math.log2(p) for p in probs.values())
assert H == 1.75  # sembol başına en az 1,75 bit

rng = random.Random(0)
n = 200_000
text = "".join(rng.choices(list(probs), weights=list(probs.values()), k=n)).encode()
bound = H * n / 8  # bayt cinsinden alt sınır
for compress in (lambda b: zlib.compress(b, 9), bz2.compress, lzma.compress):
    size = len(compress(text))
    assert bound < size < 1.3 * bound  # hiçbiri sınırın altına inemez; iyileri yaklaşır


def huffman(freqs):
    """En kısa ortalama uzunluklu önek kodu."""
    heap = [(w, i, {s: ""}) for i, (s, w) in enumerate(freqs.items())]
    heapq.heapify(heap)
    order = len(heap)
    while len(heap) > 1:
        w1, _, c1 = heapq.heappop(heap)
        w2, _, c2 = heapq.heappop(heap)
        merged = {s: "0" + c for s, c in c1.items()} | {s: "1" + c for s, c in c2.items()}
        heapq.heappush(heap, (w1 + w2, order, merged))
        order += 1
    return heap[0][2]


code = huffman(probs)
assert sum(probs[s] * len(c) for s, c in code.items()) == H  # olasılıklar 2'nin kuvveti: tam sınıra iner
skewed = {"a": 0.4, "b": 0.3, "c": 0.2, "d": 0.1}
avg = sum(skewed[s] * len(c) for s, c in huffman(skewed).items())
H2 = sum(-p * math.log2(p) for p in skewed.values())
assert H2 <= avg < H2 + 1  # Huffman her zaman [H, H+1) aralığında

noise = random.Random(1).randbytes(10_000)  # rastgele veri: entropi bayt başına 8 bit
assert len(zlib.compress(noise, 9)) > len(noise)  # sıkışmaz
print("tamam")
```

Pratik sonuçlar: şifreli ya da zaten sıkıştırılmış veri (JPEG, MP4, ZIP) yeniden sıkışmaz; önce sıkıştırın, sonra
şifreleyin. "Sembol başına entropi", sembollerin bağımsız olduğu varsayımıyla hesaplanır; gerçek metinde bağlam
(önceki harfler) belirsizliği azaltır, iyi sıkıştırıcı ve iyi dil modeli bu yüzden sınırı daha da aşağı çeker.

## Tuzaklar

| Belirti                                                  | Neden                                                  | Çözüm                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| İki raporda aynı modelin kaybı 1,44 kat farklı           | Biri bit (`log₂`), öteki nat (`ln`)                    | Birimi her sayının yanına yazın                         |
| Yeni belirteçleyicili model şaşkınlıkta "çok daha iyi"   | Şaşkınlık belirteç başınadır; belirteçler farklı       | Karakter/bayt başına bit ile karşılaştırın              |
| Şaşkınlıklar farklı sınama metinlerinde karşılaştırılmış | Metnin zorluğu farklı                                  | Aynı metin, aynı bağlam uzunluğu, aynı ön işleme        |
| Kayıp `inf`/`nan`                                        | Modelin 0 olasılık verdiği sonuç gerçekleşti; `log(0)` | Olasılığı kırpın ya da kaybı logit üzerinden hesaplayın |
| KL ıraksaması sonsuz çıktı                               | `q`, `p`'nin desteklediği bir sonuca 0 veriyor         | Yumuşatma (Laplace), ya da Jensen–Shannon               |
| `KL(p‖q)` ile `KL(q‖p)` karıştırıldı                     | Simetrik değil; yönler farklı davranış ödüllendirir    | Hangisinin "gerçek" dağılım olduğunu yazın              |
| Küçük örneklemde entropi beklenenden düşük               | Görülmeyen semboller hesaba girmiyor                   | Daha çok veri; yanlılık düzeltmeli kestirici            |
| Şifreli veriyi sıkıştırmak hiçbir şey kazandırmadı       | Şifreli veri rastgele görünür                          | Önce sıkıştır, sonra şifrele                            |
| Bir sütunun hedefle karşılıklı bilgisi neredeyse `H(Y)`  | Büyük olasılıkla sızıntı                               | Sütunun tahmin anında bilinip bilinmediğini denetleyin  |

## Denetim listesi

- [ ] Her entropi/kayıp sayısının birimi (bit ya da nat) yazılı.
- [ ] Dil modelleri aynı sınama metninde, aynı bağlam uzunluğuyla değerlendirilmiş.
- [ ] Belirteçleyiciler farklıysa karakter ya da bayt başına bit raporlanmış.
- [ ] Olasılıklar log alınmadan önce kırpılıyor ya da kayıp logit üzerinden hesaplanıyor.
- [ ] İlk adım kaybı `ln K` (sınıf ya da sözlük boyu) ile karşılaştırılmış.
- [ ] KL kullanılan yerde yön ve sıfır olasılık durumu ele alınmış.
- [ ] Sıkıştırma beklentisi entropi sınırıyla kıyaslanmış; şifreli/sıkıştırılmış veri yeniden sıkıştırılmıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kaybı nat cinsinden hesapla, şaşkınlığı `exp(ortalama kayıp)` olarak ver; ayrıca karakter
  başına biti `toplam kayıp / karakter sayısı / ln 2` ile raporla. Olasılıkların log'unu almadan önce kırp."
- **Modelin tipik hatası:** `log2` ile `ln`'yi karıştırır; şaşkınlığı farklı belirteçleyiciler arasında karşılaştırır;
  `log(softmax(x))` yazar; KL'yi ters yönde hesaplar; ortalama kayıp yerine toplam kaybın üstelini alır.
- **Çıktıda denetleyin:** birim; şaşkınlığın sözlük boyundan büyük olmadığı (büyükse model tek düzeden kötü);
  rastgele model için kaybın `ln V` çıktığı.
- **Akıl sağlığı sınaması isteyin:** "eşit olasılıklı model için şaşkınlık = sözlük boyu" testini yazdırın.

## İlgili

- [Olasılık temelleri](olasilik-temelleri.md): olasılık, beklenen değer
- [Geri yayılım matematiği](geri-yayilim-matematigi.md): softmax + çapraz entropinin türevi
- [Kombinatorik](kombinatorik.md): sıkıştırmanın güvercin yuvası sınırı
- [Dil modeli nasıl çalışır](../85-llm/llm-nasil-calisir.md): belirteç, sıcaklık, örnekleme
- [Kalibrasyon ve olasılık](../80-ml/kalibrasyon-ve-olasilik.md): log-kayıp, Brier ve olasılıkların güvenilirliği
- [Korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md): ilişki bulmak neden-sonuç değildir
- Şaşkınlık ve karakter başına bit hesabı: [`dil-modeli/dil_modeli/evaluate.py`](../../dil-modeli/dil_modeli/evaluate.py);
  eğitim kaybı: [`dil-modeli/docs/MIMARI.md`](../../dil-modeli/docs/MIMARI.md) → "Eğitim"
- Log-kayıp, Brier, kalibrasyon: [`ml-temel/ml_temel/olcut/probability.py`](../../ml-temel/ml_temel/olcut/probability.py)
