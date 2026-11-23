"""Dışa aktarım ve torch'suz çıkarım.

Modüller:
- `bundle.py`      : paket üst verisi (etiketler, ön işleme, sıcaklık, eşik) — ONNX dosyasının İÇİNE
                     (`metadata_props`) gömülür: tek dosyalık çıkarım paketi. Yanına `paket.json` da yazılır
                     (tarayıcı gibi üst veri okuyamayan çalışma zamanları için).
- `onnx_export.py` : PyTorch → ONNX (+ isteğe bağlı int8 dinamik nicemleme) ve PyTorch ile eşdeğerlik ölçümü.
- `runtime.py`     : onnxruntime + numpy + pillow ile çıkarım; torch YÜKLEMEZ (test denetler).

Genişletme: başka bir biçime (ör. TFLite) aktarım için yeni bir modül yazın; paket üst verisi aynı
`BundleMeta` şemasını kullansın.
"""
