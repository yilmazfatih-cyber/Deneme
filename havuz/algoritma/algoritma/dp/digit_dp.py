"""Basamak DP'si: [0, N] aralığında basamak toplamı S olan sayıları sayar; k.'sını kurar.

Fikir:
    "N'den küçük-eşit ve şu basamak özelliğine sahip kaç sayı var?" sorusu basamak basamak
    çözülür. ways[L][s] = uzunluğu L olan (baştaki sıfırlar serbest) ve basamak toplamı s olan
    dizi sayısı; ways[L][s] = Σ_d ways[L−1][s−d]. N'nin basamakları soldan gezilir: i. konumda
    N'nin basamağı D ise, buraya D'den KÜÇÜK bir c yazan her sayı geri kalan konumlarda serbesttir
    ve ways[kalan][S − şimdiye kadarki − c] kadardır. Sonra c = D seçilip "sıkı" devam edilir.
    Geri izleme (yanıtın kendisi): k. en küçük sayıyı bulmak için aynı tablo kullanılır;
    her konumda 0'dan 9'a basamak denenir, o basamakla başlayan sayıların adedi k'den küçükse
    k azaltılıp sonraki basamağa geçilir, değilse basamak sabitlenir.

Karmaşıklık: tablo O(L · S · 10); sayma O(L · 10); k. sayı O(L · 10) (L = basamak sayısı)
Ne zaman: 10¹⁸'e kadar aralıklarda basamak koşullu sayma ("içinde 4 geçmeyen", "basamak
    toplamı asal olan" …) — tek tek denemek olanaksızken.
Ne zaman değil: aralık küçükse (≲ 10⁶) doğrudan saymak daha basit ve hatasızdır.
Bağımlılık: yok
Genişletme: başka bir özellik için durumu değiştirin (ör. "son basamak" ekleyerek ardışık eşit
    basamak yasağı); sıkı/serbest ayrımı aynı kalır.

Örnek:
    >>> count_with_digit_sum(100, 10), kth_with_digit_sum(1, 10), kth_with_digit_sum(9, 10)
    (9, 19, 91)
"""

from __future__ import annotations


def _ways(length: int, target: int) -> list[list[int]]:
    ways = [[0] * (target + 1) for _ in range(length + 1)]
    ways[0][0] = 1
    for size in range(1, length + 1):
        for total in range(target + 1):
            ways[size][total] = sum(ways[size - 1][total - d] for d in range(min(9, total) + 1))
    return ways


def digit_sum(x: int) -> int:
    """Ondalık basamakların toplamı."""
    return sum(int(c) for c in str(x))


def count_with_digit_sum(limit: int, target: int) -> int:
    """0 ≤ x ≤ limit ve digit_sum(x) == target olan x sayısı."""
    if limit < 0 or target < 0:
        return 0
    digits = [int(c) for c in str(limit)]
    ways = _ways(len(digits), target)
    count, used = 0, 0
    for position, top in enumerate(digits):
        remaining = len(digits) - position - 1
        for c in range(top):
            if used + c <= target:
                count += ways[remaining][target - used - c]
        used += top
        if used > target:
            return count
    return count + (used == target)


def kth_with_digit_sum(k: int, target: int) -> int:
    """Basamak toplamı target olan k. en küçük doğal sayı (k 1'den başlar)."""
    if k < 1 or target < 0:
        raise ValueError("k ≥ 1 ve target ≥ 0 olmalı")
    if target == 0:  # basamak toplamı 0 olan tek sayı 0'dır
        if k == 1:
            return 0
        raise ValueError("basamak toplamı 0 olan yalnız bir sayı (0) vardır")
    length = max(1, -(-target // 9))
    while _ways(length, target)[length][target] < k:  # yeterli basamak sayısını bul
        length += 1
    ways = _ways(length, target)
    result, used = 0, 0
    for position in range(length):
        remaining = length - position - 1
        for d in range(10):
            if used + d > target:
                raise AssertionError("tablo tutarsız")  # buraya ulaşılmaz
            block = ways[remaining][target - used - d]
            if k <= block:
                result, used = result * 10 + d, used + d
                break
            k -= block
    return result
