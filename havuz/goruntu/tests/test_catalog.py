"""Katalog kural testleri (çevrimdışı): şema, lisans sınıfı, saklanan API doğrulamasıyla birebirlik,
hazır ayarlardaki ve takma adlardaki her modelin katalogda olması."""

from __future__ import annotations

import json
import tomllib

import pytest

from goruntu.arama.embedders import ALIASES
from goruntu.catalog import license_class, load_catalog
from goruntu.config import PRESET_DIR, PRESETS, TINY_MODEL
from tests.conftest import ROOT

CATALOG = load_catalog()


def _latest_verification() -> dict[str, object]:
    files = sorted((ROOT / "katalog").glob("dogrulama-*.json"))
    assert files, (
        "katalog/dogrulama-*.json yok: `python scripts/katalog_dogrula.py --yaz` çalıştırın"
    )
    data: dict[str, object] = json.loads(files[-1].read_text(encoding="utf-8"))
    return data


def test_lisans_sinifi_tutarli() -> None:
    for entry in CATALOG.modeller:
        assert entry.ticari == license_class(entry.lisans), entry.kimlik
        if entry.ticari == "hayir":
            assert "TİCARİ KULLANIMA KAPALI" in entry.notlar, (
                f"{entry.kimlik}: notlara açık uyarı yazın"
            )


def test_kayitlar_saklanan_api_dogrulamasiyla_ayni() -> None:
    verification = _latest_verification()
    found = {row["kimlik"]: row for row in verification["modeller"]}  # type: ignore[attr-defined]
    assert set(found) == {entry.kimlik for entry in CATALOG.modeller}, (
        "doğrulamayı yeniden yazın (--yaz)"
    )
    for entry in CATALOG.modeller:
        row = found[entry.kimlik]
        assert row["durum"] == "var" and not row["sorunlar"], entry.kimlik
        assert (row["lisans"], row["parametre"], row["erisim"]) == (
            entry.lisans,
            entry.parametre,
            entry.erisim,
        )
        assert row["kutuphane"] == entry.kutuphane or entry.kutuphane == "transformers"
        assert entry.dogrulandi == verification["tarih"]


def test_gomme_modellerinde_turkce_iddiasi_bos_gecilmez() -> None:
    for entry in CATALOG.modeller:
        if "gomme" in entry.gorev:
            assert entry.turkce_metin != "uygulanmaz", entry.kimlik
        else:
            assert entry.turkce_metin == "uygulanmaz", entry.kimlik


@pytest.mark.parametrize("preset", PRESETS)
def test_hazir_ayar_tabanlari_katalogda(preset: str) -> None:
    base = tomllib.loads((PRESET_DIR / f"{preset}.toml").read_text(encoding="utf-8"))["model"][
        "taban"
    ]
    if base != TINY_MODEL:
        entry = CATALOG.find(base)
        assert entry is not None, (
            f"{base} katalogda yok: katalog/modeller.yaml içine ekleyip doğrulayın"
        )
        assert entry.ticari != "hayir" and "siniflandirma" in entry.gorev


@pytest.mark.parametrize("alias", sorted(set(ALIASES) - {"histogram"}))
def test_gomme_takma_adlari_katalogda(alias: str) -> None:
    entry = CATALOG.find(alias)
    assert entry is not None and entry.kimlik == ALIASES[alias] and entry.takma_ad == alias
