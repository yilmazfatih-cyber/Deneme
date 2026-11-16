"""Hangi yalıtım düzeyinde hangi anomali olur? Tablo README'dekiyle birebir aynıdır ve burada
kanıtlanır."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from islem.mvcc import Value
from tests.islem import anomalies

#                       rc     si     ser    2pl
EXPECTED: dict[str, tuple[bool, bool, bool, bool]] = {
    "dirty_read": (False, False, False, False),
    "non_repeatable_read": (True, False, False, False),
    "lost_update": (True, False, False, False),
    "phantom": (True, False, False, False),
    "write_skew": (True, True, False, False),  # anlık görüntü yalıtımının bilinen açığı
}
SCENARIOS: dict[str, Callable[[str], bool]] = {
    "dirty_read": anomalies.dirty_read,
    "non_repeatable_read": anomalies.non_repeatable_read,
    "lost_update": anomalies.lost_update,
    "phantom": anomalies.phantom,
    "write_skew": anomalies.write_skew,
}
CASES = [
    (name, mode, EXPECTED[name][column])
    for name in EXPECTED
    for column, mode in enumerate(("rc", "si", "ser", "2pl"))
]


@pytest.mark.parametrize(("anomaly", "mode", "expected"), CASES)
def test_anomaly_table(anomaly: str, mode: str, expected: bool) -> None:
    assert SCENARIOS[anomaly](mode) is expected


def test_write_skew_under_snapshot_isolation_step_by_step() -> None:
    """Neden olur? İki işlem de AYNI anlık görüntüden okur (ikisi de nöbette görür) ve FARKLI
    anahtarlara yazar. "İlk onaylayan kazanır" yalnız aynı anahtara yazmayı yakalar; burada yazma
    kümeleri kesişmediği için ikisi de onaylanır ve birlikte kuralı bozarlar."""
    programs = {"T1": anomalies.go_home("alice"), "T2": anomalies.go_home("bob")}
    initial: dict[str, Value] = {"alice": 1, "bob": 1}
    outcomes, final = anomalies.run("si", initial, programs, anomalies.SKEW_ORDER)
    assert outcomes["T1"].observed == [1, 1] and outcomes["T2"].observed == [1, 1]
    assert outcomes["T1"].committed and outcomes["T2"].committed
    assert final == {"alice": 0, "bob": 0}
    # SERIALIZABLE: T2'nin okuduğu "alice", T2 sürerken onaylanan T1 tarafından değişti → iptal.
    outcomes, final = anomalies.run("ser", initial, programs, anomalies.SKEW_ORDER)
    assert outcomes["T1"].committed and not outcomes["T2"].committed
    assert outcomes["T2"].error is not None and "ConflictError" in outcomes["T2"].error
    assert final == {"alice": 0, "bob": 1}


def test_two_phase_locking_resolves_write_skew_by_deadlock_victim() -> None:
    programs = {"T1": anomalies.go_home("alice"), "T2": anomalies.go_home("bob")}
    outcomes, final = anomalies.run("2pl", {"alice": 1, "bob": 1}, programs, anomalies.SKEW_ORDER)
    assert outcomes["T1"].committed
    assert outcomes["T2"].error is not None and "DeadlockError" in outcomes["T2"].error
    assert outcomes["T1"].blocked_steps >= 1  # T2'nin S kilidi yüzünden beklemişti
    assert final == {"alice": 0, "bob": 1}
