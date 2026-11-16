from __future__ import annotations

from fractions import Fraction

from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.segment_intersection import segment_intersection, segments_intersect

P = tuple[int, int]
POINT = st.tuples(st.integers(-4, 4), st.integers(-4, 4))


def _cross(u: tuple[int, int], v: tuple[int, int]) -> int:
    return u[0] * v[1] - u[1] * v[0]


def _reference(p1: P, p2: P, p3: P, p4: P) -> set[tuple[Fraction, Fraction]] | str:
    """Başvuru: parametrik çözüm. Dönüş: kesişim noktaları kümesi ya da 'parça' (sonsuz nokta)."""
    d1 = (p2[0] - p1[0], p2[1] - p1[1])
    d2 = (p4[0] - p3[0], p4[1] - p3[1])
    w = (p3[0] - p1[0], p3[1] - p1[1])
    den = _cross(d1, d2)
    if den != 0:
        t, s = Fraction(_cross(w, d2), den), Fraction(_cross(w, d1), den)
        if 0 <= t <= 1 and 0 <= s <= 1:
            return {(p1[0] + t * d1[0], p1[1] + t * d1[1])}
        return set()
    # paralel ya da dejenere: ortak noktaları kafes ızgarasında 1/2'lik adımla tara (küçük aralık)
    found = set()
    for i in range(-16, 17):
        for j in range(-16, 17):
            q = (Fraction(i, 2), Fraction(j, 2))
            if _on(q, p1, p2) and _on(q, p3, p4):
                found.add(q)
    return "parça" if len(found) > 1 else found


def _on(q: tuple[Fraction, Fraction], a: P, b: P) -> bool:
    cross = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])
    return cross == 0 and min(a[0], b[0]) <= q[0] <= max(a[0], b[0]) and min(
        a[1], b[1]
    ) <= q[1] <= max(a[1], b[1])


def test_hand_checked_example() -> None:
    # T biçimi: biri öbürünün ucuna değiyor
    assert segment_intersection((0, 0), (4, 0), (2, 0), (2, 3)) == ((Fraction(2), Fraction(0)),)
    assert segment_intersection((0, 0), (2, 0), (2, 0), (5, 0)) == ((2, 0),)  # yalnız uçta değme
    assert segment_intersection((1, 1), (3, 3), (0, 0), (4, 4)) == ((1, 1), (3, 3))  # içerme
    assert not segments_intersect((0, 0), (1, 0), (0, 1), (1, 1))  # paralel


def test_edge_cases() -> None:
    assert segment_intersection((1, 1), (1, 1), (1, 1), (1, 1)) == ((1, 1),)  # iki nokta
    assert segment_intersection((1, 1), (1, 1), (0, 0), (2, 2)) == ((1, 1),)
    assert segment_intersection((0, 0), (1, 0), (2, 0), (3, 0)) is None  # doğrusal, ayrık
    floats = segment_intersection((0.0, 0.0), (1.0, 1.0), (0.0, 1.0), (1.0, 0.0))
    assert floats == ((0.5, 0.5),)


@given(POINT, POINT, POINT, POINT)
def test_matches_parametric_reference(p1: P, p2: P, p3: P, p4: P) -> None:
    expected = _reference(p1, p2, p3, p4)
    result = segment_intersection(p1, p2, p3, p4)
    assert segments_intersect(p1, p2, p3, p4) == (expected != set())
    if expected == "parça":
        assert result is not None and len(result) == 2
        assert _on(result[0], p1, p2) and _on(result[1], p3, p4)  # type: ignore[arg-type]
    elif expected:
        assert result is not None and len(result) == 1 and {result[0]} == expected
    else:
        assert result is None
