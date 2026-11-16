"""Yavaş testler (uzun denetim): örnek betikler çalışır ve beklenen çıktıyı verir; tablo aracı
örnek CSV'de varsayılan ayarlarla uçtan uca rapor üretir.

Karşılaştırma sayılarda küçük farklara izin verir (farklı işlemci/BLAS son basamağı değiştirebilir):
sayı olmayan her parça birebir aynı, sayılar göreli %2 / mutlak 0,02 içinde olmalı.
Çalıştırma: python scripts/check.py --uzun  (ya da: pytest -m yavas)
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = sorted((ROOT / "ornekler").glob("0*.py"))
NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


def same_up_to_numbers(actual: str, expected: str) -> str | None:
    """Fark yoksa None, varsa ilk farklı satırın açıklaması."""
    actual_lines, expected_lines = actual.strip().splitlines(), expected.strip().splitlines()
    if len(actual_lines) != len(expected_lines):
        return f"satır sayısı farklı: {len(actual_lines)} ≠ {len(expected_lines)}"
    for number, (got, want) in enumerate(zip(actual_lines, expected_lines, strict=True), start=1):
        if NUMBER.sub("#", got) != NUMBER.sub("#", want):
            return f"{number}. satır: {got!r} ≠ {want!r}"
        for a, b in zip(NUMBER.findall(got), NUMBER.findall(want), strict=True):
            x, y = float(a), float(b)
            if abs(x - y) > max(0.02, 0.02 * abs(y)):
                return f"{number}. satırda sayı farkı: {got!r} ≠ {want!r}"
    return None


def run(arguments: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    environment = dict(os.environ, OMP_NUM_THREADS="2", OPENBLAS_NUM_THREADS="2")
    return subprocess.run(
        [sys.executable, *arguments],
        cwd=cwd,
        env=environment,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )


@pytest.mark.yavas
@pytest.mark.parametrize("script", EXAMPLES, ids=lambda path: path.stem)
def test_example_runs_and_matches_expected_output(script: Path, tmp_path: Path) -> None:
    result = run([str(script)], tmp_path)  # başka bir klasörden çalıştırmak da desteklenir
    assert result.returncode == 0, result.stderr
    expected = (ROOT / "ornekler" / "beklenen" / f"{script.stem}.txt").read_text(encoding="utf-8")
    difference = same_up_to_numbers(result.stdout, expected)
    assert difference is None, (
        f"{script.name}: {difference}. Değişiklik bilerek yapıldıysa beklenen dosyayı yenileyin."
    )


@pytest.mark.yavas
def test_tablo_tool_on_the_sample_csv(tmp_path: Path) -> None:
    csv = ROOT / "ornekler" / "veri" / "musteri_kaybi.csv"
    result = run(
        [
            "-m",
            "ml_temel",
            "egit",
            "--veri",
            str(csv),
            "--hedef",
            "kayip",
            "--html",
            "--cikti",
            str(tmp_path),
        ],
        ROOT,
    )
    assert result.returncode == 0, result.stderr
    report = (tmp_path / "rapor.md").read_text(encoding="utf-8")
    for heading in (
        "## Özet",
        "## Uyarılar",
        "## Veri",
        "## Değerlendirme yöntemi",
        "## Sınama sonuçları",
        "## Olasılık kalibrasyonu",
        "## Sütun önemleri",
    ):
        assert heading in report
    assert "| `kayit_tarihi` | tarih |" in report
    assert "musteri_no (kimlik)" in report
    roc = re.search(r"ROC-AUC = (\d),(\d+) \(%95 GA (\d),(\d+)–(\d),(\d+)\)", report)
    assert roc is not None
    value, low, high = (float(f"{roc.group(i)}.{roc.group(i + 1)}") for i in (1, 3, 5))
    assert 0.75 < value < 0.95
    assert low < value < high
    top = re.search(r"\| `(\w+)` \| \d", report.split("## Sütun önemleri")[1])
    assert top is not None
    assert top.group(1) in ("sozlesme", "destek_cagrisi", "memnuniyet", "abonelik_ay")
