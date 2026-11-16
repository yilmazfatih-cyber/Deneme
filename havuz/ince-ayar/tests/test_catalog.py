"""Katalog kural testleri (çevrimdışı): şema, lisans sınıfı, saklanan API doğrulamasıyla tutarlılık,
hazır ayarlardaki her taban modelin katalogda olması."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

import pytest

from ince_ayar.catalog import license_class, load_catalog
from ince_ayar.config import PRESETS, TINY_MODEL
from ince_ayar.registry import MODEL_TASKS
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
        evidence = row["dil_etiketinde_tr"] or bool(row["kartta_turkce"])
        assert entry.turkce.startswith("kanıt:") == evidence, (
            f"{entry.kimlik}: Türkçe iddiası kanıtla uyuşmuyor"
        )
        assert entry.dogrulandi == verification["tarih"]


@pytest.mark.parametrize(("task", "preset"), [(t, p) for t in MODEL_TASKS for p in PRESETS])
def test_hazir_ayar_tabanlari_katalogda(task: str, preset: str) -> None:
    config = tomllib.loads(
        (ROOT / "yapilandirma" / task / f"{preset}.toml").read_text(encoding="utf-8")
    )
    base = config["model"]["taban"]
    if base != TINY_MODEL:
        entry = CATALOG.find(base)
        assert entry is not None, (
            f"{base} katalogda yok: katalog/modeller.yaml içine ekleyip doğrulayın"
        )
        assert entry.ticari != "hayir"


@pytest.mark.parametrize(
    "path", sorted((ROOT / "yapilandirma" / "uret").glob("*.toml")), ids=lambda p: p.name
)
def test_ogretmen_katalogda_ve_ticari(path: Path) -> None:
    teacher = tomllib.loads(path.read_text(encoding="utf-8"))["ogretmen"]
    entry = CATALOG.find(teacher["katalog_kimligi"])
    assert entry is not None and "ogretmen" in entry.gorev
    assert entry.lisans == teacher["lisans"] and entry.ticari == "evet"
