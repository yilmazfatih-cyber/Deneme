"""Hazır örnek kümeler: aynı komut + aynı tohum → BAYT BAYT aynı dosyalar; kayıt ve boyut kuralları."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from verihavuzu.paths import examples_dir
from verihavuzu.sentetik.examples import CARD, EXAMPLES, MANIFEST, build_example

FIX = "Düzeltmek için: python scripts/build_examples.py (üreteci bilerek değiştirdiyseniz)"


@pytest.mark.parametrize("example", EXAMPLES, ids=[e.ad for e in EXAMPLES])
def test_examples_regenerate_byte_for_byte(example: object, tmp_path: Path) -> None:
    from verihavuzu.sentetik.examples import Example

    assert isinstance(example, Example)
    rebuilt = build_example(example, tmp_path)
    stored = examples_dir() / example.ad
    names = sorted(p.name for p in stored.iterdir())
    assert names == sorted(p.name for p in rebuilt.iterdir()), FIX
    for name in names:
        assert (rebuilt / name).read_bytes() == (stored / name).read_bytes(), (
            f"{example.ad}/{name} farklı. {FIX}"
        )


def test_manifest_matches_files_and_limits() -> None:
    manifest = json.loads((examples_dir() / MANIFEST).read_text(encoding="utf-8"))
    assert [item["ad"] for item in manifest["kumeler"]] == [e.ad for e in EXAMPLES], FIX
    total = 0
    for item in manifest["kumeler"]:
        folder = examples_dir() / item["ad"]
        assert (folder / CARD).is_file(), f"{item['ad']} veri kartı yok. {FIX}"
        assert item["komut"].startswith("python -m verihavuzu uret ") and "--tohum" in item["komut"]
        for record in item["dosyalar"]:
            data = (folder / record["ad"]).read_bytes()
            assert hashlib.sha256(data).hexdigest() == record["sha256"], f"{record['ad']}: {FIX}"
            assert len(data) <= 1_200_000, f"{record['ad']} 1,2 MB'tan büyük"
            total += len(data)
        data_files = [
            r["ad"]
            for r in item["dosyalar"]
            if not r["ad"].endswith((".sema.json", ".bozulmalar.jsonl"))
        ]
        for name in data_files:
            table = name.split(".")[0]
            assert (folder / f"{table}.sema.json").is_file(), f"{name} için şema yok"
    assert total <= 8_000_000


def test_example_folders_contain_only_listed_files() -> None:
    listed = {
        item["ad"]
        for item in json.loads((examples_dir() / MANIFEST).read_text(encoding="utf-8"))["kumeler"]
    }
    folders = {p.name for p in examples_dir().iterdir() if p.is_dir()}
    assert folders == listed, "ornekler/ altında uretim.json'da olmayan klasör var"
