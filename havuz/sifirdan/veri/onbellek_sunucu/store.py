"""Önbellek deposu: komutlar, süre dolumu (tembel + etkin), LRU ile bellek sınırı.

- Veri `OrderedDict`: baştaki en az yakın zamanda kullanılandır (LRU); her erişim sona taşır.
- Süre: `expires[anahtar] = bitiş_ms`. Tembel: erişimde süresi geçmişse silinir. Etkin:
  `active_expire_cycle` süreli anahtarlardan 20 örnek alır, geçmişleri siler; örneğin %25'ten
  fazlası geçmişse yeniden dener.
- Bellek: her anahtar ≈ len(anahtar) + len(değer) + 64 bayt sayılır; `maxmemory` aşılırsa en eski
  anahtarlar atılır (allkeys-lru). Tek başına sığmayan değer `OOM` hatası alır.
Komut anlamı Redis 7 ile aynıdır (testte gerçek redis-server ile karşılaştırılır); hata iletileri
Türkçe.

Genişletme: YENİ KOMUT → `_cmd_<ad>` yöntemi + `COMMANDS` tablosuna (en az, en çok argüman) satırı +
tests/onbellek_sunucu/test_redis_diff.py'deki üretece bir dal (gerçek Redis'le karşılaştırılsın).
"""

from __future__ import annotations

import random
import re
import time
from collections import OrderedDict
from collections.abc import Callable

from .resp import Error, Reply, SimpleString

OVERHEAD = 64
_INTEGER = re.compile(rb"0|-?[1-9][0-9]*")
_INT_MIN, _INT_MAX = -(2**63), 2**63 - 1

COMMANDS: dict[str, tuple[int, int]] = {  # ad → (en az, en çok argüman; -1 = sınırsız)
    "ping": (0, 1), "echo": (1, 1), "get": (1, 1), "set": (2, 6), "del": (1, -1),
    "exists": (1, -1), "expire": (2, 2), "persist": (1, 1), "ttl": (1, 1), "pttl": (1, 1),
    "incr": (1, 1), "decr": (1, 1), "incrby": (2, 2), "decrby": (2, 2), "keys": (1, 1),
    "dbsize": (0, 0), "flushdb": (0, 0), "info": (0, 1),
    # YENİ KOMUT BURAYA: "ad": (en_az, en_çok),
}  # fmt: skip


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def _not_integer() -> Error:
    return Error("ERR", "değer bir tamsayı değil ya da aralık dışında")


def _glob(pattern: bytes) -> re.Pattern[bytes]:
    """Redis KEYS deseni: * ? [abc] [^a-z] ve \\ kaçışı."""
    out, i = [], 0
    while i < len(pattern):
        char = pattern[i : i + 1]
        if char == b"\\" and i + 1 < len(pattern):
            out.append(re.escape(pattern[i + 1 : i + 2]))
            i += 2
            continue
        if char == b"*":
            out.append(b".*")
        elif char == b"?":
            out.append(b".")
        elif char == b"[":
            end = pattern.find(b"]", i + 1)
            if end < 0:
                out.append(re.escape(char))
            else:
                body = pattern[i + 1 : end]
                negate = body[:1] in (b"^", b"!")
                body = body[1:] if negate else body
                out.append(b"[" + (b"^" if negate else b"") + body.replace(b"\\", b"\\\\") + b"]")
                i = end
        else:
            out.append(re.escape(char))
        i += 1
    return re.compile(b"".join(out), re.DOTALL)


