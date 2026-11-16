"""Testlerin ortak ayarı: sonuç ve kayıt klasörleri her testte geçici klasöre yönlenir (gerçek dosyalara dokunulmaz).

Genişletme: birden çok testin ihtiyaç duyduğu yeni bir hazırlık burada `fixture` olarak yazılır.
"""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def gecici_klasorler(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("SINAV_SONUCLAR", str(tmp_path / "sonuclar"))
    monkeypatch.setenv("SINAV_CALISMA", str(tmp_path / "calisma"))
    return tmp_path
