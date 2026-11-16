"""Kural testleri: bu temelin kendi kurallarını korur (STANDARTLAR §6, §7, §11). Her ileti
düzeltmeyi söyler.

Denetlenenler: her mini sistemin README'si zorunlu bölümleri taşır ve dizinde (kök README)
listelenir; her kaynak dosya "Genişletme:" satırlı Türkçe başlıkla açılır; paketler yalnız standart
kitaplığı ve kendi içini içe aktarır (kardeş sisteme bağımlılık yok); dosyalar ~300 satırı fazla
aşmaz; yarım iş işareti yok; görünmez/birleşen karakter yok (§6.11); her sistemin testi var;
havuz.json doğru.

Genişletme: yeni mini sistem `SYSTEMS` listesine eklenince bütün kurallar onu da denetler.
"""

from __future__ import annotations

import ast
import json
import sys
import tomllib
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SYSTEMS = [
    "anahtar_deger",
    "btree",
    "mini_sql",
    "islem",
    "arama_motoru",
    "crdt",
    "mini_git",
    "raft",
    "is_kuyrugu",
    "onbellek_sunucu",
    "tutarli_karma",
    "akis",
    "sutun_deposu",
    # YENİ MİNİ SİSTEM BURAYA (klasör adı); README ve tests/<ad>/ de gerekir.
]
README_SECTIONS = ["## Nasıl çalışır", "## Dosya haritası", "## Güvenceler", "## Sağlamadıkları"]
README_SECTIONS += ["## Buradan nereye"]
MAX_LINES = 340  # yumuşak sınır ~300; bunu aşan dosya bölünmeli


def _sources() -> list[Path]:
    files = [p for system in SYSTEMS for p in sorted((ROOT / system).glob("*.py"))]
    return files + sorted((ROOT / "tests").rglob("*.py")) + sorted((ROOT / "scripts").glob("*.py"))


def test_every_system_is_a_package_with_tests_and_listed() -> None:
    index = (ROOT / "README.md").read_text(encoding="utf-8")
    on_disk = sorted(
        p.name for p in ROOT.iterdir() if (p / "__init__.py").exists() and p.name not in {"tests"}
    )
    assert on_disk == sorted(SYSTEMS), (
        f"Klasörler {on_disk}, SYSTEMS {sorted(SYSTEMS)}: yeni sistemi tests/test_kurallar.py'deki "
        "SYSTEMS listesine ekleyin (ya da artık klasörü silin)."
    )
    for system in SYSTEMS:
        assert (ROOT / "tests" / system / "__init__.py").exists(), f"tests/{system}/ klasörü eksik"
        assert list((ROOT / "tests" / system).glob("test_*.py")), f"tests/{system}/ içinde test yok"
        assert f"`{system}`" in index, f"Kök README.md'deki tabloya `{system}` satırını ekleyin."


@pytest.mark.parametrize("system", SYSTEMS)
def test_system_readme_has_required_sections(system: str) -> None:
    readme = ROOT / system / "README.md"
    assert readme.exists(), f"{system}/README.md yok: başka bir sistemin README'sini örnek alın."
    text = readme.read_text(encoding="utf-8")
    missing = [section for section in README_SECTIONS if section not in text]
    assert not missing, f"{system}/README.md'de eksik bölümler: {missing}"


@pytest.mark.parametrize("path", _sources(), ids=lambda p: str(p.relative_to(ROOT)))
def test_source_file_rules(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    name = path.relative_to(ROOT)
    tree = ast.parse(text)
    docstring = ast.get_docstring(tree) or ""
    is_package_or_script = path.parent.parent == ROOT and path.parent.name != "tests"
    if is_package_or_script or path.name != "__init__.py":
        assert docstring, f"{name}: Türkçe başlık yorumu (docstring) yok"
    if is_package_or_script:
        assert "Genişletme:" in docstring, f"{name}: başlıkta 'Genişletme:' satırı yok"
    lines = text.count("\n")
    assert lines <= MAX_LINES, f"{name}: {lines} satır; ~300'ü aşan dosyayı iki dosyaya bölün."
    for marker in ("TO" + "DO", "FIX" + "ME"):  # bu dosya kendini yakalamasın diye parçalı yazıldı
        assert marker not in text, (
            f"{name}: yarım iş işareti ({marker}) var; işi bitirin ya da silin"
        )
    for number, line in enumerate(text.split("\n"), start=1):
        for char in line:
            category = unicodedata.category(char)
            invisible = category in ("Cf", "Zl", "Zp") or (category == "Zs" and char != " ")
            combining = category == "Mn" and 0x300 <= ord(char) <= 0x36F
            assert not (invisible or combining), (
                f"{name}:{number}: görünmez/birleşen karakter U+{ord(char):04X}; kaçış dizisiyle "
                "yazın ya da `python ../../araclar/kacis.py .` çalıştırın (STANDARTLAR §6.11)."
            )


@pytest.mark.parametrize("system", SYSTEMS)
def test_packages_import_only_stdlib_and_themselves(system: str) -> None:
    for path in sorted((ROOT / system).glob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            for name in names:
                top = name.split(".")[0]
                assert top in sys.stdlib_module_names, (
                    f"{system}/{path.name}: '{name}' standart kitaplık değil. Mini sistemler "
                    "yalnız stdlib ve kendi içini (from .x import) kullanır; kardeşe bağlanmayın."
                )


def test_havuz_json_and_pyproject() -> None:
    manifest = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    for field in ("ad", "baslik", "ozet", "tur", "denetle"):
        assert manifest.get(field), f"havuz.json: '{field}' alanı boş ya da yok"
    assert manifest["tur"] == "python" and manifest["python"]["ekstra"] == "dev"
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    assert project["dependencies"] == [], (
        "Çalışma zamanı bağımlılığı eklenmez (docs/KARARLAR.md K01)"
    )
    assert (ROOT / "docs" / "KARARLAR.md").exists() and (ROOT / "AGENTS.md").exists()
    assert "Sınırlar" in (ROOT / "README.md").read_text(encoding="utf-8")
