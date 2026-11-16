"""Rabin-Karp: kayan karma ile desen arama; aynı uzunlukta çok sayıda deseni tek geçişte arar.

Fikir:
    m uzunluklu her pencerenin karması bir çok terimli olarak hesaplanır:
        H(s[i:i+m]) = s[i]·B^(m−1) + … + s[i+m−1]   (mod P).
    Pencere bir sağa kayınca karma O(1)'de güncellenir: baştaki karakterin katkısı çıkarılır,
    kalan B ile çarpılır, yeni karakter eklenir. Karmalar eşitse (çakışma olabilir!) gerçek
    karşılaştırma yapılır; bu yüzden sonuç her zaman doğrudur, yalnız süre şansa bağlıdır.
    P = 2^61 − 1 (Mersenne asalı) ve sabit bir taban seçildi: sonuç her çalıştırmada aynıdır.
    Saldırgan girdide çakışma üretilebilir; o durumda tabanı rastgele seçin (`base` parametresi).

Karmaşıklık: zaman beklenen O(n + m · eşleşme), en kötü O(n · m); yer O(1) (çoklu: O(k))
Ne zaman: aynı uzunlukta çok sayıda desen (intihal tespiti, k-mer arama), 2B desen arama,
    alt dizgi eşitliğini O(1)'de sınamak (önek karmalarıyla).
Ne zaman değil: tek desen için en kötü durum güvencesi gerekiyorsa `kmp.py`.
Bağımlılık: yok
Genişletme: farklı uzunluklu desenler için her uzunluk grubunda ayrı bir geçiş yapın ya da
    `aho_corasick.py` kullanın.

Örnek:
    >>> rabin_karp_search("abracadabra", "abra")
    [0, 7]
    >>> rabin_karp_multi("kediköpekkuş", ["kuş", "ked", "köp"])
    [(0, 1), (4, 2), (9, 0)]
"""

from __future__ import annotations

from collections.abc import Sequence

_MOD = (1 << 61) - 1
_BASE = 1_000_003


def _hash(chunk: str, base: int) -> int:
    value = 0
    for char in chunk:
        value = (value * base + ord(char)) % _MOD
    return value


def _windows(text: str, m: int, base: int) -> list[int]:
    """Her m uzunluklu pencerenin karması (kayarak)."""
    if m > len(text):
        return []
    high = pow(base, m - 1, _MOD)  # baştaki karakterin ağırlığı
    current = _hash(text[:m], base)
    hashes = [current]
    for i in range(m, len(text)):
        current = (current - ord(text[i - m]) * high) % _MOD
        current = (current * base + ord(text[i])) % _MOD
        hashes.append(current)
    return hashes


def rabin_karp_search(text: str, pattern: str, base: int = _BASE) -> list[int]:
    """Desenin tüm başlangıç konumları (çakışanlar dahil). Boş desen: her konum."""
    m = len(pattern)
    if m == 0:
        return list(range(len(text) + 1))
    target = _hash(pattern, base)
    return [
        i
        for i, h in enumerate(_windows(text, m, base))
        if h == target and text[i : i + m] == pattern  # karma eşitliği yetmez: doğrula
    ]


def rabin_karp_multi(
    text: str, patterns: Sequence[str], base: int = _BASE
) -> list[tuple[int, int]]:
    """Aynı uzunluktaki desenlerin tüm geçişleri: (konum, desen dizini), konuma göre sıralı."""
    if not patterns:
        return []
    m = len(patterns[0])
    if m == 0 or any(len(p) != m for p in patterns):
        raise ValueError("tüm desenler aynı (sıfırdan büyük) uzunlukta olmalı")
    by_hash: dict[int, list[int]] = {}
    for index, pattern in enumerate(patterns):
        by_hash.setdefault(_hash(pattern, base), []).append(index)
    found = []
    for i, h in enumerate(_windows(text, m, base)):
        for index in by_hash.get(h, ()):
            if text[i : i + m] == patterns[index]:
                found.append((i, index))
    return found
