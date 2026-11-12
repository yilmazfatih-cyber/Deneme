import unittest

from rate_limiter import FixedWindowCounter, KeyedRateLimiter, SlidingWindowCounter, SlidingWindowLog, TokenBucket


class FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now


class TokenBucketTest(unittest.TestCase):
    def test_burst_then_steady_rate(self) -> None:
        clock = FakeClock()
        bucket = TokenBucket(capacity=5, refill_rate=2.0, clock=clock)
        self.assertEqual(sum(bucket.allow() for _ in range(10)), 5)
        clock.now = 1.0
        self.assertEqual(sum(bucket.allow() for _ in range(10)), 2)
        self.assertAlmostEqual(bucket.retry_after(), 0.5)

    def test_never_exceeds_capacity_and_cost(self) -> None:
        clock = FakeClock()
        bucket = TokenBucket(capacity=3, refill_rate=1.0, clock=clock)
        clock.now = 100.0
        self.assertEqual(bucket.tokens, 3)
        self.assertFalse(bucket.allow(cost=4))
        self.assertTrue(bucket.allow(cost=3))
        with self.assertRaises(ValueError):
            TokenBucket(capacity=0, refill_rate=1.0)


class WindowTest(unittest.TestCase):
    def test_fixed_window_allows_double_burst_at_boundary(self) -> None:
        clock = FakeClock(0.9)
        limiter = FixedWindowCounter(limit=5, window=1.0, clock=clock)
        accepted = sum(limiter.allow() for _ in range(5))
        clock.now = 1.1  # yeni pencere: sayaç sıfırlandı
        accepted += sum(limiter.allow() for _ in range(5))
        self.assertEqual(accepted, 10, "0.2 saniyede 2 * limit kabul edildi")

    def test_sliding_log_blocks_boundary_burst(self) -> None:
        clock = FakeClock(0.9)
        limiter = SlidingWindowLog(limit=5, window=1.0, clock=clock)
        accepted = sum(limiter.allow() for _ in range(5))
        clock.now = 1.1
        accepted += sum(limiter.allow() for _ in range(5))
        self.assertEqual(accepted, 5)
        clock.now = 1.95
        self.assertTrue(limiter.allow())

    def test_sliding_counter_weighs_previous_window(self) -> None:
        clock = FakeClock(0.5)
        limiter = SlidingWindowCounter(limit=10, window=1.0, clock=clock)
        self.assertEqual(sum(limiter.allow() for _ in range(10)), 10)
        clock.now = 1.25  # önceki pencerenin %75'i hâlâ örtüşüyor: tahmin = 10 * 0.75
        self.assertAlmostEqual(limiter.estimate(), 7.5)
        self.assertEqual(sum(limiter.allow() for _ in range(10)), 2)
        clock.now = 3.0  # iki pencere geçti: geçmiş tamamen unutuldu
        self.assertEqual(limiter.estimate(), 0)


class KeyedTest(unittest.TestCase):
    def test_per_client_limits_and_memory_bound(self) -> None:
        clock = FakeClock()
        limiter = KeyedRateLimiter(lambda: TokenBucket(2, 1.0, clock=clock), max_clients=3)
        self.assertEqual([limiter.allow("ip-1") for _ in range(3)], [True, True, False])
        self.assertTrue(limiter.allow("ip-2"))
        for client in ("ip-3", "ip-4", "ip-5"):
            limiter.allow(client)
        self.assertEqual(len(limiter), 3, "LRU en fazla 3 istemci tutar")
        self.assertTrue(limiter.allow("ip-1"), "unutulan istemci yeni ve dolu bir kovayla başlar")


if __name__ == "__main__":
    unittest.main()
