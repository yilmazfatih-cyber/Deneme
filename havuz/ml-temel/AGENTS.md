# ml-temel — model talimatları

## Bu temel ne yapar

Yalnız numpy ile sıfırdan makine öğrenmesi: otomatik türev (`autograd`), sinir ağı (`nn`, `optim`),
scikit-learn arayüzlü klasik modeller (`klasik`), ön işleme (`onisleme`), sızıntısız değerlendirme
(`secim`, `olcut`) ve bir CSV'den tek komutla rapor + model çıkaran araç (`tablo`,
`python -m ml_temel egit`). Tek çalışma zamanı bağımlılığı numpy'dır; scikit-learn yalnız testlerde
başvuru olarak kullanılır. PyTorch YOK (büyük dil modeli işi `havuz/dil-modeli`'nde).

## Komutlar

Hepsi bu klasörden; sanal ortam `.venv` (README → "5 dakikada çalıştırma").

| Komut | Ne zaman |
| --- | --- |
| `.venv/bin/python scripts/check.py` | Her değişiklikten sonra. Yeşil değilse iş bitmemiştir (~1 dk) |
| `.venv/bin/python scripts/check.py --duzelt` | Biçim/lint hatası çıkınca önce bunu çalıştırın |
| `.venv/bin/python scripts/check.py --uzun` | Örneklere, `tablo`'ya ya da modellere dokunduysanız (yavaş testler dahil) |
| `.venv/bin/python -m pytest tests/test_X.py -q` | Tek dosyayı denemek için |
| `.venv/bin/python -m ml_temel egit --veri ornekler/veri/musteri_kaybi.csv --hedef kayip --hizli` | Aracı elle denemek için |
| `.venv/bin/python scripts/make_sample_data.py` | Sentetik veri üretecini değiştirdiyseniz örnek CSV'yi yenilemek için |
| `.venv/bin/python ornekler/0N_*.py > ornekler/beklenen/0N_*.txt` | Bir örneğin çıktısını BİLEREK değiştirdiyseniz (önce farkı okuyun) |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Türev işlemi (yeni işlem, yanlış gradyan) | `ml_temel/autograd/ops_*.py`, kayıt: `autograd/registry.py`, test: `tests/test_autograd_ops.py` |
| Tensor çekirdeği, `backward`, yayınlama | `ml_temel/autograd/tensor.py` |
| Katmanlar | `ml_temel/nn/layers.py`, `norm.py`, `attention.py`, `gpt.py`, `conv.py`; taban: `nn/module.py` |
| Optimizer, öğrenme oranı | `ml_temel/optim/` |
| Klasik model | `ml_temel/klasik/<model>.py`; ağaç motorları `_cart.py` (kesin) ve `_hist_grower.py` + `_binning.py` (gradyan artırma) |
| Ön işleme, Pipeline | `ml_temel/onisleme/`; Türkçe belirteçleme `onisleme/text.py` |
| Ayrım, çapraz doğrulama, ızgara araması | `ml_temel/secim/` |
| Ölçüt | `ml_temel/olcut/`; ada göre puanlayıcılar `olcut/scorers.py` |
| Tahminleyici sözleşmesi (`get_params`, `clone`) | `ml_temel/ortak/base.py` |
| Girdi doğrulama, hata iletileri | `ml_temel/ortak/validation.py` |
| Türkçe büyük/küçük harf | `ml_temel/ortak/turkish.py` |
| Model dosyası (kaydet/yükle) | `ml_temel/persistence.py`; kaydedilebilir sınıflar `ml_temel/registry.py` |
| CSV okuma (Türkçe Excel) | `ml_temel/tablo/csv_reader.py` |
| Sütun türü sezme | `ml_temel/tablo/schema.py` |
| Aday modeller ve ön işlemeleri | `ml_temel/tablo/candidates.py` |
| Eğitim akışı | `ml_temel/tablo/training.py` (adımlar), `splitting.py`, `evaluation.py`, `holdout.py`, `importance.py`, `checks.py` (uyarılar) |
| Rapor / model kartı / HTML | `ml_temel/tablo/report.py`, `model_card.py`, `html_report.py` |
| Kullanıcıya görünen HER metin | `ml_temel/tablo/messages.py` (tek sözlük) |
| Komut satırı | `ml_temel/tablo/cli.py` |
| Zaman serisi | `ml_temel/zaman/` |
| Sentetik veri | `ml_temel/veri/synthetic.py` |

## Değişmez kurallar

1. Paket yalnız numpy ve standart kütüphaneyi içe aktarır; scikit-learn/pandas/scipy/torch YASAK
   (`tests/test_rules.py::test_only_numpy_and_standard_library_at_runtime`).
2. `str.lower()` / `upper()` / `casefold()` / `title()` / `capitalize()` çağrılmaz; Türkçe metinde
   `lower_tr` / `upper_tr`, İngilizce anahtar sözcükte `lower_ascii` (`test_no_locale_blind_case_conversion`).
3. `registry.OPS`'taki her türev işleminin sonlu fark testi vardır
   (`tests/test_autograd_ops.py::test_every_registered_op_has_a_gradcheck_case`).
4. Her tahminleyici `ml_temel/registry.py`'ye kayıtlıdır ve kaydet/yükle sonrası aynı çıktıyı verir
   (`test_every_estimator_is_registered_for_model_files`, `tests/test_persistence.py`).
5. Tahminleyici sözleşmesi: `__init__` yalnız parametreleri aynı adla saklar; öğrenilenler `fit`'te,
   adı `_` ile biten alanlara yazılır; `fit` `self` döndürür (`clone` ve çapraz doğrulama buna güvenir).
6. Veriden öğrenen her ön işleme (`fit` olan her şey) çapraz doğrulamada katın İÇİNDE uydurulur:
   modelle birlikte `Pipeline`'a koyun (`tests/test_secim.py::test_cross_validate_fits_preprocessing_only_on_training_rows`).
7. Kullanıcıya görünen metin `tablo/messages.py`'dedir; kodda kullanılan her anahtar orada vardır,
   kullanılmayan anahtar kalmaz (`test_every_message_key_used_in_code_exists`).
8. Her kaynak dosya Türkçe başlık yorumuyla açılır, başlıkta `Genişletme:` satırı vardır; dosya 400
   satırı geçmez (hedef ~300) (`test_every_file_opens_with_a_turkish_header`, `test_files_stay_small`).
9. Model dosyası pickle kullanmaz; `np.load(..., allow_pickle=False)` değişmez (`test_persistence.py`).
10. Rastgelelik her yerde tohumludur (`random_state` / `rng` parametresi); testler çevrimdışıdır.
11. `TODO`, boş `pass` gövdeli fonksiyon bırakılmaz (`test_no_unfinished_work_markers`).
12. Örnek CSV üreteçle birebir aynıdır (`test_sample_csv_is_reproducible`); her örnek betiğin
    `ornekler/beklenen/` altında çıktısı vardır (`test_every_example_has_an_expected_output`).

## Tarifler

### 1. Yeni türev işlemi ekle (gradyan denetimiyle)

Dosyalar: `ml_temel/autograd/ops_basic.py` (ya da uygun `ops_*.py`), `autograd/registry.py`,
`autograd/__init__.py`, `tests/test_autograd_ops.py`.

1. `ops_basic.py` içindeki `tanh`'ı kopyalayın. İleri hesabı numpy ile yapın; `backward(g)` içinde
   `girdi.accumulate(g * yerel_türev)` yazın. Yayınlamayı düşünmeyin: `accumulate` gradyanı girdinin
   biçimine kendisi indirir. Çıktıyı `make(veri, (girdiler,), backward, "ad")` ile kurun.
2. `registry.py`'deki `OPS` sözlüğüne `"ad": ops_basic.ad` ekleyin (YENİ İŞLEM BURAYA).
3. `autograd/__init__.py`'den dışa açın (`__all__`).
4. `tests/test_autograd_ops.py`'deki `CASES`'e `"ad": lambda: assert_gradcheck(ag.ad, [rand(2, 3)])`
   ekleyin. Köşeli işlemlerde (`relu`, `abs`, `max`) girdiyi köşeden uzak seçin (`away_from_zero`).
5. Doğrulama: `.venv/bin/python -m pytest tests/test_autograd_ops.py -q` ve `scripts/check.py`.

### 2. Yeni katman ekle

Dosyalar: `ml_temel/nn/layers.py` (ya da yeni dosya), `nn/__init__.py`, `tests/test_nn.py`.

1. `Linear`'ı kopyalayın: `__init__`'te parametreleri `Parameter(...)` olarak `self` alanlarına
   yazın (başlatma için `init.initialize("kaiming", biçim, init.resolve_rng(rng))`), `forward`'ı
   `autograd` işlemleriyle yazın. Geri yayılım yazmayın.
2. Alt katmanları alan ya da liste olarak saklayın; `parameters()` ve `state_dict()` onları kendisi bulur.
3. `tests/test_nn.py`'ye `assert_gradcheck(lambda *_: katman(x), katman.parameters())` testi ekleyin.
4. Doğrulama: `.venv/bin/python -m pytest tests/test_nn.py -q`.

### 3. Yeni tahminleyici (klasik model) ekle

Dosyalar: `ml_temel/klasik/<ad>.py`, `klasik/__init__.py`, `ml_temel/registry.py`,
`tests/test_klasik_*.py`, `tests/test_persistence.py`.

1. En yakın modeli kopyalayın (`dummy.py` en kısa örnektir; olasılık veren sınıflayıcı için
   `naive_bayes.py`). `BaseEstimator` + `ClassifierMixin`/`RegressorMixin`/`TransformerMixin`'den türetin.
2. `fit`'in ilk satırları: `data, target = check_X_y(X, y)`; sınıflayıcıda
   `self.classes_, codes = encode_labels(target)`; sonunda `self.n_features_in_ = data.shape[1]` ve
   `return self`. `predict`'te `check_is_fitted`, `check_array`, `check_n_features`.
3. `klasik/__init__.py`'ye ve `registry.py`'deki listeye ekleyin.
4. Test: rastgele veride scikit-learn ile karşılaştırma (`pytest.importorskip("sklearn...")`) + bilinen
   çözümlü küçük örnek; `tests/test_persistence.py` `CASES`'e kaydet/yükle durumu.
5. Doğrulama: `scripts/check.py` (kural testi kaydı unuttuysanız kırmızı olur).

### 4. Kendi CSV'nizle model eğitin

1. CSV'nin ilk satırı başlık olsun; tahmin edilecek sütunun adını bilin (ör. `kayip`).
2. `.venv/bin/python -m ml_temel egit --veri dosya.csv --hedef kayip --html`
3. Satırlar zaman sıralı bir olguysa (aylık satış, işlem geçmişi) `--zaman tarih_sutunu` ekleyin;
   aynı kişi/müşteri birden çok satırdaysa `--grup musteri_no` ekleyin (docs/DEGERLENDIRME.md).
4. `ciktilar/<dosya adı>/rapor.md`'yi okuyun (aşağıdaki tarif); önce "Uyarılar".
5. Yeni veride tahmin: `.venv/bin/python -m ml_temel tahmin --model ciktilar/<ad>/model.npz --veri yeni.csv`.
6. Hata olursa ileti Türkçe ve ne yapılacağını söyler; ayırıcı/ondalık yanlış sezildiyse
   `--ayirici ';' --ondalik ','` ile zorlayın.

### 5. Rapor okuma

1. **Uyarılar** önce: "şüphe uyandıracak kadar yüksek" ya da "tek başına başarının çok büyük kısmını
   taşıyor" görürseniz o sütunu tahmin anında gerçekten bilip bilmediğinizi sorun (ör. "iptal_tarihi"
   kaybı tahmin etmek için kullanılamaz). "Kopya satırlar" görürseniz `--grup` kullanın.
