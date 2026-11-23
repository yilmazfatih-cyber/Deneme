"""Görüntü sınıflandırma ince ayarı (timm modelleri).

Modüller (veri akış sırasıyla):
- `config.py`      : TOML şeması (`yapilandirma/siniflandirma/*.toml`).
- `dataset.py`     : klasör yapısından veri (sınıf başına klasör; isteğe bağlı hazır ayrım klasörleri).
- `split.py`       : katmanlı + kopya-farkında + grup-farkında ayrım (sızıntısız).
- `model.py`       : timm modeli + girdi normalleştirici sarmalayıcı, dondurma, kayıt/yükleme. (torch)
- `data.py`        : torch veri kümeleri; veri artırma YALNIZ eğitimde. (torch)
- `train.py`       : eğitim döngüsü (erken durdurma, dengesizlik, ayrımlı öğrenme oranı). (torch)
- `metrics.py`     : doğruluk, makro F1, karışıklık matrisi, en çok karıştırılan çiftler. (numpy)
- `calibration.py` : sıcaklık ölçekleme, ECE, "emin değilim" eşiği. (numpy)
- `evaluate.py`    : rapor üretimi (PyTorch ya da ONNX çıktısından).
- `plan.py`        : `--kuru`: plan + bellek ve süre kestirimi.
- `predict.py`     : eğitilmiş modelle tahmin. (torch)
torch isteyen modüller ağır içe aktarmayı işlevlerin içinde yapar.

Genişletme: yeni bir eğitim seçeneği → `config.py` alanı + `train.py` uygulaması + hazır ayarlar.
"""
