"""Farksal test: aynı rastgele komut dizisi GERÇEK redis-server'a ve bizim sunucuya gönderilir;
yanıtlar aynı olmalı. redis-server kurulu değilse atlanır.

Karşılaştırma kuralları: hata yanıtlarında yalnız tür ("ERR", "OOM") — iletilerimiz Türkçe; KEYS
sırasız (küme); TTL/PTTL'nin pozitif değerleri saate bağlı olduğundan yalnız "pozitif" olarak.
"""

from __future__ import annotations

import random

import pytest

from onbellek_sunucu import CacheClient, CacheError, CacheServer, Store
from onbellek_sunucu.resp import Reply
from tests.onbellek_sunucu.harness import RedisProcess, ServerThread
from tests.yardimci import seed_count

pytestmark = pytest.mark.skipif(not RedisProcess.available, reason="redis-server kurulu değil")

KEYS = ["a", "b", "sayı", "ş"]
VALUES = ["1", "-5", "01", "x", "", "9223372036854775807", "-9223372036854775808", "İzmir", "-0"]


def random_command(rng: random.Random) -> list[str]:
    key, other, value = rng.choice(KEYS), rng.choice(KEYS), rng.choice(VALUES)
    options = rng.sample([["NX"], ["XX"], ["EX", "1000"], ["PX", "900000"]], rng.randint(0, 2))
    choices: list[list[str]] = [
        ["SET", key, value, *[part for option in options for part in option]],
        ["GET", key],
        ["DEL", key, other],
        ["EXISTS", key, other, key],
        ["INCR", key],
        ["DECR", key],
        ["INCRBY", key, value],
        ["DECRBY", key, rng.choice(["3", "-9223372036854775808", "abc"])],
        ["EXPIRE", key, rng.choice(["1000", "0", "-1", "abc"])],
        ["PERSIST", key],
        ["TTL", key],
        ["PTTL", key],
        ["KEYS", rng.choice(["*", "s*", "?", "[ab]", "[^a]*", "ş"])],
        ["DBSIZE"],
        ["ECHO", value or "boş"],
        ["PING"],
        [rng.choice(["GET", "SET", "INCR"])],  # yanlış argüman sayısı
    ]
    return rng.choice(choices)


def normalize(command: list[str], reply: Reply | CacheError) -> object:
    if isinstance(reply, CacheError):
        return ("hata", str(reply).split(" ")[0])
    if command[0] in ("TTL", "PTTL") and isinstance(reply, int) and reply > 0:
        return "pozitif"
    if command[0] == "KEYS" and isinstance(reply, list):
        return sorted(item for item in reply if isinstance(item, bytes))
    return reply


def call(client: CacheClient, command: list[str]) -> object:
    try:
        return normalize(command, client.execute(*command))
    except CacheError as error:
        return normalize(command, error)


@pytest.mark.parametrize("seed", range(seed_count(6, 60)))
def test_same_replies_as_real_redis(seed: int) -> None:
    rng = random.Random(seed)
    ours_server = CacheServer(Store(), port=0, expire_interval=None)
    with (
        RedisProcess() as redis_port,
        ServerThread(ours_server) as our_port,
        CacheClient(port=redis_port) as redis,
        CacheClient(port=our_port) as ours,
    ):
        for step in range(150):
            command = random_command(rng)
            expected, actual = call(redis, command), call(ours, command)
            assert actual == expected, f"tohum={seed} adım={step} {command}"
