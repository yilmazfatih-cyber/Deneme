import unittest

from load_balancer import (
    LeastConnections,
    RandomChoice,
    Request,
    RoundRobin,
    mixed_workload,
    simulate,
    uniform_workload,
)


class LoadBalancerTest(unittest.TestCase):
    def test_hand_computed_example(self) -> None:
        # Tek sunucu: ikinci istek, birincinin bitmesini bekler.
        requests = [Request(0.0, 2.0), Request(1.0, 1.0)]
        report = simulate(requests, [1.0], RoundRobin())
        self.assertEqual(report.max_latency, 2.0)  # 1.0'da geldi, 2.0'da başladı, 3.0'da bitti
        self.assertAlmostEqual(report.mean_latency, 2.0)

    def test_least_connections_avoids_busy_server(self) -> None:
        # s0'a ağır iş düşer; round-robin üçüncü (hafif) isteği yine s0'a verir, least-connections vermez.
        # Bitiş anları varışlarla çakışmasın diye hafif işler 0.05 sn: 0.1 + 0.1 kayan noktada tam 0.2 olsa da
        # 0.2 + 0.1 == 0.30000000000000004 olur ve "aynı anda bitti mi?" sorusu yanlış yanıtlanır.
        requests = [Request(0.0, 10.0), Request(0.1, 0.05), Request(0.2, 0.05), Request(0.3, 0.05)]
        rr = simulate(requests, [1.0, 1.0], RoundRobin())
        lc = simulate(requests, [1.0, 1.0], LeastConnections())
        self.assertEqual(rr.served, {"s0": 2, "s1": 2})
        self.assertEqual(lc.served, {"s0": 1, "s1": 3})
        self.assertAlmostEqual(rr.mean_latency, (10 + 0.05 + 9.85 + 0.05) / 4)
        self.assertAlmostEqual(lc.mean_latency, (10 + 0.05 * 3) / 4)

    def test_round_robin_spreads_counts_evenly(self) -> None:
        report = simulate(uniform_workload(1000), [1.0] * 4, RoundRobin())
        self.assertEqual(set(report.served.values()), {250})

    def test_mixed_workload_least_connections_wins_p95(self) -> None:
        workload = mixed_workload()
        rr = simulate(workload, [1.0] * 4, RoundRobin())
        lc = simulate(workload, [1.0] * 4, LeastConnections())
        rnd = simulate(workload, [1.0] * 4, RandomChoice(seed=3))
        self.assertLess(lc.p95_latency, rr.p95_latency)
        self.assertLess(lc.p95_latency, rnd.p95_latency)
        self.assertLess(lc.mean_latency, rr.mean_latency)

    def test_uniform_workload_strategies_are_close(self) -> None:
        workload = uniform_workload()
        rr = simulate(workload, [1.0] * 4, RoundRobin())
        lc = simulate(workload, [1.0] * 4, LeastConnections())
        self.assertLess(abs(rr.mean_latency - lc.mean_latency), 0.01)


if __name__ == "__main__":
    unittest.main()
