"""Ortak test düzeneği: her test geçici bir AIP_DATA_DIR ile, temiz ayar ve veritabanı motoruyla çalışır."""

from __future__ import annotations

import pytest

from aiplatform.config import get_settings, reset_settings
from aiplatform.db import reset_db


@pytest.fixture(autouse=True)
def aip_data_dir(tmp_path, monkeypatch):
    """Geçici veri klasörü (modeller, platform.db, günlükler). Ayarlar ve DB motoru test başında/sonunda sıfırlanır."""
    data = tmp_path / "aipdata"
    monkeypatch.setenv("AIP_DATA_DIR", str(data))
    monkeypatch.setenv("AIP_ROLE", "server")
    reset_settings()
    reset_db()
    get_settings()  # klasörleri oluşturur
    yield data
    reset_db()
    reset_settings()


@pytest.fixture
def settings(aip_data_dir):
    return get_settings()
