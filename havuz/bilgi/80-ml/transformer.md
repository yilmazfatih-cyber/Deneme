---
baslik: Transformer ve dikkat
ozet: Dikkat hesabının saf Python'la adım adım gösterimi, nedensel maske, KV önbelleği, konum bilgisi, çok başlı dikkat, artık + norm, kodlayıcı ile çözücü farkı ve boyut/hesap/bellek ölçeklenmesi.
etiketler: [derin-ogrenme, transformer, dikkat, kv-onbellegi, dil-modeli]
duzey: ileri
guncellik: 2026-11
---

# Transformer ve dikkat

> Bu notu ne zaman okumalı: bir transformer kodunu okurken ya da değiştirirken; maske, konum, önbellek
> hatası ararken; bir modelin belleğe ve süreye sığıp sığmayacağını hesaplarken.

## Temel fikir

Transformer bir diziyi (belirteçler) katman katman işler. Her katmanda iki adım vardır:

1. **Dikkat (attention):** her konum, öteki konumlardan "ne kadar bilgi alacağını" içeriğe bakarak seçer ve
   onların değerlerinin ağırlıklı ortalamasını alır. Konumlar arası bilgi yalnız burada akar.
2. **İleri besleme (MLP):** her konum kendi vektörünü tek başına dönüştürür.

Her adım bir **artık bağlantıyla** (`x + f(norm(x))`) eklenir. Dikkat formülü:

```text
Dikkat(Q, K, V) = softmax( Q·Kᵀ / √d  +  M ) · V
Q = X·W_q (sorgu: "ne arıyorum")   K = X·W_k (anahtar: "neyim")   V = X·W_v (değer: "ne veririm")
M: maske (nedensel modelde gelecek konumlar −∞)
```

Dikkat **sıra bilmez**: konum bilgisi ayrıca verilmezse "köpek adamı ısırdı" ile "adam köpeği ısırdı" aynı
vektör kümesidir.

## Adım adım dikkat

Üç belirteç, boyut 2. Sorgu, anahtar ve değer matrisleri elle verilmiş:

```python calistir
import math

Q = [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]
K = [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]
V = [[1.0, 0.0], [0.0, 2.0], [3.0, 3.0]]
d = len(Q[0])


def softmax(row):
    top = max(row)  # en büyüğü çıkarmak taşmayı önler
    exps = [math.exp(v - top) for v in row]
    return [e / sum(exps) for e in exps]


scores = [[sum(q * k for q, k in zip(qi, kj)) / math.sqrt(d) for kj in K] for qi in Q]
weights = [softmax(row) for row in scores]
output = [[sum(w * v[c] for w, v in zip(row, V)) for c in range(d)] for row in weights]
for i in range(3):
    print(f"konum {i}: skor {[round(s, 3) for s in scores[i]]}  ağırlık {[round(w, 3) for w in weights[i]]}"
          f"  çıktı {[round(o, 3) for o in output[i]]}")
assert all(abs(sum(row) - 1) < 1e-12 for row in weights)
```

```cikti
konum 0: skor [0.707, 0.0, 0.707]  ağırlık [0.401, 0.198, 0.401]  çıktı [1.604, 1.599]
konum 1: skor [0.0, 0.707, 0.707]  ağırlık [0.198, 0.401, 0.401]  çıktı [1.401, 2.006]
konum 2: skor [0.707, 0.707, 1.414]  ağırlık [0.248, 0.248, 0.503]  çıktı [1.759, 2.007]
```

Her satırın ağırlıkları toplamı 1'dir; çıktı, değerlerin bu ağırlıklarla ortalamasıdır. `√d` ile bölme, boyut
büyüdükçe skorların büyüyüp softmax'ı tek bir konuma kilitlemesini (doygunluk) önler.

## Nedensel maske

Metin üreten modelde (çözücü) her konum yalnız kendisine ve öncesine bakabilir; yoksa eğitimde "sonraki
belirteci" görerek kopya çeker. Maskenin işini sınamanın yolu: **gelecekteki bir girdiyi değiştirip** önceki
çıktıların değişmediğini görmek.

```python calistir
import math
import random

random.seed(29)


def attention(X, causal):
    d = len(X[0])
    out = []
    for i, q in enumerate(X):
        visible = range(i + 1) if causal else range(len(X))
        scores = [sum(a * b for a, b in zip(q, X[j])) / math.sqrt(d) for j in visible]
        top = max(scores)
        w = [math.exp(s - top) for s in scores]
        out.append([sum(wj * X[j][c] for wj, j in zip(w, visible)) / sum(w) for c in range(d)])
    return out


X = [[random.gauss(0, 1) for _ in range(4)] for _ in range(5)]
changed = [row[:] for row in X]
changed[4] = [9.0, 9.0, 9.0, 9.0]  # yalnız son (gelecekteki) belirteç değişti
for causal in (True, False):
    before, after = attention(X, causal), attention(changed, causal)
    same = all(math.isclose(a, b) for i in range(4) for a, b in zip(before[i], after[i]))
    print(f"{'nedensel' if causal else 'maskesiz'}: ilk 4 konumun çıktısı değişmedi mi? {same}")
```

