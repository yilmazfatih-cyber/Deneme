"""Kural testleri: kütüphanenin kendi kurallarını korur (STANDARTLAR.md §7).

Her kural bozulduğunda ileti, düzeltmek için ne yapılacağını söyler. Kurallar:
  1. Her modülün başlığında zorunlu alanlar (Fikir, Karmaşıklık, Ne zaman, …) ve doctest örneği var.
  2. Her modülün `tests/<konu>/test_<modül>.py` dosyası var ve dışa açılan her adı anıyor.
  3. docs/DIZIN.md günceldir (betikle üretilir).
  4. Çalışma zamanı bağımlılığı yok; paket içi bağımlılık başlıkta yazılı.
  5. Modül adı stdlib modülünü gölgelemez (dosya kopyalanınca `import queue` bozulmasın).
  6. Yerel ayara duyarsız büyük/küçük harf çağrısı yok; küresel `random` durumu kullanılmıyor.
  7. Yarım iş (TODO, DOLDUR, NotImplementedError) yok; dosyalar makul uzunlukta.
"""

from __future__ import annotations

import ast
import re
import sys

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
