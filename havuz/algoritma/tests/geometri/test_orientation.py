from __future__ import annotations

from fractions import Fraction

from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.orientation import cross, on_segment, orientation, orientation_eps

COORD = st.integers(-20, 20)
POINT = st.tuples(COORD, COORD)


def test_hand_checked_example() -> None:
    assert cross((0, 0), (3, 0), (0, 4)) == 12  # 3-4-5 üçgeni: alanın iki katı
    assert orientation((1, 1), (2, 2), (3, 1)) == -1  # sağa dönüş
    assert on_segment((0, 0), (0, 0), (0, 5)) and not on_segment((1, 1), (0, 0), (0, 5))


def test_float_pitfall_and_remedies() -> None:
    # y = 3x doğrusu üstünde üç nokta; float'ta 0.1, 0.2, 0.3 tam gösterilemez → yanlış "sola dönüş"
    a, b, c = (0.1, 0.3), (0.2, 0.6), (0.3, 0.9)
    assert cross(a, b, c) != 0 and orientation(a, b, c) == 1  # TUZAK: aslında doğrusallar
    assert orientation_eps(a, b, c) == 0  # çare 1: ölçekli tolerans
    exact = [(Fraction(x).limit_denominator(10), Fraction(y).limit_denominator(10)) for x, y in (a, b, c)]
    assert orientation(*exact) == 0  # çare 2: kesin aritmetik


def test_edge_cases() -> None:
    assert orientation((5, 5), (5, 5), (5, 5)) == 0
    assert on_segment((2, 2), (2, 2), (2, 2)) and not on_segment((2, 3), (2, 2), (2, 2))
    assert orientation((10**18, 0), (0, 10**18), (-(10**18), 1)) == 1  # büyük tam sayılar kesin


@given(POINT, POINT, POINT)
def test_matches_determinant_and_symmetries(
    a: tuple[int, int], b: tuple[int, int], c: tuple[int, int]
) -> None:
    det = (
        a[0] * (b[1] - c[1]) - a[1] * (b[0] - c[0]) + (b[0] * c[1] - b[1] * c[0])
    )  # 3×3 determinant [[ax, ay, 1], [bx, by, 1], [cx, cy, 1]] açılımı
    assert orientation(a, b, c) == (det > 0) - (det < 0)
    assert orientation(a, b, c) == orientation(b, c, a) == -orientation(a, c, b)
    between = min(a[0], b[0]) <= c[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= c[1] <= max(a[1], b[1])
    assert on_segment(c, a, b) == (det == 0 and between)
