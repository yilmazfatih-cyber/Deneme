"""Değerlendirme: görev kümesi (JSONL) + koşu tanımı (YAML) → puan, rapor, model karşılaştırması.

    from yz.degerlendirme import tanim_yukle, kosu_yap, kosu_md
    tanim = tanim_yukle("gorevler/siniflandirma.yaml")
    kosu = kosu_yap(tanim, saglayici)
    print(kosu_md(kosu))

Genişletme: dışa açılan her yeni ad `__all__` listesine eklenir.
"""

from yz.degerlendirme.karsilastir import en_iyi, karsilastir, karsilastirma_raporu
from yz.degerlendirme.kosu import KosuSonucu, OrnekSonucu, kosu_yap
from yz.degerlendirme.puanlayici import PUANLAYICILAR, Puan, PuanBaglami, puanla
from yz.degerlendirme.rapor import Gerileme, gerileme_bul, karsilastirma_md, kosu_html, kosu_md
from yz.degerlendirme.tanim import (
    KosuTanimi,
    Ornek,
    PuanlayiciAyari,
    ornekleri_yukle,
    sema_yukle,
    tanim_yukle,
)

__all__ = [
    "PUANLAYICILAR",
    "Gerileme",
    "KosuSonucu",
    "KosuTanimi",
    "Ornek",
    "OrnekSonucu",
    "Puan",
    "PuanBaglami",
    "PuanlayiciAyari",
    "en_iyi",
    "gerileme_bul",
    "karsilastir",
    "karsilastirma_md",
    "karsilastirma_raporu",
    "kosu_html",
    "kosu_md",
    "kosu_yap",
    "ornekleri_yukle",
    "puanla",
    "sema_yukle",
    "tanim_yukle",
]
