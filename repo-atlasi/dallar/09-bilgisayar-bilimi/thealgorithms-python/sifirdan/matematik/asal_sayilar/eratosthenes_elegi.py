"""
Eratosthenes eleği: 2'den n'e kadar asal sayıları, her asalın katlarını
"eleyerek" bulur.

Kaynak: https://en.wikipedia.org/wiki/Sieve_of_Eratosthenes

Karmaşıklık: O(n log log n) zaman, O(n) bellek. Eleme p*p'den başlar, çünkü
daha küçük katlar daha küçük bir asal tarafından zaten elenmiştir.
"""


def asallari_bul(ust_sinir: int) -> list[int]:
    """
    ust_sinir dahil, ondan küçük ya da eşit asal sayıları sırayla döndürür.

    >>> asallari_bul(30)
    [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
    >>> asallari_bul(2)
    [2]
    >>> asallari_bul(1)
    []
    >>> asallari_bul(-10)
    Traceback (most recent call last):
        ...
    ValueError: üst sınır negatif olamaz
    """
    if ust_sinir < 0:
        raise ValueError("üst sınır negatif olamaz")
    if ust_sinir < 2:
        return []
    asal_mi = [True] * (ust_sinir + 1)
    asal_mi[0] = asal_mi[1] = False
    aday = 2
    while aday * aday <= ust_sinir:
        if asal_mi[aday]:
            # Dilim ataması, döngüden çok daha hızlıdır ve aynı işi yapar.
            asal_mi[aday * aday :: aday] = [False] * len(range(aday * aday, ust_sinir + 1, aday))
        aday += 1
    return [sayi for sayi, asal in enumerate(asal_mi) if asal]


if __name__ == "__main__":
    import doctest

    doctest.testmod()
