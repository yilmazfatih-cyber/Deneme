"""Çokgen alanı (ayakkabı bağı formülü), yön ve Pick teoremiyle kafes noktası sayımı.

Fikir:
    Köşeleri sırayla (x0, y0) … (x_{n−1}, y_{n−1}) olan basit çokgenin işaretli alanının iki katı:
        2A = Σ (x_i · y_{i+1} − x_{i+1} · y_i)   (indisler mod n).
    Her terim, orijin ve bir kenarın oluşturduğu üçgenin işaretli alanıdır; çokgen dışındaki
    parçalar birbirini götürür. İşaret yönü verir: pozitif → saat yönünün tersi.
    Tam sayı koordinatta 2A tam sayıdır (kesin); alanı yarım birim kesinlikle `Fraction` verir.
    Pick teoremi (köşeleri kafes noktalarında olan basit çokgen): A = I + B/2 − 1; sınırdaki
    nokta sayısı B, her kenar için ebob(|dx|, |dy|) toplamıdır; böylece içteki nokta sayısı
    I = A − B/2 + 1 tek tek saymadan bulunur.

Karmaşıklık: O(n); yer O(1)
Ne zaman: arsa/harita alanı, çokgen yönü (saat yönü mü), içteki tam sayı nokta sayısı.
Ne zaman değil: kendini kesen çokgenlerde formül "net" (işaretli bölgelerin toplamı) alan verir.
Bağımlılık: yok
Genişletme: ağırlık merkezi = Σ (x_i + x_{i+1})·terim_i / (6A) (y için aynısı).

Örnek:
    >>> square = [(0, 0), (4, 0), (4, 4), (0, 4)]
    >>> polygon_area(square), signed_area2(square[::-1]), is_counterclockwise(square)
    (Fraction(16, 1), -32, True)
    >>> boundary_lattice_points(square), interior_lattice_points(square)
    (16, 9)
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from fractions import Fraction


def signed_area2(polygon: Sequence[tuple[int, int]]) -> int:
    """İşaretli alanın İKİ katı (tam sayı koordinatta kesin); saat yönü tersi pozitif."""
    n = len(polygon)
    return sum(
        polygon[i][0] * polygon[(i + 1) % n][1] - polygon[(i + 1) % n][0] * polygon[i][1]
        for i in range(n)
    )


def polygon_area(polygon: Sequence[tuple[int, int]]) -> Fraction:
    """Alan (≥ 0), kesin kesir olarak."""
    return Fraction(abs(signed_area2(polygon)), 2)


def is_counterclockwise(polygon: Sequence[tuple[int, int]]) -> bool:
    """Köşeler saat yönünün tersine mi dizili?"""
    return signed_area2(polygon) > 0


def boundary_lattice_points(polygon: Sequence[tuple[int, int]]) -> int:
    """Sınırdaki tam sayı koordinatlı nokta sayısı (köşeler dahil)."""
    n = len(polygon)
    return sum(
        math.gcd(polygon[(i + 1) % n][0] - polygon[i][0], polygon[(i + 1) % n][1] - polygon[i][1])
        for i in range(n)
    )


def interior_lattice_points(polygon: Sequence[tuple[int, int]]) -> int:
    """Pick teoremi: içteki (sınırda olmayan) tam sayı noktaların sayısı."""
    return (abs(signed_area2(polygon)) - boundary_lattice_points(polygon) + 2) // 2
