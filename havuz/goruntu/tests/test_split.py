"""Ayrım testleri: yakın kopyalar ve aynı grup anahtarı hep aynı parçada (sızıntı yok), katmanlı oranlar,
belirlenimcilik, hazır ayrımda sızıntının raporlanması, klasör keşfi (NFC, gizli dosyalar)."""

from __future__ import annotations

import unicodedata
from pathlib import Path

import numpy as np
import pytest

from goruntu.errors import UserError
from goruntu.siniflandirma.dataset import discover
from goruntu.siniflandirma.prepare import prepare_data
from goruntu.siniflandirma.split import plan_split
from goruntu.synthetic import scene_image, write_shape_dataset
from tests.conftest import tiny_config


def _hashes(count: int, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).integers(0, 2**63, size=(count, 5), dtype=np.uint64)


def _side(plan, index: int) -> str:  # type: ignore[no-untyped-def]
    return next(name for name, rows in plan.indices.items() if index in rows)


def test_kopyalar_ve_gruplar_ayni_parcada() -> None:
    count = 120
    hashes = _hashes(count)
    for left, right in [(0, 1), (1, 2), (10, 50), (77, 99)]:
        hashes[right] = hashes[left] ^ np.uint64(0b11)
    groups: list[str | None] = [None] * count
    for index in (5, 30, 60, 90):
        groups[index] = "urun-7"
    labels = [i % 3 for i in range(count)]
    for seed in range(5):
        plan = plan_split(labels, hashes, groups, 0.2, 0.2, threshold=8, seed=seed)
        assert _side(plan, 0) == _side(plan, 1) == _side(plan, 2)
        assert _side(plan, 10) == _side(plan, 50) and _side(plan, 77) == _side(plan, 99)
        assert len({_side(plan, i) for i in (5, 30, 60, 90)}) == 1
        assert sorted(i for rows in plan.indices.values() for i in rows) == list(range(count))


def test_katmanli_oranlar_ve_belirlenimcilik() -> None:
    labels = [0] * 60 + [1] * 30 + [2] * 10
    hashes = _hashes(100, seed=1)
    first = plan_split(labels, hashes, [None] * 100, 0.2, 0.2, threshold=8, seed=42)
    second = plan_split(labels, hashes, [None] * 100, 0.2, 0.2, threshold=8, seed=42)
    assert first.indices == second.indices
    for name, ratio in (("egitim", 0.6), ("dogrulama", 0.2), ("test", 0.2)):
        rows = first.indices[name]
        for label, total in ((0, 60), (1, 30), (2, 10)):
            assert abs(sum(1 for i in rows if labels[i] == label) - total * ratio) <= 1


def test_celisen_etiketli_kopya_raporlanir() -> None:
    hashes = _hashes(20)
    hashes[1] = hashes[0]
    labels = [0, 1] + [i % 2 for i in range(18)]
    plan = plan_split(labels, hashes, [None] * 20, 0.2, 0.2, threshold=4, seed=0)
    assert plan.conflicts == [(0, 1)]


def test_cok_az_grup_acik_hata() -> None:
    hashes = np.zeros((6, 5), dtype=np.uint64)  # hepsi aynı görüntü → tek grup
    with pytest.raises(UserError, match="parçaya bölünemiyor"):
        plan_split([0, 1, 0, 1, 0, 1], hashes, [None] * 6, 0.2, 0.2, threshold=4, seed=0)


def test_kesif_nfc_ve_gizli_dosyalar(tmp_path: Path) -> None:
    write_shape_dataset(tmp_path / "kok", per_class=3, seed=0, size=32, shapes=("daire", "kare"))
    nfd = unicodedata.normalize("NFD", "çanta")
    write_shape_dataset(tmp_path / "kok", per_class=3, seed=1, size=32, shapes=(nfd,) if False else ())
    (tmp_path / "kok" / nfd).mkdir()
    scene_image(np.random.default_rng(0), (40, 30)).save(tmp_path / "kok" / nfd / "a.png")
    scene_image(np.random.default_rng(1), (40, 30)).save(tmp_path / "kok" / nfd / "b.png")
    (tmp_path / "kok" / "daire" / "._kopya.jpg").write_bytes(b"macos cop")
    (tmp_path / "kok" / ".gizli").mkdir()
    (tmp_path / "kok" / "kare" / "notlar.txt").write_text("görüntü değil")
    discovery = discover(tmp_path / "kok")
    assert discovery.labels == ["daire", "kare", "çanta"]
    assert all(unicodedata.is_normalized("NFC", s.label) for s in discovery.samples)
    assert len(discovery.samples) == 8


def test_grup_deseni(tmp_path: Path) -> None:
    for label in ("a", "b"):
        for name in ("u1_on.png", "u1_arka.png", "u2_on.png"):
            path = tmp_path / label / name
            path.parent.mkdir(parents=True, exist_ok=True)
            scene_image(np.random.default_rng(hash(name) % 1000), (30, 30)).save(path)
    groups = {s.path.name: s.group for s in discover(tmp_path, r"^([^_]+)_").samples if s.label == "a"}
    assert groups == {"u1_arka.png": "a/u1", "u1_on.png": "a/u1", "u2_on.png": "a/u2"}


def test_hazir_ayrimda_sizinti_uyarisi(tmp_path: Path) -> None:
    write_shape_dataset(tmp_path / "egitim", per_class=8, seed=0, size=40, shapes=("daire", "kare"))
    write_shape_dataset(tmp_path / "test", per_class=3, seed=9, size=40, shapes=("daire", "kare"))
    leaked = tmp_path / "egitim" / "daire" / "kirmizi_0000.jpg"
    (tmp_path / "test" / "daire" / "sizan.jpg").write_bytes(leaked.read_bytes())
    data = prepare_data(tiny_config(tmp_path, tmp_path / "cikti", "veri.kopya_esigi=2"))
    assert data.report["hazir_ayrim"] and data.validation  # doğrulama eğitimden ayrıldı
    leaks = data.report["sizintilar"]["test"]
    assert any(row[1].endswith("sizan.jpg") for row in leaks)
    assert any("yakın kopya" in note for note in data.notes)


def test_karisik_duzen_reddedilir(tmp_path: Path) -> None:
    write_shape_dataset(tmp_path / "egitim", per_class=2, seed=0, size=32, shapes=("daire", "kare"))
    write_shape_dataset(tmp_path, per_class=2, seed=0, size=32, shapes=("kare",))
    with pytest.raises(UserError, match="karışık"):
        discover(tmp_path)
