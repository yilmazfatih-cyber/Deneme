"""Birleşik fark (unified diff) üretimi: `diff -u` / `git diff` biçimi.

Satırlar sonlarındaki "\\n" ile birlikte tutulur (`splitlines(keepends=True)`). Değişiklikler
etraflarında `context` kadar bağlam satırıyla parçalara (hunk) gruplanır; aralarında 2×bağlam'dan
uzun değişmemiş bölge varsa yeni parça başlar (difflib ile aynı kural). Son satırda satır sonu
yoksa GNU biçiminde `\\ No newline at end of file` işareti yazılır (difflib yazmaz; yama
gidiş-dönüşü için gereklidir).
Genişletme: renkli çıktı için `unified_diff` satırlarını öneklerine göre boyayan bir sarmalayıcı
yazın.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence

from .myers import Opcode, opcodes

NO_NEWLINE = "\\ No newline at end of file\n"


def grouped(codes: list[Opcode], context: int) -> Iterator[list[Opcode]]:
    """Değişiklikleri bağlamlı gruplara ayırır (difflib.get_grouped_opcodes ile aynı mantık)."""
    if not codes:
        codes = [("equal", 0, 1, 0, 1)]
    if codes[0][0] == "equal":
        tag, i1, i2, j1, j2 = codes[0]
        codes[0] = (tag, max(i1, i2 - context), i2, max(j1, j2 - context), j2)
    if codes[-1][0] == "equal":
        tag, i1, i2, j1, j2 = codes[-1]
        codes[-1] = (tag, i1, min(i2, i1 + context), j1, min(j2, j1 + context))
    group: list[Opcode] = []
    for tag, i1, i2, j1, j2 in codes:
        if tag == "equal" and i2 - i1 > 2 * context:
            group.append((tag, i1, min(i2, i1 + context), j1, min(j2, j1 + context)))
            yield group
            group = []
            i1, j1 = max(i1, i2 - context), max(j1, j2 - context)
        group.append((tag, i1, i2, j1, j2))
    if group and not (len(group) == 1 and group[0][0] == "equal"):
        yield group


def hunk_range(start: int, stop: int) -> str:
    """`@@ -3,4 …` aralığı: 1'den başlar; tek satırda uzunluk yazılmaz; boş aralık bir öncekidir."""
    length = stop - start
    if length == 1:
        return str(start + 1)
    return f"{start if length == 0 else start + 1},{length}"


def emit(prefix: str, line: str) -> list[str]:
    if line.endswith("\n"):
        return [prefix + line]
    return [prefix + line + "\n", NO_NEWLINE]


def unified_diff(
    a: Sequence[str],
    b: Sequence[str],
    fromfile: str = "a",
    tofile: str = "b",
    context: int = 3,
) -> list[str]:
    """Satır listelerinden birleşik fark satırları üretir (fark yoksa boş liste)."""
    out: list[str] = []
    for group in grouped(opcodes(a, b), context):
        if not out:
            out += [f"--- {fromfile}\n", f"+++ {tofile}\n"]
        first, last = group[0], group[-1]
        out.append(f"@@ -{hunk_range(first[1], last[2])} +{hunk_range(first[3], last[4])} @@\n")
        for tag, i1, i2, j1, j2 in group:
            if tag == "equal":
                for line in a[i1:i2]:
                    out += emit(" ", line)
                continue
            if tag in ("replace", "delete"):
                for line in a[i1:i2]:
                    out += emit("-", line)
            if tag in ("replace", "insert"):
                for line in b[j1:j2]:
                    out += emit("+", line)
    return out


def diff_text(old: str, new: str, fromfile: str = "a", tofile: str = "b", context: int = 3) -> str:
    """İki metnin birleşik farkı (tek dizgi)."""
    lines = unified_diff(old.splitlines(True), new.splitlines(True), fromfile, tofile, context)
    return "".join(lines)
