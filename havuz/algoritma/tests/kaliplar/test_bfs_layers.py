from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.bfs_layers import (
    bfs_layers,
    days_until_all_sick,
    distance_to_nearest_station,
    elevator_presses,
)

GRID = st.lists(st.text(alphabet="..#S", min_size=5, max_size=5), min_size=1, max_size=5)


def _relaxed_distances(grid: list[str]) -> list[list[int]]:
    """Başvuru: "komşudan bir fazla" kuralını değişmeyene dek tekrar uygula (Bellman-Ford tarzı)."""
    rows, cols = len(grid), len(grid[0])
    inf = 10**9
    dist = [[0 if grid[r][c] == "S" else inf for c in range(cols)] for r in range(rows)]
    changed = True
    while changed:
        changed = False
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "#":
                    continue
                for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] != "#":
                        if dist[nr][nc] + 1 < dist[r][c]:
                            dist[r][c] = dist[nr][nc] + 1
                            changed = True
    return [[d if d < inf and grid[r][c] != "#" else -1 for c, d in enumerate(row)]
            for r, row in enumerate(dist)]  # fmt: skip


def test_hand_checked_examples() -> None:
    assert bfs_layers([1, 1, 2], lambda x: []) == [[1, 2]]  # yinelenen kaynak tek sayılır
    assert (
        elevator_presses(5, 2, 2, up=7, down=7) == 0
        and elevator_presses(6, 1, 6, up=2, down=2) == -1
    )
    assert days_until_all_sick(["S"]) == 0 and days_until_all_sick(["S#."]) == -1


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        elevator_presses(3, 0, 2, up=1, down=1)
    assert distance_to_nearest_station(["..", ".."]) == [[-1, -1], [-1, -1]]  # istasyon yok
    assert days_until_all_sick(["#"]) == 0


@given(GRID)
def test_distances_match_relaxation(grid: list[str]) -> None:
    assert distance_to_nearest_station(grid) == _relaxed_distances(grid)


@given(GRID)
def test_days_match_day_by_day_simulation(grid: list[str]) -> None:
    cells = [list(row) for row in grid]
    days = 0
    while True:
        spread = [(r, c) for r, row in enumerate(cells) for c, ch in enumerate(row) if ch == "."
                  and any(0 <= r + dr < len(cells) and 0 <= c + dc < len(row)
                          and cells[r + dr][c + dc] == "S"
                          for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)))]  # fmt: skip
        if not spread:
            break
        for r, c in spread:
            cells[r][c] = "S"
        days += 1
    expected = -1 if any("." in row for row in cells) else days
    assert days_until_all_sick(grid) == expected


@given(st.integers(1, 30), st.data())
def test_elevator_matches_iterated_reachability(floors: int, data: st.DataObject) -> None:
    start, goal = data.draw(st.integers(1, floors)), data.draw(st.integers(1, floors))
    up, down = data.draw(st.integers(0, 6)), data.draw(st.integers(0, 6))
    reach, presses, expected = {start}, 0, -1
    while True:  # her basışta ulaşılabilen katlar kümesi
        if goal in reach:
            expected = presses
            break
        grown = reach | {f for x in reach for f in (x + up, x - down) if 1 <= f <= floors}
        if grown == reach:
            break
        reach, presses = grown, presses + 1
    assert elevator_presses(floors, start, goal, up, down) == expected
