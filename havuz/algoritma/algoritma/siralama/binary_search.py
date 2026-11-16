"""İkili arama çeşitleri: alt/üst sınır, ilk/son konum, yanıt üzerinde arama, gerçel sayıda arama.

Fikir:
    Sıralı dizide aranan değer ortadaki öğeyle karşılaştırılır ve aramanın yarısı atılır.
    Hatasız yazmanın sırrı DEĞİŞMEZİ açıkça tutmaktır. Burada hep yarı açık [lo, hi) aralığı
    kullanılır ve değişmez şudur: "yanıt [lo, hi] içinde; lo'dan öncekiler koşulu sağlamaz,
    hi ve sonrası sağlar". Döngü lo == hi olunca biter; yanıt lo'dur.
    Genel biçim `first_true`: F F F T T T gibi tekdüze bir yüklemde ilk T'yi bulur. Alt sınır,
    üst sınır, ilk/son konum ve "yanıt üzerinde ikili arama" hep bunun özel hâlleridir.
    `bisect_real` gerçel sayılarda aynı işi sabit tur sayısıyla yapar (kayan noktada `lo < hi`
    koşuluna güvenmek sonsuz döngüye sokabilir).

Karmaşıklık: zaman O(log n) karşılaştırma (yüklem için O(log(hi − lo)) çağrı); yer O(1)
Ne zaman: sıralı dizide arama; "en küçük yeterli değer" sorularında yanıt üzerinde arama.
Ne zaman değil: dizi sıralı değilse (önce sıralamak O(n log n)); tek seferlik aramada
    doğrusal tarama yeter. Gerçek kodda `bisect` modülü bu dosyadaki ilk iki işlevin karşılığıdır.
Bağımlılık: yok
Genişletme: azalan dizide aramak için yüklemi tersine çevirin (`lambda i: a[i] <= x`).

Örnek:
    >>> a = [1, 2, 2, 2, 5, 8]
    >>> lower_bound(a, 2), upper_bound(a, 2), find_first(a, 2), find_last(a, 2), find_first(a, 3)
    (1, 4, 1, 3, -1)
    >>> first_true(0, 100, lambda x: x * x >= 50)
    8
    >>> round(bisect_real(0.0, 2.0, lambda x: x * x >= 2.0), 9)
    1.414213562
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, Protocol, TypeVar


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_Comparable)


def first_true(lo: int, hi: int, predicate: Callable[[int], bool]) -> int:
    """[lo, hi) içinde predicate'in doğru olduğu ilk tam sayı; hiç yoksa hi.

    Yüklem tekdüze olmalı: bir yerde doğru olduysa sonrakilerde de doğrudur.
    """
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if predicate(mid):
            hi = mid  # yanıt mid ya da solunda
        else:
            lo = mid + 1  # mid ve solu elendi
    return lo


def lower_bound(a: Sequence[T], x: T) -> int:
    """a[i] ≥ x olan ilk i (x'in araya sokulabileceği en sol yer)."""
    return first_true(0, len(a), lambda i: not a[i] < x)


def upper_bound(a: Sequence[T], x: T) -> int:
    """a[i] > x olan ilk i (x'in araya sokulabileceği en sağ yer)."""
    return first_true(0, len(a), lambda i: x < a[i])


def find_first(a: Sequence[T], x: T) -> int:
    """x'in ilk geçtiği konum; yoksa −1."""
    i = lower_bound(a, x)
    return i if i < len(a) and not x < a[i] else -1


def find_last(a: Sequence[T], x: T) -> int:
    """x'in son geçtiği konum; yoksa −1."""
    i = upper_bound(a, x) - 1
    return i if i >= 0 and not a[i] < x else -1


def bisect_real(
    lo: float, hi: float, predicate: Callable[[float], bool], iterations: int = 100
) -> float:
    """[lo, hi] gerçel aralığında predicate'in doğru olduğu en küçük değere yaklaşır.

    Her tur aralığı yarıya indirir; 100 tur, 64 bit kayan noktanın tüm duyarlığını tüketir.
    """
    for _ in range(iterations):
        mid = (lo + hi) / 2
        if predicate(mid):
            hi = mid
        else:
            lo = mid
    return hi
