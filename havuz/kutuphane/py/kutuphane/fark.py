"""fark — iki şeyin farkı: dizi farkı (Myers algoritması; en kısa düzenleme), satır bazlı metin farkı ve GNU
biçiminde birleşik fark (unified diff), nesne farkı (derin, yol listesiyle), anahtarlı kayıt listesi farkı.
TypeScript eşiyle aynı eşitlik kuralı ve aynı sonuç (vektorler/fark.json).

Kullanım:
    diff_lines("a\nb\nc", "a\nB\nc")        # [DiffOp("equal", ["a"]), DiffOp("delete", ["b"]), DiffOp("insert", ["B"]), …]
    unified_diff(eski, yeni, from_file="eski.txt", to_file="yeni.txt")   # "--- eski.txt\n+++ yeni.txt\n@@ -1,3 +1,3 @@…"
    diff_objects({"a": 1, "b": {"c": 2}}, {"a": 1, "b": {"c": 3}})   # [ObjectChange(["b","c"], "changed", 2, 3)]
    diff_by_key(eski_liste, yeni_liste, key=lambda k: k["id"])       # ByKeyDiff(added, removed, changed, unchanged)

Sınırlar: Myers O((N+M)·D) zaman ve bellek kullanır; çok uzun ve çok farklı metinde yavaşlar (difflib daha hızlı ama
en kısa farkı garanti etmez). Diziler nesne farkında SIRAYLA karşılaştırılır; taşınan öğe "değişti" görünür
(diff_by_key kullanın). Metinde satır sonları "\n"e çevrilir. True ile 1 farklı sayılır (TypeScript'teki gibi).

Genişletme: Yeni fark türü `diff_sequences` üstüne kurulur; TypeScript eşine aynı eşitlik kuralıyla eklenir.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Hashable, Sequence
from dataclasses import dataclass, field
from typing import Any, Generic, Literal, TypeVar

__all__ = [
    "ByKeyDiff",
    "Changed",
    "DiffOp",
    "ObjectChange",
    "diff_by_key",
    "diff_lines",
    "diff_objects",
    "diff_sequences",
    "unified_diff",
]

T = TypeVar("T")
_MISSING: Any = object()


@dataclass
class DiffOp(Generic[T]):
    type: Literal["equal", "delete", "insert"]
    items: list[T]


@dataclass(frozen=True)
class ObjectChange:
    path: list[str | int]
    kind: Literal["added", "removed", "changed"]
    before: Any = _MISSING
    after: Any = _MISSING


@dataclass(frozen=True)
class Changed(Generic[T]):
    before: T
    after: T


@dataclass
class ByKeyDiff(Generic[T]):
    added: list[T] = field(default_factory=list)
    removed: list[T] = field(default_factory=list)
    changed: list[Changed[T]] = field(default_factory=list)
    unchanged: list[T] = field(default_factory=list)


def _same(a: Any, b: Any) -> bool:
    """JS Object.is benzeri eşitlik: tür de aynı olmalı; NaN kendine eşit; 0 ile -0 eşit sayılır."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b):
        return True
    if isinstance(a, int | float) and isinstance(b, int | float):
        return a == b
    return type(a) is type(b) and a == b


def diff_sequences(
    a: Sequence[T], b: Sequence[T], equals: Callable[[T, T], bool] = _same
) -> list[DiffOp[T]]:
    """Myers algoritmasıyla en kısa düzenleme betiği; ardışık aynı türdeki işlemler birleştirilir."""
    n, m = len(a), len(b)
    max_d = n + m
    offset = max_d + 1
    v = [0] * (2 * max_d + 3)
    trace: list[list[int]] = []
    done = False
    for d in range(max_d + 1):
        trace.append(v.copy())
        for k in range(-d, d + 1, 2):
            down = k == -d or (k != d and v[offset + k - 1] < v[offset + k + 1])
            x = v[offset + k + 1] if down else v[offset + k - 1] + 1
            y = x - k
            while x < n and y < m and equals(a[x], b[y]):
                x += 1
                y += 1
            v[offset + k] = x
            if x >= n and y >= m:
                done = True
                break
        if done:
            break
    ops: list[tuple[str, T]] = []
    x, y = n, m
    for d in range(len(trace) - 1, -1, -1):
        vd = trace[d]
        k = x - y
        down = k == -d or (k != d and vd[offset + k - 1] < vd[offset + k + 1])
        prev_k = k + 1 if down else k - 1
        prev_x = vd[offset + prev_k]
        prev_y = prev_x - prev_k
        while x > prev_x and y > prev_y:
            ops.append(("equal", a[x - 1]))
            x -= 1
            y -= 1
        if d > 0:
            ops.append(("insert", b[y - 1]) if down else ("delete", a[x - 1]))
            x, y = prev_x, prev_y
    ops.reverse()
    merged: list[DiffOp[T]] = []
    for kind, item in ops:
        if merged and merged[-1].type == kind:
            merged[-1].items.append(item)
        else:
            merged.append(DiffOp(kind, [item]))  # type: ignore[arg-type]
    return merged


