"""En yakın nokta çifti: n nokta arasında birbirine en yakın ikisi, O(n log n) (böl ve yönet).

Fikir:
    Noktalar x'e göre sıralanıp ortadan ikiye bölünür; her yarının en yakın çifti özyinelemeyle
    bulunur, d = ikisinin küçüğü. Kalan tek olasılık, bölme çizgisinin iki yanından birer nokta:
    yalnız çizgiye d'den yakın "şerit" noktalarına bakmak yeter. Şerit y'ye göre sıralı tutulursa
    her nokta yalnız kendisinden sonraki en çok 7 noktayla karşılaştırılır (d×2d kutuya sığan nokta
    sayısı sınırlıdır). y sıralaması birleştirmeli sıralama gibi aşağıdan yukarı korunur:
    toplam O(n log n).
    Uzaklıklar KARE olarak hesaplanır: tam sayı koordinatta kesin.

Karmaşıklık: zaman O(n log n); yer O(n)
Ne zaman: çarpışma tespiti, kümeleme ön adımı, en yakın iki şehir/sensör.
Ne zaman değil: noktalar sürekli değişiyor ve tekrar tekrar soruluyorsa ızgara/k-d ağacı
    (`algoritma/veri_yapilari/kd_tree.py`).
Bağımlılık: yok
Özyineleme: derinlik ⌈log2 n⌉ (n = 10⁶ için 20); yığın taşmaz.
Genişletme: Manhattan uzaklığı için `_dist2` ve şerit genişliği koşulunu birlikte değiştirin.

Örnek:
    >>> closest_pair([(0, 0), (5, 4), (3, 1), (9, 9), (4, 3)])
    (2, 1, 4)
"""

from __future__ import annotations

from collections.abc import Sequence

Point = tuple[float, float]


def _dist2(a: Point, b: Point) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def closest_pair(points: Sequence[Point]) -> tuple[float, int, int]:
    """(uzaklığın karesi, i, j) — i < j, points[i] ile points[j] en yakın çift. En az iki nokta."""
    if len(points) < 2:
        raise ValueError("en az iki nokta gerekir")
    by_x = sorted(range(len(points)), key=lambda i: points[i])

    def solve(ids: list[int]) -> tuple[tuple[float, int, int], list[int]]:
        """(en iyi çift, y'ye göre sıralı dizinler)."""
        if len(ids) <= 3:
            best = min(
                ((_dist2(points[a], points[b]), min(a, b), max(a, b))
                 for k, a in enumerate(ids) for b in ids[k + 1 :]),
                default=(float("inf"), -1, -1),
            )  # fmt: skip
            return best, sorted(ids, key=lambda i: points[i][1])
        mid = len(ids) // 2
        split_x = points[ids[mid]][0]
        left_best, left_y = solve(ids[:mid])
        right_best, right_y = solve(ids[mid:])
        best = min(left_best, right_best)
        # Timsort iki sıralı koşuyu doğrusal zamanda birleştirir (birleştirmeli sıralama adımı)
        merged = sorted(left_y + right_y, key=lambda i: points[i][1])
        strip = [i for i in merged if (points[i][0] - split_x) ** 2 < best[0]]
        for k, a in enumerate(strip):
            for b in strip[k + 1 : k + 8]:
                if (points[b][1] - points[a][1]) ** 2 >= best[0]:
                    break
                best = min(best, (_dist2(points[a], points[b]), min(a, b), max(a, b)))
        return best, merged

    return solve(by_x)[0]
