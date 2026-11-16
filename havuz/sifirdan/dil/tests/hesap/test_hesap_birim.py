"""Birim dönüşümü testleri: uzunluk, ağırlık, sıcaklık; boyut uyumu; gidiş-dönüş özelliği."""

from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from hesap import UNITS, CalcError, Calculator, calculate


def show(expr: str) -> str:
    calc = Calculator()
    return calc.format(calc.calculate(expr))


@pytest.mark.parametrize(
    ("expr", "expected"),
    [
        ("5 km + 300 m", "5.3 km"),
        ("5 km + 300 m kaç m", "5300 m"),
        ("1 mil -> km", "1.609344 km"),
        ("12 inç kaç cm", "30.48 cm"),
        ("3 ft to m", "0.9144 m"),
        ("2 lb kaç g", "907.18474 g"),
        ("16 oz kaç lb", "1 lb"),
        ("1.5 ton kaç kg", "1500 kg"),
        ("100 °C kaç °F", "212 °F"),
        ("-40 C to F", "-40 °F"),
        ("0 K kaç °C", "-273.15 °C"),
        ("98.6 F kaç C", "37 °C"),
        ("5 km / 500 m", "10"),
        ("2 * 3 km", "6 km"),
        ("(2 + 3) km kaç m", "5000 m"),
        ("10 km / 4", "2.5 km"),
        ("-(5 km)", "-5 km"),
    ],
)
def test_conversions(expr: str, expected: str) -> None:
    assert show(expr) == expected


@pytest.mark.parametrize(
    ("expr", "message"),
    [
        ("5 km + 3 kg", "uzunluk (km) ile ağırlık (kg) toplanamaz"),
        ("5 + 3 km", "birimsiz sayı ile birimli değer"),
        ("5 km * 2 m", "iki birimli değer çarpılamaz"),
        ("5 kg kaç m", "ağırlık (kg) uzunluk birimine (m) dönüştürülemez"),
        ("5 kaç m", "birimi yok"),
        ("20 C + 5 C", "sıcaklıklarla toplama"),
        ("2 * 20 C", "sıcaklık bir sayıyla çarpılamaz"),
        ("5 km km", "zaten birimi var"),
        ("3 parsek", "bilinmeyen birim"),
        ("5 km kaç", "dönüşümden sonra birim"),
        ("karekök(4 km)", "yalnız birimsiz sayılarla"),
        ("10 / 2 km", "sayı uzunluk (km) ile bölünemez"),
    ],
)
def test_unit_errors(expr: str, message: str) -> None:
    with pytest.raises(CalcError) as info:
        calculate(expr)
    assert message in info.value.message


NAMES = sorted(UNITS)


@given(st.sampled_from(NAMES), st.sampled_from(NAMES), st.floats(min_value=-1e6, max_value=1e6))
def test_round_trip_conversion(source: str, target: str, value: float) -> None:
    a, b = UNITS[source], UNITS[target]
    if a.dimension != b.dimension:
        return
    expr = f"({value!r} {source}) kaç {target} kaç {source}"
    result = Calculator().calculate(expr)
    assert math.isclose(result.value, value, rel_tol=1e-9, abs_tol=1e-6)
