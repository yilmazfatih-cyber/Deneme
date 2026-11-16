"""Kalıp — iki işaretçi: sıralı dizide iki ucu (ya da aynı yöne giden iki konumu) birlikte ilerlet.

Fikir:
    İç içe iki döngü (O(n²)) yerine iki dizin tutulur ve her adımda en az biri ilerler; toplam
    adım O(n) olur. İki biçimi vardır:
      * Karşılıklı uçlar: soldan ve sağdan başla; toplam küçükse solu, büyükse sağı kaydır
        (dizi SIRALI olduğu için elenen öğe hiçbir çözümde yer alamaz).
      * Aynı yön (hızlı/yavaş): sağ işaretçi taramayı yapar, sol işaretçi bir koşul bozulunca
        ya da yazılacak yer olarak ilerler (yerinde ayıklama, aralık sayma).
    Akla gelmeli: "sıralı dizide çift/üçlü bul", "yerinde sil/ayıkla", "fark ya da toplam
    sınırlı çiftleri say", iki sıralı listeyi birleştirme.

Karmaşıklık: O(n) (dizi sıralı değilse önce O(n log n) sıralama); ek yer O(1)
Ne zaman: girdi sıralı (ya da sıralanabilir) ve koşul tekdüze: işaretçiyi ilerletmek koşulu
    hep aynı yöne değiştiriyor.
Ne zaman değil: sıra bozulamazsa ve dizi sıralı değilse (özgün dizinler gerekiyorsa) karma
    tablo (sözlük) kullanın; koşul tekdüze değilse işaretçi kaydırma yanlış dalı eler.
Bağımlılık: yok
Genişletme: üçlü toplam için bir öğeyi sabitleyip kalanında karşılıklı uçları çalıştırın (O(n²)).

Örnek:
    >>> pair_with_sum([150, 200, 350, 425, 600], 775)  # 350 + 425
    (2, 3)
    >>> count_close_pairs([300, 302, 305, 311, 312], 5)
    4
    >>> remove_duplicates_in_place([1, 1, 2, 2, 2, 5])
    3
"""

from __future__ import annotations

from collections.abc import MutableSequence, Sequence


def pair_with_sum(sorted_values: Sequence[float], target: float) -> tuple[int, int] | None:
    """İSKELET (karşılıklı uçlar).

    Problem: Bir mağazada ürün fiyatları artan sırada dizilmiş. Elinizde tam `target` liralık bir
    hediye çeki var ve çek tek seferde, iki FARKLI ürüne tamamen harcanmalı. Hangi iki ürün?
    Çözüm: toplam küçükse daha pahalı bir sol ürün gerekir (sol ilerler), büyükse daha ucuz bir
    sağ ürün (sağ geriler). Dönüş: (i, j), i < j; yoksa None.
    """
    left, right = 0, len(sorted_values) - 1
    while left < right:
        total = sorted_values[left] + sorted_values[right]
        if total == target:
            return left, right
        if total < target:
            left += 1
        else:
            right -= 1
    return None


def count_close_pairs(sorted_paces: Sequence[float], max_gap: float) -> int:
    """Problem: Bir koşu kulübünde koşucuların 5 km temposu (saniye) artan sırada. Temposu
    birbirine en çok `max_gap` saniye yakın iki koşucu birlikte antrenman yapabilir. Kaç
    farklı ikili mümkün?
    Çözüm (aynı yön): her sağ uç için, ondan en çok max_gap yavaş olmayan en soldaki koşucuyu
    tutan sol işaretçi yalnız ileri gider; sağ uçla eşleşebilecek koşucu sayısı right − left.
    """
    pairs, left = 0, 0
    for right, pace in enumerate(sorted_paces):
        while pace - sorted_paces[left] > max_gap:
            left += 1
        pairs += right - left
    return pairs


def remove_duplicates_in_place(sorted_ids: MutableSequence[int]) -> int:
    """Problem: Muhasebe, sıralı fatura numaraları listesinde yinelenen kayıtları yerinde
    (yeni liste açmadan) ayıklamak istiyor. Listenin başındaki ilk k konuma her numaranın bir
    kopyası yazılsın; k'yı döndürün (listenin geri kalanı önemsiz).
    Çözüm (hızlı/yavaş): hızlı işaretçi tarar, yavaş işaretçi bir sonraki yazma yeridir.
    """
    write = 0
    for read in range(len(sorted_ids)):
        if read == 0 or sorted_ids[read] != sorted_ids[write - 1]:
            sorted_ids[write] = sorted_ids[read]
            write += 1
    return write
