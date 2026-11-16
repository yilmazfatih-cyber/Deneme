"""Test çerçevesinin kendi testleri (pytest ile): keşif, fixture, parametrize, raises, zaman aşımı,
assert yeniden yazımı, raporlama ve komut satırı. Ayrıca çerçeveyle yazılmış örnek testler koşulur.
"""

from __future__ import annotations

import textwrap
import threading
import time
from pathlib import Path

import pytest

from test_cercevesi import ERROR, FAILED, PASSED, SKIPPED, Result, TestTimeout, run
from test_cercevesi.__main__ import main
from test_cercevesi.report import summary
from test_cercevesi.runner import call_with_timeout

ROOT = Path(__file__).parents[2] / "test_cercevesi"


def write_tests(folder: Path, name: str, source: str) -> Path:
    path = folder / name
    path.write_text(textwrap.dedent(source), encoding="utf-8")
    return path


def by_name(results: list[Result]) -> dict[str, Result]:
    return {r.id.split("::")[-1]: r for r in results}


def test_framework_examples_all_pass() -> None:
    results = run([ROOT / "ornekler"])
    outcomes = [r.outcome for r in results]
    assert outcomes.count(PASSED) == 10 and outcomes.count(SKIPPED) == 2
    assert FAILED not in outcomes and ERROR not in outcomes


def test_intentional_failures_are_reported_with_values() -> None:
    results = by_name(run([ROOT / "ornekler_hatali"]))
    equal = results["test_esitlik_kalir"]
    assert equal.outcome == FAILED
    assert "topla(2, 2) == 5" in equal.message
    assert "sol taraf: 4" in equal.message and "sağ taraf: 5" in equal.message
    assert equal.location == "test_ornek_kasitli.py:18"
    assert "ilk fark: konum 9 ('ü' ≠ 'u')" in results["test_metin_farki"].message
    listed = results["test_liste_farki"].message
    assert "dizin 2 (3 ≠ 4)" in listed and "açıklama: listeler aynı olmalıydı" in listed
    assert "değer: []" in results["test_deger_gosterimi"].message
    assert "hiçbir hata oluşmadı" in results["test_beklenen_hata_olusmadi"].message
    assert "zaman aşımı" in results["test_zaman_asimi"].message
    assert "ZeroDivisionError" in results["test_beklenmeyen_istisna"].message
    missing = results["test_eksik_fixture"]
    assert missing.outcome == ERROR and "fixture bulunamadı" in missing.message


def test_fixture_teardown_runs_even_when_test_fails(tmp_path: Path) -> None:
    log = tmp_path / "gunluk.txt"
    write_tests(
        tmp_path,
        "test_temizlik.py",
        f"""
        from pathlib import Path
        from test_cercevesi import fixture

        LOG = Path({str(log)!r})

        @fixture
        def kaynak():
            LOG.write_text("kuruldu\\n")
            yield 42
            LOG.write_text(LOG.read_text() + "temizlendi\\n")

        @fixture(scope="modul")
        def ortak():
            LOG.write_text(LOG.read_text() + "modul-kur\\n")
            yield "o"
            LOG.write_text(LOG.read_text() + "modul-temizle\\n")

        def test_kalan(kaynak, ortak):
            assert kaynak == 43

        def test_ikinci(ortak):
            assert ortak == "o"
        """,
    )
    results = by_name(run([tmp_path]))
    assert results["test_kalan"].outcome == FAILED
    assert results["test_ikinci"].outcome == PASSED
    assert log.read_text().splitlines() == ["kuruldu", "modul-kur", "temizlendi", "modul-temizle"]