```cikti
nedensel: ilk 4 konumun çıktısı değişmedi mi? True
maskesiz: ilk 4 konumun çıktısı değişmedi mi? False
```

Toplu işlemede (batch) bir de **dolgu maskesi** (padding mask) vardır: kısa dizilere eklenen dolgu belirteçlerine
dikkat edilmez. İki maske karıştırılırsa model ya geleceği görür ya da gerçek belirteçleri yok sayar.

## KV önbelleği

Üretimde her yeni belirteç için bütün diziyi baştan hesaplamak gereksizdir: önceki konumların anahtar ve
değerleri değişmez (nedensel maske sayesinde). Önbellek onları saklar; yeni adımda yalnız yeni belirtecin sorgusu,
anahtarı ve değeri hesaplanır.

```python calistir
import math
import random

random.seed(30)
D = 4
Wq, Wk, Wv = ([[random.gauss(0, 0.5) for _ in range(D)] for _ in range(D)] for _ in range(3))
tokens = [[random.gauss(0, 1) for _ in range(D)] for _ in range(6)]
project = lambda x, W: [sum(a * w for a, w in zip(x, column)) for column in zip(*W)]


def attend(q, keys, values):
    scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(D) for k in keys]
    top = max(scores)
    w = [math.exp(s - top) for s in scores]
    return [sum(wi * v[c] for wi, v in zip(w, values)) / sum(w) for c in range(D)]


cache_k, cache_v, cached, full_ops, cache_ops = [], [], [], 0, 0
for t, x in enumerate(tokens, start=1):
    prefix = tokens[:t]  # önbelleksiz: her adımda bütün öneki yeniden izdüşür
    keys, values = [project(p, Wk) for p in prefix], [project(p, Wv) for p in prefix]
    full = attend(project(x, Wq), keys, values)
    full_ops += 3 * t
    cache_k.append(project(x, Wk))  # önbellekli: yalnız yeni belirteç
    cache_v.append(project(x, Wv))
    cached.append(attend(project(x, Wq), cache_k, cache_v))
    cache_ops += 3
    assert all(math.isclose(a, b) for a, b in zip(full, cached[-1]))
print(f"6 adımda izdüşüm sayısı: önbelleksiz {full_ops}, önbellekli {cache_ops}; çıktılar aynı")
```

```cikti
6 adımda izdüşüm sayısı: önbelleksiz 63, önbellekli 18; çıktılar aynı
```

Önbellek hesabı azaltır ama **bellek** ister: her katmanda, her konum için anahtar ve değer vektörü. Uzun bağlamda
sınır çoğu zaman ağırlıklar değil KV önbelleğidir (aşağıdaki hesap). Bağlam penceresi dolunca önbellek ya kaydırılır
ya da yeniden kurulur; kodda bu durumun ayrıca sınanması gerekir.

## Konum bilgisi

```python calistir
import math
import random

random.seed(31)


def attention(X):
    out = []
    for q in X:
        scores = [sum(a * b for a, b in zip(q, k)) for k in X]
        top = max(scores)
        w = [math.exp(s - top) for s in scores]
        out.append([sum(wi * x[c] for wi, x in zip(w, X)) / sum(w) for c in range(len(q))])
    return out


X = [[random.gauss(0, 1) for _ in range(3)] for _ in range(4)]
order = [2, 0, 3, 1]
permuted_then = attention([X[i] for i in order])
then_permuted = [attention(X)[i] for i in order]
equivariant = all(math.isclose(a, b) for r1, r2 in zip(permuted_then, then_permuted) for a, b in zip(r1, r2))
print(f"konum bilgisi yokken sırayı karıştırmak çıktıyı yalnız karıştırır: {equivariant}")


def rotate(vector, position, theta=0.3):  # RoPE: 2 boyutlu bir çifti konum × açı kadar döndür
    angle = position * theta
    x, y = vector
    return [x * math.cos(angle) - y * math.sin(angle), x * math.sin(angle) + y * math.cos(angle)]


q, k = [0.8, -0.4], [0.5, 0.9]
dot = lambda m, n: sum(a * b for a, b in zip(rotate(q, m), rotate(k, n)))
print(f"RoPE skoru yalnız uzaklığa bağlı: (5,2)={dot(5, 2):.4f}  (13,10)={dot(13, 10):.4f}  (3,2)={dot(3, 2):.4f}")
assert math.isclose(dot(5, 2), dot(13, 10))
```

