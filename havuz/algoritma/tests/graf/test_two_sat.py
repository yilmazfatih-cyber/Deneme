from __future__ import annotations

import itertools

from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.two_sat import TwoSat

Clause = tuple[int, bool, int, bool]


def _satisfies(assignment: tuple[bool, ...] | list[bool], clauses: list[Clause]) -> bool:
    return all(assignment[a] == av or assignment[b] == bv for a, av, b, bv in clauses)


def test_hand_checked_example() -> None:
    # Nöbet: Ali (0) ve Banu (1) aynı gün olamaz; Can (2) ancak Ali varsa gelir; biri mutlaka gelir
    sat = TwoSat(3)
    sat.add_clause(0, False, 1, False)
    sat.add_clause(2, False, 0, True)
    sat.add_clause(0, True, 1, True)
    sat.require(2, True)
    assert sat.solve() == [True, False, True]


def test_edge_cases() -> None:
    assert TwoSat(0).solve() == [] and TwoSat(2).solve() is not None
    contradiction = TwoSat(1)
    contradiction.require(0, True)
    contradiction.require(0, False)
    assert contradiction.solve() is None


@given(
    st.integers(1, 6),
    st.lists(
        st.tuples(st.integers(0, 5), st.booleans(), st.integers(0, 5), st.booleans()), max_size=14
    ),
)
def test_matches_brute_force(n: int, raw: list[Clause]) -> None:
    clauses = [(a % n, av, b % n, bv) for a, av, b, bv in raw]
    sat = TwoSat(n)
    for clause in clauses:
        sat.add_clause(*clause)
    result = sat.solve()
    satisfiable = any(_satisfies(p, clauses) for p in itertools.product((False, True), repeat=n))
    assert (result is not None) == satisfiable
    if result is not None:
        assert _satisfies(result, clauses)
