"""Yönelim testi: üç nokta saat yönü tersine mi, saat yönünde mi, doğrusal mı? (+ float notu)

Fikir:
    cross(o, a, b) = (a − o) × (b − o) = (a.x − o.x)(b.y − o.y) − (a.y − o.y)(b.x − o.x).
    Pozitifse o → a → b sola döner (saat yönü tersi), negatifse sağa, sıfırsa doğrusaldır;
    mutlak değeri üçgen alanının iki katıdır. Örtü, kesişim, nokta-çokgen bunun üstüne kurulur.
    KAYAN NOKTA TUZAĞI: float ile neredeyse doğrusal noktalarda işaret YANLIŞ çıkabilir (testte
    (0.1, 0.3), (0.2, 0.6), (0.3, 0.9) "sola dönüş" görünür); sonuç tutarsız kararlar ve çöken
    örtü/kesişim kodudur. Çare: koordinatları tam sayı ya da `Fraction` tutun (buradaki işlevler
    onlarla KESİN); float zorunluysa ölçekli eps kullanın (`orientation_eps`); `==` ile float
    karşılaştırmayın.

Karmaşıklık: her test O(1); yer O(1)
Ne zaman: her türlü 2B geometri kararında; "sol mu sağ mı", "aynı doğruda mı".
Ne zaman değil: 3B'de yönelim için 3×3 determinant (dört nokta) gerekir.
Bağımlılık: yok
Genişletme: çok büyük tam sayılarda Python taşmaz; başka dile taşırken 64 bit taşmasına dikkat
    (|koordinat| ≤ 10⁹ ise çarpımlar 2·10¹⁸'e sığar).

Örnek:
    >>> a, b = (0, 0), (4, 0)
    >>> orientation(a, b, (2, 3)), orientation(a, b, (2, -1)), orientation(a, b, (9, 0))
    (1, -1, 0)
    >>> on_segment((2, 2), (0, 0), (4, 4)), on_segment((5, 5), (0, 0), (4, 4))
    (True, False)
"""

from __future__ import annotations

from fractions import Fraction

Number = int | float | Fraction
Point = tuple[Number, Number]


def cross(o: Point, a: Point, b: Point) -> Number:
    """(a − o) × (b − o): üçgen alanının iki katı, işaretli."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def orientation(a: Point, b: Point, c: Point) -> int:
    """+1 sola dönüş (saat yönü tersi), −1 sağa, 0 doğrusal. Tam sayı/Fraction ile kesin."""
    value = cross(a, b, c)
    return (value > 0) - (value < 0)


def orientation_eps(a: Point, b: Point, c: Point, eps: float = 1e-9) -> int:
    """Float koordinatlar için: |cross| ≤ eps · ölçek ise doğrusal say (sezgisel güvenlik payı)."""
    value = float(cross(a, b, c))
    span_b = abs(float(b[0] - a[0])) + abs(float(b[1] - a[1]))
    span_c = abs(float(c[0] - a[0])) + abs(float(c[1] - a[1]))
    scale = max(span_b, span_c, 1.0)
    if abs(value) <= eps * scale * scale:
        return 0
    return 1 if value > 0 else -1


def on_segment(p: Point, a: Point, b: Point) -> bool:
    """p, [a, b] doğru parçasının üstünde mi (uçlar dahil)?"""
    return (
        orientation(a, b, p) == 0
        and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
        and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])
    )
