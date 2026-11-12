import statistics
import unittest

from consistent_hashing import ConsistentHashRing, modulo_assign, moved_fraction

KEYS = [f"kullanici:{i}" for i in range(20_000)]


class ConsistentHashingTest(unittest.TestCase):
    def test_adding_a_node_moves_about_one_over_n_keys(self) -> None:
        nodes = [f"onbellek-{i}" for i in range(4)]
        ring = ConsistentHashRing(nodes, vnodes=200)
        before = {key: ring.get_node(key) for key in KEYS}
        ring.add_node("onbellek-4")
        after = {key: ring.get_node(key) for key in KEYS}
        fraction = moved_fraction(before, after)
        # İdeal oran 1/5 = 0.20; sanal düğüm sayısı sonlu olduğu için biraz sapar.
        self.assertGreater(fraction, 0.14)
        self.assertLess(fraction, 0.26)
        # Taşınan her anahtar yalnızca YENİ sunucuya gitmiş olmalı.
        moved_to = {after[key] for key in KEYS if before[key] != after[key]}
        self.assertEqual(moved_to, {"onbellek-4"})

    def test_modulo_hashing_moves_most_keys(self) -> None:
        nodes = [f"onbellek-{i}" for i in range(4)]
        before = {key: modulo_assign(key, nodes) for key in KEYS}
        after = {key: modulo_assign(key, [*nodes, "onbellek-4"]) for key in KEYS}
        self.assertGreater(moved_fraction(before, after), 0.7)

    def test_removing_a_node_only_moves_its_keys(self) -> None:
        ring = ConsistentHashRing(["a", "b", "c"], vnodes=100)
        before = {key: ring.get_node(key) for key in KEYS}
        ring.remove_node("b")
        after = {key: ring.get_node(key) for key in KEYS}
        for key in KEYS:
            if before[key] != "b":
                self.assertEqual(before[key], after[key])
        self.assertNotIn("b", set(after.values()))

    def test_virtual_nodes_balance_the_load(self) -> None:
        nodes = [f"s{i}" for i in range(8)]
        spread = {}
        for vnodes in (1, 200):
            counts = ConsistentHashRing(nodes, vnodes=vnodes).distribution(KEYS)
            spread[vnodes] = statistics.pstdev([counts.get(node, 0) for node in nodes]) / (len(KEYS) / len(nodes))
        self.assertLess(spread[200], 0.15)
        self.assertGreater(spread[1], spread[200] * 2)

    def test_weight_gives_proportional_share(self) -> None:
        ring = ConsistentHashRing(vnodes=100)
        ring.add_node("kucuk")
        ring.add_node("buyuk", weight=3)
        counts = ring.distribution(KEYS)
        self.assertAlmostEqual(counts["buyuk"] / len(KEYS), 0.75, delta=0.06)

    def test_replicas_are_distinct_and_errors(self) -> None:
        ring = ConsistentHashRing(["a", "b", "c"], vnodes=20)
        replicas = ring.get_nodes("siparis:7", 3)
        self.assertEqual(sorted(replicas), ["a", "b", "c"])
        self.assertEqual(replicas[0], ring.get_node("siparis:7"))
        with self.assertRaises(ValueError):
            ring.get_nodes("x", 4)
        with self.assertRaises(ValueError):
            ring.add_node("a")
        with self.assertRaises(LookupError):
            ConsistentHashRing().get_node("x")


if __name__ == "__main__":
    unittest.main()
