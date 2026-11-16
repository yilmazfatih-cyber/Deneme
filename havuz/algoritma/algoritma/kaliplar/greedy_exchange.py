"""Kalıp — açgözlü + değişim argümanı: doğru sıralama ölçütünü bul, kanıtla, tek geçişte seç.

Fikir:
    Açgözlü algoritma her adımda "şu an en iyi görünen"i seçer, geri dönmez; çoğu zaman YANLIŞTIR.
    Doğruluğunu göstermenin yolu DEĞİŞİM ARGÜMANIDIR: açgözlünün yapmayacağı bir sıra/seçim
    içeren her en iyi çözümde, iki öğeyi takas etmenin çözümü kötüleştirmediği gösterilir.
    Örnek (kısa iş önce): yan yana a > b ise takas, b'nin beklemesini a azaltır, a'nınkini b
    artırır; net b − a < 0 → artan sıra en iyidir. Şüphedeysen küçük girdide kaba kuvvetle
    karşılaştır (bu dosyanın testleri gibi).

Karmaşıklık: genelde O(n log n) (sıralama + yığın); yer O(n)
Ne zaman: "sırala ve seç" yapısı; teslim tarihi/süre/oran gibi tek ölçüt; değişim
    argümanı kurulabiliyor (matroid yapısı, kesirli seçim).
Ne zaman değil: 0/1 sırt çantası, ağırlıklı aralık seçimi, madeni para (kanonik olmayan) gibi
    açgözlünün yanıldığı problemler → DP.
Bağımlılık: yok
Genişletme: yeni bir açgözlü kural yazdığınızda testine kaba kuvvet karşılaştırması ekleyin
    (bu dosyanın testleri gibi).

Örnek:
    >>> order, total = min_total_waiting([30, 10, 20])
    >>> order, total
    ([1, 2, 0], 40)
    >>> max_profit_jobs([(2, 100), (1, 19), (2, 27), (1, 25), (3, 15)])
    142
    >>> best_spice_mix([(60, 10), (100, 20), (120, 30)], 50)
    Fraction(240, 1)
"""

from __future__ import annotations

import heapq
from collections.abc import Sequence
from fractions import Fraction


def min_total_waiting(durations: Sequence[int]) -> tuple[list[int], int]:
    """İSKELET (ölçüte göre sırala).

    Problem: Bir berberde aynı anda gelen müşterilerin işlem süreleri belli. Her müşterinin
    beklemesi, kendinden önce hizmet alanların süreleri toplamıdır. Toplam beklemeyi en aza
    indiren sıra ve toplam bekleme? Kanıt: başlıktaki komşu takas argümanı → kısa iş önce.
    """
    order = sorted(range(len(durations)), key=lambda i: (durations[i], i))
    total = elapsed = 0
    for i in order:
        total += elapsed
        elapsed += durations[i]
    return order, total


def max_profit_jobs(jobs: Sequence[tuple[int, int]]) -> int:
    """Problem: Bir serbest çalışan her biri TAM 1 gün süren işler alabiliyor; iş i en geç
    deadline_i. günün sonunda teslim edilmeli ve profit_i kazandırıyor. Günde tek iş yapılır.
    En çok toplam kazanç? (jobs: (son gün ≥ 1, kâr) çiftleri.)
    Açgözlü: işleri son güne göre sırala; seçilenleri en-küçük yığında tut; yığın boyu son günü
    aşarsa en az kazandıranı bırak. Değişim argümanı: seçili kümedeki her iş, daha kârlı ama
    sığmayan bir işle takas edilirse kazanç artar — yığın bu takası yapar.
    """
    chosen: list[int] = []
    for deadline, profit in sorted(jobs):
        if deadline < 1:
            raise ValueError("son gün en az 1 olmalı")
        heapq.heappush(chosen, profit)
        if len(chosen) > deadline:
            heapq.heappop(chosen)  # sığmıyor: en az kârlıyı bırak
    return sum(chosen)


def best_spice_mix(spices: Sequence[tuple[int, int]], capacity: int) -> Fraction:
    """Problem: Bir baharatçının teraziye koyabileceği en çok `capacity` gram var. Her baharatın
    stoktaki toplam değeri ve gramı (değer, gram) verili; baharatlar BÖLÜNEBİLİR (istenen kadar
    gram alınır). En değerli karışımın değeri? (kesirli sırt çantası)
    Açgözlü: gram başına değeri en yüksek olandan başla. Değişim argümanı: daha düşük oranlı bir
    gram, daha yüksek oranlı bir gramla takas edilince değer artar.
    """
    remaining = Fraction(capacity)
    total = Fraction(0)
    for value, grams in sorted(spices, key=lambda s: Fraction(s[0], s[1]), reverse=True):
        if remaining <= 0:
            break
        take = min(Fraction(grams), remaining)
        total += Fraction(value, grams) * take
        remaining -= take
    return total
