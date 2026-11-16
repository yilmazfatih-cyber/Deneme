"""Kural testleri: havuz standartlarının (STANDARTLAR.md §3, §6, §7) bu temeldeki karşılıkları.

Her testin iletisi düzeltme adımını söyler.
"""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
from pathlib import Path

import pytest

from dil_modeli.cli import COMMANDS
from dil_modeli.train_config import load_train_config

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "dil_modeli"
BROWSER = ROOT / "tarayici"
EXAMPLE = ROOT / "ornek-model"
GENERATED = {"unicode_classes.py", "unicode_classes.js"}  # üreteçle yazılır, elle değil
SOURCES = sorted([*PACKAGE.glob("*.py"), *(ROOT / "scripts").glob("*.py")])
JS_SOURCES = sorted(p for p in BROWSER.rglob("*.js") if "node_modules" not in p.parts)
MAX_LINES = 300


def _docstring(path: Path) -> str:
    match = re.match(r'\s*"""(.*?)"""', path.read_text(encoding="utf-8"), re.S)
    return match.group(1) if match else ""


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: p.name)
def test_python_sources_have_a_turkish_header_with_extension_hint(path: Path) -> None:
    if path.name in GENERATED or path.name == "__main__.py":
        return
    header = _docstring(path)
    assert header, f"{path.name}: dosya ne yapar, kim kullanır anlatan başlık docstring'i ekleyin."
    if path.parent == PACKAGE and path.name != "__init__.py":
        assert "Genişletme:" in header, f"{path.name}: başlığa 'Genişletme:' satırı ekleyin."


@pytest.mark.parametrize("path", JS_SOURCES, ids=lambda p: p.name)
def test_js_sources_start_with_a_comment(path: Path) -> None:
    first = path.read_text(encoding="utf-8").lstrip().splitlines()[0]
    assert first.startswith("//"), f"{path.name}: ilk satıra Türkçe açıklama yorumu ekleyin."


@pytest.mark.parametrize("path", [*SOURCES, *JS_SOURCES], ids=lambda p: p.name)
def test_files_stay_small(path: Path) -> None:
    lines = len(path.read_text(encoding="utf-8").splitlines())
    assert lines <= MAX_LINES or path.name in GENERATED, (
        f"{path.name} {lines} satır (sınır {MAX_LINES}). Bir kısmını ayrı bir dosyaya taşıyın."
    )


def test_no_locale_unaware_case_conversion() -> None:
    """Türkçe'de i/İ ve ı/I için yerel kurallı çeviri gerekir (dil_modeli/text_tr.py)."""
    pattern = re.compile(r"\.(upper|lower|capitalize|title|casefold|swapcase)\(\)")
    offenders = [
        f"{path.name}:{number}"
        for path in SOURCES
        if path.name != "text_tr.py"  # yardımcının kendisi (kuralı açıklayan metin içerir)
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if pattern.search(line) and "tr-kural-muaf" not in line
    ]
    js = re.compile(r"\.to(Upper|Lower)Case\(\)")
    offenders += [p.name for p in JS_SOURCES if js.search(p.read_text(encoding="utf-8"))]
    assert not offenders, f"Yerel kuralsız harf çevirme: {offenders}. upper_tr/lower_tr kullanın."


def test_turkish_case_helpers() -> None:
    from dil_modeli.text_tr import lower_tr, upper_tr

    assert upper_tr("istanbul ılık") == "İSTANBUL ILIK"
    assert lower_tr("İSTANBUL ILIK") == "istanbul ılık"


def test_no_unfinished_work_markers() -> None:
    markers = re.compile(r"\b(TODO|FIXME|XXX)\b|sonra yazılacak")
    offenders = [
        p.name for p in [*SOURCES, *JS_SOURCES] if markers.search(p.read_text(encoding="utf-8"))
    ]
    assert not offenders, (
        f"Yarım iş işareti: {offenders}. Tamamlayın ya da README 'Sınırlar'a yazın."
    )


