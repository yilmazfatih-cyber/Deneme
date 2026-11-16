"""Test dosyalarında kullanılan işaretler: fixture, parametrize, skip, timeout, raises.

Bu dekoratörler işlevi DEĞİŞTİRMEZ; yalnız üstüne öznitelik (`__tc_*__`) yazar. Toplayıcı
(discovery.py) ve koşucu (runner.py) bu öznitelikleri okur — sihirli kayıt defteri yoktur.
Genişletme: yeni bir işaret (ör. `@slow`) için bir dekoratör yazıp özniteliği runner.py'de okuyun.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, TypeVar, overload

F = TypeVar("F", bound=Callable[..., Any])
SCOPES = ("test", "modul")


class SkipTest(Exception):
    """Testi atlar (gerekçesiyle)."""


class TestTimeout(Exception):
    """Test, izin verilen süreyi aştı."""

    __test__ = False  # pytest bu sınıfı test sanmasın


@overload
def fixture(fn: F) -> F: ...


@overload
def fixture(*, scope: str = "test") -> Callable[[F], F]: ...


def fixture(fn: F | None = None, *, scope: str = "test") -> F | Callable[[F], F]:
    """Fixture işaretler. Üreteç (yield) ise yield'den sonrası temizliktir.

    `scope="test"`: her test için yeniden kurulur; `scope="modul"`: dosya başına bir kez.
    """
    if scope not in SCOPES:
        raise ValueError(f"geçersiz scope {scope!r}; seçenekler: {', '.join(SCOPES)}")

    def mark(target: F) -> F:
        target.__tc_fixture__ = scope  # type: ignore[attr-defined]
        return target

    return mark(fn) if fn is not None else mark


def parametrize(
    names: str, values: Sequence[Any], ids: Sequence[str] | None = None
) -> Callable[[F], F]:
    """`@parametrize("a, b, beklenen", [(1, 2, 3), (2, 2, 4)])` — her satır ayrı bir test olur."""
    keys = [n.strip() for n in names.split(",") if n.strip()]
    rows = [tuple(v) if len(keys) > 1 else (v,) for v in values]
    for row in rows:
        if len(row) != len(keys):
            raise ValueError(
                f"parametrize: {len(keys)} ad var ama {row!r} satırında {len(row)} değer"
            )
    if ids is not None and len(ids) != len(rows):
        raise ValueError("parametrize: ids sayısı değer satırı sayısıyla aynı olmalı")

    def mark(target: F) -> F:
        cases = getattr(target, "__tc_params__", [])
        cases.append((keys, rows, list(ids) if ids else None))
        target.__tc_params__ = cases  # type: ignore[attr-defined]
        return target

    return mark


def skip(reason: str = "") -> Callable[[F], F]:
    def mark(target: F) -> F:
        target.__tc_skip__ = reason or "atlandı"  # type: ignore[attr-defined]
        return target

    return mark


def skip_now(reason: str = "") -> None:
    """Testin içinden çağrılır: `skip_now("veritabanı yok")`."""
    raise SkipTest(reason or "atlandı")


def timeout(seconds: float) -> Callable[[F], F]:
    def mark(target: F) -> F:
        target.__tc_timeout__ = seconds  # type: ignore[attr-defined]
        return target

    return mark


@dataclass
class RaisesInfo:
    value: BaseException | None = None


@contextmanager
def raises(kind: type[BaseException], match: str | None = None) -> Iterator[RaisesInfo]:
    """`with raises(ValueError, match="sıfır"):` — blokta bu tür hata çıkmazsa test kalır."""
    info = RaisesInfo()
    try:
        yield info
    except kind as exc:
        info.value = exc
        if match is not None and not re.search(match, str(exc)):
            raise AssertionError(
                f"{kind.__name__} oluştu ama ileti eşleşmedi:\n"
                f"  desen: {match!r}\n  ileti: {str(exc)!r}"
            ) from None
        return
    raise AssertionError(f"{kind.__name__} bekleniyordu ama hiçbir hata oluşmadı")
