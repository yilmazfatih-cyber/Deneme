"""Myers fark algoritması (doğrusal bellekli "orta yılan" sürümü) ve yardımcıları.

Fark = en kısa düzenleme betiği: en az sayıda satır silme + ekleme ile `a`'yı `b`'ye çeviren yol
(D = silinen + eklenen). Myers, düzenleme grafiğinde aynı anda baştan (ileri) ve sondan (geri)
arama yapar; iki arama bir köşegende buluşunca (orta yılan) problem ikiye bölünür ve iki yarı
özyinelemeyle çözülür: zaman O((N+M)·D), bellek O(N+M). Ortak baş/son önceden kırpılır.
`edit_distance` ayrı ve basit bir gerçeklemedir (yalnız D'yi hesaplar); testler ikisini ve kaba
kuvvet LCS'yi karşılaştırır.
Genişletme: "sabır" (patience) farkı gibi bir sezgisel eklemek için `matches` yerine geçen bir işlev
yazın; `opcodes` ve üst katmanlar değişmeden çalışır.
"""

from __future__ import annotations

from collections.abc import Hashable, Sequence

Opcode = tuple[str, int, int, int, int]  # (tür, a_baş, a_son, b_baş, b_son) — difflib biçimi


def matches(a: Sequence[Hashable], b: Sequence[Hashable]) -> list[tuple[int, int]]:
    """En uzun ortak alt dizinin eşleşen (i, j) çiftleri, artan sırada."""
    out: list[tuple[int, int]] = []
    _solve(a, b, 0, len(a), 0, len(b), out)
    return out


def _solve(
    a: Sequence[Hashable],
    b: Sequence[Hashable],
    a_lo: int,
    a_hi: int,
    b_lo: int,
    b_hi: int,
    out: list[tuple[int, int]],
) -> None:
    while a_lo < a_hi and b_lo < b_hi and a[a_lo] == b[b_lo]:  # ortak baş
        out.append((a_lo, b_lo))
        a_lo += 1
        b_lo += 1
    tail: list[tuple[int, int]] = []
    while a_lo < a_hi and b_lo < b_hi and a[a_hi - 1] == b[b_hi - 1]:  # ortak son
        a_hi -= 1
        b_hi -= 1
        tail.append((a_hi, b_hi))
    if a_lo < a_hi and b_lo < b_hi:
        split = _middle_snake(a, b, a_lo, a_hi, b_lo, b_hi)
        if split is not None:
            x, y = split
            _solve(a, b, a_lo, x, b_lo, y, out)
            _solve(a, b, x, a_hi, y, b_hi, out)
    out.extend(reversed(tail))


def _middle_snake(
    a: Sequence[Hashable], b: Sequence[Hashable], a_lo: int, a_hi: int, b_lo: int, b_hi: int
) -> tuple[int, int] | None:
    """İleri ve geri aramanın buluştuğu nokta (mutlak dizinlerle); ortak öğe yoksa None.

    diff-match-patch'in `diff_bisect`'inden uyarlanmıştır. k_*_start/end sayaçları, ızgaranın
    dışına taşan köşegenleri aramadan çıkarır (taşan değerler komşuları bozmasın diye).
    """
    n, m = a_hi - a_lo, b_hi - b_lo
    max_d = (n + m + 1) // 2
    offset = max_d
    size = 2 * max_d + 2
    forward = [-1] * size
    backward = [-1] * size
    forward[offset + 1] = 0
    backward[offset + 1] = 0
    delta = n - m
    front = delta % 2 != 0  # toplam tekse buluşma ileri adımda yakalanır
    k1_start = k1_end = k2_start = k2_end = 0
    for d in range(max_d):
        for k1 in range(-d + k1_start, d + 1 - k1_end, 2):
            i = offset + k1
            if k1 == -d or (k1 != d and forward[i - 1] < forward[i + 1]):
                x1 = forward[i + 1]  # aşağı: ekleme
            else:
                x1 = forward[i - 1] + 1  # sağa: silme
            y1 = x1 - k1
            while x1 < n and y1 < m and a[a_lo + x1] == b[b_lo + y1]:
                x1 += 1
                y1 += 1
            forward[i] = x1
            if x1 > n:
                k1_end += 2  # ızgaranın sağından taştı
            elif y1 > m:
                k1_start += 2  # ızgaranın altından taştı
            elif front:
                j = offset + delta - k1
                if 0 <= j < size and backward[j] != -1 and x1 >= n - backward[j]:
                    return a_lo + x1, b_lo + y1
        for k2 in range(-d + k2_start, d + 1 - k2_end, 2):
            i = offset + k2
            if k2 == -d or (k2 != d and backward[i - 1] < backward[i + 1]):
                x2 = backward[i + 1]
            else:
                x2 = backward[i - 1] + 1
            y2 = x2 - k2
            while x2 < n and y2 < m and a[a_hi - 1 - x2] == b[b_hi - 1 - y2]:
                x2 += 1
                y2 += 1
            backward[i] = x2
            if x2 > n:
                k2_end += 2
            elif y2 > m:
                k2_start += 2
            elif not front:
                j = offset + delta - k2
                if 0 <= j < size and forward[j] != -1:
                    x1 = forward[j]
                    if x1 >= n - x2:
                        return a_lo + x1, b_lo + x1 - (j - offset)
    return None


def opcodes(a: Sequence[Hashable], b: Sequence[Hashable]) -> list[Opcode]:
    """difflib.SequenceMatcher.get_opcodes ile aynı biçim: equal/replace/delete/insert."""
    result: list[Opcode] = []
    i = j = 0
    for mi, mj in [*matches(a, b), (len(a), len(b))]:
        if i < mi and j < mj:
            result.append(("replace", i, mi, j, mj))
        elif i < mi:
            result.append(("delete", i, mi, j, j))
        elif j < mj:
            result.append(("insert", i, i, j, mj))
        if mi < len(a) or mj < len(b):
            if result and result[-1][0] == "equal" and result[-1][2] == mi:
                tag, i1, _, j1, _ = result[-1]
                result[-1] = (tag, i1, mi + 1, j1, mj + 1)
            else:
                result.append(("equal", mi, mi + 1, mj, mj + 1))
        i, j = mi + 1, mj + 1
    return result


def matching_blocks(a: Sequence[Hashable], b: Sequence[Hashable]) -> list[tuple[int, int, int]]:
    """(i, j, uzunluk) blokları + sonda (len(a), len(b), 0) — difflib biçimi."""
    blocks = [(i1, j1, i2 - i1) for tag, i1, i2, j1, _ in opcodes(a, b) if tag == "equal"]
    return [*blocks, (len(a), len(b), 0)]


def edit_distance(a: Sequence[Hashable], b: Sequence[Hashable]) -> int:
    """Yalnız D: basit ileri Myers (O((N+M)·D) zaman, O(N+M) bellek). Testlerde çapraz denetim."""
    n, m = len(a), len(b)
    offset = n + m
    furthest = [0] * (2 * offset + 2)
    for d in range(n + m + 1):
        for k in range(-d, d + 1, 2):
            i = offset + k
            if k == -d or (k != d and furthest[i - 1] < furthest[i + 1]):
                x = furthest[i + 1]
            else:
                x = furthest[i - 1] + 1
            y = x - k
            while x < n and y < m and a[x] == b[y]:
                x += 1
                y += 1
            furthest[i] = x
            if x >= n and y >= m:
                return d
    return n + m
