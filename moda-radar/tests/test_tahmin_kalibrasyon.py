import pytest

from moda_radar.tahmin import kalibrasyon as kb


def test_brier():
    assert kb.brier([1.0, 0.0], [1, 0]) == 0
    assert kb.brier([0.5] * 4, [1, 0, 1, 0]) == 0.25
    assert kb.brier([0.8, 0.3], [True, False]) == pytest.approx((0.04 + 0.09) / 2)
    with pytest.raises(ValueError):
        kb.brier([0.5], [1, 0])
    with pytest.raises(ValueError):
        kb.brier([], [])
    with pytest.raises(ValueError):
        kb.brier([1.2], [1])


def test_kalibrasyon_kovalari():
    p = [0.05, 0.15, 0.5, 0.55, 0.95, 1.0]
    y = [0, 0, 1, 0, 1, 1]
    kov = kb.kalibrasyon_kovalari(p, y, k=5)
    assert len(kov) == 5
    assert [k["n"] for k in kov] == [2, 0, 2, 0, 2]
    assert kov[1]["ort_olasilik"] is None
    assert kov[2]["gercek_oran"] == 0.5
    assert kov[4]["ort_olasilik"] == pytest.approx(0.975)
    assert sum(k["n"] for k in kov) == len(p)


def test_ilk_n_isabet():
    assert kb.ilk_n_isabet(["a", "b", "c", "d"], {"a", "c"}, n=2) == 0.5
    assert kb.ilk_n_isabet(["a", "b"], {"a", "b"}, n=10) == 1.0
    assert kb.ilk_n_isabet([], {"a"}) == 0.0
    # enjekte eşitlik: renkte ΔE yerine yakınlık
    assert kb.ilk_n_isabet([10, 20], [11], n=2, esit=lambda a, b: abs(a - b) < 2) == 0.5
