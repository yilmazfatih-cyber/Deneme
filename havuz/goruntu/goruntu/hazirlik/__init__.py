"""Görüntü hazırlama: güvenli açma, EXIF yönü, üst veri temizliği, boyutlandırma, model girdisi.

Modüller:
- `loader.py`      : dosyayı/baytları GÜVENLE açar (boyut, piksel, biçim sınırı) ve EXIF yönünü uygular.
- `metadata.py`    : kişisel üst veriyi (GPS, kamera, yazar, XMP…) bulur; üst verisiz kodlar.
- `resize.py`      : en-boy oranını koruyarak boyutlandırma (sığdır / kırp / doldur / kısa kenar).
- `model_input.py` : modele giren dizinin TEK tanımı (eğitim, ONNX ve sunucu aynısını kullanır).
- `batch.py`       : klasör → klasör toplu işlem (`hazirla`, `temizle` komutları) ve rapor.
Bu paket torch İSTEMEZ (yalnız numpy + pillow + pydantic).

Genişletme: yeni bir hazırlık adımı için ayrı bir modül açın; toplu işleme `batch.py` içinden bağlayın.
"""
