"""Kural testleri: kütüphanenin kendi kurallarını korur (STANDARTLAR.md §7).

Her kural bozulduğunda ileti, düzeltmek için ne yapılacağını söyler. Kurallar:
  1. Her modülün başlığında zorunlu alanlar ve doctest örneği var; `Fikir` bölümü 3–8 satır.
  2. Her modülün `tests/<konu>/test_<modül>.py` dosyası var ve dışa açılan her adı anıyor.
  3. docs/DIZIN.md günceldir (betikle üretilir).
  4. Çalışma zamanı bağımlılığı yok; paket içi bağımlılık başlıkta yazılı.
  5. Modül adı stdlib modülünü gölgelemez (dosya kopyalanınca `import queue` bozulmasın).
  6. Yerel ayara duyarsız büyük/küçük harf çağrısı yok; küresel `random` durumu kullanılmıyor.
  7. Yarım iş (TODO, DOLDUR, NotImplementedError) yok; dosyalar makul uzunlukta.
  8. Belgelerde ve başlıklarda anılan dosyalar gerçekten var; her kalıp docs/KALIPLAR.md'de.
  9. Kaynakta görünmez/birleşen karakter yok (STANDARTLAR §6.11; kaçış dizisi kullanılır).
 10. Test dosyası başka bir test dosyasından içe aktarmaz (tek başına kopyalanabilsin).
"""

from __future__ import annotations

import ast
import re
import sys
import unicodedata
from pathlib import Path

import pytest

from scripts.build_index import (
    INDEX_PATH,
    REQUIRED_FIELDS,
    ROOT,
    TOPICS,
    ModuleInfo,
    collect_modules,
    render_index,
)

MODULES: list[ModuleInfo] = collect_modules()
MODULE_IDS = [m.relative for m in MODULES]
MAX_LINES = 400  # yumuşak hedef 300 (STANDARTLAR.md §6.1); 400 üstü kırmızı


def test_every_topic_folder_is_registered() -> None:
    folders = {p.name for p in (ROOT / "algoritma").iterdir() if p.is_dir() and p.name[0] != "_"}
    missing = folders - set(TOPICS)
    assert not missing, (
        f"Kayıtsız konu klasörü: {sorted(missing)}. scripts/build_index.py içindeki TOPICS "
        "sözlüğüne ekleyin."
    )
    assert len(MODULES) > 100, "Modüller bulunamadı; testleri temel klasöründen çalıştırın."


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_header_has_required_fields(module: ModuleInfo) -> None:
    assert module.title, (
        f"{module.relative}: başlık yorumu yok. İlk satır `Ad: tek satır özet.` biçiminde olmalı."
    )
    assert module.summary, (
        f"{module.relative}: ilk satır `Ad: tek satır özet.` biçiminde olmalı (': ' eksik)."
    )
    for field in REQUIRED_FIELDS:
        assert module.fields.get(field), (
            f"{module.relative}: başlıkta `{field}:` alanı yok ya da boş. Örnek için "
            "algoritma/graf/dijkstra.py başlığına bakın."
        )
    assert "O(" in module.fields["Karmaşıklık"], (
        f"{module.relative}: `Karmaşıklık:` satırında büyük-O yazmalı (ör. `zaman O(n log n)`)."
    )
    source = module.path.read_text(encoding="utf-8")
    assert ">>> " in (ast.get_docstring(ast.parse(source)) or ""), (
        f"{module.relative}: `Örnek:` bölümünde çalışan bir `>>>` örneği olmalı (doctest koşar)."
    )


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_module_has_test_that_mentions_public_names(module: ModuleInfo) -> None:
    test_path = ROOT / "tests" / module.topic / f"test_{module.name}.py"
    assert test_path.exists(), (
        f"{module.relative} için test yok: tests/{module.topic}/test_{module.name}.py oluşturun "
        "(tarif: AGENTS.md → 'Yeni algoritma ekle')."
    )
    text = test_path.read_text(encoding="utf-8")
    assert module.dotted in text, f"{test_path.name}: `{module.dotted}` içe aktarılmıyor."
    assert module.public_names, f"{module.relative}: dışa açılan fonksiyon ya da sınıf yok."
    untested = [n for n in module.public_names if not re.search(rf"\b{re.escape(n)}\b", text)]
    assert not untested, (
        f"{module.relative}: şu adlar testte hiç geçmiyor: {untested}. Her dışa açılan ad "
        f"tests/{module.topic}/test_{module.name}.py içinde sınanmalı (ya da adı `_` ile başlatın)."
    )


