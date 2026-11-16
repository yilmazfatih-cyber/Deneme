"""Sanal makine testleri: örnekler, anlam parçacıkları (yorumlayıcıyla aynı), döküm, sınırlar."""

from __future__ import annotations

from pathlib import Path

import pytest

from sanal_makine import VM, Op, compile_program, disassemble
from sanal_makine import run as vm_run
from sanal_makine.__main__ import main
from yorumlayici import Interpreter, Limits, TohumError, parse
from yorumlayici.errors import LIMIT
from yorumlayici.natives import make_builtins
from yorumlayici.resolver import resolve

EXAMPLES = sorted((Path(__file__).parents[2] / "yorumlayici" / "ornekler").glob("*.tohum"))


def outcome(backend: type[Interpreter] | type[VM], source: str) -> tuple[str, str | None]:
    out: list[str] = []
    try:
        backend(out.append, Limits(max_steps=1_000_000, max_depth=100)).run(source)
    except TohumError as err:
        return "".join(out), str(err)
    return "".join(out), None


def compiled(source: str) -> str:
    program = parse(source)
    resolve(program, set(make_builtins()))
    return disassemble(compile_program(program))


@pytest.mark.parametrize("path", EXAMPLES, ids=[p.stem for p in EXAMPLES])
def test_examples_on_vm(path: Path) -> None:
    expected = path.with_suffix(".beklenen").read_text(encoding="utf-8")
    assert vm_run(path.read_text(encoding="utf-8")) == expected


SNIPPETS = [
    # üç düzey iç içe kapanım: üst değer, üst değerin üst değeri
    "işlev a() { değişken x = 1\n işlev b() { işlev c() { x += 1; döndür x } döndür c }\n"
    " döndür b() }\ndeğişken f = a()\nf()\nyazdır(f())",
    # kır'dan önce yakalanan döngü değişkeni kapanmalı
    "değişken fs = []\niçin i içinde aralık(5) { ekle(fs, işlev() { döndür i })\n"
    " eğer i == 2 { kır } }\nyazdır(fs[0](), fs[1](), fs[2]())",
    # devam ile atlanan turlarda yerel değişkenler doğru boşaltılmalı
    "değişken t = 0\niçin i içinde aralık(6) { değişken k = i * 2\n eğer k % 4 == 0 { devam }\n"
    " t += k }\nyazdır(t)",
    # iken içinde kapanım + iç blok yereli
    "değişken i = 0\ndeğişken g = yok\niken i < 3 { değişken y = i\n eğer i == 1 {"
    " g = işlev() { döndür y } }\n i += 1 }\nyazdır(g())",
    # yerel işlev kendini özyinelemeli çağırabilir
    "işlev dış() { işlev fakt(n) { eğer n < 2 { döndür 1 } döndür n * fakt(n - 1) }"
    " döndür fakt(10) }\nyazdır(dış())",
    # ad yazıldığı yerde bağlanır
    'değişken y = "genel"\nişlev dış() { işlev iç() { döndür y }\n değişken y = "yerel"\n'
    " döndür iç() }\nyazdır(dış())",
    # bileşik atama sırası ve dizinli bileşik atama
    "değişken x = 1\nişlev f() { x = 10; döndür 1 }\nx += f()\ndeğişken l = [1, 2]\n"
    "l[-1] *= 21\nyazdır(x, l)",
    # kısa devre değer döndürür
    'yazdır(yok veya "a", 0 ve 3, yanlış ve 1 / 0)',
    # çalışma hataları aynı ileti ve konumla
    "değişken l = [1]\nyazdır(l[1])",
    'yazdır({"a": 1, [2]: 3})',
    "işlev f(a, b) { }\nf(1)",
    "yazdır(z)\ndeğişken z = 1",
    "işlev f(n) { döndür f(n + 1) }\nf(0)",
]


@pytest.mark.parametrize("source", SNIPPETS)
def test_snippets_match_interpreter(source: str) -> None:
    assert outcome(VM, source) == outcome(Interpreter, source)


def test_disassembly_is_readable() -> None:
    text = compiled("değişken x = 1 + 2\nyazdır(x)")
    assert "CONST" in text and "ADD" in text and "DEFINE_GLOBAL" in text
    assert "yazdır" in text
    assert text.splitlines()[0] == "== <betik> (0 parametre, 0 üst değer) =="


def test_disassembly_shows_closures_upvalues_and_scopes() -> None:
    text = compiled(
        "işlev sayaç() { değişken n = 0\n döndür işlev() { n += 1; döndür n } }\n"
        "için i içinde [1] { yazdır(i) }"
    )
    assert "<işlev sayaç>" in text
    assert "GET_UPVALUE" in text and "SET_UPVALUE" in text and " n" in text
    assert "FOR_NEXT" in text and "END_SCOPE" in text
    assert "== <adsız> (0 parametre, 1 üst değer) ==" in text


def test_constants_are_deduplicated_by_type() -> None:
    program = parse("yazdır(1, 1, doğru, 1.0)")
    resolve(program, set(make_builtins()))
    proto = compile_program(program)
    assert proto.constants.count(1) == 3  # 1, doğru, 1.0 Python'da eşit sayılır…
    assert sorted(type(c).__name__ for c in proto.constants if c == 1) == ["bool", "float", "int"]


def test_vm_step_limit() -> None:
    with pytest.raises(TohumError) as info:
        VM(lambda _t: None, Limits(max_steps=10_000)).run("iken doğru { }")
    assert info.value.kind == LIMIT


def test_call_depth_limit_matches_interpreter() -> None:
    source = "işlev f(n) { döndür f(n + 1) }\nf(0)"
    assert outcome(VM, source)[1] == outcome(Interpreter, source)[1]
    assert "en fazla 100 iç içe çağrı" in str(outcome(VM, source)[1])


def test_opcodes_have_unique_values() -> None:
    assert len({int(op) for op in Op}) == len(Op)


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    program = tmp_path / "p.tohum"
    program.write_text("yazdır(2 ** 8)", encoding="utf-8")
    assert main(["calistir", str(program)]) == 0
    assert main(["dok", str(program)]) == 0
    assert main(["kod", "yazdır(1 / 0)"]) == 1
    assert main(["calistir", str(tmp_path / "yok.tohum")]) == 2
    captured = capsys.readouterr()
    assert captured.out.startswith("256\n== <betik>")
    assert "POW" in captured.out
    assert "sıfıra bölme" in captured.err and "Dosya bulunamadı" in captured.err
