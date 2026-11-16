"""Z algoritması: her konumdan başlayan parçanın dizgi başıyla örtüşme boyunu O(n)'de bulur.

Fikir:
    z[i] = s ile s[i:]'nin en uzun ortak öneki (z[0] = n kabul edilir). [l, r) şimdiye kadar
    bulunan ve en sağa uzanan "baş ile örtüşen pencere"dir. i < r ise s[i:r] parçası s[i−l:r−l]
    ile aynıdır, dolayısıyla z[i] en az min(r − i, z[i − l])'dir; oradan karakter karakter
    uzatılır. r yalnız ileri gittiği için toplam iş O(n).
    Desen arama: desen + AYRAÇ + metin dizisinin Z'si alınır; z değeri desen uzunluğuna eşit
    olan konumlar eşleşmedir. Ayraç olarak hiçbir karakterle çakışmayan −1 kullanılır (dizgi
    kod noktalarına çevrilir), böylece metinde hangi karakter olursa olsun güvenlidir.

Karmaşıklık: zaman O(n + m); yer O(n + m)
Ne zaman: desen arama, bir dizginin tüm periyotları, "s'nin her sonekinin baştaki eşleşmesi"
    soruları; KMP'den daha kolay akılda kalır.
Ne zaman değil: akış hâlinde (metnin tamamı elde değilken) arama için KMP (`kmp.py`).
Bağımlılık: yok
Genişletme: dizgi periyodu: z[p] + p == n olan en küçük p.

Örnek:
    >>> z_function("aabxaab")
    [7, 1, 0, 0, 3, 1, 0]
    >>> z_search("bir iki bir", "bir")
    [0, 8]
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def z_function(s: Sequence[T]) -> list[int]:
    """z[i] = LCP(s, s[i:]); z[0] = len(s)."""
    n = len(s)
    z = [0] * n
    if n:
        z[0] = n
    left = right = 0  # [left, right): baş ile örtüşen, en sağa uzanan pencere
    for i in range(1, n):
        if i < right:
            z[i] = min(right - i, z[i - left])
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1
        if i + z[i] > right:
            left, right = i, i + z[i]
    return z


def z_search(text: str, pattern: str) -> list[int]:
    """Desenin metindeki tüm başlangıç konumları (çakışanlar dahil). Boş desen: her konum."""
    if not pattern:
        return list(range(len(text) + 1))
    # Ayraç −1 hiçbir karakterin kod noktasına eşit olamaz: metinde ne olursa olsun güvenli.
    combined = [ord(c) for c in pattern] + [-1] + [ord(c) for c in text]
    z = z_function(combined)
    m = len(pattern)
    return [i - m - 1 for i in range(m + 1, len(combined)) if z[i] >= m]
