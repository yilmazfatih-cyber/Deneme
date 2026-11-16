"""Çokgende nokta: nokta içeride mi, sınırda mı, dışarıda mı? (dolanım sayısı, kesin)

Fikir:
    Dolanım sayısı (winding number): çokgenin kenarları boyunca yürürken noktanın etrafında net
    kaç tur atıldığı. Sıfırdan farklıysa nokta içeridedir. Hesap için noktadan sağa doğru yatay
    bir ışın düşünülür: aşağıdan yukarı geçen ve noktanın SOLUNDA kalmayan her kenar +1, yukarıdan
    aşağı geçen −1 sayılır ("solunda mı" yönelim testiyle bulunur; bölme yok, tam sayıda kesin).
    Kenarın alt ucu dahil, üst ucu hariç sayılır; böylece ışın bir köşeden geçse bile çift
    sayım olmaz. Önce nokta herhangi bir kenarın üstünde mi diye bakılır (SINIR).
    Kendini kesen çokgenlerde de anlamlı bir yanıt verir (dolanım sayısı ≠ 0 → içeride).

Karmaşıklık: O(n) her sorgu; yer O(1)
Ne zaman: harita bölgesinde konum, tıklama hangi şeklin içinde, coğrafi sınır denetimi.
Ne zaman değil: aynı çokgende çok sayıda sorgu varsa: dışbükeyse O(log n) ikili arama, değilse
    bölgeleri ızgaraya/ağaca bölün. Küresel koordinatlarda (enlem/boylam) düzlem varsayımı bozulur.
Bağımlılık: algoritma.geometri.orientation (cross, on_segment)
Genişletme: tek-çift kuralı gerekiyorsa dönüş koşulunu `winding % 2 != 0` yapın.

Örnek:
    >>> square = [(0, 0), (4, 0), (4, 4), (0, 4)]
    >>> [point_in_polygon(p, square) for p in [(2, 2), (4, 1), (5, 2)]]  # iç, sınır, dış
    [1, 0, -1]
"""

from __future__ import annotations

from collections.abc import Sequence

from algoritma.geometri.orientation import Point, cross, on_segment

INSIDE, BOUNDARY, OUTSIDE = 1, 0, -1


def winding_number(p: Point, polygon: Sequence[Point]) -> int:
    """Çokgenin p etrafındaki net dolanım sayısı (p sınırdaysa anlamsızdır)."""
    winding = 0
    n = len(polygon)
    for i in range(n):
        a, b = polygon[i], polygon[(i + 1) % n]
        if a[1] <= p[1] < b[1] and cross(a, b, p) > 0:
            winding += 1  # yukarı giden kenar, p solunda
        elif b[1] <= p[1] < a[1] and cross(a, b, p) < 0:
            winding -= 1  # aşağı giden kenar, p sağında
    return winding


def point_in_polygon(p: Point, polygon: Sequence[Point]) -> int:
    """1 (INSIDE) içeride, 0 (BOUNDARY) sınırda, −1 (OUTSIDE) dışarıda."""
    n = len(polygon)
    if any(on_segment(p, polygon[i], polygon[(i + 1) % n]) for i in range(n)):
        return BOUNDARY
    return INSIDE if winding_number(p, polygon) != 0 else OUTSIDE
