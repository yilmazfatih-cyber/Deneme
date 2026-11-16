# ml-temel — yalnız numpy ile sıfırdan makine öğrenmesi

İki işe yarar:

1. **İçini açıp bakılabilen bir makine öğrenmesi kütüphanesi.** Otomatik türev, sinir ağı katmanları
   (MLP, dikkat, minik GPT, evrişim), klasik modeller (doğrusal, lojistik, Naive Bayes, k-NN, k-means,
   PCA, karar ağacı, rastgele orman, gradyan artırma, kalibrasyon), ön işleme, değerlendirme ve ölçütler —
   hepsi yalnız **numpy** ile, küçük ve Türkçe açıklamalı dosyalarda. Her parça scikit-learn (ya da
   sonlu fark) ile karşılaştıran testlerle kanıtlıdır.
2. **İşe yarayan bir araç:** bir CSV dosyasından tek komutla, **sızıntısız** değerlendirilmiş bir tahmin
   modeli, Türkçe rapor ve model kartı.

```bash
python -m ml_temel egit --veri musteriler.csv --hedef kayip
```

Büyük dil modeli işi bu temelde yok; o iş kardeş temel `havuz/dil-modeli`'nde (PyTorch).

## 5 dakikada çalıştırma

Bu klasörde (Python ≥ 3.11, [uv](https://docs.astral.sh/uv/) kurulu):

```bash
uv venv .venv
uv pip install --python .venv/bin/python -r requirements-dev.lock   # kilitten, sabit sürümler
uv pip install --python .venv/bin/python --no-deps -e .
.venv/bin/python scripts/check.py                                     # yeşil olmalı (~1 dk)
```

`uv` yoksa: `python -m venv .venv && .venv/bin/pip install -e ".[dev]"`.

Örnek CSV üzerinde model eğitin ve raporu açın:

```bash
.venv/bin/python -m ml_temel egit --veri ornekler/veri/musteri_kaybi.csv --hedef kayip --html
# → ciktilar/musteri_kaybi/ içinde: model.npz, rapor.md, rapor.html, model_karti.md, metrikler.json
```

## CSV'den modele (`tablo` aracı)

| Komut | Ne yapar |
| --- | --- |
| `python -m ml_temel egit --veri x.csv --hedef sutun` | Sütun türlerini sezer, aday modelleri doğru ayrımla çapraz doğrular, en iyisini seçer, sınama kümesinde güven aralığıyla ölçer; model + rapor + model kartı yazar |
| `... egit ... --zaman tarih_sutunu` | Zaman sıralı veri: eğitim hep geçmiş, sınama hep gelecek (en yeni %20) |
| `... egit ... --grup musteri_no` | Bir müşterinin/hastanın bütün satırları ya eğitimde ya sınamada |
| `... egit ... --hizli` | Daha az ağaç ve tekrar: hızlı deneme |
| `python -m ml_temel tahmin --model ciktilar/x/model.npz --veri yeni.csv` | `yeni_tahmin.csv`: tahmin + sınıf olasılıkları (girdiyle aynı CSV biçiminde); `--esik 0.3` ile karar eşiği |
| `python -m ml_temel degerlendir --model ... --veri etiketli.csv` | Yeni etiketli veride ölçütler ve %95 güven aralıkları |
| `python -m ml_temel rapor --model ... [--html]` | Raporu model dosyasındaki sonuçlardan yeniden yazar |

Diğer seçenekler: `--gorev siniflandirma|regresyon`, `--pozitif evet`, `--modeller dogrusal,orman,artirma`,
`--ayirici ';'`, `--ondalik ','`, `--tohum 0`, `--cikti klasor`. Hepsi için `python -m ml_temel egit -h`.

**Türkçe Excel dosyaları** kendiliğinden tanınır: UTF-8 BOM, `;` ayırıcı, ondalık virgül (`12,5`),
binlik nokta (`1.234,56`), `gg.aa.yyyy` tarihler ve eski Windows Türkçe kodlaması (cp1254).

**Rapor neler içerir:** özet ve tek cümlelik yorum; uyarılar (dışarıda bırakılan kimlik/sabit sütunlar,
dengesiz sınıflar, küçük sınama kümesi, şüpheli yüksek başarı ve tek sütun baskınlığı gibi **sızıntı
işaretleri**, eğitim–sınama kopya satırları, taban çizgisini geçememe); sütun türleri; ayrım
stratejisinin gerekçesi; adayların çapraz doğrulama tablosu; sınama ölçütleri (önyükleme %95 güven
aralığı ve taban çizgisiyle); kalibrasyon tablosu ve ECE; karar eşiği ve karışıklık matrisi;
permütasyon önemi; kullanım komutları; sınırlar. Rapor nasıl okunur: [AGENTS.md](AGENTS.md) → "Rapor okuma".

## Neler var

| Alt paket | İçerik |
| --- | --- |
| `autograd` | `Tensor` (yayınlamaya duyarlı ters kipli türev), 36 işlem (dört işlem, matmul, exp/log, tanh/relu/gelu/sigmoid, toplam/ortalama/varyans/en büyük, biçim/devrik/dilim/birleştirme/maske, softmax, log-softmax, çapraz entropi, katman normu, dropout, conv2d, max-pool), `no_grad`, sonlu farkla `gradcheck` |
| `nn` | `Module`/`Parameter`, `Linear`, `Embedding`, `LayerNorm`, `RMSNorm`, `Dropout`, `Sequential`, `MLP`, nedensel çok başlı öz-dikkat, `TransformerBlock`, minik `GPT` (üretim + kaydet/yükle), `Conv2d`, `MaxPool2d`; Xavier/He başlatma; `.npz` ağırlık dosyaları |
| `optim` | SGD (momentum, Nesterov), Adam, AdamW, ısınma + kosinüs çizelgesi, gradyan kırpma |
| `klasik` | LinearRegression, Ridge, LogisticRegression (ikili + çok sınıflı, L2), LinearSVC, GaussianNB, MultinomialNB, k-NN, KMeans (k-means++), PCA, karar ağacı, rastgele orman (OOB), histogram tabanlı gradyan artırma (regresyon, ikili ve çok sınıflı; eksik değer desteği; erken durdurma), kalibrasyon (Platt + izotonik), IsolationForest, taban modeller |
| `onisleme` | StandardScaler, MinMaxScaler, SimpleImputer, OneHotEncoder, OrdinalEncoder, Count/Tfidf/Hashing vektörleyiciler (Türkçe küçük harf ve belirteçleme), Pipeline, ColumnTransformer |
| `secim` | train_test_split (katmanlı/gruplu/sıralı), KFold, StratifiedKFold, GroupKFold, TimeSeriesSplit, cross_validate, cross_val_predict, GridSearchCV |
| `olcut` | doğruluk, kesinlik/duyarlılık/F1, karışıklık matrisi, ROC-AUC, PR-AUC, log-kayıp, Brier, kalibrasyon eğrisi, ECE, RMSE/MAE/R², önyükleme güven aralığı |
| `tablo` | CSV'den modele araç (yukarıda) |
| `zaman` | mevsimsel naif, üstel düzleştirme (Holt-Winters), geriye dönük sınama |
| `veri` | tohumlu sentetik veri üreteçleri |

Matematik ve "nasıl çalışır": [docs/NASIL_CALISIR.md](docs/NASIL_CALISIR.md). Doğru değerlendirme
(sızıntı, ayrım, ölçüt, güven aralığı): [docs/DEGERLENDIRME.md](docs/DEGERLENDIRME.md). Parçalar ve veri
akışı: [docs/MIMARI.md](docs/MIMARI.md). Kararlar: [docs/KARARLAR.md](docs/KARARLAR.md).

## Örnekler

Her biri çalışan bir betik ve `ornekler/beklenen/` altında beklenen çıktı; veri temelin içinde tohumlu üretilir.

| Betik | Ne gösterir | Süre (ölçülen) |
| --- | --- | --- |
| `ornekler/01_mlp_siniflandirma.py` | MLP ile iç içe "yarım aylar" (doğrusal model 0,85 → MLP 0,98) | ~1 sn |
| `ornekler/02_minik_gpt.py` | Karakter düzeyi minik GPT, Yunus Emre dörtlüğünü (kamu malı) ezberler | ~9 sn |
| `ornekler/03_musteri_kaybi.py` | Gradyan artırma + doğru çapraz doğrulama + izotonik kalibrasyon + **sızıntı gösterimi** (yanlış kodlamayla ROC-AUC 1,000; doğrusuyla 0,500) | ~7 sn |
| `ornekler/04_turkce_metin.py` | Türkçe kısa metin sınıflandırma, TF-IDF + lojistik regresyon (kelime ve karakter n-gram) | <1 sn |
| `ornekler/05_kmeans_pca.py` | Ölçekleme + PCA + k-means dirsek yöntemi | <1 sn |
| `ornekler/06_sekil_evrisim.py` | Evrişimli ağ ile kare/daire/artı sınıflandırma (%93) | ~1 sn |
| `ornekler/07_zaman_serisi.py` | Zaman serisi tabanlarının geriye dönük sınaması | <1 sn |

Süreler `tests/test_ornekler.py` koşusundan (4 çekirdekli, paylaşımlı makine, `OMP_NUM_THREADS=2`).

## scikit-learn'den farklar

Arayüzler bilerek scikit-learn'e (sinir ağı tarafı PyTorch'a) benzer: aynı sınıf ve parametre adları,
`fit / predict / predict_proba / transform`, `get_params / set_params / clone`, `Pipeline`, `cross_validate`.
Bilinen farklar:

| Konu | scikit-learn | ml-temel |
| --- | --- | --- |
| Veri tablosu | pandas DataFrame | `ml_temel.ortak.Table` (sütun adı → numpy dizisi); ColumnTransformer sütunları adla seçer |
| Seyrek matris | TF-IDF ve tek-sıcak çıktısı seyrek | hep yoğun (numpy); 2 GiB'ı aşacak matriste açıklayıcı hata — `max_features` kullanın |
| Model kaydetme | pickle/joblib (güvenilmeyen dosya kod çalıştırabilir) | pickle'sız `.npz` + JSON; yalnız kayıtlı sınıflar yüklenir (`persistence.py`) |
| `OneHotEncoder` / `OrdinalEncoder` | bilinmeyen kategori varsayılan olarak hata | varsayılan hoşgörülü: sıfır satırı / `-1` |
| `SimpleImputer` | tümü boş sütunu atar | atmaz; 0 ya da "(eksik)" ile doldurur |
| `KMeans` | `n_init="auto"` (k-means++ ile 1 deneme) | `n_init=10` |
| `LogisticRegression` | `tol=1e-4`, `max_iter=100`; L1/elastik ağ var | yalnız L2 (`C`); `tol=1e-6`, `max_iter=1000`; L-BFGS |
| `LinearSVC` | liblinear | aynı amaç (kare menteşe, kesme terimi de cezalı), L-BFGS ile birincil çözüm |
| Karar ağacı / orman | özellikleri rastgele sırayla dener; eksik değeri destekler | eşit kazançta küçük numaralı özellik; eksik değer desteklenmez (önce doldurun); ormanda düğümde geçerli bölme yoksa ek özellik denenmez |
| Gradyan artırma | `HistGradientBoosting*`; kategorik bölme, monoton kısıt var; gradyanlar float32 | aynı adlar ve varsayılanlar; kategorik bölme / kısıt / `max_features` yok (kategorileri `OrdinalEncoder` ile verin); gradyanlar float64 — tahminler noktasal olarak biraz farklı, ölçütler aynı düzeyde |
| `CalibratedClassifierCV` | `sigmoid`, `isotonic`, `temperature`; `FrozenEstimator` | `sigmoid`, `isotonic`; `ensemble=True/False`; önceden eğitilmiş model seçeneği yok |
| `PCA` | tam / rastgele SVD | yalnız tam SVD |
| `HashingVectorizer` | MurmurHash3 | `zlib.crc32` (sütunlar farklı düşer) |
| `train_test_split` | grup için ayrı sınıf | `groups=` parametresi var; `shuffle=False` sondan ayırır |
| `nn.Linear` (PyTorch) | ağırlık (çıkış, giriş) | ağırlık (giriş, çıkış): `y = x @ W + b` |

Testlerde karşılaştırma: doğrusal/lojistik/Ridge/SVM/NB/k-NN/PCA/izotonik/kalibrasyon katsayı ya da
olasılık düzeyinde (1e-4 – 1e-10); sığ ağaçlar birebir; derin ağaç, orman, gradyan artırma, k-means,
IsolationForest ölçüt düzeyinde (ayrıntı: `tests/test_klasik_*.py`).

## Hız (ölçülen)

`scripts/bench_boosting.py` ile, 4 çekirdekli **paylaşımlı** makinede (ölçüm sırasında yük ortalaması
~7,6–8,6), `OMP_NUM_THREADS=2`, Python 3.13.18, numpy 2.5.5, scikit-learn 1.9.1:

| İş | ml-temel | scikit-learn (aynı ayarlar) |
| --- | --- | --- |
| Gradyan artırma, 100 000 × 50, 100 adım, regresyon — `fit` | **9,1 sn** (`predict` 2,6 sn) | 4,7 sn (0,9 sn) |
| Aynısı, ikili sınıflama — `fit` | **13,5 sn** (`predict` 2,0 sn) | 4,6 sn (0,5 sn) |
| Rastgele orman, 10 000 × 20, 100 ağaç — `fit` | **8,9 sn** (`predict` 0,4 sn) | 2,7 sn, tek iş parçacığı (0,1 sn) |
| `egit` örnek CSV'de (2 000 satır, 3 aday, 5 kat, önyükleme + önem dahil) | ~11–16 sn (`--hizli` ile ~5 sn) | — |
| `egit`, 50 000 satır × 13 sütun (aynı üreteçle; yük ortalaması ~1,5) | 1 dk 51 sn (`--hizli` ile 38 sn) | — |

Kendi makinenizde: `OMP_NUM_THREADS=2 .venv/bin/python scripts/bench_boosting.py` (ve `--orman`).

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `python scripts/check.py` | ruff + biçim + mypy + hızlı testler (459 test; 16–62 sn, makine yüküne göre) |
| `python scripts/check.py --uzun` | + 8 yavaş test: bütün örnekler ve örnek CSV'de tam `egit` (toplam ~45 sn – 2 dk) |
| `python scripts/check.py --duzelt` | biçim ve basit lint hatalarını kendiliğinden düzeltir, sonra denetler |
| `python scripts/make_sample_data.py` | `ornekler/veri/musteri_kaybi.csv` dosyasını yeniden üretir |
| `python scripts/bench_boosting.py` | hız ölçümü |

## Veri ve metin kaynakları

- `ornekler/veri/musteri_kaybi.csv` ve bütün örnek verileri `ml_temel/veri/synthetic.py` ile tohumlu
  üretilir; kurgusaldır, gerçek kişi ya da şirket verisi değildir.
- `ornekler/02_minik_gpt.py` içindeki dörtlük Yunus Emre'ye (13.–14. yüzyıl) aittir; kamu malıdır.
- `ornekler/04_turkce_metin.py` içindeki 48 kısa ileti bu temel için elle yazılmış örnek veridir.

## Sınırlar

- **Hız:** numpy ile yazıldığı için derlenmiş kütüphanelerden yavaştır (yukarıdaki tablo: gradyan
  artırma ~2–3 kat, orman ~3 kat). Milyonlarca satırlık veride scikit-learn / LightGBM kullanın.
- **Bellek:** bütün matrisler yoğundur; çok büyük metin kümelerinde TF-IDF belleği taşabilir
  (2 GiB üstünde açıklayıcı hata verir).
- **Sinir ağları öğretim amaçlıdır:** yalnız CPU, float64, yerinde (in-place) işlem ve ikinci türev yok.
  Minik GPT saniyeler içinde birkaç satırı ezberler; gerçek dil modeli için `havuz/dil-modeli`.
- **Karar ağacı ve orman** eksik değer kabul etmez (gradyan artırma eder); kategorik değişkenler sıralı
  kodla verilir, doğal kategorik bölme yoktur.
- **`tablo` aracı** sabit, makul ayarlarla çalışır; hiperparametre araması yapmaz. Tarih sütunlarından
  yalnız ay ve haftanın günü türetilir. Çok sınıflı görevde olasılık kalibrasyonu yapılmaz. Sızıntı
  uyarıları sezgiseldir: uyarı yoksa sızıntı yok demek değildir.
- **Türkçe metin:** gerçek bir kök bulucu yok; ekler için kelime kırpma (`stem_length`) ya da karakter
  n-gramları kullanılır.
- **Güven aralıkları** yüzdelik önyüklemedir (BCa değil) ve yalnız sınama örneklemindeki belirsizliği kapsar.
- **Model dosyası** pickle'sız ve yalnız kayıtlı sınıfları kurar; yine de güvenilmeyen kaynaktan gelen çok
  büyük bir dosya bellek tüketebilir.
- **Doğrulanmadı:** yalnız Linux + Python 3.13'te sınandı. Kilit dosyası Python 3.11/3.12 için de sürüm
  içerir ama bu sürümlerde ve Windows/macOS'ta testler koşturulmadı. Holt-Winters için başvuru
  kütüphanesi (statsmodels) yoktu; yalnız bilinen çözümlü örneklerle sınandı.
