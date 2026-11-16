from __future__ import annotations

from itertools import pairwise

from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.a_star import a_star, grid_shortest_path
from tests.graf.helpers import all_pairs_shortest, weighted_adjacency, weighted_edge_lists


def _bfs_grid(grid: list[str], start: tuple[int, int], goal: tuple[int, int]) -> int | None:
    rows, cols = len(grid), len(grid[0])
    if grid[start[0]][start[1]] == "#" or grid[goal[0]][goal[1]] == "#":
        return None
    dist = {start: 0}
    frontier = [start]
    for r, c in frontier:
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] != "#" and (nr, nc) not in dist:
                dist[(nr, nc)] = dist[(r, c)] + 1
                frontier.append((nr, nc))
    return dist.get(goal)


def test_hand_checked_example() -> None:
    grid = ["S..#....",
            ".#.#.##.",
            ".#...#..",
            ".####.#.",
            "......#G"]  # fmt: skip
    found = grid_shortest_path(grid, (0, 0), (4, 7))
    assert found is not None and found[0] == 15


def test_edge_cases() -> None:
    assert grid_shortest_path(["#."], (0, 0), (0, 1)) is None  # başlangıç duvar
    assert grid_shortest_path([".#."], (0, 0), (0, 2)) is None  # ulaşılamaz
    assert grid_shortest_path(["."], (0, 0), (0, 0)) == (0, [(0, 0)])
    # sonsuz örtük graf: tam sayılar, hamleler +1, −1, ×2; 0'dan 7'ye en az 5 hamle (0,1,2,3,6,7)
    found = a_star(0, 7, lambda x: [(x + 1, 1), (x - 1, 1), (x * 2, 1)], lambda x: 0)
    assert found is not None and found[0] == 5 and found[1][0] == 0 and found[1][-1] == 7


GRID = st.lists(st.text(alphabet="..#", min_size=6, max_size=6), min_size=1, max_size=6)


@given(GRID, st.data())
def test_grid_matches_bfs(grid: list[str], data: st.DataObject) -> None:
    start = (data.draw(st.integers(0, len(grid) - 1)), data.draw(st.integers(0, 5)))
    goal = (data.draw(st.integers(0, len(grid) - 1)), data.draw(st.integers(0, 5)))
    found = grid_shortest_path(grid, start, goal)
    expected = _bfs_grid(grid, start, goal)
    assert (found[0] if found else None) == expected
    if found is not None:
        assert expected is not None
        cells = found[1]
        assert cells[0] == start and cells[-1] == goal and len(cells) == expected + 1
        assert all(abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1 for a, b in pairwise(cells))


@given(weighted_edge_lists(max_n=7, max_m=14), st.data())
def test_zero_heuristic_equals_dijkstra(
    graph: tuple[int, list[tuple[int, int, int]]], data: st.DataObject
) -> None:
    n, edges = graph
    start, goal = data.draw(st.integers(0, n - 1)), data.draw(st.integers(0, n - 1))
    adj = weighted_adjacency(n, edges, directed=True)
    found = a_star(start, goal, lambda v: adj[v], lambda v: 0)
    expected = all_pairs_shortest(n, edges, directed=True)[start][goal]
    assert (found[0] if found else float("inf")) == expected