```cikti
konum bilgisi yokken sırayı karıştırmak çıktıyı yalnız karıştırır: True
RoPE skoru yalnız uzaklığa bağlı: (5,2)=0.7455  (13,10)=0.7455  (3,2)=0.3101
```

| Konum yöntemi | Nasıl | Not |
| --- | --- | --- |
| Öğrenilen konum gömmesi | Her konuma bir vektör eklenir | Eğitimdeki en uzun konumun ötesine gidemez |
| Sinüs-kosinüs (sabit) | Farklı frekanslarda dalga eklenir | Parametresiz |
| RoPE (döndürme) | Sorgu ve anahtar konumla döndürülür; skor göreli uzaklığa bağlı olur | Yeni dil modellerinde yaygın; bağlam uzatma yöntemleri buna dayanır |
| ALiBi benzeri yanlılık | Skora uzaklıkla artan ceza eklenir | Daha uzun dizilere genelleme amacı |

## Çok başlı dikkat, artık + norm, blok

- **Çok başlı (multi-head):** `d` boyut `h` başa bölünür; her baş kendi alt uzayında dikkat yapar (biri söz
  dizimini, öteki göndermeyi izleyebilir); sonuçlar birleştirilip `W_o` ile karıştırılır. Hesap maliyeti tek başlı
  dikkatle aynıdır.
- **Gruplu sorgu dikkati (GQA):** birkaç sorgu başı aynı anahtar/değer başını paylaşır; KV önbelleği o oranda küçülür.
- **Blok (ön-norm):** `x ← x + Dikkat(Norm(x))`, `x ← x + MLP(Norm(x))`. MLP genişliği tipik olarak 4·d (SwiGLU'da
  ≈ 8/3·d). Son katmandan sonra norm ve sözlük boyutunda çıkış katmanı (çoğu zaman gömmeyle paylaşılır).

| Yapı | Dikkat | Tipik iş |
| --- | --- | --- |
| Yalnız kodlayıcı (encoder) | İki yönlü (maskesiz) | Sınıflandırma, varlık tanıma, gömme |
| Yalnız çözücü (decoder) | Nedensel | Metin üretimi, sohbet; genel amaçlı dil modelleri |
| Kodlayıcı-çözücü | Kodlayıcı iki yönlü, çözücü nedensel + kodlayıcıya çapraz dikkat | Çeviri, özetleme |

## Boyut, hesap ve bellek ölçeklenmesi

LLaMA tarzı bir çözücünün parametre sayısı, KV önbelleği ve eğitim hesabı (1,1 milyar parametre sınıfında bir
yapılandırma):

```python calistir
V, d, L, heads, kv_heads, d_ff = 32_000, 2048, 22, 32, 4, 5632
d_head = d // heads
d_kv = kv_heads * d_head
per_layer = 2 * d * d + 2 * d * d_kv + 3 * d * d_ff + 2 * d  # q,o + k,v (GQA) + SwiGLU + 2 norm
params = V * d + L * per_layer + d + V * d  # gömme + bloklar + son norm + ayrı çıkış katmanı
print(f"parametre: {params / 1e9:.2f} milyar; ağırlıklar fp16 {params * 2 / 2**30:.1f} GiB, 4 bit ≈ {params * 0.5 / 2**30:.1f} GiB")
for T in (2048, 32_768):
    for name, kv in (("GQA (4 KV başı)", kv_heads), ("tam çok başlı", heads)):
        cache = 2 * L * T * kv * d_head * 2  # K ve V, fp16 (2 bayt), tek dizi
        print(f"bağlam {T:>6}, {name:16s}: KV önbelleği {cache / 2**20:8.0f} MiB")
tokens = 20 * params  # parametre başına ~20 belirteç (yaygın kural)
print(f"eğitim hesabı ≈ 6·N·D = {6 * params * tokens:.1e} kayan nokta işlemi ({tokens / 1e9:.0f} milyar belirteç)")
```

```cikti
parametre: 1.10 milyar; ağırlıklar fp16 2.0 GiB, 4 bit ≈ 0.5 GiB
bağlam   2048, GQA (4 KV başı) : KV önbelleği       44 MiB
bağlam   2048, tam çok başlı   : KV önbelleği      352 MiB
bağlam  32768, GQA (4 KV başı) : KV önbelleği      704 MiB
bağlam  32768, tam çok başlı   : KV önbelleği     5632 MiB
eğitim hesabı ≈ 6·N·D = 1.5e+20 kayan nokta işlemi (22 milyar belirteç)
```

