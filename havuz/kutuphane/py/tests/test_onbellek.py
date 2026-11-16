"""onbellek modülünün testi: sahte saatle LRU + TTL ve başvuru modeliyle kaba kuvvet karşılaştırma."""

from __future__ import annotations

import random

import pytest

from kutuphane.onbellek import EvictReason, LruCache


def test_lru_order_and_peek() -> None:
    evicted: list[tuple[str, EvictReason]] = []
    cache: LruCache[str, int] = LruCache(
        max_size=2, on_evict=lambda k, _v, r: evicted.append((k, r))
    )
    cache.set("a", 1)
    cache.set("b", 2)
    assert cache.get("a") == 1
    cache.set("c", 3)
    assert "b" not in cache
    assert cache.keys() == ["a", "c"]
    assert cache.peek("a") == 1
    cache.set("d", 4)
    assert cache.keys() == ["c", "d"]
    assert evicted == [("b", "size"), ("a", "size")]


def test_ttl_expiry() -> None:
    now = 0.0
    reasons: list[EvictReason] = []
    cache: LruCache[str, str] = LruCache(
        max_size=10, ttl=0.1, now=lambda: now, on_evict=lambda _k, _v, r: reasons.append(r)
    )
    cache.set("x", "bir")
    cache.set("y", "iki", ttl=1.0)
    now = 0.099
    assert cache.get("x") == "bir"
    now = 0.1
    assert cache.get("x") is None
    assert len(cache) == 1
    now = 1.0
    assert cache.purge_expired() == 1
    assert reasons == ["expired", "expired"]


def test_get_or_set_and_errors() -> None:
    cache: LruCache[str, int] = LruCache(max_size=3)
    assert cache.get_or_set("z", lambda: 7) == 7
    assert cache.get_or_set("z", lambda: 8) == 7

    def broken() -> int:
        raise RuntimeError("db")

    with pytest.raises(RuntimeError):
        cache.get_or_set("hata", broken)
    assert not cache.has("hata")
    with pytest.raises(ValueError):
        LruCache(max_size=0)


def test_matches_reference_model() -> None:
    rng = random.Random(7)
    cache: LruCache[int, int] = LruCache(max_size=5)
    model: list[int] = []
    for i in range(5000):
        key = rng.randint(0, 8)
        if i % 3 == 0:
            cache.set(key, key)
            if key in model:
                model.remove(key)
            model.append(key)
            if len(model) > 5:
                model.pop(0)
        else:
            assert (cache.get(key) is not None) == (key in model)
            if key in model:
                model.remove(key)
                model.append(key)
        assert cache.keys() == model


def test_delete_and_clear_notify() -> None:
    reasons: list[EvictReason] = []
    cache: LruCache[str, int] = LruCache(max_size=3, on_evict=lambda _k, _v, r: reasons.append(r))
    cache.set("a", 1)
    cache.set("b", 2)
    assert cache.delete("a")
    assert not cache.delete("a")
    cache.clear()
    assert reasons == ["deleted", "cleared"]
