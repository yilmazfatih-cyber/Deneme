"""Kural testleri: temelin kendi kurallarını korur. Her iletide düzeltme adımı yazar."""

from __future__ import annotations

import io
import json
import re
import subprocess
import sys
import tokenize
from pathlib import Path

import pytest

from verihavuzu import reference
from verihavuzu.files import csv_text
from verihavuzu.kalite.validators import VALIDATOR_LABELS, VALIDATORS
from verihavuzu.paths import root_dir, tr_dir

ROOT = root_dir()
SOURCES = sorted((ROOT / "verihavuzu").rglob("*.py"))
_CASE_METHODS = {"upper", "lower", "capitalize", "title", "casefold", "swapcase"}


# --- tr/ başvuru verileri --------------------------------------------------------------------


def test_every_reference_file_has_meta_and_csv_in_sync() -> None:
    data_files = {p.name for p in tr_dir().iterdir() if p.suffix in (".json", ".csv")}
    for name in sorted(data_files):
        stem = name.split(".")[0]
        assert (tr_dir() / f"{stem}.meta.json").is_file(), (
            f"tr/{name} için tr/{stem}.meta.json yok. AGENTS.md → 'Yeni başvuru verisi ekle' tarifine bakın."
        )
    for name in reference.dataset_names():
        meta = reference.load_meta(name)
        rows = reference.load(name)
        assert meta.ad == name and meta.kayit_sayisi == len(rows), (
            f"tr/{name}.meta.json kayit_sayisi {meta.kayit_sayisi}, dosyada {len(rows)} satır var; düzeltin."
        )
        assert set(meta.alanlar) == set(rows[0]), (
            f"tr/{name}.meta.json 'alanlar' sütunlarla aynı olmalı."
        )
        assert all((tr_dir() / f).is_file() for f in meta.dosyalar)
        csv_path = tr_dir() / f"{name}.csv"
        assert csv_path.read_text(encoding="utf-8") == csv_text(rows), (
            f"tr/{name}.csv güncel değil. Düzeltmek için: python scripts/build_reference.py"
        )
        if meta.dogrulama.yontem == "capraz-kaynak":
            assert meta.dogrulama.kaynaklar, (
                f"tr/{name}: çapraz kaynak doğrulamasında kaynak listesi boş olamaz"
            )


def test_attribution_file_mentions_copied_sources() -> None:
    text = (tr_dir() / "ATIFLAR.md").read_text(encoding="utf-8")
    assert "turkiye-api" in text and "schwifty" in text


# --- kaynak kod kuralları -------------------------------------------------------------------------


def _case_calls(path: Path) -> list[int]:
    """Koddaki .upper()/.lower()… çağrılarının satırları (belge dizgisi ve yorumlar hariç)."""
    tokens = list(tokenize.generate_tokens(io.StringIO(path.read_text(encoding="utf-8")).readline))
    lines = path.read_text(encoding="utf-8").splitlines()
    found = []
    for index in range(1, len(tokens) - 1):
        token = tokens[index]
        if (
            token.type == tokenize.NAME
            and token.string in _CASE_METHODS
            and tokens[index - 1].string == "."
            and tokens[index + 1].string == "("
            and "# tr-ok" not in lines[token.start[0] - 1]
        ):
            found.append(token.start[0])
    return found


def test_no_bare_case_conversion() -> None:
    offenders = [f"{p.relative_to(ROOT)}:{n}" for p in SOURCES for n in _case_calls(p)]
    assert not offenders, (
        "Türkçe için yanlış büyük/küçük harf çevirisi: "
        + ", ".join(offenders)
        + ". verihavuzu.text.upper_tr / lower_tr kullanın (Türkçe metin değilse satıra '# tr-ok' yazın)."
    )


@pytest.mark.parametrize("path", SOURCES, ids=[str(p.relative_to(ROOT)) for p in SOURCES])
def test_source_files_have_header_and_stay_small(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if path.name == "__init__.py" and not text.strip():
        return
    assert text.startswith('"""'), f"{path.name}: dosya Türkçe bir başlık yorumuyla açılmalı."
    if path.name not in ("__init__.py", "__main__.py"):
        header = text.split('"""')[1]
        assert "Genişletme:" in header, f"{path.name}: başlıkta 'Genişletme:' satırı olmalı."
    assert len(text.splitlines()) <= 330, f"{path.name}: ~300 satırı aşmayın; dosyayı bölün."
    assert not re.search(r"\b(TODO|FIXME|XXX)\b|sonra yazılacak", text), (
        f"{path.name}: yarım iş işareti"
    )


def test_every_validator_has_a_label_and_examples() -> None:
    from tests.test_validators import EXAMPLES

    assert set(VALIDATORS) == set(VALIDATOR_LABELS) == set(EXAMPLES), (
        "kalite/validators.py içindeki her denetimin etiketi ve tests/test_validators.py'de örneği olmalı."
    )


# --- belgeler ve makine kaydı ------------------------------------------------------------------


def test_required_documents_exist() -> None:
    for name in (
        "README.md",
        "AGENTS.md",
        "havuz.json",
        "docs/KARARLAR.md",
        "docs/MIMARI.md",
        "docs/VERI_KARTI_SABLONU.md",
        "docs/LISANSLAR.md",
        "docs/KVKK_NOTLARI.md",
        "docs/BASVURU_VERILERI.md",
        "docs/ANALIZ_TARIFLERI.md",
        "docs/ornek-is-akisi.yml",
        "docs/ornek-denetimler.json",
    ):
        assert (ROOT / name).is_file(), f"{name} eksik"
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "## Sınırlar" in readme


def test_havuz_json() -> None:
    data = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    assert data["ad"] == "veri" and data["tur"] == "python"
    assert data["denetle"] == ["python scripts/check.py"]
    assert {".venv", "calisma"} <= set(data["kopyalamaHaric"])


def test_example_checks_file_runs_from_docs(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "verihavuzu",
            "dogrula",
            "ornekler/eticaret/siparisler.csv",
            "--denetim",
            "docs/ornek-denetimler.json",
            "--json",
            str(tmp_path / "r.json"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_case_rule_catches_code_but_not_text(tmp_path: Path) -> None:
    sample = tmp_path / "ornek.py"
    sample.write_text('"""Belge: "i".upper() burada sorun değil."""\n'
                      "x = 'a'.upper()\n"
                      "y = 'b'.lower()  # tr-ok: ASCII\n"
                      "# z.lower() yorumda\n", encoding="utf-8")  # fmt: skip
    assert _case_calls(sample) == [2]
