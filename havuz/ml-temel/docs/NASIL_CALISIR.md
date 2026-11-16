# Nasıl çalışır

Her bölüm: fikir, kısa matematik, kodun yeri. Ayrıntı her dosyanın başlık yorumundadır.

## 1. Geri yayılım (ters kipli otomatik türev)

**Dosyalar:** `ml_temel/autograd/tensor.py`, `ops_*.py`, `gradcheck.py`

Bir hesap, işlemlerden oluşan bir graftır: `z = tanh(x @ W + b)`, `kayıp = ortalama(z²)`. Her işlem
çıktısını üretirken "çıktının gradyanı `g` gelirse girdilere ne düşer" kuralını bir kapanış olarak saklar
(zincir kuralı):

| İşlem | İleri | Geri (girdiye düşen) |
| --- | --- | --- |
| `a + b` | `a + b` | `g` ve `g` |
| `a * b` | `a·b` | `g·b` ve `g·a` |
| `a @ b` | `A·B` | `g·Bᵀ` ve `Aᵀ·g` |
| `tanh(a)` | `t = tanh a` | `g·(1 - t²)` |
| `sum(a, eksen)` | toplam | `g` o eksen boyunca kopyalanır |
| `softmax(a)` | `s = eᵃ / Σeᵃ` | `s·(g - Σ g·s)` |
| `log_softmax(a)` | `a - logsumexp(a)` | `g - s·Σg` |
| `cross_entropy(z, y)` | `-ort(log_softmax(z)[y])` | `(softmax(z) - tek_sıcak(y)) / N` |
| `layer_norm(x)` | `x̂ = (x - μ)/σ`, `x̂·w + b` | `(g' - ort(g') - x̂·ort(g'·x̂)) / σ`, `g' = g·w` |

`backward()` grafı **topolojik sıraya** dizer (her düğüm girdilerinden sonra gelir; özyinelemesiz
derinlik öncelikli gezinti, derin graflarda yığın taşmaz) ve sondan başa kapanışları çağırır. Bir
tensör iki yerde kullanılmışsa gradyanları **toplanır** (`accumulate`).

**Yayınlama (broadcasting):** `(2, 3) + (3,)` toplamında `b` iki satıra kopyalanmıştır; geri yolda
gradyanı da o eksende **toplayarak** `(3,)`'e indiririz (`unbroadcast`). Her işlem bunu ayrıca
düşünmez; `accumulate` hepsi için yapar.

**Sayısal kararlılık:** `softmax` ve `log_softmax` en büyük değeri çıkararak (log-sum-exp) hesaplanır;
`sigmoid` ve ikili çapraz entropi `|z|` ile yazılır; `exp(1000)` taşmaz.

**Gradyan denetimi:** `f'(x) ≈ (f(x+ε) - f(x-ε)) / 2ε`. `gradcheck` her girdi elemanını tek tek oynatıp
sayısal türevi otomatik türevle karşılaştırır. Çıktı skaler değilse sabit rastgele ağırlıklarla skalere
indirilir; böylece bütün Jacobian sınanır. Kayıttaki her işlem bu denetimden geçer.

## 2. Dikkat (attention) ve minik GPT

**Dosyalar:** `ml_temel/nn/attention.py`, `nn/gpt.py`

Her konum için sorgu `q = xW_q`, anahtar `k = xW_k`, değer `v = xW_v` üretilir:

```
dikkat(Q, K, V) = softmax( Q·Kᵀ / √d  +  M ) · V        M[i, j] = -∞  (j > i ise; gelecek)
```

`M` nedensel maskedir: `i`. konum yalnız `0..i` konumlarına bakabilir; eğitimde "sonraki harfi" görerek
kopya çekemez. Çok başlı dikkatte `d_model` boyut `h` başa bölünür, her baş kendi alt uzayında dikkat
hesaplar, sonuçlar birleştirilip `W_o` ile karıştırılır.

Transformer bloğu (ön-norm): `x ← x + dikkat(norm(x))`, `x ← x + MLP(norm(x))`; MLP `4·d` genişlikte GELU'lu.
GPT: belirteç gömmesi + konum gömmesi → N blok → son norm → sözlük skorları (çıkış ağırlığı belirteç
gömmesiyle paylaşılır). Kayıp: her konumda bir sonraki belirtecin çapraz entropisi. Üretim: son konumun
skorlarından `temperature` ve isteğe bağlı `top_k` ile örnekleme; `temperature=0` en olası belirteç.
Artık yola yazan izdüşümler GPT-2'deki gibi `0.02/√(2·katman)` ölçekle başlatılır.

## 3. Ağaç bölme

### Kesin CART (karar ağacı, rastgele orman)

**Dosya:** `ml_temel/klasik/_cart.py`

Bir düğümde her aday özellik için değerler sıralanır; ardışık iki farklı değerin ortası eşik adayıdır.
Sol taraf istatistikleri **kümülatif toplamla**, sağ taraf "düğüm toplamı − sol" ile bulunur. Kazanç,
bir vekil fonksiyon `v` ile:

```
kazanç = v(sol) + v(sağ) - v(ebeveyn)
gini:          v(c) = Σ cₖ² / N               (c: sınıf ağırlıkları, N = Σc)
entropi:       v(c) = Σ cₖ log₂ cₖ - N log₂ N
kare hata:     v = (Σ a·y)² / Σ a              (a: örnek ağırlığı)
```

Bu, "ağırlıklı safsızlık azalışı"nın tam karşılığıdır (ör. Gini için `N·G(ebeveyn) - N_L·G(sol) - N_R·G(sağ)`).

