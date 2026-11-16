# Kararlar

Kısa kayıtlar: karar, gerekçe, elenen seçenek. Şartnameden bilinçli sapmalar **SAPMA** ile işaretlidir.

## Genel

**K01 — Tek çalışma zamanı bağımlılığı numpy.** Şartname gereği; ayrıca temel tek başına kopyalanabilsin
ve her satırı okunabilsin. scikit-learn yalnız `dev` ekstrasında, testlerde başvuru gerçeklemesi olarak.
Kural testi paketteki her içe aktarmayı denetler. Elenen: scipy (seyrek matris, en iyileyiciler) — L-BFGS
ve Newton yöntemleri ~100 satırda elle yazıldı.

**K02 — SAPMA: Pydantic yok; sınırda doğrulama elle.** STANDARTLAR §6.6 Python'da Pydantic önerir; ama
numpy dışı çalışma zamanı bağımlılığı şartnameyle çelişir. Dışarıdan gelen her veri
`ml_temel/ortak/validation.py` (diziler), `tablo/csv_reader.py` (dosya) ve `persistence.py` (model dosyası)
içinde açıkça doğrulanır; iletiler Türkçe ve yol göstericidir.

**K03 — Her yerde float64.** Gradyan denetiminin (sonlu fark, ε = 1e-6) güvenilir olması ve scikit-learn
ile 1e-6–1e-10 düzeyinde karşılaştırma için. Bedel: bellek ve hız (float32'nin iki katı).

**K04 — Kilit dosyası `requirements-dev.lock`.** `uv pip compile pyproject.toml --extra dev --universal
--python-version 3.11` ile üretildi; Python 3.11+ ve bütün platformlar için sabit sürümler. Kurulum:
`uv pip install -r requirements-dev.lock` + `uv pip install --no-deps -e .`. Elenen: `uv.lock` (uv'ye
özgü proje biçimi; havuz araçları `pip install -e ".[dev]"` bekliyor).

## autograd ve nn

**K05 — Hevesli (eager) graf, kapanışlı geri yayılım.** Her işlem çıktısıyla birlikte geri kuralını
saklar; `backward` topolojik sıra (özyinelemesiz) + kapanış çağrısı. Yayınlama tek yerde (`accumulate` →
`unbroadcast`) çözülür; işlem yazan kişi düşünmek zorunda kalmaz. Elenen: işlem sınıfları
(`Function.forward/backward`) — daha çok kalıp kod, küçük model için daha çok hata yeri.

**K06 — `Tensor.__array_ufunc__ = None`.** `numpy_dizisi * tensor` yazımında numpy'ın dizi dizi
dolaşması yerine `Tensor.__rmul__` çağrılsın diye.

**K07 — `nn.Linear` ağırlığı (giriş, çıkış).** `y = x @ W + b` matematikteki gibi okunur; PyTorch'un
(çıkış, giriş) düzeni değil. README farklar tablosunda yazılı.

**K08 — Dikkat ve GPT ilkellerden kurulu.** Yalnız softmax, log-softmax, çapraz entropi ve katman
normu elle türetilmiş tek işlemler (kararlılık ve hız); geri kalanı (`RMSNorm`, maskeli dikkat) ilkel
işlemlerden kurulu ve gradyan denetimli.

## Klasik modeller

**K09 — Karar ağacı ve orman: kesin CART, seviye seviye vektörel arama.** scikit-learn ile aynı eşikler
(sığ ağaçlar testte birebir aynı), test kolaylığı. Düğüm düğüm Python döngüsü elendi: tam derin ağaçta
düğüm başına ~30 numpy çağrısı ormanı dakikalara çıkarıyordu. Değer sıraları (`dense_ranks`) tek
`argsort` anahtarı için bir kez hesaplanır; ilk sürüme göre ~3 kat hızlanma ölçüldü (10 000 × 20, 50 ağaç:
11,1 → 6,8 sn, geliştirme sırasında).

**K10 — Ormanda düğüm başına `max_features` aday; geçerli bölme yoksa yaprak.** scikit-learn geçerli
bölme bulana kadar ek özellik dener. Basitlik için yapılmadı; README'de fark olarak yazılı.

**K11 — Gradyan artırma: histogram + yaprak öncelikli büyütme + çıkarma hilesi.** scikit-learn
`HistGradientBoosting*` ile aynı formüller (Newton yaprağı, kazanç, kutulama kuralı, erken durdurma
kuralı); ölçütler testte aynı düzeyde. Gradyanlar float64 (scikit-learn float32) — noktasal tahminler
biraz farklı. Kök sayım histogramı önbellekte; eksik değer yoksa ikinci tarama yapılmaz (100 000 × 50,
100 adım: 12,0 → 9,3 sn, geliştirme sırasında).

**K12 — Sınıf adları `HistGradientBoostingRegressor/Classifier`.** Parametreler scikit-learn'ün aynı
adlı sınıflarıyla aynı (`max_iter`, `max_leaf_nodes`…). `GradientBoosting*` adı kullanılmadı: o
scikit-learn'de farklı parametreli (`n_estimators`) başka bir sınıf; küçük model karıştırmasın.

**K13 — Lojistik regresyon amacı scikit-learn ölçeğinde.** `ortalama log-kayıp + ||w||²/(2·C·n)`; kesme
cezasız; çok sınıfta K vektörlü simetrik softmax. Bu sayede katsayılar 1e-5 içinde aynı çıkar.
Varsayılanlar `tol=1e-6`, `max_iter=1000` (scikit-learn 1e-4, 100): daha kesin, yakınsama uyarısı nadir.

**K14 — `LinearSVC` kesme terimini de cezalandırır.** liblinear ile aynı amaç (`intercept_scaling`
sütunu); karşılaştırma testinde katsayılar 1e-4 içinde aynı.

**K15 — `KMeans(n_init=10)`.** scikit-learn'ün yeni varsayılanı (`"auto"` = 1 deneme) yerel en iyiye
takılmaya daha açık; numpy gerçeklemesi 10 denemeyi kaldırıyor.

**K16 — Kalibrasyon: `cv="prefit"` yok.** scikit-learn bunu `FrozenEstimator`'a taşıdı; `tablo`
aracı kendi kat dışı akışını kullandığından gerek olmadı.

## Ön işleme ve veri

**K17 — `Table` (pandas yok).** Sütun adı → numpy dizisi; değişmez, satır seçimi `take_rows`.
Yalnız ihtiyaç duyulan işlemler var (seçme, çıkarma, sütun ekleme, matrise çevirme).

**K18 — Yoğun matrisler.** Seyrek matris için scipy gerekirdi (K01). TF-IDF ve tek-sıcak yoğun; 2 GiB'ı
aşacak matriste ne yapılacağını söyleyen hata. Büyük metin kümeleri README Sınırlar'da.

**K19 — `HashingVectorizer` karma işlevi `zlib.crc32`.** Standart kütüphanede, her makinede ve her
çalıştırmada aynı. Python'un `hash()`'i her süreçte değiştiği için elendi; MurmurHash3 bağımlılık ister.

**K20 — Türkçe harf kuralları.** `lower_tr`/`upper_tr` (I↔ı, İ↔i), `lower_ascii` (İngilizce anahtar
sözcükler), `fold_ascii_tr`, `sort_key_tr`. Paket içinde `.lower()` vb. çağrısı AST tabanlı kural
testiyle yasak. Gerçek kök bulucu yok (bağımlılık + kapsam); `stem_length` ve karakter n-gramları var.

**K21 — Durak sözcük listesi olumsuzluk taşımaz.** "değil", "yok", "hiç" listede yok: şikâyet/duygu
sınıflamasında anlamı bunlar belirler.

**K22 — Model dosyası pickle'sız.** `.npz` (sayısal diziler) + JSON (nesne ağacı); yükleme yalnız
`registry.py`'deki sınıfları `__init__` çağırmadan kurar; `allow_pickle=False`. Elenen: pickle/joblib
(güvenilmeyen dosya kod çalıştırır), safetensors (bağımlılık ve nesne ağacı taşımaz). Kural testi her
tahminleyicinin kayıtlı olduğunu ve kaydet/yükle sonrası aynı çıktıyı verdiğini denetler.

## `tablo` aracı

**K23 — CSV sezgileri.** Kodlama: BOM → utf-8-sig, değilse UTF-8, olmazsa cp1254. Ayırıcı: `; , \t |`
arasından ilk 30 satıra en tutarlı bölünen. Ondalık: "1.234" gibi belirsiz değerler oylamaya girmez;
eşitlikte `;` ayırıcılı dosyada virgül. Binlik ayırıcı yalnız 3'lü gruplarla kabul edilir ("04.07.2023"
sayı sanılmaz — bu hata geliştirmede yakalandı). Bütünüyle boş satırlar (Excel artığı) atlanır.

