"""Veri havuzu: Türkçe başvuru verileri, sentetik veri, veri kalitesi, veri hattı ve katalog.

Bu paket dört alt paketten oluşur:
  - ``sentetik``: tohumlu, ilişkisel tutarlı sahte veri üreteçleri
  - ``kalite``  : şema doğrulama, profil, denetim, kayma, ayırma, yineleme, kişisel veri
  - ``hat``     : nazik HTTP getirici ve veri hattı iskeleti
  - ``katalog`` : açık veri kümeleri kataloğu (arama, doğrulama, indirme)
Komut satırı: ``python -m verihavuzu --help``.
Genişletme: yeni bir alt komut için ``cli/main.py`` içindeki "YENİ KOMUT BURAYA" satırına bakın.
"""

__version__ = "0.1.0"
