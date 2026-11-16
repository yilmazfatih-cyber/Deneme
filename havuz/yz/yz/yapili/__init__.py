"""Yapılı çıktı: model çıktısından şemaya uyan nesne (katmanlı strateji + JSON onarımı).

    from yz.yapili import cikar
    from yz.yapili.semalar import Fatura
    sonuc = cikar(saglayici, Fatura, fatura_metni)
    print(sonuc.rapor())          # hangi katman, kaç onarım turu, hangi onarımlar
    fatura = sonuc.zorla()        # başarısızsa ayrıntılı hata

Adlar ilk kullanımda yüklenir (yz/tembel.py; döngüsel içe aktarmaya karşı). Paket İÇİNDEN
içe aktarırken her zaman tanımlandığı modülü kullanın (ör. `from yz.yapili.json_onar import ...`).
Genişletme: dışa açılan yeni ad → TYPE_CHECKING bloğu + `_KAYNAKLAR` + `__all__`.
"""

from typing import TYPE_CHECKING

from yz.tembel import tembel_erisim

if TYPE_CHECKING:
    from yz.yapili.cikar import KATMANLAR, Cikarici, CikarimSonucu, Deneme, cikar
    from yz.yapili.gbnf import semadan_gbnf
    from yz.yapili.json_onar import AyiklamaSonucu, json_ayikla, json_coz
    from yz.yapili.sema_araclari import alan_listesi, iskelet, sema_ile_duzelt, turkce_sayi

_KAYNAKLAR = {
    "KATMANLAR": "yz.yapili.cikar",
    "AyiklamaSonucu": "yz.yapili.json_onar",
    "Cikarici": "yz.yapili.cikar",
    "CikarimSonucu": "yz.yapili.cikar",
    "Deneme": "yz.yapili.cikar",
    "alan_listesi": "yz.yapili.sema_araclari",
    "cikar": "yz.yapili.cikar",
    "iskelet": "yz.yapili.sema_araclari",
    "json_ayikla": "yz.yapili.json_onar",
    "json_coz": "yz.yapili.json_onar",
    "sema_ile_duzelt": "yz.yapili.sema_araclari",
    "semadan_gbnf": "yz.yapili.gbnf",
    "turkce_sayi": "yz.yapili.sema_araclari",
}
__getattr__ = tembel_erisim(__name__, _KAYNAKLAR)

__all__ = [
    "KATMANLAR",
    "AyiklamaSonucu",
    "Cikarici",
    "CikarimSonucu",
    "Deneme",
    "alan_listesi",
    "cikar",
    "iskelet",
    "json_ayikla",
    "json_coz",
    "sema_ile_duzelt",
    "semadan_gbnf",
    "turkce_sayi",
]
