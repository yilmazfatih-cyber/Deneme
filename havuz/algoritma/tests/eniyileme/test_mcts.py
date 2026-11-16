from __future__ import annotations

import random

import pytest

from algoritma.eniyileme.mcts import TakeStones, mcts, mcts_best_move


@pytest.mark.parametrize("stones", [5, 6, 7, 9, 10, 11, 13, 14, 15])
def test_finds_winning_move(stones: int) -> None:
    # Kuram: kazandıran hamle yığını 4'ün katına indirir (taş sayısı mod 4 kadar al).
    move = mcts_best_move(TakeStones(), stones, iterations=10_000, rng=random.Random(stones))
    assert move == stones % 4


def test_game_rules_and_edge_cases() -> None:
    game = TakeStones()
    assert game.moves((2, 0)) == [1, 2] and game.play((5, 0), 3) == (2, 1)
    assert game.winner((0, 1)) == 0 and game.winner((3, 0)) is None and game.to_move((3, 1)) == 1
    assert mcts_best_move(game, 1, iterations=50) == 1  # tek hamle
    visits = mcts(game, (3, 0), 500, random.Random(0))
    assert sum(visits.values()) == 500 and max(visits, key=visits.__getitem__) == 3  # hepsini al


def test_reproducible_with_seed() -> None:
    first = mcts(TakeStones(), (12, 0), 2000, random.Random(42))
    second = mcts(TakeStones(), (12, 0), 2000, random.Random(42))
    assert first == second
