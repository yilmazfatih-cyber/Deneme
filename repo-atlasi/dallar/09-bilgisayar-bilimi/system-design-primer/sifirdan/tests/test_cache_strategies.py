import unittest

from cache_strategies import (
    CacheAside,
    Database,
    WriteBehind,
    WriteThrough,
    cold_writes_hot_reads,
    compare,
    read_after_write,
    seed_database,
)


class CacheStrategiesTest(unittest.TestCase):
    def test_read_after_write_favours_write_through(self) -> None:
        results = compare(read_after_write(), cache_capacity=64, keys_to_seed=[f"kullanici:{i}" for i in range(50)])
        aside, through = results["cache-aside"], results["write-through"]
        self.assertGreater(through.hit_ratio, aside.hit_ratio)
        self.assertLess(through.db_reads, aside.db_reads)
        self.assertEqual(aside.stale_reads, 0)
        self.assertEqual(through.stale_reads, 0)

    def test_cold_writes_pollute_write_through_cache(self) -> None:
        results = compare(cold_writes_hot_reads(), cache_capacity=32, keys_to_seed=[f"urun:{i}" for i in range(20)])
        aside, through = results["cache-aside"], results["write-through"]
        self.assertGreater(aside.hit_ratio, 0.95)
        self.assertLess(through.hit_ratio, aside.hit_ratio - 0.1)

    def test_write_behind_coalesces_writes_but_can_lose_them(self) -> None:
        db = Database()
        repo = WriteBehind(db, cache_capacity=8)
        for version in range(5):
            repo.set("sepet:1", f"v{version}")
        self.assertEqual(repo.get("sepet:1"), "v4")
        self.assertEqual(db.writes, 0)
        self.assertEqual(repo.flush(), 1, "beş yazma tek DB yazmasına indi")
        repo.set("sepet:1", "v5")
        self.assertEqual(repo.crash(), 1)
        self.assertEqual(db.read("sepet:1"), "v4", "boşaltılmamış v5 kayboldu")

    def test_cache_aside_race_leaves_stale_value(self) -> None:
        """
        Klasik yarış: okuyucu ıskalar ve DB'den ESKİ değeri okur; araya yazar girip DB'yi
        günceller ve önbelleği siler; okuyucu sonra eski değeri önbelleğe yazar. TTL olmadan
        bu bayat değer süresiz kalır. Çözümler: TTL, sürüm numarası, "lease" (kiralama).
        """
        db = Database()
        seed_database(db, ["fiyat:1"])
        repo = CacheAside(db, cache_capacity=4)
        old_value = repo.load_from_db("fiyat:1")  # okuyucu: ıskaladı, DB'den okudu
        repo.set("fiyat:1", "fiyat:1:v1")  # yazar: DB güncellendi, önbellek silindi
        assert old_value is not None
        repo.fill_cache("fiyat:1", old_value)  # okuyucu: eski değeri önbelleğe koydu
        self.assertEqual(repo.get("fiyat:1"), "fiyat:1:v0")
        self.assertEqual(db.read("fiyat:1"), "fiyat:1:v1")

    def test_write_through_has_no_window_for_that_race(self) -> None:
        db = Database()
        seed_database(db, ["fiyat:1"])
        repo = WriteThrough(db, cache_capacity=4)
        repo.set("fiyat:1", "fiyat:1:v1")
        self.assertEqual(repo.get("fiyat:1"), "fiyat:1:v1")


if __name__ == "__main__":
    unittest.main()