**K24 — Sütun türü kuralları** (`schema.py` başlığında): kimlik ve sabit sütunlar modele alınmaz ve
raporda yazılır. Tarih sütunlarından yalnız ay ve haftanın günü türetilir; mutlak tarih özellik olarak
kullanılmaz (zaman ayrımında dışa kestirim riski).

**K25 — Ayrım önceliği: zaman > grup > katmanlı (sınıflama) / rastgele (regresyon).** Sınama %20,
5 kat (sınıf azsa kat sayısı düşer). En az 30 satır; sınıflamada her sınıfta en az 2·min(kat, 3) örnek.

**K26 — Ana ölçütler:** ikili ROC-AUC (sınıf oranından bağımsız, kolay yorumlanır), çok sınıflı log-kayıp
(uygun puanlama kuralı), regresyon RMSE. Diğerleri de raporlanır.

**K27 — Kalibrasyon seçimi.** İkili sınıflamada kat dışı olasılığın log-oranına Platt ya da izotonik
eşleme; seçim iç çapraz doğrulamayla log-kayıpla; %0,2'den az iyileşmede yapılmaz; izotonik yalnız
≥ 1000 kat dışı örnekte aday. Çok sınıflıda yapılmaz (README Sınırlar). Geliştirmede bulunan hata:
pozitif sınıf 0. sütundayken düzeltme yanlış sütuna uygulanıyordu; regresyon testi eklendi.

