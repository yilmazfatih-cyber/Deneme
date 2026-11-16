"""ml_temel — yalnız numpy ile sıfırdan makine öğrenmesi temeli.

Alt paketler (her birinin `__init__.py`'si içindekileri listeler):
  autograd   ters kipli otomatik türev (Tensor, işlemler, gradyan denetimi)
  nn, optim  sinir ağı katmanları (MLP, Transformer, minik GPT, evrişim) ve optimizer'lar
  klasik     scikit-learn arayüzlü klasik modeller (doğrusal, ağaçlar, orman, gradyan artırma…)
  onisleme   ölçekleme, kodlama, eksik doldurma, TF-IDF, Pipeline, ColumnTransformer
  secim      ayrımlar, çapraz doğrulama, ızgara araması (sızıntısız değerlendirme)
  olcut      ölçütler ve önyükleme güven aralığı
  tablo      CSV'den modele araç: `python -m ml_temel egit --veri x.csv --hedef sutun`
  zaman      zaman serisi tabanları ve geriye dönük sınama
  veri       tohumlu sentetik veri üreteçleri
Model dosyaları pickle'sız ve güvenlidir: `persistence.py` + `registry.py`.
"""

__version__ = "0.1.0"
