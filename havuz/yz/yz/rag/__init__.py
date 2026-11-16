"""Belgeye soru sorma (RAG): yükle → temizle → parçala → dizinle → ara → kaynaklı yanıt.

    from yz.rag import RagDizini, RagHatti, klasor_yukle
    dizin = RagDizini()                  # varsayılan: bağımlılıksız KarmaGomme
    dizin.ekle(klasor_yukle("belgelerim"))
    sonuc = RagHatti(dizin, saglayici).sor("İade süresi kaç gün?")

Adlar ilk kullanımda yüklenir (yz/tembel.py; döngüsel içe aktarmaya karşı). Paket İÇİNDEN
içe aktarırken her zaman tanımlandığı modülü kullanın (ör. `from yz.rag.gomme import KarmaGomme`).
Genişletme: dışa açılan yeni ad → TYPE_CHECKING bloğu + `_KAYNAKLAR` + `__all__`.
"""

from typing import TYPE_CHECKING

from yz.tembel import tembel_erisim

if TYPE_CHECKING:
    from yz.rag.bm25 import BM25, belirtecle
    from yz.rag.degerlendir import GetirmeOlcumu, GetirmeSorusu, getirme_olc, sorulari_yukle
    from yz.rag.dizin import AramaSonucu, RagDizini, rrf_birlestir
    from yz.rag.gomme import CumleDonusturucuGomme, Gomme, KarmaGomme, SaglayiciGomme
    from yz.rag.parcala import Parca, belgeyi_parcala
    from yz.rag.siralama import ModelSiralayici, sozcuk_ortusmesi_siralayici
    from yz.rag.vektor_deposu import VektorDeposu
    from yz.rag.yanit import RagHatti, SorYaniti, atiflari_bul, dayanaksizlari_bul, enjeksiyon_var
    from yz.rag.yukleyici import Belge, bayttan_yukle, dosya_yukle, klasor_yukle

_KAYNAKLAR = {
    "BM25": "yz.rag.bm25",
    "AramaSonucu": "yz.rag.dizin",
    "Belge": "yz.rag.yukleyici",
    "CumleDonusturucuGomme": "yz.rag.gomme",
    "GetirmeOlcumu": "yz.rag.degerlendir",
    "GetirmeSorusu": "yz.rag.degerlendir",
    "Gomme": "yz.rag.gomme",
    "KarmaGomme": "yz.rag.gomme",
    "ModelSiralayici": "yz.rag.siralama",
    "Parca": "yz.rag.parcala",
    "RagDizini": "yz.rag.dizin",
    "RagHatti": "yz.rag.yanit",
    "SaglayiciGomme": "yz.rag.gomme",
    "SorYaniti": "yz.rag.yanit",
    "VektorDeposu": "yz.rag.vektor_deposu",
    "atiflari_bul": "yz.rag.yanit",
    "bayttan_yukle": "yz.rag.yukleyici",
    "belgeyi_parcala": "yz.rag.parcala",
    "belirtecle": "yz.rag.bm25",
    "dayanaksizlari_bul": "yz.rag.yanit",
    "dosya_yukle": "yz.rag.yukleyici",
    "enjeksiyon_var": "yz.rag.yanit",
    "getirme_olc": "yz.rag.degerlendir",
    "klasor_yukle": "yz.rag.yukleyici",
    "rrf_birlestir": "yz.rag.dizin",
    "sorulari_yukle": "yz.rag.degerlendir",
    "sozcuk_ortusmesi_siralayici": "yz.rag.siralama",
}
__getattr__ = tembel_erisim(__name__, _KAYNAKLAR)

__all__ = [
    "BM25",
    "AramaSonucu",
    "Belge",
    "CumleDonusturucuGomme",
    "GetirmeOlcumu",
    "GetirmeSorusu",
    "Gomme",
    "KarmaGomme",
    "ModelSiralayici",
    "Parca",
    "RagDizini",
    "RagHatti",
    "SaglayiciGomme",
    "SorYaniti",
    "VektorDeposu",
    "atiflari_bul",
    "bayttan_yukle",
    "belgeyi_parcala",
    "belirtecle",
    "dayanaksizlari_bul",
    "dosya_yukle",
    "enjeksiyon_var",
    "getirme_olc",
    "klasor_yukle",
    "rrf_birlestir",
    "sorulari_yukle",
    "sozcuk_ortusmesi_siralayici",
]
