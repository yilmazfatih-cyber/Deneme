"""İstem yardımcıları: şablonlar, az-örnek seçimi, bağlam bütçesi, konuşma belleği.

Adlar ilk kullanımda yüklenir (yz/tembel.py; döngüsel içe aktarmaya karşı). Paket İÇİNDEN
içe aktarırken her zaman tanımlandığı modülü kullanın (ör. `from yz.istem.sablonlar import sablon`).
Genişletme: dışa açılan yeni ad → TYPE_CHECKING bloğu + `_KAYNAKLAR` + `__all__`.
"""

from typing import TYPE_CHECKING

from yz.tembel import tembel_erisim

if TYPE_CHECKING:
    from yz.istem.az_ornek import AzOrnekSecici, Ornek, ornek_mesajlari
    from yz.istem.bellek import OzetleyenBellek
    from yz.istem.butce import BaglamButcesi, mesaj_belirteci, mesajlari_sigdir, parcalari_sigdir
    from yz.istem.sablonlar import SABLONLAR, sablon

_KAYNAKLAR = {
    "SABLONLAR": "yz.istem.sablonlar",
    "AzOrnekSecici": "yz.istem.az_ornek",
    "BaglamButcesi": "yz.istem.butce",
    "Ornek": "yz.istem.az_ornek",
    "OzetleyenBellek": "yz.istem.bellek",
    "mesaj_belirteci": "yz.istem.butce",
    "mesajlari_sigdir": "yz.istem.butce",
    "ornek_mesajlari": "yz.istem.az_ornek",
    "parcalari_sigdir": "yz.istem.butce",
    "sablon": "yz.istem.sablonlar",
}
__getattr__ = tembel_erisim(__name__, _KAYNAKLAR)

__all__ = [
    "SABLONLAR",
    "AzOrnekSecici",
    "BaglamButcesi",
    "Ornek",
    "OzetleyenBellek",
    "mesaj_belirteci",
    "mesajlari_sigdir",
    "ornek_mesajlari",
    "parcalari_sigdir",
    "sablon",
]
