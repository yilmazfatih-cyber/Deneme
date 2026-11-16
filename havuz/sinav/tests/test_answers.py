"""Okuma görevlerinin yanıt denetimi (exam/answers.py) ve iki okuma görevinin kuralları.

Başvuru yanıtı geçmeli; tipik yanlışlar (belgedeki önerilen "90 gün"ü uygulanmış sanmak, yalnız bir top-p
varsayılanını görmek) kalmalı.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from exam.answers import Rule, check_file, fold_tr, split_answers
from exam.paths import GOREVLER


def _module(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        f"yanit_{path.parent.parent.name.replace('-', '_')}", path
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _failures(task_id: str, text: str, tmp_path: Path) -> dict[int, list[str]]:
    rules = _module(GOREVLER / task_id / "gizli" / "yanit_denetle.py").RULES
    path = tmp_path / "YANIT.txt"
    path.write_text(text, encoding="utf-8")
    return {number: problems for number, problems in check_file(path, rules).items() if problems}


def test_turkce_katlama() -> None:
    assert fold_tr("İSTANBUL Iğdır") == "istanbul igdir"
    assert fold_tr("ÇAĞRI") == "cagri"


def test_numarali_yanitlar_cesitli_bicimlerde() -> None:
    text = "1. bir\n   devam 1.0 sürer\n**2.** iki\n3) üç\nSoru 4: dört\n## 5. beş\n"
    answers = split_answers(text)
    assert answers[1] == "bir\n   devam 1.0 sürer"
    assert [answers[n] for n in (2, 3, 4, 5)] == ["iki", "üç", "dört", "beş"]


def test_kural_turleri(tmp_path: Path) -> None:
    rule = Rule(
        1,
        "konu",
        all_of=("deleted",),
        any_of=(("hayır", "silinmez"),),
        none_of=("90",),
        unless=("öneri",),
    )
    path = tmp_path / "Y.txt"
    path.write_text("1. Hayır; DELETED = 1 olur. 90 gün yalnız öneri.\n", encoding="utf-8")
    assert check_file(path, [rule]) == {1: []}
    path.write_text("1. Hayır; deleted = 1. 90 gün sonra silinir.\n", encoding="utf-8")
    assert check_file(path, [rule])[1]
    assert check_file(tmp_path / "yok.txt", [rule])[1]


def test_uygulama_okuma_basvuru_gecer_tipik_yanlis_kalir(tmp_path: Path) -> None:
    cozum = _module(GOREVLER / "uygulama-silme-okuma" / "cozum.py")
    assert _failures("uygulama-silme-okuma", cozum.ANSWER, tmp_path) == {}
    wrong = cozum.ANSWER.replace(
        "Hiç temizlenmiyor. docs/MEZAR_TASI.md'deki saklama süresi (ör. 90 gün) yalnız önerilen bir tasarım,\n"
        "   uygulanmadı; bugün mezar taşları süresiz kalır.",
        "90 gün sonra kalıcı olarak temizlenir.",
    )
    assert list(_failures("uygulama-silme-okuma", wrong, tmp_path)) == [2]


def test_dil_modeli_okuma_basvuru_gecer_tipik_yanlis_kalir(tmp_path: Path) -> None:
    cozum = _module(GOREVLER / "dil-modeli-okuma" / "cozum.py")
    assert _failures("dil-modeli-okuma", cozum.ANSWER, tmp_path) == {}
    wrong = "1. 0\n2. 0.95, aynı.\n3. Durur.\n4. Sabit; train.py\n5. 8000\n"
    assert list(_failures("dil-modeli-okuma", wrong, tmp_path)) == [1, 2, 3, 4, 5]
