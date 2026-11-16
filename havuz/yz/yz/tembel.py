"""Paket `__init__` dosyaları için tembel (ilk kullanımda) içe aktarma — döngüsel içe aktarmaya karşı.

Neden: `yapili`, `rag`, `istem` paketleri hem alt düzey modüller (json_onar, gomme, sablonlar)
hem üst düzey modüller (cikar, yanit) içerir. `__init__` hepsini baştan içe aktarırsa, yalnız alt
düzey bir modülü isteyen kardeş paket (ör. saglayici → yapili.json_onar) döngüye düşer.
Kural testi: tests/test_kurallar.py her modülü boş bir içe aktarma durumundan yükler.
Kullanım (bir paketin __init__.py'sinde):
    __getattr__ = tembel_erisim(__name__, {"cikar": "yz.yapili.cikar", ...})
Genişletme: pakete yeni ad → hem `TYPE_CHECKING` içe aktarmasına, hem tabloya, hem `__all__`'a.
"""

from __future__ import annotations

import importlib
import sys
from collections.abc import Callable
from typing import Any


def tembel_erisim(paket_adi: str, kaynaklar: dict[str, str]) -> Callable[[str], Any]:
    """`ad → modül yolu` tablosundan, modül düzeyinde `__getattr__` olarak kullanılacak işlev üretir."""

    def erisim(ad: str) -> Any:
        modul_yolu = kaynaklar.get(ad)
        if modul_yolu is None:
            raise AttributeError(
                f"`{paket_adi}` içinde `{ad}` yok. Geçerli adlar: {', '.join(sorted(kaynaklar))}"
            )
        deger = getattr(importlib.import_module(modul_yolu), ad)
        setattr(sys.modules[paket_adi], ad, deger)  # sonraki erişimler doğrudan
        return deger

    return erisim
