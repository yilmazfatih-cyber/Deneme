"""kimlik — kimlik (ID) üretimi: UUIDv7 (zamana göre sıralı, RFC 9562; veritabanı birincil anahtarı için ideal),
kısa rastgele kimlik (URL güvenli, sapmasız), insanın okuyup yazabileceği kod (Crockford Base32, isteğe bağlı
sağlama karakteri; "0/O" ve "1/I/L" karışmaz). TypeScript eşiyle aynı baytlardan aynı kimliği üretir.

Kullanım:
    uuidv7()                                  # "019a8c5e-3f2b-7c41-9d2e-5b7a1c3e9f04" (zaman sıralı)
    uuidv7_timestamp(kimlik)                  # oluşturulma anı (ms)
    short_id()                                # "V1StGXR8_Z5jdHi6B-myT" (21 karakter, ~126 bit)
    readable_code(8, check=True)              # "7K3M-9QPX-R" → telefonda okunabilir
    validate_readable_code("7k3m 9qpx r")     # True (küçük harf, boşluk, O→0, I/L→1 düzeltilir)

Rastgelelik `secrets.token_bytes` (kriptografik) ile gelir; testte `random_bytes` verilebilir. UUIDv7 üreteci aynı
milisaniyede bile artan sırada üretir (74 bitlik sayaç; iş parçacığı güvenli); saat geri giderse son zamandan devam
eder. Python 3.14'teki `uuid.uuid7()` yerine bu kullanılır ki 3.11+ her sürümde ve TypeScript'le aynı davransın.

Sınırlar: UUIDv7 oluşturulma zamanını açığa vurur; gizli kalması gerekiyorsa short_id kullanın. Okunaklı kod 8
karakterde 40 bittir: kaba kuvvete karşı sınırlama (hiz_siniri) gerekir. Sıralama garantisi tek süreç içindir.

Genişletme: Yeni kimlik biçimi aynı `random_bytes` parametresini alan bir işlev olarak eklenir; TypeScript eşine
aynı algoritmayla eklenir ki aynı baytlar aynı kimliği versin (vektorler/kimlik.json).
"""

from __future__ import annotations

import math
import re
import secrets
import threading
import time
from collections.abc import Callable

__all__ = [
    "CROCKFORD_ALPHABET",
    "URL_ALPHABET",
    "Uuidv7Generator",
    "check_character",
    "is_uuid",
    "normalize_readable_code",
    "readable_code",
    "short_id",
    "uuidv7",
    "uuidv7_from_parts",
    "uuidv7_timestamp",
    "validate_readable_code",
]

RandomBytes = Callable[[int], bytes]

URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def _uuid_from_counter(timestamp_ms: int, counter: int) -> str:
    rand_a = counter >> 62
    rand_b = (counter & ((1 << 62) - 1)) | (0b10 << 62)
    value = (timestamp_ms << 80) | (0x7 << 76) | (rand_a << 64) | rand_b
    h = f"{value:032x}"
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def _counter_from_bytes(random: bytes) -> int:
    if len(random) < 10:
        raise ValueError("UUIDv7 için en az 10 rastgele bayt gerekir.")
    counter = ((random[0] & 0x0F) << 8) | random[1]
    counter = (counter << 6) | (random[2] & 0x3F)
    for byte in random[3:10]:
        counter = (counter << 8) | byte
    return counter


def _check_timestamp(timestamp_ms: int) -> None:
    if (
        isinstance(timestamp_ms, bool)
        or not isinstance(timestamp_ms, int)
        or not 0 <= timestamp_ms < 2**48
    ):
        raise ValueError(f"Zaman damgası 0 ile 2^48 arasında tam sayı (ms) olmalı: {timestamp_ms}.")


def uuidv7_from_parts(timestamp_ms: int, random: bytes | list[int]) -> str:
    """Belirli zaman ve 10 rastgele bayttan UUIDv7 kurar (test ve diller arası uyum için saf işlev)."""
    _check_timestamp(timestamp_ms)
    return _uuid_from_counter(timestamp_ms, _counter_from_bytes(bytes(random)))


