"""sonuc — hata fırlatmak yerine değer döndürmek için Result tipi: `Ok(value)` ya da `Err(error)`.
Beklenen hataları (doğrulama, bulunamadı, ağ) tipte görünür kılar; `try/except` unutulamaz.

Kullanım:
    def bul(kimlik: str) -> Result[Kisi, str]:
        return ok(kisi) if kisi else err("yok")
    match bul("42"):
        case Ok(value=kisi): print(kisi.ad)
        case Err(error=neden): print(neden)
    ad = unwrap_or(map_ok(bul("42"), lambda k: k.ad), "bilinmiyor")
    sonuc = try_catch(lambda: json.loads(metin))          # fırlatan kodu sarar → Result[Any, Exception]

Sınırlar: Bilerek küçüktür. Beklenmeyen hatalar (programlama hataları) için yine `raise` kullanın; Result yalnız
çağıranın ele alması gereken durumlar içindir.

Genişletme: Yeni yardımcı, Result alıp Result döndüren saf bir işlev olarak eklenir; TypeScript eşine
(ts/src/sonuc.ts) aynı adın camelCase biçimiyle eklenir.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Generic, Literal, TypeAlias, TypeVar

__all__ = [
    "Err",
    "Ok",
    "Result",
    "UnwrapError",
    "and_then",
    "combine",
    "err",
    "fold",
    "is_err",
    "is_ok",
    "map_err",
    "map_ok",
    "ok",
    "partition",
    "try_catch",
    "try_catch_async",
    "unwrap",
    "unwrap_or",
]

T = TypeVar("T")
U = TypeVar("U")
E = TypeVar("E")
F = TypeVar("F")
R = TypeVar("R")


@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T

    @property
    def ok(self) -> Literal[True]:
        return True


@dataclass(frozen=True)
class Err(Generic[E]):
    error: E

    @property
    def ok(self) -> Literal[False]:
        return False


Result: TypeAlias = Ok[T] | Err[E]


class UnwrapError(Exception):
    """Hatalı sonuçta `unwrap` çağrılınca fırlatılır; asıl hata `__cause__` ve `error` içindedir."""

    def __init__(self, message: str, error: object) -> None:
        super().__init__(message)
        self.error = error


def ok(value: T) -> Ok[T]:
    return Ok(value)


def err(error: E) -> Err[E]:
    return Err(error)


def is_ok(result: Result[T, E]) -> bool:
    return isinstance(result, Ok)


def is_err(result: Result[T, E]) -> bool:
    return isinstance(result, Err)


def map_ok(result: Result[T, E], fn: Callable[[T], U]) -> Result[U, E]:
    """Başarılıysa değeri dönüştürür, hatayı olduğu gibi geçirir."""
    return Ok(fn(result.value)) if isinstance(result, Ok) else result


def map_err(result: Result[T, E], fn: Callable[[E], F]) -> Result[T, F]:
    """Hatalıysa hatayı dönüştürür (ör. teknik hatayı kullanıcı iletisine çevirmek)."""
    return Err(fn(result.error)) if isinstance(result, Err) else result


def and_then(result: Result[T, E], fn: Callable[[T], Result[U, E]]) -> Result[U, E]:
    """Başarılıysa sıradaki Result döndüren adımı çalıştırır (zincirleme)."""
    return fn(result.value) if isinstance(result, Ok) else result


def unwrap(result: Result[T, E]) -> T:
    """Değeri verir; hatalıysa UnwrapError fırlatır."""
    if isinstance(result, Ok):
        return result.value
    cause = result.error if isinstance(result.error, BaseException) else None
    raise UnwrapError(f"Sonuç hatalı: {result.error}", result.error) from cause


def unwrap_or(result: Result[T, E], fallback: T) -> T:
    return result.value if isinstance(result, Ok) else fallback


def fold(result: Result[T, E], on_ok: Callable[[T], R], on_err: Callable[[E], R]) -> R:
    """İki dalı da ele alıp tek bir değere indirger."""
    return on_ok(result.value) if isinstance(result, Ok) else on_err(result.error)


def try_catch(fn: Callable[[], T]) -> Result[T, Exception]:
    """Fırlatabilen kodu sarar: try_catch(lambda: json.loads(metin))."""
    try:
        return Ok(fn())
    except Exception as error:
        return Err(error)


async def try_catch_async(fn: Callable[[], Awaitable[T]]) -> Result[T, Exception]:
    """Eşzamansız kodu sarar: await try_catch_async(lambda: istemci.get(url))."""
    try:
        return Ok(await fn())
    except Exception as error:
        return Err(error)


def combine(results: Sequence[Result[T, E]]) -> Result[list[T], E]:
    """Hepsi başarılıysa değer listesini, değilse İLK hatayı döndürür."""
    values: list[T] = []
    for result in results:
        if isinstance(result, Err):
            return result
        values.append(result.value)
    return Ok(values)


def partition(results: Sequence[Result[T, E]]) -> tuple[list[T], list[E]]:
    """Başarılıları ve hataları ayırır: (değerler, hatalar)."""
    values = [r.value for r in results if isinstance(r, Ok)]
    errors = [r.error for r in results if isinstance(r, Err)]
    return values, errors
