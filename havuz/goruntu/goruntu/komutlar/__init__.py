"""Komut satırı komutlarının uygulamaları (her dosya bir komut grubu).

- `base.py`       : `Command` tanımı ve ortak seçenekler.
- `prepare.py`    : hazirla, temizle
- `duplicates.py` : kopya-bul, sizinti
- `classify.py`   : egit, degerlendir, tahmin, disa-aktar
- `search.py`     : indeksle, ara, benzer, sifir-atis, arama-olc
- `misc.py`       : modeller, ornek-veri, sun
Bu modüller ağır kütüphane içe aktarmaz; ağır iş, komut çalışırken ilgili paketten çağrılır.

Genişletme: yeni komutun nereye ekleneceği `goruntu/commands.py` başlığında yazar.
"""
