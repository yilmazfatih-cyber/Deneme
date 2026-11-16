"""Fisher-Yates karıştırma: her permütasyonu EŞİT olasılıkla üreten yerinde karıştırma; örnekleme.

Fikir:
    Sondan başa doğru her i konumu için [0, i] aralığından rastgele bir j seçilir ve i ile j
    yer değiştirir. i. adımda i+1 seçenek vardır; toplam n·(n−1)·…·1 = n! eşit olası seçim dizisi
    ve her dizi farklı bir permütasyon verir: dağılım tam düzgündür.
    Sık yapılan HATA: j'yi her adımda [0, n−1]'den seçmek. O zaman nⁿ seçim dizisi n!
    permütasyona dağılır; nⁿ, n!'e bölünmediği için (n ≥ 3) bazı permütasyonlar daha olasıdır.
    Kısmi sürüm: yalnız ilk k adım yapılırsa son k konum, düzgün rastgele bir k'lı örnektir (O(k)).
    Rastgele kaynak parametredir (`random.Random`): aynı tohum aynı sonucu verir.

Karmaşıklık: karıştırma O(n); k'lı örnek O(n) kopya + O(k) seçim; yer O(1) (yerinde)
Ne zaman: kart destesi, rastgele sıra, A/B grubu atama, rastgele örnek.
Ne zaman değil: Python'da `rng.shuffle` / `rng.sample` aynı algoritmayı kullanır; bu dosya yöntemin
    kendisini ve başka dile taşınacak doğru sürümü gösterir. Akıştan (uzunluğu bilinmeyen)
    örnek için
    `reservoir_sampling.py`.
Bağımlılık: yok
Genişletme: kriptografik rastgelelik gerekiyorsa `rng` olarak `random.SystemRandom()` verin.

Örnek:
    >>> import random
    >>> cards = ["A", "B", "C", "D"]
    >>> fisher_yates_shuffle(cards, random.Random(42))
    >>> cards, random_sample(range(10), 3, random.Random(7))
    (['C', 'B', 'D', 'A'], [5, 3, 8])
"""

from __future__ import annotations

import random
from collections.abc import Iterable, MutableSequence
from typing import TypeVar

T = TypeVar("T")


def fisher_yates_shuffle(items: MutableSequence[T], rng: random.Random) -> None:
    """Diziyi yerinde, düzgün dağılımla karıştırır."""
    for i in range(len(items) - 1, 0, -1):
        j = rng.randrange(i + 1)  # 0 ≤ j ≤ i — DİKKAT: n değil i+1
        items[i], items[j] = items[j], items[i]


def random_permutation(n: int, rng: random.Random) -> list[int]:
    """0 … n−1'in düzgün rastgele bir permütasyonu."""
    order = list(range(n))
    fisher_yates_shuffle(order, rng)
    return order


def random_sample(items: Iterable[T], k: int, rng: random.Random) -> list[T]:
    """Tekrarsız, düzgün rastgele k öğe (seçilme sırasıyla); kısmi Fisher-Yates."""
    pool = list(items)
    if not 0 <= k <= len(pool):
        raise ValueError(f"k, 0 ile {len(pool)} arasında olmalı")
    n = len(pool)
    for i in range(k):  # baştan k adım: pool[i] konumuna kalanlardan biri gelir
        j = rng.randrange(i, n)
        pool[i], pool[j] = pool[j], pool[i]
    return pool[:k]
