"""Kalıp — geri izleme iskeleti: seç → ilerle → geri al; geçersiz dalı erken buda.

Fikir:
    Çözüm adım adım kurulur: seçenek seçilir (durum güncellenir), özyinelemeyle ilerlenir,
    sonra seçim GERİ ALINIR. Kısmi çözüm bir kuralı zaten bozuyorsa dal hiç büyütülmez (budama)
    — kaba kuvvetten farkı budur. Kopyalanacak iskelet `backtrack` işlevindedir:
    `tamam(kısmi)` → yanıta ekle; değilse her uygun seçenek için ekle → ilerle → çıkar.
    Yinelenen yanıtları önlemek için seçenekler SIRALI verilir; kombinasyonlarda bir sonraki
    seçim öncekinden küçük olamaz (başlangıç dizini taşınır).

Karmaşıklık: en kötü üstel (çözüm sayısı kadar iş zaten kaçınılmaz); yer O(derinlik)
Ne zaman: "tümünü listele/say", permütasyon, kombinasyon, alt küme, bulmaca, yerleştirme;
    kısıtlar kısmi çözümde erken sınanabildiğinde.
Ne zaman değil: yalnız SAYI ya da en iyi değer isteniyorsa ve alt problemler örtüşüyorsa DP
    (`dp_state_design.py`) çok daha hızlıdır.
Bağımlılık: yok
Özyineleme: derinlik = çözüm uzunluğu (burada ≤ ~20).
Genişletme: yeni problem için yalnız `tamam`, `seçenekler`, `uygun` parçalarını değiştirin;
    `backtrack` işlevi genel sürümdür.

Örnek:
    >>> seating(["Ali", "Banu", "Cem"], [("Ali", "Banu")])
    [['Ali', 'Cem', 'Banu'], ['Banu', 'Cem', 'Ali']]
    >>> exact_orders([25, 40], 90), balanced_tags(2)
    ([[25, 25, 40]], ['<<>>', '<><>'])
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from typing import TypeVar

T = TypeVar("T")


def backtrack(
    is_complete: Callable[[list[T]], bool],
    options: Callable[[list[T]], Iterable[T]],
    is_valid: Callable[[list[T], T], bool],
) -> list[list[T]]:
    """İSKELET: tüm tam çözümleri (kopyalarını) bulma sırasıyla döndürür."""
    found: list[list[T]] = []
    partial: list[T] = []

    def go() -> None:
        if is_complete(partial):
            found.append(list(partial))
            return
        for option in options(partial):
            if is_valid(partial, option):
                partial.append(option)  # seç
                go()  # ilerle
                partial.pop()  # geri al

    go()
    return found


def seating(guests: Sequence[str], feuds: Sequence[tuple[str, str]]) -> list[list[str]]:
    """Problem: Düz bir masaya konuklar yan yana oturacak; küs olan iki konuk YAN YANA oturamaz.
    Tüm geçerli oturma düzenleri (sözlük sırasıyla)?
    """
    banned = {frozenset(pair) for pair in feuds}
    names = sorted(guests)
    return backtrack(
        lambda p: len(p) == len(names),
        lambda p: (n for n in names if n not in p),
        lambda p, n: not p or frozenset((p[-1], n)) not in banned,
    )


def exact_orders(prices: Sequence[int], budget: int) -> list[list[int]]:
    """Problem: Bir kafede menü fiyatları belli; bir üründen istenildiği kadar alınabilir. Tam
    `budget` liralık siparişlerin hepsi (her sipariş artan fiyat sırasında, tekrarsız)?
    Budama: toplam bütçeyi aşan dal büyütülmez; artan sırayla seçim aynı siparişi iki kez üretmez.
    """
    menu = sorted(set(prices))
    if any(p <= 0 for p in menu):
        raise ValueError("fiyatlar pozitif olmalı")
    return backtrack(
        lambda p: sum(p) == budget,
        lambda p: (x for x in menu if not p or x >= p[-1]),
        lambda p, x: sum(p) + x <= budget,
    )


def balanced_tags(pairs: int) -> list[str]:
    """Problem: Bir belge biçiminde "<" etiket açar, ">" kapatır. `pairs` açma ve `pairs` kapama
    ile kurulabilen tüm GEÇERLİ diziler (her önekte kapanış açılışı geçmez)? Sözlük sırasıyla.
    """

    def valid(p: list[str], tag: str) -> bool:
        opened = p.count("<")
        closed = len(p) - opened
        return opened < pairs if tag == "<" else closed < opened

    found = backtrack(lambda p: len(p) == 2 * pairs, lambda p: "<>", valid)
    return ["".join(x) for x in found]
