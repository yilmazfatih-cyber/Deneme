"""Klasör yolları: başvuru verisi, katalog, örnekler ve çalışma klasörü nerede?

Paket yerinde (``pip install -e .``) kurulur; veri dosyaları paketin bir üst klasöründe durur.
Başka bir yerden çalıştırıyorsanız ``VERIHAVUZU_KOK`` ortam değişkeniyle kökü gösterin.
Genişletme: yeni bir üst klasör eklerseniz buraya bir işlev ekleyin; kodun başka yerinde yol
kurmayın.
"""

from __future__ import annotations

import os
from pathlib import Path


def root_dir() -> Path:
    """Temelin kök klasörünü döndürür (içinde ``tr/`` ve ``katalog/`` bulunan klasör)."""
    env = os.environ.get("VERIHAVUZU_KOK")
    root = Path(env) if env else Path(__file__).resolve().parent.parent
    if not (root / "tr").is_dir():
        raise FileNotFoundError(
            f"Başvuru verisi klasörü bulunamadı: {root / 'tr'}. Paketi temel klasöründe "
            "`pip install -e .` ile kurun ya da VERIHAVUZU_KOK ortam değişkenini ayarlayın."
        )
    return root


def tr_dir() -> Path:
    """Türkçe başvuru verilerinin klasörü (``tr/``)."""
    return root_dir() / "tr"


def catalog_dir() -> Path:
    """Açık veri kümeleri kataloğunun klasörü (``katalog/``)."""
    return root_dir() / "katalog"


def examples_dir() -> Path:
    """Hazır örnek kümelerin klasörü (``ornekler/``)."""
    return root_dir() / "ornekler"


def work_dir() -> Path:
    """Çalışma klasörü: önbellek, indirilenler, hat çıktıları. Depoya girmez (``.gitignore``)."""
    env = os.environ.get("VERIHAVUZU_CALISMA")
    path = Path(env) if env else root_dir() / "calisma"
    path.mkdir(parents=True, exist_ok=True)
    return path