**K28 — Karar eşiği varsayılan 0,5.** Olasılıklar kalibre olduğundan "olasılığı yarıdan büyük" anlamlı;
F1'i en büyükleyen eşik yalnız bilgi olarak raporlanır, `tahmin --esik` ile değiştirilir. Eşiği sınama
kümesinde seçmek iyimserlik getirirdi.

**K29 — Aday ayarları sabit, gradyan artırmada erken durdurma hep açık; büyük veride orman
küçültülür.** 20 000'den çok eğitim satırında ormanın her ağacı en çok 20 000 satırlık bootstrap
örneklemiyle ve en az 5 satırlık yapraklarla kurulur (tam derin 150 ağaç yüz binlerce satırda
dakikalar sürerdi). Varsayılan HGB ayarları
1 300 satırlık katlarda aşırı öğrendi (log-kayıp 0,697, taban 0,559; geliştirmede ölçüldü). Erken
durdurma + 15 yaprak + L2 = 1 ile 0,472. Hiperparametre araması yapılmaz (süre; README Sınırlar).

**K30 — Permütasyon önemi sınama kümesinde, ham sütunlar üzerinden.** Model türünden bağımsız; tarih
sütunu karıştırılınca türetilmiş sütunlar da bozulur. Ağaç kazanç önemi çok kategorili sütunları kayırdığı
için ana önem olarak kullanılmadı.

**K31 — Sızıntı uyarı eşikleri:** ROC-AUC ya da R² ≥ 0,995; tek sütun pozitif önem toplamının ≥ %60'ı ve
≥ 0,05; kopya sınama satırı > %1; sınama < 200 satır; en küçük sınıf < %10. Sezgiseldir (README Sınırlar).

**K32 — Kullanıcıya görünen metin `tablo/messages.py`'de (tek sözlük).** Kütüphane hata iletileri
geliştiriciye dönüktür ve kod içinde Türkçe kalır; kullanıcı arayüzü (komut satırı, rapor) sözlükte.

## Örnekler, testler

**K33 — SAPMA: örnek betik adları Türkçe** (`ornekler/01_mlp_siniflandirma.py`). STANDARTLAR kaynak
dosya adlarını İngilizce ister; örnekler içe aktarılan modül değil, sahibinin çalıştırdığı belgelerdir
(komut satırı alt komutları gibi). Yardımcı `ornekler/_setup_path.py` İngilizce.

**K34 — Örnek çıktı karşılaştırması sayılarda hoşgörülü** (göreli %2 ya da 0,02): farklı işlemci/BLAS
son basamağı değiştirebilir; sayı olmayan her parça birebir aranır.

**K35 — Metin kaynakları.** GPT örneğinde kamu malı Yunus Emre dörtlüğü (ORTAK_BRIF kural 7: eğitim
verisi yazılmadı). Metin sınıflama örneğindeki 48 ileti şartnamenin istediği "birkaç on satırlık örnek
veri"dir; dil modeli eğitimi için değildir.

**K36 — Testler paralel değil, iş parçacığı 2.** Makine paylaşımlı; `scripts/check.py` BLAS iş
parçacıklarını 2'ye sınırlar. Hızlı denetim ~30 sn; yavaş testler (`@pytest.mark.yavas`) `--uzun` ile.

**K37 — Holt-Winters parametre seçimi ızgarayla.** α, β, γ ∈ {0,05 … 0,95} (10 değer); bütün ızgara
noktaları zaman boyunca birlikte (vektörel) güncellenir. Başvuru kütüphanesi (statsmodels) kurulu
olmadığından bilinen çözümlü örneklerle sınandı.
