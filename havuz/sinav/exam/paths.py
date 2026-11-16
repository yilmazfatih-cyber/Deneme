"""Sınavın klasörleri: havuz kökü, görevler, sonuçlar, çalışma kayıtları, ortak araçlar.

Testler sonuç ve kayıt klasörlerini ortam değişkeniyle geçici klasörlere yönlendirir
(`SINAV_SONUCLAR`, `SINAV_CALISMA`); böylece gerçek sonuç dosyalarına dokunulmaz.

Genişletme: yeni bir klasör gerekiyorsa buraya bir işlev ekleyin; yolu kodun içine gömmeyin.
"""

from __future__ import annotations

import os
from pathlib import Path

SINAV = Path(__file__).resolve().parent.parent
HAVUZ = SINAV.parent
ARACLAR = HAVUZ / "araclar"
GOREVLER = SINAV / "gorevler"
ISTEMLER = HAVUZ / "rehber" / "ISTEMLER.md"


def results_dir() -> Path:
    """Sonuç dosyalarının (`<etiket>.jsonl`) klasörü."""
    return Path(os.environ.get("SINAV_SONUCLAR", SINAV / "sonuclar"))


def work_dir() -> Path:
    """Hazırlık kayıtlarının ve puanlama günlüklerinin klasörü (depoya girmez)."""
    return Path(os.environ.get("SINAV_CALISMA", SINAV / "calisma"))


def records_dir() -> Path:
    return work_dir() / "kayitlar"


def repo_root() -> Path:
    """Havuzun içinde bulunduğu git deposunun kökü (görev klasörü bunun DIŞINDA açılmalı)."""
    return HAVUZ.parent
