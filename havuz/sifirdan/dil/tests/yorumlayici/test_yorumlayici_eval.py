"""Yorumlayıcı anlam testleri: değerler, kapsam, kapanımlar, döngüler, hatalar, sınırlar."""

from __future__ import annotations

import pytest

from yorumlayici import Interpreter, Limits, TohumError, run
from yorumlayici.errors import LIMIT, RUNTIME, SCOPE


def show(expr: str) -> str:
    return run(f"yazdır({expr})").rstrip("\n")


def error_of(source: str, limits: Limits | None = None) -> TohumError:
    with pytest.raises(TohumError) as info:
        run(source, limits)
    return info.value


@pytest.mark.parametrize(
    ("expr", "expected"),
    [
        ("7 / 2", "3.5"),
        ("6 / 3", "2"),
        ("7 % 3", "1"),
        ("-7 % 3", "2"),
        ("2 ** 10", "1024"),
        ("2 ** -1", "0.5"),
        ("1 + 2.5", "3.5"),
        ("0.1 + 0.2", "0.30000000000000004"),
        ('"a" + "ğ"', "ağ"),
        ("[1] + [2, 3]", "[1, 2, 3]"),
        ("doğru == 1", "yanlış"),
        ("1 == 1.0", "doğru"),
        ("[1, [2]] == [1, [2]]", "doğru"),
        ('{"a": 1} == {"a": 1}', "doğru"),
        ('"ç" > "z"', "doğru"),
        ("yok veya 5", "5"),
        ("0 ve 3", "3"),
        ("değil 0", "yanlış"),
        ("değil yok", "doğru"),
        ('[1, "a", yok, doğru]', '[1, "a", yok, doğru]'),
        ('{"ad": "Ayşe", 3: [1.5]}', '{"ad": "Ayşe", 3: [1.5]}'),
        ("[1, 2, 3][-1]", "3"),
        ('"merhaba"[1]', "e"),
        ("tür(işlev() { })", "işlev"),
    ],
)
def test_values_and_operators(expr: str, expected: str) -> None:
    assert show(expr) == expected


def test_short_circuit_skips_right_side() -> None:
    src = (
        'işlev bağır() { yazdır("çağrıldı"); döndür doğru }\n'
        "yazdır(yanlış ve bağır())\nyazdır(doğru veya bağır())"
    )
    assert run(src) == "yanlış\ndoğru\n"


def test_closures_capture_variables_not_values() -> None:
    src = """
işlev çift() {
    değişken n = 0
    işlev artır() { n += 1 }
    işlev oku() { döndür n }
    döndür [artır, oku]
}
değişken p = çift()
p[0]()
p[0]()
yazdır(p[1]())
"""
    assert run(src) == "2\n"


def test_loop_variable_is_fresh_each_iteration() -> None:
    src = """
değişken fs = []
için i içinde aralık(3) { ekle(fs, işlev() { döndür i }) }
yazdır(fs[0](), fs[1](), fs[2]())
"""
    assert run(src) == "0 1 2\n"


def test_names_bind_where_written_not_where_called() -> None:
    src = """
değişken y = "genel"
işlev dış() {
    işlev iç() { döndür y }
    değişken y = "yerel"
    döndür iç()
}
yazdır(dış())
"""
    assert run(src) == "genel\n"


def test_top_level_functions_can_be_mutually_recursive() -> None:
    src = """
işlev çift_mi(n) { eğer n == 0 { döndür doğru } döndür tek_mi(n - 1) }
işlev tek_mi(n) { eğer n == 0 { döndür yanlış } döndür çift_mi(n - 1) }
yazdır(çift_mi(10), tek_mi(7))
"""
    assert run(src) == "doğru doğru\n"


def test_compound_assignment_evaluates_left_to_right() -> None:
    src = "değişken x = 1\nişlev f() { x = 10; döndür 1 }\nx += f()\nyazdır(x)"
    assert run(src) == "2\n"


def test_for_loop_iterates_over_snapshot_and_dict_keys() -> None:
    src = """
değişken l = [1, 2]
için x içinde l { ekle(l, x) }
yazdır(l)
için k içinde {"a": 1, "b": 2} { yazdır(k) }
için h içinde "ığ" { yazdır(h) }
"""
    assert run(src) == "[1, 2, 1, 2]\na\nb\nı\nğ\n"


def test_break_and_continue() -> None:
    src = """
değişken i = 0
iken doğru {
    i += 1
    eğer i % 2 == 0 { devam }
    eğer i > 7 { kır }
    yazdır(i)
}
"""
    assert run(src) == "1\n3\n5\n7\n"