class Uuidv7Generator:
    """Aynı milisaniyede bile artan sırada UUIDv7 üreten, iş parçacığı güvenli üreteç."""

    def __init__(
        self, *, now: Callable[[], int] = _now_ms, random_bytes: RandomBytes = secrets.token_bytes
    ) -> None:
        self._now = now
        self._random_bytes = random_bytes
        self._last_ms = -1
        self._counter = 0
        self._lock = threading.Lock()

    def next(self) -> str:
        with self._lock:
            ms = self._now()
            _check_timestamp(ms)
            if ms > self._last_ms:
                self._last_ms = ms
                self._counter = _counter_from_bytes(self._random_bytes(10))
            else:
                self._counter += 1  # aynı ms ya da saat geri gitti: son zamandan sayaçla devam
                if self._counter >= 1 << 74:
                    self._last_ms += 1
                    self._counter = _counter_from_bytes(self._random_bytes(10))
            return _uuid_from_counter(self._last_ms, self._counter)


_DEFAULT_GENERATOR = Uuidv7Generator()


def uuidv7() -> str:
    """Zaman sıralı UUIDv7 üretir."""
    return _DEFAULT_GENERATOR.next()


def is_uuid(text: str, version: int | None = None) -> bool:
    """UUID biçiminde mi? (sürüm 1–8, RFC varyantı). `version` verilirse sürüm de denetlenir."""
    match = re.fullmatch(
        "[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        text,
        re.IGNORECASE,
    )
    return match is not None and (version is None or int(match.group(1)) == version)


def uuidv7_timestamp(uuid: str) -> int:
    """UUIDv7'nin oluşturulma anı (Unix ms). v7 değilse hata."""
    if not is_uuid(uuid, 7):
        raise ValueError(f'"{uuid}" bir UUIDv7 değil.')
    return int(uuid.replace("-", "")[:12], 16)


def short_id(
    length: int = 21,
    *,
    alphabet: str = URL_ALPHABET,
    random_bytes: RandomBytes = secrets.token_bytes,
) -> str:
    """Sapmasız rastgele kimlik: her karakter alfabeden eşit olasılıkla seçilir (maske + reddetme; nanoid yöntemi)."""
    if not 2 <= len(alphabet) <= 256 or len(set(alphabet)) != len(alphabet):
        raise ValueError("Alfabe 2–256 farklı karakterden oluşmalı.")
    if length < 1:
        raise ValueError("Uzunluk 1 veya daha büyük olmalı.")
    mask = (2 << (((len(alphabet) - 1) | 1).bit_length() - 1)) - 1
    step = math.ceil((1.6 * mask * length) / len(alphabet))
    chars: list[str] = []
    while True:
        for byte in random_bytes(step):
            index = byte & mask
            if index < len(alphabet):
                chars.append(alphabet[index])
                if len(chars) == length:
                    return "".join(chars)


def normalize_readable_code(code: str) -> str:
    """Kodu karşılaştırılabilir biçime getirir: büyük harf, boşluk/tire yok, O→0, I/L/ı/i→1."""
    text = re.sub(r"[\s-]+", "", code)
    text = re.sub("[oO]", "0", text)
    text = re.sub("[iIlLıİ]", "1", text)
    return text.upper()  # harf: Crockford alfabesi ASCII; Türkçe i/ı önce 1 yapıldı


def check_character(code: str) -> str:
    """Luhn mod 32 sağlama karakteri (Crockford alfabesinde)."""
    body = normalize_readable_code(code)
    n = len(CROCKFORD_ALPHABET)
    factor = 2
    total = 0
    for ch in reversed(body):
        value = CROCKFORD_ALPHABET.find(ch)
        if value < 0:
            raise ValueError(f'"{ch}" kod alfabesinde yok.')
        addend = factor * value
        factor = 1 if factor == 2 else 2
        total += addend // n + addend % n
    return CROCKFORD_ALPHABET[(n - total % n) % n]


def readable_code(
    length: int = 8,
    *,
    group_size: int = 4,
    check: bool = False,
    random_bytes: RandomBytes = secrets.token_bytes,
) -> str:
    """İnsanın okuyup yazacağı kod: "7K3M-9QPX". `check=True` → sonuna sağlama karakteri eklenir."""
    code = short_id(length, alphabet=CROCKFORD_ALPHABET, random_bytes=random_bytes)
    if check:
        code += check_character(code)
    if group_size <= 0:
        return code
    return "-".join(code[i : i + group_size] for i in range(0, len(code), group_size))


def validate_readable_code(code: str, *, check: bool = True) -> bool:
    """Kodu doğrular (yazım farklarını düzelterek). Varsayılan: son karakter sağlama karakteridir."""
    normalized = normalize_readable_code(code)
    if not normalized or any(ch not in CROCKFORD_ALPHABET for ch in normalized):
        return False
    if not check:
        return True
    return len(normalized) >= 2 and check_character(normalized[:-1]) == normalized[-1]
