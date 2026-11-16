"""Akış işleme: hangi sırayla gelirse gelsin, kabul edilen olaylar üzerinden toplu (batch) hesapla
aynı
sonuç; sınırlı karışıklıkta (≤ filigran payı) hiç düzeltme ve geç olay yok; geç olaylar tam
belirlenir."""

from __future__ import annotations

import math
import random
from collections import defaultdict
from collections.abc import Callable

import pytest
from hypothesis import given
from hypothesis import strategies as st

from akis import AGGREGATES, Event, Result, Sliding, StreamProcessor, Tumbling, Window

BATCH: dict[str, Callable[[list[float]], float | None]] = {  # başvuru: toplu hâl
    "sayi": lambda xs: len(xs),
    "toplam": lambda xs: math.fsum(xs) if xs else None,
    "ortalama": lambda xs: math.fsum(xs) / len(xs) if xs else None,
    "en_kucuk": lambda xs: min(xs) if xs else None,
    "en_buyuk": lambda xs: max(xs) if xs else None,
}


def _events(rng: random.Random, count: int) -> list[Event]:
    return [
        Event(rng.choice(["a", "b"]), float(rng.randint(-5, 9)), rng.randint(0, 200))
        for _ in range(count)
    ]


def _batch(
    assigner: Tumbling | Sliding, events: list[Event], name: str
) -> dict[tuple[Window, str], object]:
    groups: dict[tuple[Window, str], list[float]] = defaultdict(list)
    for event in events:
        for window in assigner.assign(event.time):
            groups[(window, event.key)].append(event.value)
    return {group: BATCH[name](values) for group, values in groups.items()}


def _reference_accepted(
    assigner: Tumbling | Sliding, arrivals: list[Event], delay: int, lateness: int
) -> tuple[list[tuple[Event, Window]], list[Event]]:
    """Belgelenen kural, işleyiciden bağımsız: olay, varışından ÖNCEKİ filigrana göre açık
    pencerelere girer."""
    watermark, maximum = -(2**63), -(2**63)
    accepted: list[tuple[Event, Window]] = []
    late: list[Event] = []
    for event in arrivals:
        windows = [w for w in assigner.assign(event.time) if w[1] + lateness > watermark]
        accepted += [(event, window) for window in windows]
        if not windows:
            late.append(event)
        maximum = max(maximum, event.time)
        watermark = max(watermark, maximum - delay)
    return accepted, late


def _final(results: list[Result]) -> dict[tuple[Window, str], object]:
    return {(r.window, r.key): r.value for r in results if r.kind == "son"}


ASSIGNERS = [Tumbling(10), Sliding(20, 5)]


@pytest.mark.parametrize("assigner", ASSIGNERS, ids=["atlayan", "kayan"])
@pytest.mark.parametrize("name", sorted(BATCH))
@given(seed=st.integers(0, 2**32 - 1), delay=st.integers(0, 30), lateness=st.integers(0, 40))
def test_any_arrival_order_equals_batch_over_accepted(
    assigner: Tumbling | Sliding, name: str, seed: int, delay: int, lateness: int
) -> None:
    rng = random.Random(seed)
    arrivals = _events(rng, rng.randint(1, 80))
    rng.shuffle(arrivals)  # tamamen karışık varış
    processor = StreamProcessor(assigner, AGGREGATES[name], delay, lateness)
    results = [r for event in arrivals for r in processor.process(event)] + processor.flush()
    accepted, late = _reference_accepted(assigner, arrivals, delay, lateness)
    groups: dict[tuple[Window, str], list[float]] = defaultdict(list)
    for event, window in accepted:
        groups[(window, event.key)].append(event.value)
    assert _final(results) == {group: BATCH[name](values) for group, values in groups.items()}
    assert processor.late == late and processor.open_windows() == 0
    seen_first: set[tuple[Window, str]] = set()
    for result in results:  # her pencere: tam bir "ilk", düzeltmeler ilkten sonra, tam bir "son"
        group = (result.window, result.key)
        if result.kind == "ilk":
            assert group not in seen_first
            seen_first.add(group)
        else:
            assert group in seen_first
    assert len(_final(results)) == len(seen_first)


@pytest.mark.parametrize("assigner", ASSIGNERS, ids=["atlayan", "kayan"])
@given(seed=st.integers(0, 2**32 - 1), delay=st.integers(0, 20))
def test_bounded_disorder_needs_no_corrections(
    assigner: Tumbling | Sliding, seed: int, delay: int
) -> None:
    rng = random.Random(seed)
    events = sorted(_events(rng, 60), key=lambda e: e.time)
    # Sınırlı karışıklık: her olay en çok `delay` kadar geride gelebilir → filigran hep doğru.
    arrivals = sorted(events, key=lambda e: e.time + rng.uniform(0, delay))
    maximum = -(2**63)
    for event in arrivals:
        assert event.time >= maximum - delay  # üretecin sözü
        maximum = max(maximum, event.time)
    processor = StreamProcessor(assigner, AGGREGATES["toplam"], out_of_orderness=delay)
    results = [r for event in arrivals for r in processor.process(event)] + processor.flush()
    assert not processor.late and all(r.kind != "düzeltme" for r in results)
    firsts = {(r.window, r.key): r.value for r in results if r.kind == "ilk"}
    assert firsts == _batch(assigner, events, "toplam")  # "ilk" sonuçlar zaten kesin


def test_example_with_late_event_correction_and_drop() -> None:
    processor = StreamProcessor(
        Tumbling(10), AGGREGATES["toplam"], out_of_orderness=2, allowed_lateness=5
    )
    assert processor.process(Event("a", 1.0, 3)) == []
    assert processor.process(Event("a", 2.0, 12)) == [
        Result((0, 10), "a", 1.0, "ilk")
    ]  # filigran 10
    assert processor.process(Event("a", 4.0, 7)) == [
        Result((0, 10), "a", 5.0, "düzeltme")
    ]  # geç ama izinli
    closing = processor.process(Event("a", 8.0, 18))  # filigran 16 ≥ 10 + 5: [0,10) kapanır
    assert Result((0, 10), "a", 5.0, "son") in closing
    assert processor.process(Event("a", 16.0, 9)) == [] and processor.late == [Event("a", 16.0, 9)]
    assert Result((10, 20), "a", 10.0, "son") in processor.flush()


def test_window_assignment() -> None:
    assert Tumbling(10).assign(-3) == [(-10, 0)]  # negatif zaman: taban bölme
    assert Sliding(20, 5).assign(12) == [(-5, 15), (0, 20), (5, 25), (10, 30)]
    with pytest.raises(ValueError, match="katı"):
        Sliding(10, 3)


def test_watermark_never_moves_backwards() -> None:
    processor = StreamProcessor(Tumbling(10), AGGREGATES["sayi"])
    processor.advance(100)
    assert processor.advance(50) == [] and processor.watermark == 100
    assert processor.process(Event("a", 1.0, 95)) == [] and processor.late == [Event("a", 1.0, 95)]
