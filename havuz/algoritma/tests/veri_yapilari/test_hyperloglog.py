from __future__ import annotations

import pytest

from algoritma.veri_yapilari.hyperloglog import HyperLogLog


@pytest.mark.parametrize("true_count", [1, 10, 100, 1000, 20_000])
def test_relative_error_within_four_sigma(true_count: int) -> None:
    hll = HyperLogLog(precision=12)
    for i in range(true_count):
        hll.add(f"öğe-{i}")
        hll.add(f"öğe-{i}")  # tekrar eklemek sayıyı değiştirmez
    sigma = 1.04 / (hll.register_count**0.5)
    assert abs(hll.estimate() - true_count) / true_count < 4 * sigma


def test_edge_cases() -> None:
    assert HyperLogLog(4).estimate() == 0.0
    with pytest.raises(ValueError):
        HyperLogLog(3)
    with pytest.raises(ValueError):
        HyperLogLog(10).merge(HyperLogLog(11))


def test_merge_equals_union() -> None:
    a, b, both = HyperLogLog(10), HyperLogLog(10), HyperLogLog(10)
    for i in range(3000):
        (a if i % 2 else b).add(str(i).encode())
        both.add(str(i).encode())
    a.merge(b)
    assert a.estimate() == both.estimate()  # kova kova max: birleşim tam aynı durumu verir
