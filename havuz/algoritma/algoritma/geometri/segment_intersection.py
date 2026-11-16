"""Doğru parçası kesişimi: kesişiyorlar mı, kesişiyorsa nokta mı yoksa ortak bir parça mı?

Fikir:
    [p1, p2] ve [p3, p4] parçaları, (a) p3 ve p4 [p1, p2] doğrusunun FARKLI yanlarındaysa ve
    (b) p1 ve p2 [p3, p4] doğrusunun farklı yanlarındaysa kesişir (yönelim testleri zıt işaretli).
    Uç durumlar: bir uç öbür parçanın üstündeyse (yönelim 0 ve sınırlar içinde) de kesişirler;
    dört nokta doğrusalsa parçalar üst üste binebilir (ortak parça) ya da ayrık olabilir.
    Kesişim noktası parametrik denklemden bulunur: p1 + t·d1 = p3 + s·d2 ⇒
    t = ((p3 − p1) × d2) / (d1 × d2). Tam sayı girdide t `Fraction` olarak hesaplanır: KESİN.

Karmaşıklık: O(1); yer O(1)
Ne zaman: çizim/harita kesişimleri, çokgenin kendini kesmesi, ışın izleme, çarpışma testi.
Ne zaman değil: çok sayıda parçanın tüm kesişimleri için süpürme çizgisi
    (`sweep_line_intersections.py`, Bentley-Ottmann).
Bağımlılık: algoritma.geometri.orientation (yönelim ve parça-üstü testleri)
Genişletme: doğru (sonsuz) ile parça kesişimi için yalnız (a) koşulunu kullanın.

Örnek:
    >>> segments_intersect((0, 0), (4, 4), (0, 4), (4, 0))
    True
    >>> segment_intersection((0, 0), (4, 4), (0, 4), (4, 0))
    ((Fraction(2, 1), Fraction(2, 1)),)
    >>> segment_intersection((0, 0), (4, 0), (2, 0), (6, 0))  # üst üste binen parça
    ((2, 0), (4, 0))
    >>> segment_intersection((0, 0), (1, 1), (2, 2), (3, 0)) is None
    True
"""

from __future__ import annotations

from fractions import Fraction

from algoritma.geometri.orientation import Number, Point, on_segment, orientation


def _divide(numerator: Number, denominator: Number) -> Number:
    """Tam sayı/Fraction girdide kesin bölme; float varsa float bölme."""
    if isinstance(numerator, float) or isinstance(denominator, float):
        return numerator / denominator
    return Fraction(numerator) / Fraction(denominator)


def segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    """[p1, p2] ile [p3, p4] en az bir ortak noktaya sahip mi (uçlar dahil)?"""
    d1 = orientation(p3, p4, p1)
    d2 = orientation(p3, p4, p2)
    d3 = orientation(p1, p2, p3)
    d4 = orientation(p1, p2, p4)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return True  # her biri öbürünü iki yana ayırıyor: kesin kesişim
    return (
        on_segment(p1, p3, p4)
        or on_segment(p2, p3, p4)
        or on_segment(p3, p1, p2)
        or on_segment(p4, p1, p2)
    )


def segment_intersection(
    p1: Point, p2: Point, p3: Point, p4: Point
) -> tuple[Point] | tuple[Point, Point] | None:
    """Kesişim: None, (nokta,) ya da üst üste binme için (başlangıç, bitiş) parçası."""
    if not segments_intersect(p1, p2, p3, p4):
        return None
    d1 = (p2[0] - p1[0], p2[1] - p1[1])
    d2 = (p4[0] - p3[0], p4[1] - p3[1])
    denominator = d1[0] * d2[1] - d1[1] * d2[0]  # d1 × d2
    if denominator != 0:  # paralel değil: tek nokta
        numerator = (p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]  # (p3 − p1) × d2
        t = _divide(numerator, denominator)
        return ((p1[0] + t * d1[0], p1[1] + t * d1[1]),)
    # doğrusal ve kesişiyorlar: ortak parça (yalnız uçta değiyorlarsa tek nokta)
    shared = sorted(p for p in (p1, p2, p3, p4) if on_segment(p, p1, p2) and on_segment(p, p3, p4))
    start, end = shared[0], shared[-1]
    return (start,) if start == end else (start, end)