2. **Özet → Sınama kümesi**: modelin hiç görmediği satırlardaki başarı; parantezdeki %95 güven aralığı
   genişse veri azdır. Taban çizgisiyle karşılaştırın: aradaki fark modelin gerçek katkısıdır.
3. **Aday modeller**: ± değerleri katlar arası oynaklıktır; iki model arasındaki fark ± değerlerinden
   küçükse "biri daha iyi" demek için kanıt zayıftır.
4. **Kalibrasyon**: "Tahmin edilen" ile "Gerçekleşen" sütunları yakınsa olasılıklar güvenilirdir
   (%30 denen müşterilerin ~%30'u gerçekten gidiyor).
5. **Karar eşiği**: karışıklık matrisinde satırlar gerçek, sütunlar tahmin. Kaçırılan vaka pahalıysa
   eşiği düşürün (`tahmin --esik 0.3`), yanlış alarm pahalıysa yükseltin.
6. **Sütun önemleri**: modelin neye dayandığı; neden-sonuç DEĞİLDİR.

### 6. scikit-learn'e geçiş eşlemesi

Veri büyüdüğünde ya da hız gerektiğinde aynı kod çoğunlukla yalnız içe aktarma değiştirerek çalışır:

| ml-temel | scikit-learn |
| --- | --- |
| `ml_temel.klasik.LogisticRegression(C=...)` | `sklearn.linear_model.LogisticRegression(C=...)` |
| `ml_temel.klasik.Ridge`, `LinearRegression` | `sklearn.linear_model.Ridge`, `LinearRegression` |
| `ml_temel.klasik.LinearSVC` | `sklearn.svm.LinearSVC(dual=False)` |
| `ml_temel.klasik.GaussianNB`, `MultinomialNB` | `sklearn.naive_bayes.*` |
| `ml_temel.klasik.KNeighbors*` | `sklearn.neighbors.KNeighbors*` |
| `ml_temel.klasik.KMeans(n_init=10)`, `PCA` | `sklearn.cluster.KMeans(n_init=10)`, `sklearn.decomposition.PCA` |
| `ml_temel.klasik.DecisionTree*`, `RandomForest*` | `sklearn.tree.*`, `sklearn.ensemble.RandomForest*` |
| `ml_temel.klasik.HistGradientBoosting*` | `sklearn.ensemble.HistGradientBoosting*` |
| `ml_temel.klasik.CalibratedClassifierCV`, `IsotonicRegression` | `sklearn.calibration.*`, `sklearn.isotonic.*` |
| `ml_temel.klasik.IsolationForest` | `sklearn.ensemble.IsolationForest` |
| `ml_temel.onisleme.*` (scaler, imputer, encoder, vectorizer, `Pipeline`, `ColumnTransformer`) | `sklearn.preprocessing`, `sklearn.impute`, `sklearn.feature_extraction.text`, `sklearn.pipeline`, `sklearn.compose` |
| `ml_temel.secim.*` | `sklearn.model_selection.*` (`train_test_split(groups=...)` → `GroupShuffleSplit`) |
| `ml_temel.olcut.*` | `sklearn.metrics.*` (`expected_calibration_error`, `bootstrap_ci` yok) |
| `ml_temel.ortak.Table` | `pandas.DataFrame` |
| `ml_temel.persistence.save_model` | `joblib.dump` (pickle: yalnız güvenilir dosyalar!) |

Farklar: README → "scikit-learn'den farklar".

### 7. Yeni ölçüt ekle

1. `ml_temel/olcut/` içindeki uygun dosyaya `(y_true, y_pred) -> float` fonksiyonu yazın; `olcut/__init__.py`'den açın.
2. Ada göre kullanılacaksa `olcut/scorers.py` `SCORERS`'a ekleyin (hata ölçütleri `neg_` önekli, işaret -1).
3. `tablo` raporunda görünecekse `tablo/evaluation.py` `METRICS`'e ekleyin ve `messages.py`'ye
   `olcut_<ad>` ile `anlam_<ad>` metinlerini yazın.
4. Test: `tests/test_olcut.py`'de scikit-learn karşılaştırması + elle hesaplanmış örnek.

### 8. `tablo`'ya yeni aday model ekle

1. `tablo/candidates.py`'de `_boosting`'i kopyalayıp ön işleme + modeli `Pipeline` olarak kurun.
2. `CANDIDATES` sözlüğüne `"ad": _yeni` ekleyin; `messages.py`'ye `model_ad` metnini ekleyin.
3. Doğrulama: `.venv/bin/python -m ml_temel egit --veri ornekler/veri/musteri_kaybi.csv --hedef kayip --modeller ad --hizli`
   ve `scripts/check.py`.

### 9. Yeni dönüştürücü (ön işleme) ekle

1. `onisleme/scalers.py`'deki `MinMaxScaler`'ı kopyalayın: `fit` yalnız EĞİTİM verisinden öğrenir,
   `transform` öğrenileni uygular; ikisi de `check_array` ile başlar.
2. `onisleme/__init__.py` ve `registry.py`'ye ekleyin; scikit-learn karşılaştırma testi yazın.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Çapraz doğrulama puanı şaşırtıcı yüksek, sınama düşük | Ön işleme bütün veride uyduruldu (sızıntı) | Ön işlemeyi modelle birlikte `Pipeline`'a koyun; `cross_validate`'e hattı verin |
| `İ`/`ı` içeren kelimeler eşleşmiyor ("İADE" ≠ "iade") | `.lower()` kullanıldı | `lower_tr` kullanın; vektörleyiciler zaten kullanır |
| `ValueError: X içinde eksik değer (NaN) var` | Model eksik değer kabul etmiyor | `SimpleImputer` ekleyin ya da `HistGradientBoosting*` kullanın |
| `Gradyan uyuşmuyor → 0. girdi, eleman (…)` | `backward` içindeki yerel türev yanlış | Türevi elle yeniden türetin; `docs/NASIL_CALISIR.md` → Geri yayılım |
| `RuntimeError: backward() skaler çıktı ister` | Vektör çıktıdan geri yayılım | Önce `.sum()` ya da `.mean()` alın |
| Gradyanlar her adımda büyüyor | `zero_grad()` unutuldu (gradyanlar birikir) | Her adımda `model.zero_grad(); loss.backward(); optimizer.step()` |
| `ModelFileError: ... kaydedilemiyor` | Kayıtlı olmayan sınıf ya da fonksiyon parametresi | Sınıfı `registry.py`'ye ekleyin; `tokenizer=` gibi fonksiyon vermeyin |
| `Modelin beklediği sütunlar dosyada yok` | Tahmin CSV'sinde sütun adı farklı | Eğitimdeki sütun adlarını birebir kullanın |
| Tarih sütunu "sayisal" sanıldı | Biçim tanınmadı | `gg.aa.yyyy` ya da `yyyy-aa-gg` kullanın; yeni biçim için `tablo/schema.py` `DATE_FORMATS` |
| `test_every_message_key_used_in_code_exists` kırmızı | Koda yazılan metin sözlükte yok ya da sözlükte kullanılmayan anahtar var | `tablo/messages.py`'yi güncelleyin |
| Örnek testi "satır sayısı farklı" diyor | Örneğin çıktısı değişti | Bilerek değiştiyse `ornekler/beklenen/` dosyasını yenileyin |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` yeşil (lint, biçim, mypy, testler)
- [ ] Modele/örneğe/`tablo`'ya dokunulduysa `scripts/check.py --uzun` de yeşil
- [ ] Yeni sayısal kod başka bir gerçeklemeyle karşılaştırıldı (scikit-learn, sonlu fark ya da kaba kuvvet)
- [ ] Yeni sınıf `registry.py`'de; yeni işlem `autograd/registry.py`'de; yeni metin `messages.py`'de
- [ ] Yeni dosya Türkçe başlık + `Genişletme:` satırıyla açılıyor; 300 satırı geçmiyor
- [ ] Kullanıcıya dönük hata iletileri Türkçe ve ne yapılacağını söylüyor
- [ ] Davranış değiştiyse README (Sınırlar / farklar tablosu) ve `docs/KARARLAR.md` güncel
