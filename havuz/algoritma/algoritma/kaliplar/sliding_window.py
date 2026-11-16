"""Kalıp — kayan pencere: ardışık parçayı sağdan genişlet, koşul bozulunca soldan daralt.

Fikir:
    "Koşulu sağlayan en uzun/en kısa ARDIŞIK parça" sorularında her başlangıç için baştan saymak
    O(n²)'dir. Kayan pencerede sağ uç her adımda bir ilerler; pencere geçersizleşince sol uç
    geçerli olana dek ilerler. İki uç da yalnız ileri gittiğinden toplam O(n). Pencerenin
    özeti (toplam, harf sayaçları) artımlı güncellenir: giren eklenir, çıkan çıkarılır.
    Sabit boyutlu pencerede yalnız "bir giren, bir çıkan" vardır.
    Akla gelmeli: "ardışık", "alt dizgi/alt dizi", "en çok k farklı", "toplamı en az S olan en
    kısa", "son k günün…" ifadeleri.

Karmaşıklık: O(n) (pencere özetinin güncellemesi O(1) ise); ek yer O(pencere özeti)
Ne zaman: geçerlilik TEKDÜZE ise: geçerli bir pencerenin her alt penceresi de geçerli (en uzun
    soruları) ya da geçerli pencereyi genişletmek geçerliliği bozmaz (en kısa soruları).
Ne zaman değil: negatif sayılar "toplam ≥ S" tekdüzeliğini bozar → önek toplamı + sözlük
    (`prefix_sum.py`) ya da tekdüze kuyruk gerekir.
Bağımlılık: yok
Genişletme: pencerenin en büyüğü/en küçüğü gerekiyorsa özet olarak tekdüze kuyruk tutun
    (`algoritma/cesitli/sliding_window_max.py`).

Örnek:
    >>> longest_with_at_most_k_distinct("AABBCABBA", 2)  # "ABBA" ya da "AABB" (4)
    4
    >>> shortest_window_with_sum([2, 3, 1, 2, 4, 3], 7), best_fixed_window([5, 1, 3, 8, 2], 2)
    (2, 11)
"""

from __future__ import annotations

from collections.abc import Sequence


def longest_with_at_most_k_distinct(categories: Sequence[str], k: int) -> int:
    """İSKELET (değişken pencere, en uzun).

    Problem: Bir marketin kasa kayıtlarında her satışın ürün kategorisi sırayla yazılı. Bir
    kampanya en çok k farklı kategoriye uygulanabiliyor; kampanyanın kesintisiz geçerli
    olacağı EN UZUN ardışık satış dizisi kaç satıştır?
    """
    if k < 0:
        raise ValueError("k negatif olamaz")
    counts: dict[str, int] = {}
    best = left = 0
    for right, category in enumerate(categories):
        counts[category] = counts.get(category, 0) + 1  # giren
        while len(counts) > k:  # geçersiz: soldan daralt
            gone = categories[left]
            counts[gone] -= 1
            if counts[gone] == 0:
                del counts[gone]
            left += 1
        best = max(best, right - left + 1)
    return best


def shortest_window_with_sum(gains: Sequence[float], target: float) -> int:
    """Problem: Bir bisikletçinin her kilometrede ürettiği enerji (pozitif sayılar) sırayla
    ölçülmüş. Telefonunu şarj etmek için en az `target` enerji gerekiyor. Bunu sağlayan EN KISA
    ardışık kilometre dilimi kaç km? Hiç yoksa 0.
    Çözüm (değişken pencere, en kısa): toplam hedefe ulaştıkça soldan daralt ve kaydet.
    """
    if any(g <= 0 for g in gains):
        raise ValueError("bu pencere mantığı yalnız pozitif değerlerle doğrudur")
    best = len(gains) + 1
    total: float = 0
    left = 0
    for right, gain in enumerate(gains):
        total += gain
        while total >= target and left <= right:
            best = min(best, right - left + 1)
            total -= gains[left]
            left += 1
    return best if best <= len(gains) else 0


def best_fixed_window(sales: Sequence[float], k: int) -> float:
    """Problem: Bir fırının günlük satışlarında k günlük ardışık dönemlerin en yüksek toplamı
    nedir? (k gün yoksa ValueError.)
    Çözüm (sabit pencere): her adımda bir gün girer, bir gün çıkar.
    """
    if not 1 <= k <= len(sales):
        raise ValueError("pencere 1 ile gün sayısı arasında olmalı")
    window = sum(sales[:k])
    best = window
    for i in range(k, len(sales)):
        window += sales[i] - sales[i - k]
        best = max(best, window)
    return best