**Hız:** düğüm düğüm değil **seviye seviye** çalışılır. Aynı derinlikteki bütün düğümlerin satırları
`düğüm × (n+1) + değer_sırası` anahtarıyla tek bir `argsort` ile sıralanır; düğüm başına en iyi bölme
`maximum.reduceat` ile bulunur. Python döngüsü düğüm sayısıyla değil `derinlik × aday özellik` ile büyür.
Değer sıraları (`dense_ranks`) ormanda bir kez hesaplanıp bütün ağaçlara verilir.

Rastgele ormanda her ağaç **bootstrap** örneklemiyle (çekiliş sayısı örnek ağırlığı olur) ve her düğümde
özelliklerin rastgele bir altkümesiyle (`max_features`) kurulur; torba dışı (OOB) satırlarla ücretsiz
bir doğrulama puanı hesaplanır.

### Histogram ağacı (gradyan artırma)

**Dosyalar:** `ml_temel/klasik/_binning.py`, `_hist_grower.py`

Her sütun en çok 255 kutuya (kantiller; farklı değer azsa değerlerin kendisi) + 1 "eksik" kutusuna
çevrilir (uint8). Bir düğümün histogramı: her (özellik, kutu) için Σg, Σh ve satır sayısı. Kümülatif
toplamla bütün eşikler tek seferde denenir. Eksik değerler için iki tarama: eksikler sağa ve eksikler sola.

İki hız hilesi: (1) **çıkarma hilesi** — iki çocuktan küçüğünün histogramı hesaplanır, büyüğününki
`ebeveyn − küçük`; (2) **yaprak öncelikli büyütme** — en büyük kazançlı yaprak önce bölünür,
`max_leaf_nodes` (varsayılan 31) dolunca durulur. Küçük düğümlerde histogram tek düz `bincount` ile,
büyüklerde sütun sütun kurulur.

## 4. Gradyan artırma

**Dosya:** `ml_temel/klasik/boosting.py`

Model küçük ağaçların toplamıdır: `F(x) = F₀ + η·Σ fₜ(x)`. Her adımda o anki tahminin kaybının birinci
(`g`) ve ikinci (`h`) türevi hesaplanır ve yeni ağaç **Newton adımı** olarak kurulur. Bir yaprağın en iyi
değeri ve bir bölmenin kazancı (λ: L2 düzenlileştirme):

```
yaprak değeri = -G / (H + λ)            G = Σg, H = Σh (yapraktaki satırlar)
kazanç = G_L²/(H_L + λ) + G_R²/(H_R + λ) - G²/(H + λ)
```

| Görev | Kayıp | g | h | F₀ |
| --- | --- | --- | --- | --- |
| regresyon | ½(y - F)² | F - y | 1 | ortalama(y) |
| ikili | log-kayıp, p = σ(F) | p - y | p(1 - p) | log(oran/(1 - oran)) |
| çok sınıflı | softmax log-kayıp | pₖ - yₖ | pₖ(1 - pₖ) | log pₖ - ort(log p) |

Çok sınıfta her adımda sınıf başına bir ağaç kurulur (gradyanlar adım başında bir kez hesaplanır).
Erken durdurma: eğitimin %10'u (sınıflamada katmanlı) ayrılır; o kısımdaki kayıp son `n_iter_no_change`
adımda `tol`'dan fazla iyileşmediyse durulur. Bu formüller scikit-learn `HistGradientBoosting*` ile aynıdır.

## 5. Kalibrasyon

**Dosyalar:** `ml_temel/klasik/calibration.py`, `ml_temel/olcut/probability.py`, `ml_temel/tablo/evaluation.py`

İyi sıralayan bir model olasılıkları yanlış söyleyebilir. Kalibrasyon, skor `s`'yi `P(y=1 | s)`'ye eşler.
Eşleme, modelin **eğitimde görmediği** satırların skorlarıyla öğrenilir (çapraz doğrulamanın kat dışı
tahminleri):

- **Platt (sigmoid):** `P = 1 / (1 + exp(A·s + B))`. Hedefler Platt'ın önerdiği gibi yumuşatılır:
  pozitifler `(N₊+1)/(N₊+2)`, negatifler `1/(N₋+2)`. İki parametre, Newton yöntemiyle çözülür; az veride kararlı.
- **İzotonik:** artan basamaklı eşleme; havuzlanmış komşu ihlalleri algoritması (PAVA): sırayla gezilir,
  bir değer öncekinden küçükse iki blok ağırlıklı ortalamada birleştirilir. Esnek ama ~1000'den az
  kalibrasyon örneğinde aşırı öğrenir.
- **ECE (beklenen kalibrasyon hatası):** tahminler kutulara ayrılır; `ECE = Σ (nₖ/N)·|gerçek_oranₖ - ort_tahminₖ|`.

`tablo` aracında seçim de sızıntısızdır: kat dışı olasılıklar üzerinde "yok / sigmoid / izotonik"
seçenekleri **ikinci bir iç çapraz doğrulamayla** log-kayıpla karşılaştırılır; %0,2'den az iyileşme
varsa düzeltme yapılmaz. Sınama kümesine bu karar için bakılmaz.

## 6. TF-IDF ve Türkçe belirteçleme

**Dosyalar:** `ml_temel/onisleme/text.py`, `vectorizers.py`, `ml_temel/ortak/turkish.py`

`idf(t) = ln((1 + n) / (1 + df(t))) + 1`, `tfidf = tf·idf`, sonra her satır birim uzunluğa getirilir
(scikit-learn ile aynı). Belirteçleme: Türkçe küçük harf (`I → ı`, `İ → i`), kesme işaretinden sonraki
ekin atılması (`İstanbul'da → istanbul`), isteğe bağlı aksan sadeleştirme (`ç → c`), kelime kırpma
(`stem_length`) ya da karakter n-gramları (`analyzer="char_wb"`; eklere karşı dayanıklı).
