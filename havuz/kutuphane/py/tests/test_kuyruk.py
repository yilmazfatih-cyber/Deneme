"""kuyruk modülünün testi: eşzamanlılık sınırı, öncelik, temizleme, map_limit."""

from __future__ import annotations

import asyncio

import pytest

from kutuphane.kuyruk import QueueClearedError, TaskQueue, map_limit


def test_concurrency_limit_and_results() -> None:
    async def main() -> None:
        queue = TaskQueue(concurrency=3)
        running = 0
        peak = 0

        def job(i: int):  # type: ignore[no-untyped-def]
            async def run() -> int:
                nonlocal running, peak
                running += 1
                peak = max(peak, running)
                await asyncio.sleep(0.001 * (1 + i % 3))
                running -= 1
                return i * 2

            return run

        results = await asyncio.gather(*(queue.add(job(i)) for i in range(20)))
        assert peak == 3
        assert results == [i * 2 for i in range(20)]
        await queue.on_idle()
        assert queue.size == queue.pending == 0

    asyncio.run(main())


def test_priority_order() -> None:
    async def main() -> list[str]:
        queue = TaskQueue(concurrency=1, auto_start=False)
        order: list[str] = []

        def job(name: str):  # type: ignore[no-untyped-def]
            async def run() -> None:
                order.append(name)

            return run

        futures = [
            queue.add(job("a")),
            queue.add(job("b"), priority=5),
            queue.add(job("c")),
            queue.add(job("d"), priority=5),
            queue.add(job("e"), priority=10),
        ]
        queue.start()
        await asyncio.gather(*futures)
        return order

    assert asyncio.run(main()) == ["e", "b", "d", "a", "c"]


def test_failure_is_isolated_and_clear() -> None:
    async def main() -> None:
        queue = TaskQueue(concurrency=1)

        async def bad() -> None:
            raise RuntimeError("bozuk")

        async def slow() -> str:
            await asyncio.sleep(10)
            return "bitmemeli"

        async def good() -> str:
            return "iyi"

        failing = queue.add(bad)
        with pytest.raises(RuntimeError):
            await failing
        assert await queue.add(good) == "iyi"
        running = queue.add(slow)
        waiting = queue.add(good)
        await asyncio.sleep(0)
        queue.clear(cancel_running=True)
        with pytest.raises(QueueClearedError):
            await waiting
        with pytest.raises(asyncio.CancelledError):
            await running

    asyncio.run(main())


def test_map_limit() -> None:
    async def main() -> None:
        running = 0
        peak = 0

        async def work(n: int) -> str:
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(n / 1000)
            running -= 1
            return f"x{n}"

        assert await map_limit([5, 1, 3, 2, 4], 2, work) == ["x5", "x1", "x3", "x2", "x4"]
        assert peak == 2
        started: list[int] = []

        async def fails_at_two(n: int) -> int:
            started.append(n)
            if n == 2:
                raise ValueError("iki")
            return n

        with pytest.raises(ValueError, match="iki"):
            await map_limit([1, 2, 3, 4, 5, 6], 1, fails_at_two)
        assert started == [1, 2]
        assert await map_limit([], 3, work) == []

    asyncio.run(main())
