"""Myers fark algoritması (O((N+M)·D)) ve birleşik (unified) fark çıktısı.

Myers, a'yı b'ye çeviren EN KISA düzenleme betiğini (en az silme + ekleme) bulur: d = 0, 1, 2...
için her köşegende (k = x - y) ulaşılabilen en uzak noktayı tutar, eşleşen satırlarda "yılan" gibi
kayar. Her d adımının durumunu saklayıp sondan başa geri izleyerek betiği çıkarır. Test: betiğin
uzunluğu, LCS dinamik programlamasıyla bulunan en küçük değerle aynıdır.

Genişletme: büyük dosyalarda bellek O(D²)'dir; "ortadaki yılan" (linear space) sürümüne geçin.
Git'in "indent" ve "patience" sezgileri okunurluğu artırır ama en kısalığı değiştirmez.
"""

from __future__ import annotations

from collections.abc import Sequence

Edit = tuple[str, int | None, int | None]  # ("=", i, j) | ("-", i, None) | ("+", None, j)


def edit_script(a: Sequence[bytes], b: Sequence[bytes]) -> list[Edit]:
    n, m = len(a), len(b)
    if n == 0 and m == 0:
        return []
    frontier: dict[int, int] = {1: 0}  # köşegen k → ulaşılan en büyük x
    trace: list[dict[int, int]] = []
    for d in range(n + m + 1):
        trace.append(dict(frontier))
        for k in range(-d, d + 1, 2):
            if k == -d or (k != d and frontier[k - 1] < frontier[k + 1]):
                x = frontier[k + 1]  # aşağı: b'den ekleme
            else:
                x = frontier[k - 1] + 1  # sağa: a'dan silme
            y = x - k
            while x < n and y < m and a[x] == b[y]:  # yılan: eşleşen satırlar bedava
                x, y = x + 1, y + 1
            frontier[k] = x
            if x >= n and y >= m:
                return _backtrack(trace, n, m)
    raise AssertionError("ulaşılamaz: d en çok n + m olabilir")


def _backtrack(trace: list[dict[int, int]], n: int, m: int) -> list[Edit]:
    x, y = n, m
    edits: list[Edit] = []
    for d in range(len(trace) - 1, -1, -1):
        frontier = trace[d]
        k = x - y
        down = k == -d or (k != d and frontier.get(k - 1, -1) < frontier.get(k + 1, -1))
        previous_k = k + 1 if down else k - 1
        previous_x = frontier.get(previous_k, 0)
        previous_y = previous_x - previous_k
        while x > previous_x and y > previous_y:
            edits.append(("=", x - 1, y - 1))
            x, y = x - 1, y - 1
        if d > 0:
            edits.append(("+", None, y - 1) if down else ("-", x - 1, None))
        x, y = previous_x, previous_y
    edits.reverse()
    return edits


def _range(start: int, length: int) -> str:
    """Birleşik fark aralığı: 1 satırsa yalnız başlangıç, boşsa bir önceki satır."""
    if length == 1:
        return str(start + 1)
    return f"{start + 1 if length else start},{length}"


def unified_diff(
    a: Sequence[bytes], b: Sequence[bytes], a_name: str, b_name: str, context: int = 3
) -> list[str]:
    """`git diff` benzeri satırlar (sondaki satır sonları olmadan)."""
    script = edit_script(a, b)
    changes = [i for i, (op, _, _) in enumerate(script) if op != "="]
    if not changes:
        return []
    groups: list[list[int]] = []
    for i in changes:
        low, high = max(0, i - context), min(len(script), i + context + 1)
        if groups and low <= groups[-1][1]:
            groups[-1][1] = max(groups[-1][1], high)
        else:
            groups.append([low, high])
    lines = [f"--- {a_name}", f"+++ {b_name}"]
    for low, high in groups:
        a_before = sum(op != "+" for op, _, _ in script[:low])
        b_before = sum(op != "-" for op, _, _ in script[:low])
        part = script[low:high]
        a_count = sum(op != "+" for op, _, _ in part)
        b_count = sum(op != "-" for op, _, _ in part)
        lines.append(f"@@ -{_range(a_before, a_count)} +{_range(b_before, b_count)} @@")
        for op, left, right in part:
            text = a[left] if left is not None else b[right if right is not None else 0]
            symbol = " " if op == "=" else op
            lines.append(symbol + text.decode("utf-8", errors="replace").rstrip("\n"))
            if not text.endswith(b"\n"):
                lines.append("\\ No newline at end of file")
    return lines


def lcs_length(a: Sequence[bytes], b: Sequence[bytes]) -> int:
    """En uzun ortak alt dizi uzunluğu (O(N·M) başvuru; testler Myers'i bununla sınar)."""
    previous = [0] * (len(b) + 1)
    for item in a:
        current = [0]
        for j, other in enumerate(b):
            current.append(previous[j] + 1 if item == other else max(previous[j + 1], current[j]))
        previous = current
    return previous[-1]
