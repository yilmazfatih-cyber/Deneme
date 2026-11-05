"""Ortak test yardımcıları. Hiçbir test ağa ya da gerçek modele ihtiyaç duymaz."""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:  # paket kurulmadan da çalışsın
    sys.path.insert(0, str(ROOT))


@pytest.fixture(autouse=True)
def _isolated_env(monkeypatch, tmp_path):
    """Kullanıcının ortam değişkenleri ve text2sql.toml'u testleri etkilemesin."""
    for var in ("TEXT2SQL_MODEL", "TEXT2SQL_BASE_MODEL", "TEXT2SQL_BACKEND", "TEXT2SQL_GGUF", "TEXT2SQL_PROFIL",
                "TEXT2SQL_NUM_CTX", "TEXT2SQL_TIMEOUT", "TEXT2SQL_DB", "OLLAMA_HOST"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.chdir(tmp_path)


def load_builder():
    spec = importlib.util.spec_from_file_location("ornek_olustur", ROOT / "ornek" / "olustur.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def dukkan_db(tmp_path) -> str:
    path = tmp_path / "dukkan.sqlite"
    load_builder().build(path)
    return str(path)


@pytest.fixture
def small_db(tmp_path) -> str:
    path = tmp_path / "kucuk.db"
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE yazarlar (id INTEGER PRIMARY KEY, ad TEXT NOT NULL);
        CREATE TABLE kitaplar (
          id INTEGER PRIMARY KEY,
          baslik TEXT NOT NULL,  -- kitabın adı
          yazar_id INTEGER REFERENCES yazarlar(id),
          yil INTEGER
        );
        CREATE TABLE etiketler (kitap_id INTEGER, etiket TEXT, PRIMARY KEY (kitap_id, etiket));
        CREATE VIEW yeni_kitaplar AS SELECT baslik, yil FROM kitaplar WHERE yil >= 2000;
        INSERT INTO yazarlar VALUES (1, 'Sabahattin Ali'), (2, 'Orhan Pamuk'), (3, 'Sait Faik');
        INSERT INTO kitaplar VALUES (1, 'Kuyucaklı Yusuf', 1, 1937), (2, 'Kar', 2, 2002), (3, 'Masumiyet Müzesi', 2, 2008);
        INSERT INTO etiketler VALUES (1, 'roman'), (2, 'roman');
        """
    )
    con.commit()
    con.close()
    return str(path)
