"""derin — derin eşitlik, derin kopya, derin birleştirme ve yol ile okuma/yazma (sözlük/liste ağaçları için).

Kullanım:
    deep_equal({"a": [1, {"b": float("nan")}]}, {"a": [1, {"b": float("nan")}]})   # True (NaN kendine eşit)
    deep_equal(1, True)                                    # False (Python'da 1 == True; burada tür de bakılır)
    kopya = deep_clone(durum)                              # iç içe nesneler paylaşılmaz (döngüler korunur)
    deep_merge(varsayilan_ayar, kullanici_ayari)           # yeni sözlük; listeler varsayılan olarak değiştirilir
    get_path(ayar, "sunucu.kapilar.0", 8080)               # yoksa varsayılan
    set_path(durum, ["kullanici", "ad"], "Ayşe")           # DEĞİŞTİRMEZ: yeni sözlük döndürür

Sınırlar: deep_clone `copy.deepcopy` kullanır (sınıf örnekleri de kopyalanır; TypeScript eşinden farkı budur).
deep_equal'da dict anahtar sırası önemsizdir, list/tuple ayrı türdür, set içerikçe karşılaştırılır. Döngüsel yapılar
deep_equal'da desteklenir. Python'da `deep_freeze` yoktur (types.MappingProxyType ya da frozen dataclass kullanın).

Genişletme: Yeni tür desteği `_equal` ve `deep_merge` içinde aynı sırayla bir `if` dalı olarak eklenir.
"""

from __future__ import annotations

import copy
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any, TypeVar

__all__ = ["deep_clone", "deep_equal", "deep_merge", "get_path", "set_path"]

T = TypeVar("T")
_FORBIDDEN_KEYS = frozenset({"__proto__", "constructor", "prototype"})


def deep_equal(a: Any, b: Any) -> bool:
    """Derin eşitlik: tür de karşılaştırılır (1 ≠ True ≠ 1.0 değil: 1 == 1.0 sayılır), NaN kendine eşittir."""
    return _equal(a, b, set())


def _equal(a: Any, b: Any, seen: set[tuple[int, int]]) -> bool:
    if a is b:
        return True
    if isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b):
        return True
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, int | float) and isinstance(b, int | float):
        return a == b
    if type(a) is not type(b):
        return False
    pair = (id(a), id(b))
    if pair in seen:
        return True
    if isinstance(a, dict):
        seen.add(pair)
        return a.keys() == b.keys() and all(_equal(a[k], b[k], seen) for k in a)
    if isinstance(a, list | tuple):
        seen.add(pair)
        return len(a) == len(b) and all(_equal(x, y, seen) for x, y in zip(a, b, strict=True))
    return bool(a == b)


def deep_clone(value: T) -> T:
    """Derin kopya (döngüsel başvurular korunur)."""
    return copy.deepcopy(value)


def deep_merge(
    target: Mapping[str, Any], source: Mapping[str, Any], *, arrays: str = "replace"
) -> dict[str, Any]:
    """Sözlükleri derin birleştirir; YENİ sözlük döner. Sonraki kaynak öncekini ezer.

    `arrays="replace"` (varsayılan) listeyi değiştirir, "concat" uç uca ekler. __proto__ gibi anahtarlar atlanır
    (JSON'dan gelen veri TypeScript tarafına geçerse prototip kirletmesin diye iki dilde de aynı kural).
    """
    result: dict[str, Any] = copy.deepcopy(dict(target))
    for key, value in source.items():
        if key in _FORBIDDEN_KEYS:
            continue
        current = result.get(key)
        if isinstance(current, Mapping) and isinstance(value, Mapping):
            result[key] = deep_merge(current, value, arrays=arrays)
        elif isinstance(current, list) and isinstance(value, list) and arrays == "concat":
            result[key] = current + copy.deepcopy(value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def _to_path(path: str | Sequence[str | int]) -> list[str | int]:
    if not isinstance(path, str):
        return list(path)
    if path == "":
        return []
    return [int(part) if re.fullmatch("0|[1-9][0-9]*", part) else part for part in path.split(".")]


def get_path(value: Any, path: str | Sequence[str | int], fallback: Any = None) -> Any:
    """Yoldaki değeri okur: get_path(o, "a.b.0") ya da get_path(o, ["a", "b", 0]). Yoksa `fallback`."""
    current = value
    for part in _to_path(path):
        if isinstance(current, Mapping):
            if part in current:
                current = current[part]
            elif isinstance(part, int) and str(part) in current:
                current = current[str(part)]  # JSON nesnesinde "0" anahtarı
            else:
                return fallback
        elif (
            isinstance(current, list | tuple) and isinstance(part, int) and 0 <= part < len(current)
        ):
            current = current[part]
        else:
            return fallback
    return current


def set_path(value: Any, path: str | Sequence[str | int], new_value: Any) -> Any:
    """Yoldaki değeri yazılmış YENİ bir kopya döndürür; ara sözlük/liste yoksa oluşturulur (sayı anahtar → liste)."""
    parts = _to_path(path)
    if not parts:
        return new_value
    head, rest = parts[0], parts[1:]
    if isinstance(head, str) and head in _FORBIDDEN_KEYS:
        raise TypeError(f'"{head}" anahtarına yazılamaz.')
    if isinstance(value, list) and isinstance(head, int):
        container: Any = list(value)
        while len(container) <= head:
            container.append(None)
    elif isinstance(value, Mapping):
        container = dict(value)
    elif isinstance(head, int):
        container = [None] * (head + 1)
    else:
        container = {}
    if isinstance(container, list) and isinstance(head, int):
        child = container[head]
    else:
        child = container.get(head) if isinstance(container, dict) else None
    container[head] = new_value if not rest else set_path(child, rest, new_value)
    return container
