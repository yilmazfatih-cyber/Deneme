"""Yönetim arayüzü statik dosyaları: uygulama üzerinden sunulur, harici kaynak yok, sayfa modülleri mevcut."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

WEB = Path(__file__).resolve().parents[1] / "aiplatform" / "web"
JS_FILES = sorted(p.relative_to(WEB).as_posix() for p in WEB.rglob("*.js"))
PAGES = ["magaza", "kurulu", "sistem", "denetim", "onaylar", "erp"]


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import os

    from aiplatform import config, db

    old = os.environ.get("AIP_DATA_DIR")
    os.environ["AIP_DATA_DIR"] = str(tmp_path_factory.mktemp("web"))
    config.reset_settings()
    db.reset_db()
    from aiplatform.api.app import create_app

    try:
        yield TestClient(create_app())  # lifespan çalıştırılmaz: yalnız statik dosyalar
    finally:
        if old is None:
            os.environ.pop("AIP_DATA_DIR", None)
        else:
            os.environ["AIP_DATA_DIR"] = old
        db.reset_db()
        config.reset_settings()


def test_index(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "<title>Yerel AI Platformu</title>" in r.text
    assert 'lang="tr"' in r.text
    for p in PAGES:
        assert f'href="#/{p}"' in r.text


@pytest.mark.parametrize("path", JS_FILES + ["app.css"])
def test_statik_dosyalar_sunulur(client, path):
    r = client.get(f"/{path}")
    assert r.status_code == 200, path
    if path.endswith(".js"):
        assert "javascript" in r.headers["content-type"]


def test_sayfa_modulleri_var():
    for p in PAGES:
        src = (WEB / "js" / "pages" / f"{p}.js").read_text(encoding="utf-8")
        assert "export async function render" in src, p
    for name in ("api.js", "router.js", "components.js", "app.js"):
        assert (WEB / "js" / name).exists()


def test_harici_kaynak_yok():
    """Platform internetsiz çalışır: CDN, uzak yazı tipi, mutlak http(s) adresi yok."""
    pat = re.compile(
        r"""(?:src|href)\s*=\s*["']https?://|@import\s+url\(\s*["']?https?://|from\s+["']https?://|import\(\s*["']https?://"""
    )
    for p in WEB.rglob("*"):
        if p.suffix in {".html", ".css", ".js"}:
            text = p.read_text(encoding="utf-8")
            assert not pat.search(text), p
            assert "cdn." not in text.lower(), p


def test_yalniz_goreli_api_cagrilari():
    for p in (WEB / "js").rglob("*.js"):
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r"""api\.(?:get|post|patch|del)\(\s*[`"']([^`"']+)""", text):
            assert m.group(1).startswith("/api/"), (p.name, m.group(1))


def test_esm_importlari_cozulur():
    """Göreli import'lar var olan dosyalara gider (derleme adımı olmadığı için kırık yol sessiz kalırdı)."""
    for p in (WEB / "js").rglob("*.js"):
        for m in re.finditer(r"""(?:from|import\()\s*["'](\.[^"']+)["']""", p.read_text(encoding="utf-8")):
            assert (p.parent / m.group(1)).resolve().exists(), (p.name, m.group(1))


def test_salt_okunur_uyarisi_arayuzde():
    assert "salt-okunur" in (WEB / "js" / "pages" / "erp.js").read_text(encoding="utf-8")