def _split_lines(text: str) -> list[str]:
    if text == "":
        return []
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    if normalized.endswith("\n"):
        lines.pop()
    return lines


def diff_lines(a: str, b: str) -> list[DiffOp[str]]:
    """Satır bazlı metin farkı."""
    return diff_sequences(_split_lines(a), _split_lines(b))


def _range(start: int, count: int) -> str:
    if count == 1:
        return str(start)
    return f"{start - 1 if count == 0 else start},{count}"


def unified_diff(
    a: str, b: str, *, context: int = 3, from_file: str = "a", to_file: str = "b"
) -> str:
    """GNU biçiminde birleşik fark (unified diff); fark yoksa boş metin."""
    lines: list[tuple[str, str, int, int]] = []
    a_line = b_line = 1
    for op in diff_lines(a, b):
        tag = " " if op.type == "equal" else "-" if op.type == "delete" else "+"
        for text in op.items:
            lines.append((tag, text, a_line, b_line))
            if tag != "+":
                a_line += 1
            if tag != "-":
                b_line += 1
    changed = [i for i, line in enumerate(lines) if line[0] != " "]
    if not changed:
        return ""
    out = [f"--- {from_file}", f"+++ {to_file}"]
    i = 0
    while i < len(changed):
        first = last = changed[i]
        while i + 1 < len(changed) and changed[i + 1] - last <= 2 * context + 1:
            i += 1
            last = changed[i]
        i += 1
        hunk = lines[max(0, first - context) : min(len(lines), last + context + 1)]
        a_count = sum(1 for line in hunk if line[0] != "+")
        b_count = sum(1 for line in hunk if line[0] != "-")
        out.append(f"@@ -{_range(hunk[0][2], a_count)} +{_range(hunk[0][3], b_count)} @@")
        out.extend(tag + text for tag, text, _, _ in hunk)
    return "\n".join(out) + "\n"


def diff_objects(
    before: Any, after: Any, path: list[str | int] | None = None
) -> list[ObjectChange]:
    """Derin nesne farkı: yollarıyla eklenen, silinen, değişen alanlar. Listeler indeksle karşılaştırılır."""
    here: list[str | int] = path or []
    if isinstance(before, dict) and isinstance(after, dict):
        changes: list[ObjectChange] = []
        for key in before:
            if key not in after:
                changes.append(ObjectChange([*here, key], "removed", before=before[key]))
            else:
                changes += diff_objects(before[key], after[key], [*here, key])
        for key in after:
            if key not in before:
                changes.append(ObjectChange([*here, key], "added", after=after[key]))
        return changes
    if isinstance(before, list) and isinstance(after, list):
        changes = []
        for i in range(max(len(before), len(after))):
            if i >= len(after):
                changes.append(ObjectChange([*here, i], "removed", before=before[i]))
            elif i >= len(before):
                changes.append(ObjectChange([*here, i], "added", after=after[i]))
            else:
                changes += diff_objects(before[i], after[i], [*here, i])
        return changes
    return [] if _same(before, after) else [ObjectChange(here, "changed", before, after)]


def diff_by_key(
    before: Sequence[T], after: Sequence[T], key: Callable[[T], Hashable]
) -> ByKeyDiff[T]:
    """Anahtarlı kayıt listelerinin farkı (ör. id'ye göre): eklenen, silinen, değişen (derin), değişmeyen."""
    old = {key(item): item for item in before}
    new_keys = {key(item) for item in after}
    result: ByKeyDiff[T] = ByKeyDiff()
    for item in after:
        previous = old.get(key(item), _MISSING)
        if previous is _MISSING:
            result.added.append(item)
        elif diff_objects(previous, item):
            result.changed.append(Changed(previous, item))
        else:
            result.unchanged.append(item)
    result.removed = [item for item in before if key(item) not in new_keys]
    return result
