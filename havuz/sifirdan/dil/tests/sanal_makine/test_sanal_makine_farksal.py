"""Farksal test: rastgele programlar ve ifadeler yorumlayıcıda ve sanal makinede AYNI sonucu verir.

"Aynı sonuç" = aynı çıktı metni ve (varsa) aynı hata iletisi (tür + konum + metin + ipucu).
Hızlı denetimde az tohum, `python scripts/check.py --uzun` ile binlerce tohum koşar.
"""

from __future__ import annotations

import random

import pytest

from sanal_makine import VM
from sanal_makine.random_programs import random_expression, random_program
from yorumlayici import Interpreter, Limits, TohumError

LIMITS = Limits(max_steps=400_000, max_depth=60)


def outcome(backend: type[Interpreter] | type[VM], source: str) -> tuple[str, str | None]:
    out: list[str] = []
    try:
        backend(out.append, LIMITS).run(source)
    except TohumError as err:
        return "".join(out), str(err)
    return "".join(out), None


def assert_same(source: str) -> None:
    interp, vm = outcome(Interpreter, source), outcome(VM, source)
    assert interp[1] is None or "adım sınırı" not in interp[1], "program çok uzun sürdü"
    assert vm == interp, f"Farklı sonuç!\n--- program ---\n{source}"


@pytest.mark.parametrize("seed", range(150))
def test_random_programs(seed: int) -> None:
    assert_same(random_program(random.Random(seed)))


@pytest.mark.parametrize("seed", range(40))
def test_random_expressions(seed: int) -> None:
    rng = random.Random(10_000 + seed)
    for _ in range(25):
        assert_same(f"yazdır({random_expression(rng)})")


@pytest.mark.parametrize("seed", range(60))
def test_constant_folding_keeps_meaning(seed: int) -> None:
    """Katlamalı sanal makine == katlamasız yorumlayıcı (rastgele ifadeler sabit doludur)."""
    rng = random.Random(50_000 + seed)
    sources = [f"yazdır({random_expression(rng)})" for _ in range(10)]
    sources.append(random_program(random.Random(seed)))
    for source in sources:
        out: list[str] = []
        try:
            VM(out.append, LIMITS, optimize=True).run(source)
            folded: tuple[str, str | None] = ("".join(out), None)
        except TohumError as err:
            folded = ("".join(out), str(err))
        assert folded == outcome(Interpreter, source), source


@pytest.mark.yavas
def test_many_random_programs() -> None:
    for seed in range(1_000, 4_000):
        assert_same(random_program(random.Random(seed)))


@pytest.mark.yavas
def test_many_random_expressions() -> None:
    rng = random.Random(99)
    for _ in range(20_000):
        assert_same(f"yazdır({random_expression(rng)})")


def test_generator_covers_the_interesting_features() -> None:
    text = "\n".join(random_program(random.Random(seed)) for seed in range(100))
    for feature in ["işlev()", "kır", "devam", "iken", "için", "döndür", "ekle(", "+="]:
        assert feature in text, feature


def test_generated_programs_mostly_run_without_error() -> None:
    errors = sum(
        outcome(Interpreter, random_program(random.Random(s)))[1] is not None for s in range(60)
    )
    assert errors < 15  # çoğu program sonuna kadar çalışmalı ki farksal test anlamlı olsun