KEY_USE = re.compile(r"""words\[["']([a-z_]+)["']\]|words\.([a-z_]+)|say\('([a-z_]+)'""")


def _dictionary_check(html: Path, words: Path, *scripts: Path) -> None:
    keys = set(json.loads(words.read_text(encoding="utf-8")))
    used = set(re.findall(r'data-metin="([a-z_]+)"', html.read_text(encoding="utf-8")))
    for script in scripts:
        found = KEY_USE.findall(script.read_text(encoding="utf-8"))
        used |= {key for groups in found for key in groups if key}
    assert used, f"{html.name}: hiç sözlük anahtarı bulunamadı (denetim bozuk olabilir)"
    missing = sorted(used - keys)
    assert not missing, f"{words.name} içinde eksik anahtar: {missing}. Sözlüğe ekleyin."


def test_every_ui_text_key_exists_in_its_dictionary() -> None:
    _dictionary_check(BROWSER / "index.html", BROWSER / "tr.json", BROWSER / "app.js")
    _dictionary_check(
        PACKAGE / "web" / "deneme.html", PACKAGE / "web" / "tr.json", PACKAGE / "report.py"
    )


def test_browser_test_entry_imports_every_test_file() -> None:
    entry = (BROWSER / "testler.js").read_text(encoding="utf-8")
    missing = [p.name for p in BROWSER.glob("*.test.js") if f"./{p.name}" not in entry]
    assert not missing, (
        f"tarayici/testler.js içine ekleyin: {missing} (node --test tarayici/ onu çalıştırır)."
    )


def test_training_config_files_are_valid() -> None:
    for path in sorted((ROOT / "yapilandirma").glob("*.toml")):
        config = load_train_config(path)
        config.model_config(vocab_size=8192)  # hazır boyut ve model alanları geçerli


def test_every_command_is_documented() -> None:
    for name in ("README.md", "AGENTS.md"):
        text = (ROOT / name).read_text(encoding="utf-8")
        missing = [c.name for c in COMMANDS if c.name not in text]
        assert not missing, f"{name} içinde belgelenmemiş komut: {missing}"


def test_every_module_is_on_the_agents_map() -> None:
    text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    missing = [
        p.name for p in PACKAGE.glob("*.py") if p.name not in text and p.name != "__init__.py"
    ]
    assert not missing, f"AGENTS.md 'Harita' tablosuna ekleyin: {missing}"


@pytest.mark.skipif(not (EXAMPLE / "egitim-kaydi.json").is_file(), reason="örnek model yok")
def test_example_model_record_matches_files() -> None:
    record = json.loads((EXAMPLE / "egitim-kaydi.json").read_text(encoding="utf-8"))
    files = {str(p.relative_to(EXAMPLE)) for p in EXAMPLE.rglob("*") if p.is_file()}
    listed = set(record["dosyalar"])
    assert files - listed == {"egitim-kaydi.json", "MODEL_KARTI.md"}, "Kayıtta olmayan dosya var"
    for name, entry in record["dosyalar"].items():
        digest = hashlib.sha256((EXAMPLE / name).read_bytes()).hexdigest()
        assert digest == entry["sha256"], f"{name} değişmiş: python scripts/ornek_model.py paketle"
    total = sum(entry["bayt"] for entry in record["dosyalar"].values())
    assert total <= 16_000_000, f"Örnek model dosyaları {total / 1e6:.1f} MB; sınır 16 MB."
    assert record["veri"]["kaynak"]["lisans"], "Veri lisansı kayıtta yok."


def test_havuz_json_is_complete() -> None:
    data = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    for key in (
        "ad",
        "baslik",
        "ozet",
        "tur",
        "gereksinim",
        "denetle",
        "uzunDenetim",
        "baslat",
        "kopyalamaHaric",
    ):
        assert key in data, f"havuz.json'da '{key}' eksik"
    assert data["ad"] == ROOT.name
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for entry in (".venv/", "node_modules/", "veri/", "calisma/"):
        assert entry in ignore, f".gitignore'a ekleyin: {entry}"
    assert tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["name"]
