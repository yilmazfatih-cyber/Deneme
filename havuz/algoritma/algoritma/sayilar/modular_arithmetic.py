"""Modüler aritmetik: hızlı üs alma (kare-çarp) ve modüler ters.

Fikir:
    Üs alma: b^e'yi e kez çarpmak yerine e'nin ikili açılımı kullanılır. b, b², b⁴, b⁸ … ardışık
    karelerle elde edilir; e'nin 1 olan bitlerine karşılık gelen kareler çarpılır. Her adımda
    mod alındığı için sayılar küçük kalır. Adım sayısı e'nin bit sayısıdır: O(log e).
    Modüler ters: a·x ≡ 1 (mod m) ancak ebob(a, m) = 1 ise vardır. Genişletilmiş Öklid
    a·x + m·y = 1 verir; mod m'de bu a·x ≡ 1 demektir. m asalsa Fermat ile x = a^(m−2) de olur.
    Python'da yerleşik `pow(b, e, m)` ve `pow(a, -1, m)` aynı işi yapar; bu dosya yöntemi
    gösterir ve başka dile taşınacak sürümün başvurusudur.

Karmaşıklık: mod_pow O(log e) çarpma; mod_inverse O(log m); yer O(1)
Ne zaman: kriptografi (RSA), karma hesapları, olasılık/kombinatorik soruları (mod 10⁹+7).
Ne zaman değil: Python kodunda doğrudan `pow` kullanın; tek fark burada adımların görünür olması.
Bağımlılık: yok (genişletilmiş Öklid'in kısa bir kopyası içeride; tam sürüm: `gcd.py`)
Genişletme: matris üssü için aynı kare-çarp döngüsü çarpma yerine matris çarpımıyla çalışır
    (`matrix_power.py`).

Örnek:
    >>> mod_pow(3, 200, 1_000_000_007), mod_inverse(3, 11), mod_inverse(10, 17)
    (136318165, 4, 12)
"""

from __future__ import annotations


def mod_pow(base: int, exponent: int, modulus: int) -> int:
    """base^exponent mod modulus (exponent ≥ 0, modulus ≥ 1)."""
    if exponent < 0:
        raise ValueError("negatif üs için önce mod_inverse alın")
    if modulus < 1:
        raise ValueError("modül en az 1 olmalı")
    result = 1 % modulus
    base %= modulus
    while exponent:
        if exponent & 1:
            result = result * base % modulus
        base = base * base % modulus
        exponent >>= 1
    return result


def mod_inverse(a: int, modulus: int) -> int:
    """a·x ≡ 1 (mod modulus) olan 0 ≤ x < modulus; ters yoksa ValueError."""
    if modulus < 1:
        raise ValueError("modül en az 1 olmalı")
    old_r, r = a % modulus, modulus
    old_x, x = 1, 0
    while r:
        q = old_r // r
        old_r, r = r, old_r - q * r
        old_x, x = x, old_x - q * x
    if old_r != 1:
        if modulus == 1:
            return 0
        raise ValueError(f"{a} sayısının mod {modulus} tersi yok (ebob = {old_r})")
    return old_x % modulus