def test_index_assignment_and_compound_index() -> None:
    assert run('değişken d = {"a": [1, 2]}\nd["a"][1] += 40\nyazdır(d)') == '{"a": [1, 42]}\n'


def test_cyclic_list_is_displayed_safely() -> None:
    assert run("değişken a = [1]\nekle(a, a)\nyazdır(a)") == "[1, [...]]\n"


@pytest.mark.parametrize(
    ("source", "kind", "message"),
    [
        ("yazdır(x)", SCOPE, "'x' tanımlı değil"),
        ("işlev f() { değişken a = 1; değişken a = 2 }", SCOPE, "zaten tanımlı"),
        ("işlev f() { değişken a = a }", SCOPE, "kendi başlangıç değerinde"),
        ("işlev f() { kır }", SCOPE, "yalnız bir döngünün"),
        ("döndür 5", SCOPE, "yalnız bir işlevin"),
        ("yazdır(z)\ndeğişken z = 1", RUNTIME, "tanımlanmadan önce kullanıldı"),
        ('yazdır(1 + "a")', RUNTIME, "'+' işleci sayı ile dizgi"),
        ("yazdır(1 / 0)", RUNTIME, "sıfıra bölme"),
        ("yazdır([1][3])", RUNTIME, "dizin sınır dışı: 3"),
        ('yazdır({"a": 1}["b"])', RUNTIME, "sözlükte 'b' anahtarı yok"),
        ("yazdır({[1]: 2})", RUNTIME, "sözlük anahtarı dizgi ya da sayı"),
        ('değişken s = "ab"\ns[0] = "x"', RUNTIME, "dizgiler değiştirilemez"),
        ("yazdır(5())", RUNTIME, "sayı türü çağrılamaz"),
        ("işlev f(a) { }\nf(1, 2)", RUNTIME, "1 bağımsız değişken bekliyor, 2 verildi"),
        ('yazdır("a" < 1)', RUNTIME, "karşılaştırması dizgi ile sayı"),
        ("için x içinde 5 { }", RUNTIME, "sayı üzerinde dolaşılamaz"),
        ("yazdır(10.0 ** 400)", RUNTIME, "sayı taşması"),
        ("yazdır((-8) ** 0.5)", RUNTIME, "gerçel sayı değil"),
        ("yazdır(2 ** 100000)", LIMIT, "sayı çok büyük"),
    ],
)
def test_errors_have_kind_and_message(source: str, kind: str, message: str) -> None:
    err = error_of(source)
    assert err.kind == kind
    assert message in err.message
    assert err.pos is not None


def test_scope_error_suggests_similar_name() -> None:
    err = error_of("değişken toplam = 1\nyazdır(toplm)")
    assert err.hint == "'toplam' mi demek istediniz?"


def test_output_before_runtime_error_is_kept() -> None:
    out: list[str] = []
    with pytest.raises(TohumError):
        Interpreter(out.append).run("yazdır(1)\nyazdır(1 / 0)")
    assert out == ["1\n"]


def test_step_limit_stops_infinite_loop() -> None:
    err = error_of("iken doğru { }", Limits(max_steps=5_000))
    assert err.kind == LIMIT and "adım sınırı" in err.message


def test_recursion_limit_stops_infinite_recursion() -> None:
    err = error_of("işlev f(n) { döndür f(n + 1) }\nf(0)", Limits(max_depth=50))
    assert err.kind == LIMIT and "en fazla 50 iç içe çağrı" in err.message


def test_deep_but_bounded_recursion_works() -> None:
    src = "işlev t(n) { eğer n == 0 { döndür 0 } döndür n + t(n - 1) }\nyazdır(t(190))"
    assert run(src) == f"{sum(range(191))}\n"


def test_deeply_nested_value_display_is_limited() -> None:
    err = error_of("değişken a = []\niçin i içinde aralık(400) { a = [a] }\nyazdır(a)")
    assert err.kind == LIMIT and "çok derin" in err.message


def test_huge_list_is_limited() -> None:
    err = error_of("değişken l = aralık(2000000)")
    assert err.kind == LIMIT


def test_interpreter_keeps_globals_between_runs() -> None:
    out: list[str] = []
    interp = Interpreter(out.append)
    interp.run("değişken a = 2\nişlev kare(x) { döndür x * x }")
    assert interp.run("kare(a) + 1") == 5
    interp.run("yazdır(kare(3))")
    assert out == ["9\n"]
