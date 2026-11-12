"""
Önbellek güncelleme stratejileri: cache-aside, write-through ve write-behind karşılaştırması.

Primer'deki karşılığı: "Cache > When to update the cache" bölümü. Oradaki iddiaları
ölçülebilir hâle getiriyoruz:

- Cache-aside (tembel yükleme): Uygulama önce önbelleğe bakar; ıskalarsa veritabanından
  okuyup önbelleğe yazar. Yazmada veritabanını günceller ve önbellek girdisini SİLER.
  Yalnızca okunan veri önbelleğe girer. Her ıskalama 3 adım (önbellek, DB, önbellek) sürer.
- Write-through: Her yazma hem önbelleğe hem veritabanına eşzamanlı gider. Yazılan veri
  hemen okunursa önbellekten gelir; ama hiç okunmayacak veri de önbelleği doldurur ve
  sıcak anahtarları dışarı itebilir.
- Write-behind: Yazma önce yalnızca önbelleğe gider, veritabanına sonra toplu yazılır.
  Hızlıdır ve aynı anahtara art arda yazmaları birleştirir; ama boşaltmadan (flush) önce
  çökme, onaylanmış yazmaların kaybı demektir.

Maliyet modeli soyut birimdir: önbellek işlemi 1, veritabanı işlemi 10 birim (gerçekte bellek
~100 ns, ağ üzerinden veritabanı ~1 ms; oran daha da büyüktür).
"""

from __future__ import annotations

import random
from collections.abc import Iterable
from dataclasses import dataclass

from lru_cache import LRUCache

CACHE_COST = 1
DB_COST = 10


class Database:
    def __init__(self) -> None:
        self._rows: dict[str, str] = {}
        self.reads = 0
        self.writes = 0

    def read(self, key: str) -> str | None:
        self.reads += 1
        return self._rows.get(key)

    def write(self, key: str, value: str) -> None:
        self.writes += 1
        self._rows[key] = value


class Repository:
    """Ortak iskelet: get/set ve maliyet sayacı. Alt sınıflar stratejiyi belirler."""

    name = "temel"

    def __init__(self, db: Database, cache_capacity: int) -> None:
        self.db = db
        self.cache: LRUCache[str, str] = LRUCache(cache_capacity)
        self.cost = 0

    def get(self, key: str) -> str | None:
        self.cost += CACHE_COST
        value = self.cache.get(key)
        if value is not None:
            return value
        value = self.load_from_db(key)
        if value is not None:
            self.fill_cache(key, value)
        return value

    # Okuma yolunun iki adımı ayrı metot: testte araya başka bir istemcinin yazmasını sokabilmek için.
    def load_from_db(self, key: str) -> str | None:
        self.cost += DB_COST
        return self.db.read(key)

    def fill_cache(self, key: str, value: str) -> None:
        self.cost += CACHE_COST
        self.cache.put(key, value)

    def set(self, key: str, value: str) -> None:
        raise NotImplementedError


class CacheAside(Repository):
    name = "cache-aside"

    def set(self, key: str, value: str) -> None:
        self.cost += DB_COST + CACHE_COST
        self.db.write(key, value)
        self.cache.delete(key)  # güncellemek yerine geçersiz kıl: bir sonraki okuma tazesini yükler


class WriteThrough(Repository):
    name = "write-through"

    def set(self, key: str, value: str) -> None:
        self.cost += CACHE_COST + DB_COST
        self.cache.put(key, value)
        self.db.write(key, value)


