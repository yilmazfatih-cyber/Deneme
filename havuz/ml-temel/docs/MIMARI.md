# Mimari

## Katmanlar

```
                ┌──────────────────────────── tablo (CSV → model + rapor) ───────────────────────────┐
                │ csv_reader → schema → splitting → candidates → evaluation → holdout → importance   │
                │                         training.py yönetir; report / model_card / html_report    │
                │                         cli.py komutları; messages.py bütün metinler               │
                └───────────────┬───────────────────────────┬──────────────────────────┬────────────┘
                                │                           │                          │
       ┌────────────────────────▼──────┐   ┌────────────────▼─────────┐   ┌────────────▼──────────┐
       │ klasik (modeller)             │   │ onisleme (dönüştürücüler) │   │ secim + olcut         │
       │ linear, logistic, svm, nb,    │   │ scalers, impute, encoders │   │ ayrımlar, CV, arama;   │
       │ neighbors, cluster, pca,      │   │ text, vectorizers,        │   │ ölçütler, önyükleme   │
       │ tree/_cart, forest,           │   │ pipeline, column          │   │                       │
       │ boosting/_hist_grower,        │   └───────────────────────────┘   └───────────────────────┘
       │ calibration, isolation, dummy │
       └───────────────┬───────────────┘        ┌──────────── nn + optim ──────────┐
                       │                        │ Module, Linear, … GPT, Conv2d     │
                       │                        │ SGD, Adam(W), çizelgeler, kırpma  │
                       │                        └───────────────┬──────────────────┘
                       │                                        │
       ┌───────────────▼────────────────────────────────────────▼──────────────────┐
       │ ortak: BaseEstimator/clone, Table, doğrulama, Türkçe harf, tipler         │
       │ autograd: Tensor + işlemler + gradcheck (yalnız nn kullanır)              │
       └───────────────────────────────────────────────────────────────────────────┘
       persistence.py + registry.py: her nesneyi pickle'sız .npz'ye yazar / okur
       zaman: zaman serisi tabanları · veri: sentetik veri üreteçleri
```

Bağımlılık yönü: `ortak` hiçbir alt pakete bağlı değildir; `onisleme` yalnız `ortak`'a; `secim`
`olcut`'a; `klasik` `ortak`'a ve iki yerde `olcut`/`secim`'e (orman OOB puanı için `r2_score`; kalibrasyon
ve erken durdurma için katlar — döngü olmasın diye fonksiyon içinde içe aktarılır); `tablo` hepsine.
`registry.py` en üstte durur (bütün kayıtlı sınıfları içe aktarır); `persistence.py` onu geç yükler.

## `egit` komutunda veri akışı

```
CSV (bayt)
  │ csv_reader: kodlama, ayırıcı, ondalık sezgisi → Table (sayısal: float + NaN, metin: object + None)
  ▼
Table ── training._target: hedef ayıklanır, boş hedefli satırlar atılır, görev ve sınıflar
  │      training._columns: schema.infer_column → kimlik/sabit dışarıda; tarih → ay + haftagunu
  ▼
hazırlanmış Table (model.derive_columns: durumsuz, sızıntısız)
  │ splitting.make_split: sıra + eğitim/sınama + katlar (zaman / grup / katmanlı / rastgele)
  ▼
eğitim satırları ──► evaluation.cross_validate (taban + adaylar, AYNI katlar, her katta clone + fit)
  │                     └─► kat dışı olasılıklar ──► choose_calibration (iç CV) ──► eşleme + F1 eşiği
  ▼
en iyi aday + bütün eğitim verisi ──► TabularModel (hazırlık + Pipeline + eşleme + eşik)
  │
sınama satırları (ilk ve tek kez) ──► holdout.evaluate_test (ölçüt + önyükleme GA, kalibrasyon tablosu,
  │                                    karışıklık) ──► importance.permutation_importance ──► checks (uyarılar)
  ▼
sonuç sözlüğü (JSON'a uygun) ──► persistence.save_model(model, metadata={"sonuclar": ...})
                              ──► report.render_report / model_card / html_report / metrikler.json
```

`tahmin` ve `degerlendir` model dosyasını `persistence.load_model` ile okur ve `TabularModel`'i
kullanır; `rapor` yalnız dosyadaki sonuç sözlüğünden raporu yeniden üretir (modeli yeniden eğitmez).

## Genişletme noktaları (tek kayıt dosyaları)

| Ne | Nerede | İşaret |
| --- | --- | --- |
| Türev işlemi | `autograd/registry.py` `OPS` | `# YENİ İŞLEM BURAYA` |
| Kaydedilebilir sınıf | `registry.py` | `# YENİ SINIF BURAYA` |
| Ölçüt (ada göre) | `olcut/scorers.py` `SCORERS` | `# YENİ ÖLÇÜT BURAYA` |
| Ağaç ölçütü | `klasik/_cart.py` `PROXIES` | `# YENİ ÖLÇÜT BURAYA` |
| `tablo` adayı | `tablo/candidates.py` `CANDIDATES` | `# YENİ ADAY BURAYA` |
| `tablo` ölçütü | `tablo/evaluation.py` `METRICS` | `# YENİ ÖLÇÜT BURAYA` |
| Komut | `tablo/cli.py` `COMMANDS` | `# YENİ KOMUT BURAYA` |
| Etkinleştirme / başlatma | `nn/layers.py` `ACTIVATIONS`, `nn/init.py` `INITIALIZERS` | `# YENİ … BURAYA` |
| Örnek veri dosyası | `scripts/make_sample_data.py` `FILES` | `# YENİ ÖRNEK DOSYA BURAYA` |
