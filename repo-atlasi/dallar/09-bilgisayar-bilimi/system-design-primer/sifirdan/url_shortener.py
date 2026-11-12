"""
URL kısaltıcı: base62 kodlama + anahtar-değer deposu + çakışma yönetimi.

Primer'deki karşılığı: solutions/system_design/pastebin/README.md ("Design Pastebin.com
(or Bit.ly)"). Oradaki öneri: (ip + zaman damgası)'nın MD5'ini base62'ye çevir, ilk 7
karakteri al, veritabanında aynısı varsa yeniden üret. Oradaki base62 kodu sözde koddur
(çalışmaz); burada çalışan ve test edilen bir sürüm var.

İki strateji:
- HashShortener: hash(url + deneme_no) -> base62 -> SON `length` karakter (yani sayı mod
  62^length; Primer'in "ilk 7 karakter"inden farkı `_candidate` yorumunda). Aynı kod başka
  bir URL'ye aitse deneme_no artırılır (çakışma çözümü). Aynı URL tekrar gelirse aynı kodu
  verir (idempotent), çünkü ilk deneme aynı kodu üretir.
- CounterShortener: artan sayaç -> base62. Hiç çakışmaz, ama kodlar sıralıdır ve tahmin
  edilebilir (kaç bağlantı üretildiği dışarıdan okunur). Dağıtık sistemde tek sayaç bir
  darboğazdır; çözüm her sunucuya sayaç aralığı (ör. 1000'erli bloklar) dağıtmaktır.

Kapasite hesabı: 62^7 ~ 3.5 * 10^12 kod. Primer'in varsayımı 3 yılda 360 milyon kısa link.
"""

from __future__ import annotations

import hashlib
import itertools
from collections.abc import Callable
from typing import Protocol
from urllib.parse import urlsplit

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
BASE = len(ALPHABET)
_INDEX = {char: value for value, char in enumerate(ALPHABET)}


def base62_encode(number: int) -> str:
    """
    >>> base62_encode(0), base62_encode(61), base62_encode(62), base62_encode(3843)
    ('0', 'Z', '10', 'ZZ')
    >>> base62_encode(-1)
    Traceback (most recent call last):
        ...
    ValueError: negatif sayı kodlanamaz
    """
    if number < 0:
        raise ValueError("negatif sayı kodlanamaz")
    if number == 0:
        return ALPHABET[0]
    digits = []
    while number:
        number, remainder = divmod(number, BASE)
        digits.append(ALPHABET[remainder])
    return "".join(reversed(digits))


def base62_decode(code: str) -> int:
    """
    >>> base62_decode("ZZ")
    3843
    >>> base62_decode("a-b")
    Traceback (most recent call last):
        ...
    ValueError: base62 dışı karakter: '-'
    """
    number = 0
    for char in code:
        if char not in _INDEX:
            raise ValueError(f"base62 dışı karakter: {char!r}")
        number = number * BASE + _INDEX[char]
    return number


class KeyValueStore(Protocol):
    def get(self, key: str) -> str | None: ...

    def put_if_absent(self, key: str, value: str) -> bool:
        """Anahtar yoksa yazar ve True döner; varsa dokunmaz ve False döner (atomik)."""
        ...


class InMemoryStore:
    """Sözlük tabanlı depo. Gerçekte: Redis SETNX, DynamoDB koşullu yazma, SQL UNIQUE kısıtı."""

    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._data.get(key)

    def put_if_absent(self, key: str, value: str) -> bool:
        if key in self._data:
            return False
        self._data[key] = value
        return True

    def __len__(self) -> int:
        return len(self._data)


class CollisionError(RuntimeError):
    """Deneme sınırı içinde boş kod bulunamadı (kod uzunluğu artırılmalı)."""


def normalize_url(url: str) -> str:
    """
    Yalnızca http/https kabul eder; şemayı ve alan adını küçük harfe çevirir.

    >>> normalize_url("HTTPS://Ornek.COM.tr/Yol?q=1")
    'https://ornek.com.tr/Yol?q=1'
    >>> normalize_url("javascript:alert(1)")
    Traceback (most recent call last):
        ...
    ValueError: yalnızca http/https URL kısaltılabilir
    """
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        raise ValueError("yalnızca http/https URL kısaltılabilir")
    # Yol ve sorgu büyük/küçük harfe duyarlıdır; onlara dokunmuyoruz.
    return parts._replace(scheme=parts.scheme.lower(), netloc=parts.netloc.lower()).geturl()


def sha256_int(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest(), "big")


class HashShortener:
    def __init__(
        self,
        store: KeyValueStore,
        length: int = 7,
        max_attempts: int = 8,
        hash_fn: Callable[[str], int] = sha256_int,
    ) -> None:
        self.store, self.length, self.max_attempts, self._hash = store, length, max_attempts, hash_fn
        self.collisions = 0

    def _candidate(self, url: str, attempt: int) -> str:
        # Sabit uzunluk için soldan '0' ile doldurup SAĞDAKİ `length` karakteri alırız: bu, sayı mod 62^length
        # demektir ve düzgün dağılır. Primer'deki "ilk 7 karakter" en anlamlı basamakları alır; en baştaki
        # basamak düzgün dağılmaz ve uzunluk da girdiye göre değişebilir.
        return base62_encode(self._hash(f"{url}#{attempt}")).rjust(self.length, "0")[-self.length :]

    def shorten(self, url: str) -> str:
        url = normalize_url(url)
        for attempt in range(self.max_attempts):
            code = self._candidate(url, attempt)
            if self.store.put_if_absent(code, url):
                return code
            if self.store.get(code) == url:  # aynı URL daha önce kısaltılmış: aynı kodu ver
                return code
            self.collisions += 1
        raise CollisionError(f"{self.max_attempts} denemede boş kod bulunamadı")

    def resolve(self, code: str) -> str:
        url = self.store.get(code)
        if url is None:
            raise KeyError(code)
        return url


class CounterShortener:
    """
    >>> shortener = CounterShortener(InMemoryStore(), start=125)
    >>> shortener.shorten("https://ornek.com/a"), shortener.shorten("https://ornek.com/b")
    ('21', '22')
    """

    def __init__(self, store: KeyValueStore, start: int = 1) -> None:
        self.store = store
        self._ids = itertools.count(start)

    def shorten(self, url: str) -> str:
        url = normalize_url(url)
        code = base62_encode(next(self._ids))
        if not self.store.put_if_absent(code, url):
            raise CollisionError("sayaç tekrarladı: aynı aralık iki sunucuya verilmiş olabilir")
        return code

    def resolve(self, code: str) -> str:
        url = self.store.get(code)
        if url is None:
            raise KeyError(code)
        return url