def test_index_is_up_to_date() -> None:
    current = INDEX_PATH.read_text(encoding="utf-8") if INDEX_PATH.exists() else ""
    assert current == render_index(MODULES), (
        "docs/DIZIN.md güncel değil: `python scripts/build_index.py` çalıştırın."
    )


def _imports_of(tree: ast.Module) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, "Göreli içe aktarma kullanmayın (kopyalanınca bozulur)."
            found.add(node.module or "")
    return found


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_only_stdlib_and_declared_dependencies(module: ModuleInfo) -> None:
    tree = ast.parse(module.path.read_text(encoding="utf-8"))
    declared = module.fields.get("Bağımlılık", "")
    for name in sorted(_imports_of(tree)):
        top = name.split(".")[0]
        if top == "algoritma":
            assert name in declared, (
                f"{module.relative}: `{name}` içe aktarılıyor ama başlıktaki `Bağımlılık:` "
                "satırında yazmıyor. Tam modül yolunu oraya ekleyin."
            )
        else:
            assert top in sys.stdlib_module_names, (
                f"{module.relative}: `{name}` standart kütüphanede değil. Bu temel çalışma "
                "zamanında yalnız stdlib kullanır (docs/KARARLAR.md, K01)."
            )


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_module_name_does_not_shadow_stdlib(module: ModuleInfo) -> None:
    assert module.name not in sys.stdlib_module_names, (
        f"{module.relative}: `{module.name}` bir stdlib modülünün adı. Dosya başka projeye "
        "kopyalanınca stdlib'i gölgeler; başka ad seçin (ör. `fifo_queue`, `base64_codec`)."
    )


_CASE_CALL = re.compile(r"\.(upper|lower|capitalize|title|swapcase|casefold)\(\)")
_GLOBAL_RANDOM = re.compile(
    r"\brandom\.(random|randint|randrange|shuffle|choice|choices|sample|uniform|seed|gauss)\("
)
_UNFINISHED = re.compile(r"\b(TODO|FIXME|DOLDUR)\b|NotImplementedError")


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_source_hygiene(module: ModuleInfo) -> None:
    source = module.path.read_text(encoding="utf-8")
    if module.name != "turkish_text":
        match = _CASE_CALL.search(source)
        assert match is None, (
            f"{module.relative}: `{match.group(0) if match else ''}` yerel ayarı bilmez "
            "(i → İ hatası). `algoritma.dizgi.turkish_text` içindeki `upper_tr`/`lower_tr` "
            "kullanın."
        )
    match = _GLOBAL_RANDOM.search(source)
    assert match is None, (
        f"{module.relative}: küresel `random` durumu kullanılıyor "
        f"({match.group(0) if match else ''}…). Bunun yerine parametreyle "
        "`rng: random.Random` alın (belirlenimci testler için)."
    )
    match = _UNFINISHED.search(source)
    assert match is None, (
        f"{module.relative}: yarım iş işareti bulundu ({match.group(0) if match else ''}). "
        "Gövdeyi tamamlayın ya da modülü silip README 'Sınırlar' bölümüne yazın."
    )
    assert module.line_count <= MAX_LINES, (
        f"{module.relative}: {module.line_count} satır (> {MAX_LINES}). Modülü iki fikre bölün."
    )
    assert "from __future__ import annotations" in source, (
        f"{module.relative}: `from __future__ import annotations` satırı eksik."
    )


_FILE_REFERENCE = re.compile(
    r"`((?:algoritma|scripts|tests|docs)/[\w/]+\.(?:py|md)|[a-z0-9_]+\.py)`"
)
_KNOWN_FILES = {p.name for p in ROOT.rglob("*.py") if ".venv" not in p.parts}


def _referenced_paths(text: str) -> list[str]:
    return [match.group(1) for match in _FILE_REFERENCE.finditer(text)]


