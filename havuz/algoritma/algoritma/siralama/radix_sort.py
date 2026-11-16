"""Taban (radix) sıralama: tam sayıları basamak basamak, en düşük basamaktan başlayarak sıralar.

Fikir:
    LSD (en anlamsız basamaktan) taban sıralamada sayılar önce birler basamağına göre (burada
    256 tabanında: en düşük bayta göre) kararlı biçimde kovalara dağıtılır, sonra bir sonraki
    basamağa göre… Her tur kararlı olduğu için önceki turların sırası eşitlikte korunur ve en
    anlamlı basamaktan sonra dizi sıralıdır. d basamak için d tur, her tur O(n + taban).
    Negatif sayılar ayrı sıralanır: mutlak değerleri sıralanıp ters çevrilir ve başa konur.

Karmaşıklık: zaman O(d · (n + b)) (b = taban, d = log_b(en büyük)); ek yer O(n + b)
Kararlılık: kararlı (her tur kararlı kovalama)
Ne zaman: çok sayıda, sınırlı genişlikte tam sayı (32/64 bit kimlik, IP adresi, zaman damgası).
Ne zaman değil: az sayıda öğe ya da çok geniş sayılar; Python'da `sorted()` çoğu zaman daha
    hızlıdır.
Bağımlılık: yok
Genişletme: dizgiler için "basamak" = karakter; kısa dizgileri sonda −1 ile doldurun (boşluk
    anlamında).

Örnek:
    >>> radix_sort([170, 45, 75, -90, 802, 24, 2, 66])
    [-90, 2, 24, 45, 66, 75, 170, 802]
"""

from __future__ import annotations

from collections.abc import Sequence


def _lsd_non_negative(values: list[int], base: int) -> list[int]:
    if not values:
        return values
    largest = max(values)
    exp = 1
    while largest // exp > 0:
        buckets: list[list[int]] = [[] for _ in range(base)]
        for value in values:
            buckets[(value // exp) % base].append(value)
        values = [value for bucket in buckets for value in bucket]
        exp *= base
    return values


def radix_sort(values: Sequence[int], base: int = 256) -> list[int]:
    """Tam sayıları (negatifler dahil) artan sırada döndürür."""
    if base < 2:
        raise ValueError("taban en az 2 olmalı")
    negatives = _lsd_non_negative([-v for v in values if v < 0], base)
    non_negatives = _lsd_non_negative([v for v in values if v >= 0], base)
    return [-v for v in reversed(negatives)] + non_negatives
