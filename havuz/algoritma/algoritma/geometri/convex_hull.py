"""Dışbükey örtü (Andrew'un tekdüze zinciri): noktaları saran en küçük dışbükey çokgen, O(n log n).

Fikir:
    Noktalar (x, y)'ye göre sıralanır. Alt zincir soldan sağa kurulur: her yeni nokta için,
    zincirin son iki noktasıyla birlikte SAĞA dönüyor (ya da doğrusal) ise sondaki nokta atılır;
    sonra yeni nokta eklenir. Üst zincir aynı işlemle sağdan sola kurulur. İki zincir birleşince
    saat yönünün tersine dizili örtü elde edilir. Doğrusal noktalar (kenar üstündekiler) atılır;
    yinelenen noktalar sorun çıkarmaz.
    Yönelim testi tam sayı/Fraction koordinatlarla KESİNDİR; float'ta neredeyse doğrusal
    noktalar yanlış sınıflanabilir (bkz. `orientation.py` notu).

Karmaşıklık: zaman O(n log n) (sıralama); yer O(n)
Ne zaman: şekil sınırı, en uzak nokta çifti (döner kumpas), çarpışma için sınır, kümelerin kabuğu.
Ne zaman değil: 3B örtü için farklı algoritmalar (quickhull, artımlı) gerekir.
Bağımlılık: algoritma.geometri.orientation (cross)
Genişletme: kenar üstündeki noktaları da tutmak için `<= 0` koşulunu `< 0` yapın (dikkat:
    tümü doğrusalsa noktalar iki kez görünür).

Örnek:
    >>> convex_hull([(0, 0), (2, 0), (1, 1), (2, 2), (0, 2), (1, 0)])
    [(0, 0), (2, 0), (2, 2), (0, 2)]
"""

from __future__ import annotations

from collections.abc import Sequence

from algoritma.geometri.orientation import Point, cross


def convex_hull(points: Sequence[Point]) -> list[Point]:
    """Örtü köşeleri, saat yönü tersine, en küçük (x, y)'den başlayarak; doğrusallar atılır."""
    unique = sorted(set(points))
    if len(unique) <= 2:
        return unique
    lower: list[Point] = []
    for p in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()  # sağa dönüş ya da doğrusal: ortadaki nokta örtüde değil
        lower.append(p)
    upper: list[Point] = []
    for p in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]  # uç noktalar iki zincirde de var; birer kez al