def test_fixture_dependency_cycle_and_bad_teardown(tmp_path: Path) -> None:
    write_tests(
        tmp_path,
        "test_dongu.py",
        """
        from test_cercevesi import fixture

        @fixture
        def a(b):
            return 1

        @fixture
        def b(a):
            return 2

        @fixture
        def bozuk():
            yield 1
            raise RuntimeError("temizlik patladı")

        def test_dongu(a):
            pass

        def test_bozuk_temizlik(bozuk):
            pass
        """,
    )
    results = by_name(run([tmp_path]))
    assert "döngüsel fixture bağımlılığı: a → b → a" in results["test_dongu"].message
    assert results["test_bozuk_temizlik"].outcome == ERROR
    assert "temizlik patladı" in results["test_bozuk_temizlik"].message


def test_parametrize_stacking_raises_match_and_skip(tmp_path: Path) -> None:
    write_tests(
        tmp_path,
        "test_param.py",
        """
        from test_cercevesi import parametrize, raises

        @parametrize("x", [1, 2])
        @parametrize("y", ["a", "b"], ids=["A", "B"])
        def test_carpim(x, y):
            assert x in (1, 2)

        def test_ileti_eslesmedi():
            with raises(ValueError, match="sıfır"):
                raise ValueError("başka ileti")

        def test_yan_etki_bir_kez():
            sayac = []
            def say():
                sayac.append(1)
                return len(sayac)
            assert say() == 1
            assert len(sayac) == 1
        """,
    )
    results = run([tmp_path])
    ids = [r.id.split("::")[-1] for r in results]
    assert ids[:4] == [
        "test_carpim[1-A]",
        "test_carpim[1-B]",
        "test_carpim[2-A]",
        "test_carpim[2-B]",
    ]
    named = by_name(results)
    assert "ileti eşleşmedi" in named["test_ileti_eslesmedi"].message
    assert named["test_yan_etki_bir_kez"].outcome == PASSED


def test_collection_error_does_not_stop_other_files(tmp_path: Path) -> None:
    write_tests(tmp_path, "test_bozuk.py", "def test_x(:\n    pass\n")
    write_tests(tmp_path, "test_saglam.py", "def test_tamam():\n    assert True\n")
    results = run([tmp_path])
    assert [r.outcome for r in results] == [ERROR, PASSED]
    assert "SyntaxError" in results[0].message


def test_timeout_interrupts_on_main_thread() -> None:
    started = time.perf_counter()
    with pytest.raises(TestTimeout, match="0,2 sn"):
        call_with_timeout(lambda: time.sleep(5), 0.2)
    assert time.perf_counter() - started < 3


def test_timeout_from_worker_thread() -> None:
    caught: list[BaseException] = []

    def worker() -> None:
        try:
            call_with_timeout(lambda: time.sleep(1), 0.1)
        except TestTimeout as exc:
            caught.append(exc)

    thread = threading.Thread(target=worker)
    thread.start()
    thread.join(5)
    assert caught and "arka planda sürüyor" in str(caught[0])


def test_summary_uses_turkish_decimal() -> None:
    results = [Result("a", PASSED), Result("b", FAILED), Result("c", SKIPPED)]
    assert summary(results, 0.125) == "1 geçti, 1 kaldı, 1 atlandı, 0 hata (0,12 sn)"


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_tests(
        tmp_path,
        "test_cli_ornek.py",
        """
        def test_İlk():
            assert 1 + 1 == 2

        def test_ikinci_kalir():
            assert 1 + 1 == 3

        def test_üçüncü():
            pass
        """,
    )
    assert main([str(tmp_path), "-k", "ilk", "-v"]) == 0  # Türkçe kurallı: İlk ~ ilk
    assert main([str(tmp_path), "-x"]) == 1
    assert main([str(tmp_path / "yok")]) == 2
    assert main([str(tmp_path), "-k", "boyle_test_yok"]) == 2
    out = capsys.readouterr().out
    assert "test_İlk GEÇTİ" in out
    assert "1 geçti, 1 kaldı, 0 atlandı, 0 hata" in out  # -x: ilk kalan testte durdu
    assert "Beklenti tutmadı: 1 + 1 == 3" in out
