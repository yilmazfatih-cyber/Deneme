import unittest

from lru_cache import LRUCache


class LRUCacheTest(unittest.TestCase):
    def test_evicts_least_recently_used(self) -> None:
        cache: LRUCache[str, int] = LRUCache(3)
        for key, value in [("a", 1), ("b", 2), ("c", 3)]:
            cache.put(key, value)
        cache.get("a")
        self.assertEqual(cache.put("d", 4), "b")
        self.assertEqual(list(cache), ["d", "a", "c"])
        self.assertEqual(cache.stats.evictions, 1)

    def test_update_refreshes_without_eviction(self) -> None:
        cache: LRUCache[str, int] = LRUCache(2)
        cache.put("a", 1)
        cache.put("b", 2)
        self.assertIsNone(cache.put("a", 10))
        self.assertEqual(cache.put("c", 3), "b")
        self.assertEqual(cache.get("a"), 10)

    def test_contains_does_not_touch_and_delete_relinks(self) -> None:
        cache: LRUCache[str, int] = LRUCache(2)
        cache.put("x", 1)
        cache.put("y", 2)
        self.assertIn("x", cache)
        self.assertEqual(cache.put("z", 3), "x")
        self.assertTrue(cache.delete("y"))
        self.assertFalse(cache.delete("y"))
        cache.put("w", 4)
        self.assertEqual(list(cache), ["w", "z"])
        self.assertEqual(len(cache), 2)

    def test_stats_and_default(self) -> None:
        cache: LRUCache[str, int] = LRUCache(1)
        self.assertEqual(cache.get("yok", -1), -1)
        cache.put("var", 1)
        cache.get("var")
        self.assertEqual((cache.stats.hits, cache.stats.misses), (1, 1))
        self.assertAlmostEqual(cache.stats.hit_ratio, 0.5)

    def test_invalid_capacity(self) -> None:
        with self.assertRaises(ValueError):
            LRUCache(0)


if __name__ == "__main__":
    unittest.main()
