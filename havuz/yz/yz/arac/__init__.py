"""Araçlar: Python işlevinden model aracı, araç kutusu (izin + onay), hazır araçlar.

    from yz.arac import arac, AracKutusu
    @arac
    def kur_cevir(tutar: float, kur: float) -> str:
        '''Tutarı verilen kurla çevirir.'''
        return str(tutar * kur)

Genişletme: dışa açılan her yeni ad `__all__` listesine eklenir.
"""

from yz.arac.kutu import AracKutusu, OnayKancasi
from yz.arac.tanim import Arac, AracSonucu, arac, belge_dizgisini_coz, cikti_metni

__all__ = [
    "Arac",
    "AracKutusu",
    "AracSonucu",
    "OnayKancasi",
    "arac",
    "belge_dizgisini_coz",
    "cikti_metni",
]
