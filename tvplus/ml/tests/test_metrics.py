import numpy as np

from mediafm_mini.metrics import modal_scores, nearest_visible, neighbour_sides, ranks, summarize


def test_ranks_pessimistic_ties():
    s = np.array([[0.9, 0.1, 0.5], [0.2, 0.2, 0.1], [0.0, 0.3, 0.7]])
    r = ranks(s, np.array([0, 0, 1]))
    assert r.tolist() == [1, 2, 2]


def test_summarize_values():
    out = summarize(np.array([1, 2, 6, 1]), np.array([10, 10, 10, 10]))
    assert out["R@1"] == 0.5 and out["R@5"] == 0.75
    assert out["mean_rank"] == 2.5
    assert abs(out["MRR"] - (1 + 0.5 + 1 / 6 + 1) / 4) < 1e-9
    assert abs(out["random_R@1"] - 0.1) < 1e-9


def test_modal_scores_uses_only_shared_modalities():
    D = 3
    pred = np.zeros((1, 3, D))
    pred[0, 0] = [1, 0, 0]
    pred[0, 1] = [0, 1, 0]
    pred[0, 2] = [0, 0, 1]
    cand = np.zeros((2, 3, D))
    cand[0, 0] = [1, 0, 0]  # görüntüde aynı
    cand[0, 1] = [0, -1, 0]  # seste ters
    cand[1, 2] = [0, 0, 1]
    cand_ok = np.array([[1, 1, 0], [0, 0, 1]], bool)
    s = modal_scores(pred, np.ones((1, 3), bool), cand, cand_ok)
    assert np.allclose(s, [[0.0, 1.0]])
    s2 = modal_scores(pred, np.array([[0, 0, 0]], bool), cand, cand_ok)
    assert np.all(s2 == -1)


def test_neighbours():
    hidden = np.array([True, False, True, True, False])
    assert nearest_visible(0, hidden) == 1
    assert nearest_visible(2, hidden) == 1  # eşitlikte sol
    assert nearest_visible(3, hidden) == 4
    assert neighbour_sides(2, hidden) == (1, 4)
    assert neighbour_sides(0, hidden) == (None, 1)
