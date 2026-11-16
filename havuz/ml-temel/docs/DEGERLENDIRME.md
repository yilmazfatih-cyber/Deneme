# Doğru değerlendirme: sızıntı, ayrım, ölçüt, güven aralığı

Bir modelin başarısı, **eğitimde hiç görmediği ve tahmin anında gerçekten elde olacak bilgiyle**
ölçülmelidir. Bu belgedeki her kural `ml_temel` içinde koda dökülmüştür; `tablo` aracı hepsini
kendiliğinden uygular.

## 1. Sızıntı (leakage) tuzakları

Sızıntı: değerlendirmede, gerçek kullanımda var olmayacak bir bilginin modele ulaşması. Sonuç her zaman
aynıdır: çapraz doğrulama ve sınama puanı parlak, gerçek hayatta model başarısız.

| Tuzak | Örnek | Belirti | Önlem (ml-temel'de) |
| --- | --- | --- | --- |
| **Ön işleme bütün veride uyduruldu** | Ölçekleme ortalaması, eksik doldurma değeri, TF-IDF sözlüğü, hedef ortalaması kodlaması bütün veriden hesaplandı, sonra çapraz doğrulandı | Çapraz doğrulama sınamadan belirgin iyi | Ön işleme + model tek `Pipeline`; `cross_validate` her katta hattın temiz kopyasını yalnız kat eğitim satırlarıyla uydurur (`tests/test_secim.py` bunu kanıtlar). `ornekler/03_musteri_kaybi.py`: yanlış kodlamayla ROC-AUC 1,000, doğrusuyla 0,500 |
| **Zaman sırası** | Gelecekteki satırlarla eğitip geçmişi tahmin etmek; rastgele karıştırılmış zaman serisi | Canlıda başarı düşer; özellikle eğilimli veride | `TimeSeriesSplit` (eğitim hep geçmişte), `train_test_split(shuffle=False)`, `tablo --zaman`; hedef gelecekteki bir pencereden hesaplanıyorsa `TimeSeriesSplit(gap=...)` |
| **Grup** | Aynı müşterinin satırları hem eğitimde hem sınamada; model kişiyi "tanır" | Yeni müşterilerde başarı düşer | `GroupKFold`, `train_test_split(groups=...)`, `tablo --grup`; önyükleme `bootstrap_ci(groups=...)` |
| **Hedef sızıntısı** | Hedeften sonra oluşan bilgi: "iptal_tarihi", "tahsilat_durumu"; ya da hedefin kopyası | Neredeyse kusursuz puan; tek sütun baskın | `tablo` uyarıları: başarı ≥ 0,995 ve tek sütunun önemin ≥ %60'ını taşıması |
| **Kopya satırlar** | Aynı kayıt veride birden çok kez | Sınama iyimser | `tablo` uyarısı: sınama satırlarının > %1'i eğitimde birebir varsa |
| **Model seçimi sınamada yapıldı** | Onlarca modeli/ayarı sınama kümesinde deneyip en iyisini raporlamak | Raporlanan puan iyimser | Seçim yalnız çapraz doğrulamayla; sınama kümesi en sonda, bir kez. `GridSearchCV.best_score_` de iyimserdir: dürüst ölçüm için iç içe çapraz doğrulama (`cross_validate(GridSearchCV(...), ...)`) |

## 2. Doğru ayrım seçimi

| Verinin yapısı | Eğitim/sınama ayrımı | Çapraz doğrulama | `tablo` |
| --- | --- | --- | --- |
| Bağımsız satırlar, sınıflandırma | `train_test_split(stratify=y)` | `StratifiedKFold(5, shuffle=True)` | varsayılan |
| Bağımsız satırlar, regresyon | `train_test_split()` | `KFold(5, shuffle=True)` | varsayılan |
| Aynı varlığa ait birden çok satır | `train_test_split(groups=g)` | `GroupKFold(5)` + `groups=g` | `--grup sutun` |
| Zaman sıralı olay (satış, işlem, abonelik) | `train_test_split(shuffle=False)` (son %20) | `TimeSeriesSplit(5)` (+ `gap`) | `--zaman sutun` |
| Hem zaman hem grup | zamana göre ayırın; grup çakışmasını ayrıca denetleyin | `TimeSeriesSplit` | `--zaman` önceliklidir, rapor uyarır |
| Çok az veri (< ~200 satır) | ayrı sınama yerine tekrarlı çapraz doğrulama düşünün | `StratifiedKFold` | rapor "küçük sınama" uyarır |

Kural: **tahmin anında modelin önünde ne olacaksa, değerlendirmede de yalnız o olmalı.** Yeni müşteri
için tahmin yapacaksanız sınama da yeni müşterilerden oluşmalı (grup); gelecek ay için tahmin yapacaksanız
sınama gelecekten olmalı (zaman).

## 3. Ölçüt seçimi

| Soru | Ölçüt | Not |
| --- | --- | --- |
| Riskli olanları doğru sıralıyor muyum? (ikili) | **ROC-AUC** | Sınıf oranından etkilenmez; 0,5 = yazı-tura |
| Pozitifler azken (dolandırıcılık, kayıp) yakalıyor muyum? | **PR-AUC** (ortalama kesinlik) | Taban değeri pozitif oranıdır, 0,5 değil |
| Olasılıklarım doğru mu? | **log-kayıp**, **Brier**, **ECE** + kalibrasyon tablosu | Karar olasılıkla veriliyorsa (beklenen maliyet) şart |
| Belirli bir eşikte karar | kesinlik, duyarlılık, F1, karışıklık matrisi | Eşiği yanlış alarm / kaçırma maliyetine göre seçin |
| Dengesiz sınıflarda tek sayı | **dengeli doğruluk**, makro F1 | Düz doğruluk yanıltır (%95 "hayır" verisinde hep "hayır" = %95) |
| Çok sınıflı | log-kayıp (ana), doğruluk, makro F1 | `tablo` ana ölçütü log-kayıptır |
| Regresyon, tipik hata | **MAE** (aykırıya dayanıklı), **RMSE** (büyük hatayı cezalandırır) | Hedefle aynı birimde |
| Regresyon, açıklanan pay | **R²** | 0 = ortalamayı söylemek kadar; negatif olabilir |

Her zaman **taban çizgisiyle** karşılaştırın (`DummyClassifier` / `DummyRegressor`); `tablo` her
ölçütün yanında yazar. Model tabanı geçemiyorsa sütunlar hedef hakkında bilgi taşımıyor olabilir.

## 4. Güven aralığı

Sınama kümesi olası verilerden yalnız bir örneklemdir. **Önyükleme (bootstrap):** sınama satırları
yerine koyarak yeniden örneklenir, ölçüt her seferinde yeniden hesaplanır; dağılımın %2,5 ve %97,5
dilimleri %95 güven aralığıdır (`olcut.bootstrap_ci`).

| Durum | Ne yapmalı |
| --- | --- |
| Sınıflandırma | `stratify=True`: her sınıf kendi içinde örneklenir (azınlık sınıfı hiç çıkmayan örneklem olmaz) |
| Gruplu veri | `groups=...`: grup bütün olarak örneklenir; yoksa aralık olduğundan dar çıkar |
| İki modeli karşılaştırma | Farkın aralığına bakın: `bootstrap_ci(lambda y, a, b: m(y, a) - m(y, b), y, pa, pb)`; aralık 0'ı içeriyorsa fark kanıtlanmamıştır |
| Aralık çok geniş | Sınama kümesi küçük; daha çok veri toplayın ya da tekrarlı çapraz doğrulama kullanın |

Okuma: "ROC-AUC 0,865 (%95 GA 0,815–0,904)" → bu sınama kümesine benzer başka bir örneklemde değerin
büyük olasılıkla 0,815 ile 0,904 arasında çıkması beklenir. Aralık yalnız örnekleme belirsizliğini
kapsar; veri toplama yanlılığını (ör. yalnız bir bölgeden gelen müşteriler) kapsamaz.

## 5. `tablo` aracının izlediği sıra

1. Sınama kümesi en başta ayrılır (strateji yukarıdaki tablodan).
2. Bütün adaylar ve taban çizgisi **aynı katlarla** çapraz doğrulanır; ön işleme her katta yeniden uydurulur.
3. En iyi aday ana ölçüte (ikili: ROC-AUC, çok sınıflı: log-kayıp, regresyon: RMSE) göre seçilir.
4. Kalibrasyon kararı kat dışı tahminlerle, iç çapraz doğrulamayla verilir.
5. En iyi aday bütün eğitim verisiyle yeniden eğitilir.
6. Sınama kümesi **ilk ve tek kez** kullanılır: ölçütler + güven aralıkları + kalibrasyon + permütasyon önemi.