| Büyüyen | Neyle orantılı |
| --- | --- |
| Parametre (ve ağırlık belleği) | L · d² (+ V · d gömme) |
| Belirteç başına ileri hesap | ≈ 2 · parametre (+ bağlamla büyüyen dikkat payı) |
| Eğitim hesabı | ≈ 6 · parametre · belirteç sayısı |
| Dikkatin karesel kısmı | L · T² · d (uzun bağlamda baskın olur) |
| KV önbelleği | 2 · L · T · (KV başı · baş boyutu) · bayt · eşzamanlı dizi |
| Eğitimde etkinleştirme belleği | yığın · T · d · L (+ ara katman); gradyan denetimi azaltır |

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Eğitim kaybı çok düşük, üretim saçma | Nedensel maske yok ya da ters | "Geleceği değiştir, geçmiş değişmesin" testi |
| Toplu üretimde dolgulu diziler bozuk | Dolgu maskesi eksik ya da konumlar dolgu yüzünden kaymış | Soldan dolgu + maske; konumları gerçek belirteçlerden say |
| Önbellekli ve önbelleksiz çıktı farklı | Önbelleğe yanlış konum, RoPE açısı ya da dolgu | Küçük girdide iki yolu karşılaştıran test |
| Softmax `nan` ya da hep tek konum | `√d` ölçeği unutuldu, en büyük değer çıkarılmadı, maske −∞ satırı tamamen kapattı | Ölçek; log-sum-exp; tamamen maskeli satırı özel durum say |
| Bağlamdan uzun girdide çöküş | Konum sınırı aşıldı | Girdiyi kısaltın ya da kaydırmalı pencere; bağlam uzatmayı ayrıca sınayın |
| Bellek uzun bağlamda bitiyor | KV önbelleği ve karesel dikkat | GQA, daha kısa bağlam, önbellek nicemleme, eşzamanlı dizi sayısını azaltma |
| Ağırlık aktarımından sonra çıktılar farklı | Katman adları ya da q/k satır düzeni (RoPE düzeni) farklı | Başvuru gerçeklemeyle logit eşliği testi |

## Denetim listesi

- [ ] Nedensel maske "gelecek değişince geçmiş değişmez" testiyle sınandı.
- [ ] Dolgu maskesi ve nedensel maske birlikte doğru; dolgulu ve dolgusuz tek dizi aynı sonucu veriyor.
- [ ] Önbellekli ve önbelleksiz üretim aynı logitleri veriyor (test).
- [ ] Softmax en büyük değeri çıkararak hesaplanıyor; skorlar `√d` ile ölçekleniyor.
- [ ] Parametre sayısı ve KV önbelleği hedef bağlam ve eşzamanlı dizi sayısı için hesaplandı.
- [ ] Başka bir gerçeklemeye aktarılan ağırlıklar logit eşliğiyle doğrulandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dikkat kodunu değiştirirken şu üç testi ekle: (1) nedensel maske: son belirteci değiştirince
  önceki çıktılar değişmesin; (2) önbellekli ve önbelleksiz üretim aynı logitleri versin; (3) dolgulu toplu girdi,
  tek tek işlenmiş dizilerle aynı sonucu versin."
- **Modelin tipik hatası:** Maskeyi yanlış eksende ya da `0` yerine `-inf` ile karıştırarak uygular; softmax'ı yanlış
  eksende alır; RoPE'yi yalnız sorguya uygular; önbelleğe konum indeksini sıfırdan başlatır; bellek hesabında KV
  önbelleğini unutur.
- **Çıktıda denetleyin:** maskenin biçimi (T × T, üst üçgen), softmax ekseni (son eksen = anahtar konumları),
  önbellekte konum sayacı, dışa aktarımda katman ad eşlemesi.
- Dil modelini kullanma (istem, RAG, yerel çalıştırma) bu notun değil `85-llm` kümesinin konusudur.

## İlgili

- [Derin öğrenme temelleri](derin-ogrenme-temelleri.md) · [Gömmeler ve benzerlik](gommeler-ve-benzerlik.md) ·
  [Hesaplama ve donanım](hesaplama-ve-donanim.md)
- Numpy ile nedensel çok başlı dikkat ve minik GPT: [`ml_temel/nn/attention.py`](../../ml-temel/ml_temel/nn/attention.py),
  [`nn/gpt.py`](../../ml-temel/ml_temel/nn/gpt.py); çalışan örnek: [`02_minik_gpt.py`](../../ml-temel/ornekler/02_minik_gpt.py)
- PyTorch ile LLaMA uyumlu model (RMSNorm, RoPE, GQA, KV önbelleği): [`dil_modeli/layers.py`](../../dil-modeli/dil_modeli/layers.py),
  [`model.py`](../../dil-modeli/dil_modeli/model.py); matematik ve parametre formülü: [`dil-modeli/docs/MIMARI.md`](../../dil-modeli/docs/MIMARI.md)
- Dil modelleriyle uygulama geliştirme: `85-llm` kümesi
