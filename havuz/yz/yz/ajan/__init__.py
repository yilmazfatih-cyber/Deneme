"""Ajan: araç kullanan döngü (yerel ya da metin kipi), onay kancaları, iş akışı.

    from yz.ajan import Ajan
    from yz.arac.hazir import hesap_araci, zaman_araclari
    sonuc = Ajan(saglayici, [hesap_araci, *zaman_araclari()]).calistir("1250'nin %18'i kaç?")
    print(sonuc.yanit, sonuc.durma_nedeni)

Genişletme: dışa açılan her yeni ad `__all__` listesine eklenir.
"""

from yz.ajan.dongu import Adim, Ajan, AjanAyari, AjanSonucu
from yz.ajan.is_akisi import AkisSonucu, IsAdimi, IsAkisi
from yz.ajan.metin_kipi import MetinKarari, araclari_yaz, coz
from yz.ajan.onay import hepsini_onayla, hepsini_reddet, konsoldan_sor, listeden_onayla

__all__ = [
    "Adim",
    "Ajan",
    "AjanAyari",
    "AjanSonucu",
    "AkisSonucu",
    "IsAdimi",
    "IsAkisi",
    "MetinKarari",
    "araclari_yaz",
    "coz",
    "hepsini_onayla",
    "hepsini_reddet",
    "konsoldan_sor",
    "listeden_onayla",
]
