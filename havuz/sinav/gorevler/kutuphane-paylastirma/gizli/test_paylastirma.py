"""Gizli sınav testi (kutuphane-paylastirma): `allocate` en büyük kalan yöntemine uyar.

Başvuru: kesirlerle (fractions) bağımsız yazılmış en büyük kalan hesabı; eşit kalanda öndeki pay artar.
"""

import random
from fractions import Fraction

from kutuphane.para import allocate, money


def _kurus(parts: list) -> list[int]:  # type: ignore[type-arg]
    return [part.kurus for part in parts]


def _reference(total: int, ratios: list[int]) -> list[int]:
    weight = sum(ratios)
    amount = abs(total)
    exact = [Fraction(amount * ratio, weight) for ratio in ratios]
    shares = [int(value) for value in exact]
    leftover = amount - sum(shares)
    order = sorted(range(len(ratios)), key=lambda i: (-(exact[i] - shares[i]), i))
    for index in order[:leftover]:
        shares[index] += 1
    return [-share if total < 0 else share for share in shares]


def test_bildirilen_ornek() -> None:
    assert _kurus(allocate(money(10000), [1, 2, 3])) == [1667, 3333, 5000]
    assert _kurus(allocate(money(100), [1, 2, 3])) == [17, 33, 50]
    assert _kurus(allocate(money(-10000), [1, 2, 3])) == [-1667, -3333, -5000]


def test_esit_kalanda_ondeki_pay_artar() -> None:
    assert _kurus(allocate(money(10000), [1, 1, 1])) == [3334, 3333, 3333]
    assert _kurus(allocate(money(5), [1] * 7)) == [1, 1, 1, 1, 1, 0, 0]
    assert _kurus(allocate(money(100), [0, 1])) == [0, 100]


def test_en_buyuk_kalan_kaba_kuvvetle() -> None:
    rng = random.Random(4242)
    for _ in range(3000):
        total = rng.randint(-1_000_000, 1_000_000)
        ratios = [rng.randint(0, 50) for _ in range(rng.randint(1, 7))]
        if not any(ratios):
            ratios[0] = 1
        parts = _kurus(allocate(money(total), ratios))
        assert sum(parts) == total
        assert parts == _reference(total, ratios), (total, ratios)
