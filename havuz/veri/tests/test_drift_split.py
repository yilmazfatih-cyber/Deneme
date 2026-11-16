"""Kayma (PSI, KS — elle hesaplanmış örneklerle) ve sızıntısız ayırma."""

from __future__ import annotations

import math
import random
from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from verihavuzu.kalite import drift, split
from verihavuzu.sentetik.churn import generate_churn
from verihavuzu.sentetik.commerce import generate_commerce

# --- PSI ------------------------------------------------------------------------------------


def test_psi_numeric_matches_hand_computation() -> None:
    # Referans 1..10 → ortanca 5,5 → iki kutu: ≤ 5,5 ve > 5,5; referans oranları 0,5 / 0,5.
    # Yeni kümede sekiz değer ≤ 5,5 → 0,8 / 0,2.
    # PSI = 0,3·ln(0,8/0,5) + (−0,3)·ln(0,2/0,5) = 0,3·0,4700036 + 0,3·0,9162907 = 0,4158883
    reference = [float(x) for x in range(1, 11)]
    new = [1.0] * 8 + [9.0, 10.0]
    result = drift.psi_numeric(reference, new, bins=2)
    assert math.isclose(result.psi, 0.4158883, abs_tol=1e-6)
    assert result.yorum == "büyük"
    assert drift.psi_numeric(reference, reference, bins=4).psi == 0.0


def test_psi_categorical_matches_hand_computation_including_new_category() -> None:
    same_shift = drift.psi_categorical(["a"] * 50 + ["b"] * 50, ["a"] * 80 + ["b"] * 20)
    assert math.isclose(same_shift.psi, 0.4158883, abs_tol=1e-6)
    # Yalnız yeni kümede görülen kategori: referans oranı 0 → eps = 0,0001 ile kırpılır.
    # a: (0,9 − 1)·ln(0,9) = 0,0105361 · c: (0,1 − 0,0001)·ln(1000) = 0,6900848 → 0,7006208
    unseen = drift.psi_categorical(["a"] * 10, ["a"] * 9 + ["c"])
    assert math.isclose(unseen.psi, 0.7006208, abs_tol=1e-6)


# --- KS -------------------------------------------------------------------------------------


def _ks_brute_force(a: list[float], b: list[float]) -> float:
    points = sorted(set(a) | set(b))
    return max(
        abs(sum(x <= p for x in a) / len(a) - sum(x <= p for x in b) / len(b)) for p in points
    )


def test_ks_statistic_hand_examples() -> None:
    assert drift.ks_statistic([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]) == 0.4
    assert math.isclose(drift.ks_statistic([1, 1, 2], [1, 2, 2]), 1 / 3)  # eşit değerler
    assert drift.ks_statistic([1, 2, 3], [1, 2, 3]) == 0.0
    assert drift.ks_statistic([1, 2], [3, 4]) == 1.0


@given(
    st.lists(st.integers(0, 20), min_size=1, max_size=40),
    st.lists(st.integers(0, 20), min_size=1, max_size=40),
)
@settings(max_examples=200, deadline=None)
def test_ks_statistic_equals_brute_force(a: list[int], b: list[int]) -> None:
    fa, fb = [float(x) for x in a], [float(x) for x in b]
    assert math.isclose(drift.ks_statistic(fa, fb), _ks_brute_force(fa, fb))


def test_ks_pvalue_matches_known_kolmogorov_critical_values() -> None:
    # Büyük örneklemde λ ≈ √nₑ·D; bilinen kritik değerler: 1,224 → 0,10 · 1,358 → 0,05 · 1,628 → 0,01
    n = 2_000_000
    effective = math.sqrt(n * n / (2 * n))
    for lam, expected in ((1.224, 0.10), (1.358, 0.05), (1.628, 0.01)):
        assert abs(drift.ks_pvalue(lam / effective, n, n) - expected) < 0.002
    assert drift.ks_pvalue(0.0, 100, 100) == 1.0


def test_drift_report_detects_shift_and_not_noise() -> None:
    base, same = generate_churn(3000, 1), generate_churn(3000, 2)
    shifted = [dict(row, kidem_ay=row["kidem_ay"] + 12) for row in same]
    calm = drift.drift_report(base, same, ["kidem_ay", "sozlesme"])
    moved = drift.drift_report(base, shifted, ["kidem_ay"])
    assert all(item["psi"]["psi"] < 0.1 for item in calm["sutunlar"])
    assert calm["sutunlar"][0]["ks"]["p_degeri"] > 0.01
    assert moved["sutunlar"][0]["psi"]["psi"] > 0.25
    assert moved["sutunlar"][0]["ks"]["p_degeri"] < 1e-6


# --- ayırma ---------------------------------------------------------------------------------


def test_time_split_never_leaks_the_future() -> None:
    orders = generate_commerce(80, 3)["siparisler"]
    result = split.time_split(orders, "siparis_zamani", test_fraction=0.25, gap=timedelta(days=7))
    assert max(r["siparis_zamani"] for r in result.egitim) < min(
        r["siparis_zamani"] for r in result.test
    )
    assert result.bilgi["atilan"] > 0  # 7 günlük boşluktaki satırlar atıldı
    assert 0.15 < len(result.test) / len(orders) < 0.3


def test_group_split_keeps_groups_together_and_is_deterministic() -> None:
    orders = generate_commerce(120, 3)["siparisler"]
    first = split.group_split(orders, "musteri_id", test_fraction=0.3, seed=9)
    again = split.group_split(orders, "musteri_id", test_fraction=0.3, seed=9)
    assert first.test == again.test
    report = split.leakage_report(first.egitim, first.test, ["musteri_id"])
    assert report["musteri_id"]["ortak_deger"] == 0
    shuffled = list(orders)
    random.Random(0).shuffle(shuffled)  # rastgele ayırma sızdırır: karşılaştırma için
    naive = split.leakage_report(
        shuffled[: len(orders) // 2], shuffled[len(orders) // 2 :], ["musteri_id"]
    )
    assert naive["musteri_id"]["ortak_deger"] > 20


def test_stratified_split_preserves_label_counts_exactly() -> None:
    rows = generate_churn(1003, 4)
    result = split.stratified_split(rows, "churn", test_fraction=0.2, seed=1)
    for label in (0, 1):
        total = sum(r["churn"] == label for r in rows)
        assert sum(r["churn"] == label for r in result.test) == round(total * 0.2)
    assert len(result.egitim) + len(result.test) == len(rows)
    ids = [r["musteri_id"] for r in result.egitim]
    assert ids == sorted(ids)  # ilk sıra korunur