_DOCUMENTS = ["README.md", "AGENTS.md"]
_DOCUMENTS += sorted(str(p.relative_to(ROOT)) for p in (ROOT / "docs").glob("*.md"))


@pytest.mark.parametrize("document", _DOCUMENTS)
def test_documents_reference_existing_files(document: str) -> None:
    text = (ROOT / document).read_text(encoding="utf-8")
    for reference in _referenced_paths(text):
        exists = (ROOT / reference).exists() if "/" in reference else reference in _KNOWN_FILES
        assert exists, f"{document}: `{reference}` diye bir dosya yok. Yolu düzeltin ya da silin."


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_headers_reference_existing_files(module: ModuleInfo) -> None:
    header = ast.get_docstring(ast.parse(module.path.read_text(encoding="utf-8"))) or ""
    for reference in _referenced_paths(header):
        exists = (ROOT / reference).exists() if "/" in reference else reference in _KNOWN_FILES
        assert exists, f"{module.relative}: başlıkta anılan `{reference}` yok. Adı düzeltin."


def test_every_pattern_is_in_kaliplar_doc() -> None:
    text = (ROOT / "docs" / "KALIPLAR.md").read_text(encoding="utf-8")
    missing = [m.name for m in MODULES if m.topic == "kaliplar" and f"{m.name}.py" not in text]
    assert not missing, f"docs/KALIPLAR.md şu kalıpları anmıyor: {missing}. Birer bölüm ekleyin."


def _invisible(char: str) -> bool:
    """Görünmez ya da birleşen karakter mi? (STANDARTLAR §6.11)"""
    category = unicodedata.category(char)
    if category in ("Cf", "Zl", "Zp"):
        return True
    if category == "Zs":
        return char != " "
    if category == "Cc":
        return char not in "\t\n\r"
    return category == "Mn" and 0x0300 <= ord(char) <= 0x036F


@pytest.mark.parametrize(
    "path",
    sorted(
        p for folder in ("algoritma", "scripts", "tests") for p in (ROOT / folder).rglob("*.py")
    ),
    ids=lambda p: str(p.relative_to(ROOT)),
)
def test_no_invisible_characters(path: Path) -> None:
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        bad = [f"U+{ord(c):04X}" for c in line if _invisible(c)]
        assert not bad, (
            f"{path.relative_to(ROOT)}:{number}: görünmez/birleşen karakter {bad}. Karakterin "
            'kendisi yerine kaçış dizisi yazın (ör. "s\\u0327" ya da "\\u200b").'
        )


@pytest.mark.parametrize("module", MODULES, ids=MODULE_IDS)
def test_idea_section_is_three_to_eight_lines(module: ModuleInfo) -> None:
    lines = (
        ast.get_docstring(ast.parse(module.path.read_text(encoding="utf-8"))) or ""
    ).splitlines()
    start = lines.index("Fikir:") if "Fikir:" in lines else -1
    body = []
    for line in lines[start + 1 :] if start >= 0 else []:
        if not line.startswith("    "):
            break
        body.append(line)
    assert 3 <= len(body) <= 8, (
        f"{module.relative}: `Fikir:` bölümü {len(body)} satır; 3–8 satır olmalı (şartname). "
        "Ayrıntıyı işlev belgesine ya da `Ne zaman`/`Genişletme` alanına taşıyın."
    )


def test_tests_do_not_import_other_tests() -> None:
    """Bir test dosyası kopyalanabilsin: başka bir test dosyasından içe aktarmaz."""
    bad: list[str] = []
    for path in sorted((ROOT / "tests").rglob("test_*.py")):
        imported = _imports_of(ast.parse(path.read_text(encoding="utf-8")))
        bad += [
            f"{path.relative_to(ROOT)} → {name}"
            for name in sorted(imported)
            if name.rsplit(".", 1)[-1].startswith("test_")
        ]
    assert not bad, (
        f"Test dosyası başka bir test dosyasından içe aktarıyor: {bad}. Ortak kaba kuvveti "
        "`tests/graf/helpers.py` gibi bir yardımcı dosyaya taşıyın."
    )
