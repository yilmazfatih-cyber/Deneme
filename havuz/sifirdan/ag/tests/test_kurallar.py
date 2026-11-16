"""Kural testleri (STANDARTLAR §7): temelin kendi kurallarını testle korur.

Her kural kırıldığında ileti NE YAPILACAĞINI söyler. Yeni bir mini sistem eklerken önce `SYSTEMS`
listesine ekleyin; bu dosya README, başlık yorumu, dosya boyu, test klasörü ve metin sözlüğü
kurallarını denetler.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
# YENİ MİNİ SİSTEM BURAYA (pyproject.toml'daki paket listesine de ekleyin)
SYSTEMS = [
    "kripto_egitim",
    "http_sunucu",
    "http_istemci",
    "websocket",
    "web_catisi",
    "orm",
    "dns",
    "kabuk",
    "hiz_ve_vekil",
    "eposta",
    "sunucu_olaylari",
]
README_SECTIONS = [
    "## Nasıl çalışır",
    "## Dosya haritası",
    "## Saldırı yüzeyi",
    "## Sınırlar",
    "## Buradan nereye",
]
MAX_LINES = 330  # yumuşak sınır ~300; bunu aşan dosya bölünmeli


def source_files() -> list[Path]:
    return sorted(p for system in SYSTEMS for p in (ROOT / system).rglob("*.py"))


@pytest.mark.parametrize("system", SYSTEMS)
def test_her_sistemin_readme_bolumleri_var(system: str) -> None:
    readme = ROOT / system / "README.md"
    assert readme.exists(), f"{system}/README.md yok: kopyalayıp uyarlayın (ör. dns/README.md)."
    text = readme.read_text(encoding="utf-8")
    missing = [s for s in README_SECTIONS if s not in text]
    assert not missing, f"{system}/README.md içinde eksik bölümler: {missing}"


def test_kripto_readme_ilk_satiri_uyari() -> None:
    first = (ROOT / "kripto_egitim" / "README.md").read_text(encoding="utf-8").splitlines()[0]
    assert "Eğitseldir; üretimde stdlib/platform kriptosu kullanılır" in first


@pytest.mark.parametrize("path", source_files(), ids=lambda p: str(p.relative_to(ROOT)))
def test_kaynak_dosya_kurallari(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    module = ast.parse(text)
    doc = ast.get_docstring(module)
    where = path.relative_to(ROOT)
    assert doc and len(doc.splitlines()) >= 2, (
        f"{where}: dosya Türkçe bir başlık yorumuyla açılmalı."
    )
    assert "Genişletme:" in doc, f"{where}: başlık yorumuna 'Genişletme:' satırı ekleyin."
    lines = len(text.splitlines())
    assert lines <= MAX_LINES, f"{where}: {lines} satır; ~300 satırı aşan dosyayı ikiye bölün."
    for node in ast.walk(module):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            body = [
                n
                for n in node.body
                if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))
            ]
            placeholder = len(body) == 1 and isinstance(body[0], ast.Pass)
            assert not placeholder, (
                f"{where}:{node.lineno} '{node.name}' boş gövdeli (yarım iş yok)."
            )
    assert not re.search(r"\b(TODO|FIXME|XXX)\b", text), (
        f"{where}: TODO/FIXME bırakmayın; README Sınırlar'a yazın."
    )


@pytest.mark.parametrize("system", SYSTEMS)
def test_her_sistemin_testi_var(system: str) -> None:
    tests = list((ROOT / "tests" / system).glob("test_*.py"))
    assert tests, (
        f"tests/{system}/ altında test yok: önce test yazın (ör. tests/dns/test_ileti.py)."
    )


def test_paket_listesi_ve_sistemler_tutarli() -> None:
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    for system in SYSTEMS:
        assert f'"{system}*"' in pyproject, f"pyproject.toml paket listesine '{system}*' ekleyin."
        assert f'"{system}",' in pyproject, (
            f"pyproject.toml mypy/isort listelerine '{system}' ekleyin."
        )


def _used_keys(function: str, folder: Path) -> set[str]:
    """Kodda `function("anahtar")` çağrılarındaki sabit anahtarlar (AST ile; belge örnekleri
    sayılmaz).
    """
    found: set[str] = set()
    for path in folder.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.args):
                continue
            if node.func.id != function:
                continue
            arg = node.args[0]
            options = (
                [arg.body, arg.orelse] if isinstance(arg, ast.IfExp) else [arg]
            )  # t("a" if x else "b")
            found |= {
                o.value for o in options if isinstance(o, ast.Constant) and isinstance(o.value, str)
            }
    return found


def test_cati_metin_anahtarlari_sozlukte() -> None:
    from web_catisi.texts import TEXTS

    used = _used_keys("text", ROOT / "web_catisi")
    missing = used - TEXTS.keys()
    assert not missing, f"web_catisi/texts.py içine şu anahtarları ekleyin: {sorted(missing)}"


def test_ornek_uygulama_metinleri_sozlukte_ve_kullaniliyor() -> None:
    from web_catisi.ornek.metinler import METINLER

    used = _used_keys("t", ROOT / "web_catisi" / "ornek")
    used |= {f"{kind}.baslik" for kind in ("giris", "kayit")}  # t(f"{kind}.baslik") ile üretilir
    missing = used - METINLER.keys()
    assert not missing, f"web_catisi/ornek/metinler.py içine ekleyin: {sorted(missing)}"
    unused = METINLER.keys() - used
    assert not unused, f"Kullanılmayan metin anahtarları (silin ya da kullanın): {sorted(unused)}"


def test_testler_sabit_kapi_kullanmaz() -> None:
    for path in (ROOT / "tests").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert not re.search(r"\b84[56][0-9]\b", text), (
            f"{path.name}: testler sabit kapı değil 0 (boş kapı) ister."
        )


def test_havuz_json_gecerli() -> None:
    data = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    for key in (
        "ad",
        "baslik",
        "ozet",
        "tur",
        "python",
        "denetle",
        "uzunDenetim",
        "kopyalamaHaric",
    ):
        assert key in data, f"havuz.json'da '{key}' alanı eksik (STANDARTLAR §4)."
    assert data["tur"] == "python"
    assert data["denetle"] == ["python scripts/check.py"]
