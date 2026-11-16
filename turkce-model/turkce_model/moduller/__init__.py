"""İsteğe bağlı modüller: DeepSeek'in açık küçük modelleri yardımcı araç olarak bağlanır.

Dil modelinin kendisi sıfırdan eğitilir ve hazır ağırlık kullanmaz; modüller ona ağırlık ya da eğitim sinyali
katmaz. Bilgisayarında çalışan yerel bir model sunucusu (ör. Ollama) üzerinden çağrılırlar:

* ``ocr``   — DeepSeek-OCR: taranmış kitapçıkları ve soru fotoğraflarını metne çevirir.
* ``metin`` — küçük bir DeepSeek metin modeli: aynı sorularda kıyas satırı üretir.

Modüller varsayılan olarak kapalıdır (``ayarlar.toml`` → ``[moduller]``). Hangi DeepSeek modelinin hangi işe
yaradığı ve hangilerinin neden bağlanamadığı: ``katalog.py``.
"""
