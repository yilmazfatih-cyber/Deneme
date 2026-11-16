"""Hile denetiminin (exam/integrity.py) ve ağaç yardımcılarının (exam/tree.py, exam/diffstat.py) testleri.

Sahte bir temel ağacı kurulur, başlangıç özeti ve anlık görüntüsü alınır; sonra her hile türü uygulanıp
denetimin onu yakaladığı (ve meşru değişiklikleri yakalamadığı) gösterilir.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from exam.diffstat import diff_stats
from exam.foundations import Protection, protection_for
from exam.integrity import IntegrityResult, check_integrity
from exam.tree import Snapshot, build_manifest, matches, restore, write_snapshot

TEST_PY = '''"""Örnek test."""

from mod import (
    topla,
)


def test_topla():
    assert topla(1, 2) == 3


def test_sifir():
    assert topla(0, 0) == 0
'''

TEST_TS = """import { describe, expect, it } from 'vitest'
import { topla } from '../src/mod.ts'

describe('topla', () => {
  it('iki sayı', () => {
    expect(topla(1, 2)).toBe(3)
  })
})
"""

VECTORS = {"islevler": {"topla": [{"girdi": [1, 2], "cikti": 3}, {"girdi": [0, 0], "cikti": 0}]}}


@pytest.fixture
def tree(tmp_path: Path) -> tuple[Path, dict[str, str], Snapshot]:
    root = tmp_path / "temel"
    files = {
        "pyproject.toml": "[tool.pytest.ini_options]\naddopts = '-q'\n",
        "package.json": '{"name": "x"}\n',
        "mod.py": "def topla(a, b):\n    return a + b\n",
        "src/mod.ts": "export const topla = (a: number, b: number) => a + b\n",
        "tests/test_mod.py": TEST_PY,
        "test/mod.test.ts": TEST_TS,
        "vektorler/mod.json": json.dumps(VECTORS, indent=2) + "\n",
        "node_modules/paket/index.js": "bakılmaz\n",
    }
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    manifest = build_manifest(root)
    write_snapshot(root, manifest, tmp_path / "baslangic.tar.gz")
    return root, manifest, Snapshot(tmp_path / "baslangic.tar.gz")


def _check(
    tree: tuple[Path, dict[str, str], Snapshot], allowed: tuple[str, ...] = ()
) -> IntegrityResult:
    root, manifest, snapshot = tree
    base = protection_for("kutuphane", allowed, ())
    return check_integrity(root, manifest, snapshot, base)


def _edit(root: Path, rel: str, old: str, new: str) -> None:
    path = root / rel
    text = path.read_text(encoding="utf-8")
    assert old in text
    path.write_text(text.replace(old, new), encoding="utf-8")


def test_desen_esleme() -> None:
    assert matches("a/b/test_x.py", ["**/test_*.py"])
    assert matches("test_x.py", ["**/test_*.py"])
    assert matches("web/test/rules/i18n.test.ts", ["web/test/rules/**"])
    assert not matches("web/src/test.ts", ["**/test/**"])
    assert matches("vitest.config.ts", ["**/vitest.config.*"])


def test_bagimlilik_klasoru_ozete_girmez(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    _, manifest, _ = tree
    assert "node_modules/paket/index.js" not in manifest
    assert "tests/test_mod.py" in manifest


def test_dokunulmamis_agac_temiz(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    result = _check(tree)
    assert result.ok
    assert result.warnings == []


def test_kaynak_degisikligi_serbest_susturma_uyari(
    tree: tuple[Path, dict[str, str], Snapshot],
) -> None:
    root = tree[0]
    _edit(root, "mod.py", "return a + b", "return a + b  # noqa: E501")
    (root / "yeni.py").write_text("X = 'a'.upper()  # tr-ok\n", encoding="utf-8")
    result = _check(tree)
    assert result.ok
    assert {w.path for w in result.warnings} == {"mod.py", "yeni.py"}


@pytest.mark.parametrize(
    ("rel", "old", "new"),
    [
        ("pyproject.toml", "-q", "-q -k 'not sifir'"),
        ("package.json", '"x"', '"y"'),
    ],
)
def test_degismez_dosya_degisirse_ihlal(
    tree: tuple[Path, dict[str, str], Snapshot], rel: str, old: str, new: str
) -> None:
    _edit(tree[0], rel, old, new)
    result = _check(tree)
    assert [v.path for v in result.violations] == [rel]


def test_test_dosyasi_silinirse_ihlal(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    (tree[0] / "tests/test_mod.py").unlink()
    assert [v.reason for v in _check(tree).violations] == ["korunan dosya silindi"]


def test_test_beklentisi_degisirse_ihlal(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    _edit(tree[0], "tests/test_mod.py", "== 3", "== 4")
    result = _check(tree)
    assert result.violations[0].reason == "var olan test satırları silindi ya da değiştirildi"
    assert "== 4" in result.violations[0].detail


def test_yeni_test_ve_ice_aktarma_eklemek_serbest(
    tree: tuple[Path, dict[str, str], Snapshot],
) -> None:
    root = tree[0]
    _edit(root, "tests/test_mod.py", "    topla,\n)", "    carp,\n    topla,\n)")
    with (root / "tests/test_mod.py").open("a", encoding="utf-8") as handle:
        handle.write("\n\ndef test_carp():\n    assert carp(2, 3) == 6\n")
    _edit(root, "test/mod.test.ts", "import { topla } from", "import { carp, topla } from")
    _edit(
        root,
        "test/mod.test.ts",
        "    expect(topla(1, 2)).toBe(3)\n",
        "    expect(topla(1, 2)).toBe(3)\n    expect(carp(2, 3)).toBe(6)\n",
    )
    assert _check(tree).ok


@pytest.mark.parametrize(
    "addition",
    [
        "\n\npytestmark = pytest.mark.skip\n",
        "\n\n@pytest.fixture(autouse=True)\ndef _x(monkeypatch):\n    pass\n",
        "\n\ndef test_topla():\n    pass\n",
    ],
)
def test_eklenen_satirla_gevsetme_ihlal(
    tree: tuple[Path, dict[str, str], Snapshot], addition: str
) -> None:
    with (tree[0] / "tests/test_mod.py").open("a", encoding="utf-8") as handle:
        handle.write(addition)
    assert not _check(tree).ok


def test_ts_testine_only_ya_da_skip_ihlal(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    _edit(
        tree[0], "test/mod.test.ts", "  it('iki sayı'", "  it.skip('x', () => {})\n  it('iki sayı'"
    )
    assert not _check(tree).ok


def test_vektore_ornek_eklemek_serbest_degistirmek_ihlal(
    tree: tuple[Path, dict[str, str], Snapshot],
) -> None:
    root = tree[0]
    data = json.loads((root / "vektorler/mod.json").read_text(encoding="utf-8"))
    data["islevler"]["topla"].append({"girdi": [2, 2], "cikti": 4})
    data["islevler"]["carp"] = [{"girdi": [2, 3], "cikti": 6}]
    (root / "vektorler/mod.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    assert _check(tree).ok
    data["islevler"]["topla"][0]["cikti"] = 4
    (root / "vektorler/mod.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    assert not _check(tree).ok


@pytest.mark.parametrize(
    "rel", ["tests/conftest.py", "alt/pytest.ini", "web/.prettierignore", "src/.gitignore"]
)
def test_denetimi_gevsetebilecek_yeni_dosya_ihlal(
    tree: tuple[Path, dict[str, str], Snapshot], rel: str
) -> None:
    path = tree[0] / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x\n", encoding="utf-8")
    assert [v.path for v in _check(tree).violations] == [rel]


def test_izinli_dosya_degisebilir(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    _edit(tree[0], "tests/test_mod.py", "== 3", "== 4")
    assert _check(tree, allowed=("tests/test_mod.py",)).ok


def test_geri_yukleme_ve_fark_sayimi(tree: tuple[Path, dict[str, str], Snapshot]) -> None:
    root, manifest, snapshot = tree
    _edit(root, "mod.py", "return a + b", "return b + a\n# yeni satır")
    (root / "yeni/klasor").mkdir(parents=True)
    (root / "yeni/klasor/dosya.py").write_text("a = 1\nb = 2\n", encoding="utf-8")
    (root / "src/mod.ts").unlink()
    stats = diff_stats(root, manifest, snapshot)
    assert (stats.yeni_dosya, stats.degisen_dosya, stats.silinen_dosya) == (1, 1, 1)
    assert (stats.eklenen_satir, stats.silinen_satir) == (4, 2)
    assert restore(root, manifest, snapshot) == 3
    assert build_manifest(root) == manifest
    assert not (root / "yeni").exists()


def test_koruma_temele_gore_ayrisir() -> None:
    uygulama = protection_for("uygulama", (), ())
    assert matches("web/test/rules/i18n.test.ts", uygulama.strict)
    kutuphane: Protection = protection_for("kutuphane", (), ("ozel.txt",))
    assert matches("vektorler/para.json", kutuphane.additive)
    assert matches("ozel.txt", kutuphane.strict)
