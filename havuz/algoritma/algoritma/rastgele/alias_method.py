"""Takma ad (alias) yöntemi: ağırlıklı ayrık dağılımdan O(1)'de örnek (Vose'un sürümü).

Fikir:
    n sonuç ve olasılıkları p_i verilsin. Her olasılık n ile çarpılır (ortalama 1 olur). n tane
    "kutu" kurulur; her kutu en çok İKİ sonuç taşır: kendi sonucu (olasılık prob[i]) ve bir
    "takma ad" (alias[i], kalan 1 − prob[i]). Kurulum: 1'den küçükler (az dolu) ve büyükler
    (taşan) iki listede tutulur; her adımda bir az dolu kutu, bir taşan sonuçla tamamlanır ve
    taşanın fazlası azalır. Örnekleme: rastgele bir kutu seç (O(1)), sonra bir yazı-tura ile
    kutunun kendi sonucunu ya da takma adını döndür (O(1)).
    Kayan nokta yuvarlamasından kalan kutular 1'e eşitlenir (Vose'un sayısal düzeltmesi).

Karmaşıklık: kurulum O(n); her örnek O(1); yer O(n)
Ne zaman: aynı dağılımdan ÇOK sayıda örnek (oyun ganimeti, benzetim, rastgele metin üretimi).
Ne zaman değil: tek seferlik örnek için `rng.choices(weights=…)` (O(n) ya da O(log n)) yeter;
    ağırlıklar sık değişiyorsa Fenwick ağacı tabanlı örnekleme (`fenwick_tree.py`) daha uygundur.
Bağımlılık: yok
Genişletme: olasılıkları kesin tutmak için float yerine `fractions.Fraction` kullanılabilir
    (örnekleme o zaman tam sayı rastgelelikle yapılır).

Örnek:
    >>> import random
    >>> sampler = AliasSampler([1, 2, 7])
    >>> [round(p, 6) for p in sampler.probabilities()]
    [0.1, 0.2, 0.7]
    >>> rng = random.Random(0)
    >>> counts = [0, 0, 0]
    >>> for _ in range(10_000):
    ...     counts[sampler.sample(rng)] += 1
    >>> [round(c / 10_000, 1) for c in counts]
    [0.1, 0.2, 0.7]
"""

from __future__ import annotations

import random
from collections.abc import Sequence


class AliasSampler:
    """Negatif olmayan ağırlıklarla (toplamı > 0) dizin örnekleyici."""

    def __init__(self, weights: Sequence[float]) -> None:
        n = len(weights)
        total = float(sum(weights))
        if n == 0 or total <= 0 or any(w < 0 for w in weights):
            raise ValueError("ağırlıklar boş olmamalı, negatif olmamalı ve toplamı > 0 olmalı")
        scaled = [w * n / total for w in weights]
        self._prob = [0.0] * n
        self._alias = list(range(n))
        small = [i for i, s in enumerate(scaled) if s < 1.0]
        large = [i for i, s in enumerate(scaled) if s >= 1.0]
        while small and large:
            low, high = small.pop(), large.pop()
            self._prob[low] = scaled[low]
            self._alias[low] = high
            scaled[high] -= 1.0 - scaled[low]  # taşan sonuç az dolu kutunun boşluğunu doldurur
            (small if scaled[high] < 1.0 else large).append(high)
        for i in small + large:  # yuvarlama kalıntıları: bu kutular tam dolu sayılır
            self._prob[i] = 1.0

    def __len__(self) -> int:
        return len(self._prob)

    def sample(self, rng: random.Random) -> int:
        """Ağırlıkla orantılı rastgele bir dizin."""
        i = rng.randrange(len(self._prob))
        return i if rng.random() < self._prob[i] else self._alias[i]

    def probabilities(self) -> list[float]:
        """Tablodan geri hesaplanan olasılıklar (denetim için): ağırlık / toplam olmalı."""
        n = len(self._prob)
        result = [p / n for p in self._prob]
        for i, p in enumerate(self._prob):
            if p < 1.0:
                result[self._alias[i]] += (1.0 - p) / n
        return result
