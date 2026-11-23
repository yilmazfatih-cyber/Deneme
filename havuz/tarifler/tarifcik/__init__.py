"""tarifcik: tarif betiklerinin (uygula.py, dogrula.py) ve `tarif.py`'nin ortak yardımcıları.

Yalnız Python standart kütüphanesi kullanılır; böylece tarifler sanal ortam kurmadan çalışır.
Modüller: yollar (tarif kaydı), komut (adım çalıştırma ve özet), kurulum (temel kopyalama, npm/uv),
yama (birleşik fark üret/uygula), yerlestir (dosyalar/ klasörü), sunucu (süreç ve HTTP), bicim (kurallar).
Genişletme: yeni ortak yardımcı → uygun modüle işlev ekleyin ve tests/ altında testini yazın; paket
`__init__`'inden değil tanımlandığı modülden içe aktarın.
"""