class WriteBehind(Repository):
    name = "write-behind"

    def __init__(self, db: Database, cache_capacity: int) -> None:
        super().__init__(db, cache_capacity)
        self._dirty: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        # Henüz veritabanına yazılmamış (kirli) değer, en güncel değerdir.
        if key in self._dirty:
            self.cost += CACHE_COST
            self.cache.stats.hits += 1
            return self._dirty[key]
        return super().get(key)

    def set(self, key: str, value: str) -> None:
        self.cost += CACHE_COST
        self.cache.put(key, value)
        self._dirty[key] = value  # aynı anahtara art arda yazmalar tek DB yazmasına iner

    def flush(self) -> int:
        for key, value in self._dirty.items():
            self.cost += DB_COST
            self.db.write(key, value)
        written = len(self._dirty)
        self._dirty.clear()
        return written

    def crash(self) -> int:
        """Süreç çöker: bellekteki önbellek ve boşaltılmamış yazmalar kaybolur."""
        lost = len(self._dirty)
        self._dirty.clear()
        self.cache = LRUCache(self.cache.capacity)
        return lost


@dataclass(frozen=True)
class Op:
    kind: str  # "get" ya da "set"
    key: str
    value: str = ""


@dataclass
class Result:
    strategy: str
    cost: int
    hit_ratio: float
    db_reads: int
    db_writes: int
    stale_reads: int


def run_workload(repo: Repository, ops: Iterable[Op]) -> Result:
    """İşlemleri sırayla uygular; okunan değeri istemcinin bildiği son yazmayla karşılaştırır."""
    truth: dict[str, str] = {}
    stale = 0
    for op in ops:
        if op.kind == "set":
            repo.set(op.key, op.value)
            truth[op.key] = op.value
        else:
            value = repo.get(op.key)
            if op.key in truth and value != truth[op.key]:
                stale += 1
    if isinstance(repo, WriteBehind):
        repo.flush()
    return Result(repo.name, repo.cost, repo.cache.stats.hit_ratio, repo.db.reads, repo.db.writes, stale_reads=stale)


def seed_database(db: Database, keys: Iterable[str]) -> None:
    for key in keys:
        db.write(key, f"{key}:v0")
    db.reads = db.writes = 0


def read_after_write(rounds: int = 400, seed: int = 1) -> list[Op]:
    """Profil güncelle, hemen ardından birkaç kez görüntüle (sosyal ağ, e-ticaret sepeti)."""
    generator = random.Random(seed)
    ops = []
    for version in range(1, rounds + 1):
        key = f"kullanici:{generator.randrange(50)}"
        ops.append(Op("set", key, f"{key}:v{version}"))
        ops += [Op("get", key)] * 3
    return ops


def cold_writes_hot_reads(rounds: int = 2000, seed: int = 2) -> list[Op]:
    """
    Sıcak 20 anahtar sürekli okunur; araya hiç okunmayacak yazmalar (log, olay kaydı) karışır.
    Write-through bu soğuk veriyi de önbelleğe koyar ve sıcak anahtarları dışarı iter.
    """
    generator = random.Random(seed)
    ops = []
    for step in range(rounds):
        if generator.random() < 0.5:
            ops.append(Op("set", f"olay:{step}", "x"))
        else:
            ops.append(Op("get", f"urun:{generator.randrange(20)}"))
    return ops


def compare(ops: list[Op], cache_capacity: int, keys_to_seed: Iterable[str] = ()) -> dict[str, Result]:
    seeded = list(keys_to_seed)
    results = {}
    for strategy in (CacheAside, WriteThrough, WriteBehind):
        db = Database()
        seed_database(db, seeded)
        results[strategy.name] = run_workload(strategy(db, cache_capacity), ops)
    return results


if __name__ == "__main__":
    scenarios = (
        ("yazdıktan sonra oku", read_after_write(), 64, [f"kullanici:{i}" for i in range(50)]),
        ("soğuk yazma, sıcak okuma", cold_writes_hot_reads(), 32, [f"urun:{i}" for i in range(20)]),
    )
    for title, ops, capacity, keys in scenarios:
        print(f"== {title}")
        for result in compare(ops, capacity, keys).values():
            print(
                f"  {result.strategy:14} maliyet={result.cost:6}  isabet={result.hit_ratio:5.1%}  "
                f"db_okuma={result.db_reads:5}  db_yazma={result.db_writes:5}  bayat={result.stale_reads}"
            )