class Store:
    def __init__(
        self,
        maxmemory: int = 0,
        clock: Callable[[], int] = now_ms,
        rng: random.Random | None = None,
    ) -> None:
        self.data: OrderedDict[bytes, bytes] = OrderedDict()
        self.expires: dict[bytes, int] = {}
        self.maxmemory = maxmemory
        self.clock = clock
        self.rng = rng or random.Random(0)
        self.used = 0
        self.stats = {"expired": 0, "evicted": 0, "hits": 0, "misses": 0}

    # ── İç işlemler ─────────────────────────────────────────────────────────────────────────────

    def _alive(self, key: bytes) -> bool:
        deadline = self.expires.get(key)
        if deadline is not None and deadline <= self.clock():
            self._delete(key)
            self.stats["expired"] += 1
            return False
        return key in self.data

    def _delete(self, key: bytes) -> bool:
        value = self.data.pop(key, None)
        self.expires.pop(key, None)
        if value is None:
            return False
        self.used -= len(key) + len(value) + OVERHEAD
        return True

    def _put(self, key: bytes, value: bytes, keep_ttl: bool = False) -> Error | None:
        size = len(key) + len(value) + OVERHEAD
        if self.maxmemory and size > self.maxmemory:
            return Error("OOM", "değer bellek sınırından büyük (maxmemory)")
        old = self.data.get(key)
        if old is not None:
            self.used -= len(key) + len(old) + OVERHEAD
        if not keep_ttl:
            self.expires.pop(key, None)
        self.data[key] = value
        self.data.move_to_end(key)
        self.used += size
        while self.maxmemory and self.used > self.maxmemory:
            victim = next(iter(self.data))  # en uzun süredir dokunulmayan
            self._delete(victim)
            self.stats["evicted"] += 1
        return None

    def active_expire_cycle(self, sample: int = 20, max_rounds: int = 16) -> int:
        """Süreli anahtarlardan örnek alıp süresi geçenleri siler; silinen sayısını döndürür."""
        removed = 0
        for _ in range(max_rounds):
            if not self.expires:
                break
            keys = self.rng.sample(list(self.expires), min(sample, len(self.expires)))
            now = self.clock()
            expired = [key for key in keys if self.expires[key] <= now]
            for key in expired:
                self._delete(key)
                self.stats["expired"] += 1
            removed += len(expired)
            if len(expired) * 4 <= len(keys):  # %25'ten azı geçmiş: yeter
                break
        return removed

    # ── Komut yürütme ───────────────────────────────────────────────────────────────────────────

    def execute(self, args: list[bytes]) -> Reply:
        if not args:
            return Error("ERR", "boş komut")
        name = args[0].decode(errors="replace").lower()
        if name not in COMMANDS:
            return Error("ERR", f"bilinmeyen komut '{args[0].decode(errors='replace')}'")
        least, most = COMMANDS[name]
        if len(args) - 1 < least or (most >= 0 and len(args) - 1 > most):
            return Error("ERR", f"'{name}' komutu için argüman sayısı yanlış")
        handler: Callable[[list[bytes]], Reply] = getattr(self, f"_cmd_{name}")
        return handler(args[1:])

    def _cmd_ping(self, args: list[bytes]) -> Reply:
        return args[0] if args else SimpleString("PONG")

    def _cmd_echo(self, args: list[bytes]) -> Reply:
        return args[0]

    def _cmd_get(self, args: list[bytes]) -> Reply:
        key = args[0]
        if not self._alive(key):
            self.stats["misses"] += 1
            return None
        self.stats["hits"] += 1
        self.data.move_to_end(key)
        return self.data[key]

    def _cmd_set(self, args: list[bytes]) -> Reply:
        key, value, options = args[0], args[1], [a.upper() for a in args[2:]]
        expire_ms: int | None = None
        condition: bytes | None = None
        i = 0
        while i < len(options):
            option = options[i]
            if option in (b"NX", b"XX") and condition is None:
                condition = option
            elif option in (b"EX", b"PX") and expire_ms is None and i + 1 < len(options):
                if not _INTEGER.fullmatch(args[2 + i + 1]):
                    return _not_integer()
                amount = int(args[2 + i + 1])
                if amount <= 0:
                    return Error("ERR", "'set' komutunda geçersiz süre")
                expire_ms = amount * (1000 if option == b"EX" else 1)
                i += 1
            else:
                return Error("ERR", "sözdizimi hatası")
            i += 1
        exists = self._alive(key)
        if (condition == b"NX" and exists) or (condition == b"XX" and not exists):
            return None
        failure = self._put(key, value)
        if failure is not None:
            return failure
        if expire_ms is not None:
            self.expires[key] = self.clock() + expire_ms
        return SimpleString("OK")

    def _cmd_del(self, args: list[bytes]) -> Reply:
        return sum(self._alive(key) and self._delete(key) for key in args)

    def _cmd_exists(self, args: list[bytes]) -> Reply:
        return sum(self._alive(key) for key in args)

    def _cmd_expire(self, args: list[bytes]) -> Reply:
        key, seconds = args
        if not _INTEGER.fullmatch(seconds):
            return _not_integer()
        if not self._alive(key):
            return 0
        if int(seconds) <= 0:  # Redis: süre geçmişte → anahtar hemen silinir
            self._delete(key)
            return 1
        self.expires[key] = self.clock() + int(seconds) * 1000
        return 1

    def _cmd_persist(self, args: list[bytes]) -> Reply:
        key = args[0]
        return 1 if self._alive(key) and self.expires.pop(key, None) is not None else 0

    def _remaining(self, key: bytes) -> int | None:
        """Kalan ms; anahtar yoksa -2, süresizse -1 (Redis kodları)."""
        if not self._alive(key):
            return -2
        deadline = self.expires.get(key)
        return -1 if deadline is None else deadline - self.clock()

    def _cmd_ttl(self, args: list[bytes]) -> Reply:
        remaining = self._remaining(args[0])
        assert remaining is not None
        return remaining if remaining < 0 else (remaining + 500) // 1000

    def _cmd_pttl(self, args: list[bytes]) -> Reply:
        return self._remaining(args[0])

    def _change(self, key: bytes, delta: int) -> Reply:
        current = self.data[key] if self._alive(key) else b"0"
        if not _INTEGER.fullmatch(current) or not _INT_MIN <= int(current) <= _INT_MAX:
            return _not_integer()
        result = int(current) + delta
        if not _INT_MIN <= result <= _INT_MAX:
            return Error("ERR", "artırma ya da azaltma taşma yapar")
        failure = self._put(key, str(result).encode(), keep_ttl=True)  # INCR süreyi korur
        return failure if failure is not None else result

    def _amount(self, raw: bytes) -> int | None:
        if not _INTEGER.fullmatch(raw) or not _INT_MIN <= int(raw) <= _INT_MAX:
            return None
        return int(raw)

    def _cmd_incr(self, args: list[bytes]) -> Reply:
        return self._change(args[0], 1)

    def _cmd_decr(self, args: list[bytes]) -> Reply:
        return self._change(args[0], -1)

    def _cmd_incrby(self, args: list[bytes]) -> Reply:
        amount = self._amount(args[1])
        return _not_integer() if amount is None else self._change(args[0], amount)

    def _cmd_decrby(self, args: list[bytes]) -> Reply:
        amount = self._amount(args[1])
        if amount is None or amount == _INT_MIN:
            return _not_integer() if amount is None else Error("ERR", "azaltma taşma yapar")
        return self._change(args[0], -amount)

    def _cmd_keys(self, args: list[bytes]) -> Reply:
        pattern = _glob(args[0])
        return [key for key in list(self.data) if pattern.fullmatch(key) and self._alive(key)]

    def _cmd_dbsize(self, args: list[bytes]) -> Reply:
        return sum(self._alive(key) for key in list(self.data))

    def _cmd_flushdb(self, args: list[bytes]) -> Reply:
        self.data.clear()
        self.expires.clear()
        self.used = 0
        return SimpleString("OK")

    def _cmd_info(self, args: list[bytes]) -> Reply:
        lines = [
            f"used_memory:{self.used}",
            f"maxmemory:{self.maxmemory}",
            f"keys:{len(self.data)}",
            f"expires:{len(self.expires)}",
        ] + [f"{name}:{count}" for name, count in self.stats.items()]
        return ("\r\n".join(lines) + "\r\n").encode()
