"""sonuc modülünün testi."""

from __future__ import annotations

import asyncio
import json

import pytest

from kutuphane.sonuc import (
    Err,
    Ok,
    Result,
    UnwrapError,
    and_then,
    combine,
    err,
    fold,
    is_err,
    is_ok,
    map_err,
    map_ok,
    ok,
    partition,
    try_catch,
    try_catch_async,
    unwrap,
    unwrap_or,
)


def _divide(a: float, b: float) -> Result[float, str]:
    return err("sıfıra bölme") if b == 0 else ok(a / b)


def test_ok_err_and_pattern_matching() -> None:
    result = _divide(6, 3)
    assert is_ok(result)
    assert not is_err(result)
    assert result.ok is True
    match _divide(1, 0):
        case Ok(value=value):
            pytest.fail(f"beklenmeyen değer {value}")
        case Err(error=reason):
            assert reason == "sıfıra bölme"


def test_map_and_chain_short_circuit() -> None:
    assert map_ok(_divide(6, 3), lambda v: v * 10) == Ok(20.0)
    assert map_ok(_divide(6, 0), lambda v: v * 10) == Err("sıfıra bölme")
    assert map_err(_divide(6, 0), len) == Err(12)
    assert and_then(_divide(12, 2), lambda v: _divide(v, 3)) == Ok(2.0)
    assert and_then(_divide(12, 0), lambda v: _divide(v, 3)) == Err("sıfıra bölme")
    assert fold(_divide(1, 0), str, lambda e: f"hata: {e}") == "hata: sıfıra bölme"


def test_unwrap() -> None:
    assert unwrap(ok(5)) == 5
    assert unwrap_or(err("x"), 7) == 7
    with pytest.raises(UnwrapError) as info:
        unwrap(err(ValueError("kötü")))
    assert isinstance(info.value.__cause__, ValueError)


def test_try_catch() -> None:
    assert try_catch(lambda: json.loads('{"a": 1}')) == Ok({"a": 1})
    bad = try_catch(lambda: json.loads("{"))
    assert isinstance(bad, Err)
    assert isinstance(bad.error, json.JSONDecodeError)

    async def fails() -> int:
        raise RuntimeError("ağ")

    async def works() -> int:
        return 3

    assert asyncio.run(try_catch_async(works)) == Ok(3)
    failed = asyncio.run(try_catch_async(fails))
    assert isinstance(failed, Err)
    assert str(failed.error) == "ağ"


def test_combine_and_partition() -> None:
    assert combine([ok(1), ok(2)]) == Ok([1, 2])
    mixed: list[Result[int, str]] = [ok(1), err("a"), ok(2), err("b")]
    assert combine(mixed) == Err("a")
    assert partition(mixed) == ([1, 2], ["a", "b"])
