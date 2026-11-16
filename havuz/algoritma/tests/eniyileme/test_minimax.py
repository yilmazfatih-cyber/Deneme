from __future__ import annotations

import random

import pytest

from algoritma.eniyileme.minimax import alphabeta, minimax, winner


def _random_position(rng: random.Random, moves: int) -> tuple[str, str]:
    board, turn = [" "] * 9, "X"
    for _ in range(moves):
        if winner("".join(board)):
            break
        empty = [i for i, c in enumerate(board) if c == " "]
        board[rng.choice(empty)] = turn
        turn = "O" if turn == "X" else "X"
    return "".join(board), turn


def test_hand_checked_example() -> None:
    assert winner("XXXOO    ") == "X" and winner("XOXOXOOXO") is None
    score, move, nodes = minimax("         ", "X")
    assert score == 0 and nodes == 549_946  # bilinen düğüm sayısı (tüm oyun ağacı)
    ab_score, ab_move, ab_nodes = alphabeta("         ", "X")
    assert (ab_score, ab_move) == (score, move) and ab_nodes < nodes // 20
    assert alphabeta("OO XX    ", "O")[:2] == (-1, 2)  # O kazanır
    assert alphabeta("X   O    ", "X")[0] == 0


def test_edge_cases() -> None:
    assert minimax("XXXOO    ", "O")[:2] == (1, -1)  # oyun bitmiş: hamle yok
    assert alphabeta("XOXXOOOXX", "X")[:2] == (0, -1)  # tahta dolu, berabere
    with pytest.raises(ValueError):
        alphabeta("XX", "X")
    with pytest.raises(ValueError):
        minimax("         ", "Z")


@pytest.mark.parametrize("seed", range(30))
def test_alphabeta_matches_minimax(seed: int) -> None:
    rng = random.Random(seed)
    board, turn = _random_position(rng, rng.randint(2, 7))
    full = minimax(board, turn)
    pruned = alphabeta(board, turn)
    assert pruned[:2] == full[:2] and pruned[2] <= full[2]
