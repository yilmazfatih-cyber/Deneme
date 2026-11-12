"""
En büyük ortak bölen (EBOB) için Öklid algoritması ve EBOB'dan türetilen en
küçük ortak kat (EKOK).

Kaynak: https://en.wikipedia.org/wiki/Euclidean_algorithm

Fikir: ebob(a, b) = ebob(b, a mod b). Kalan her iki adımda en az yarıya
indiği için adım sayısı O(log min(a, b)) olur.
"""


def en_buyuk_ortak_bolen(sayi1: int, sayi2: int) -> int:
    """
    İki tam sayının EBOB'unu döndürür (işaretten bağımsız, sonuç >= 0).

    >>> en_buyuk_ortak_bolen(48, 18)
    6
    >>> en_buyuk_ortak_bolen(-48, 18)
    6
    >>> en_buyuk_ortak_bolen(0, 7)
    7
    >>> en_buyuk_ortak_bolen(2.5, 5)
    Traceback (most recent call last):
        ...
    TypeError: tam sayı bekleniyordu
    """
    # bool, int'in alt sınıfıdır; True/False'u sayı gibi kabul etmemek için ayrıca eleriz.
    if any(not isinstance(sayi, int) or isinstance(sayi, bool) for sayi in (sayi1, sayi2)):
        raise TypeError("tam sayı bekleniyordu")
    sayi1, sayi2 = abs(sayi1), abs(sayi2)
    while sayi2:
        sayi1, sayi2 = sayi2, sayi1 % sayi2
    return sayi1


def en_kucuk_ortak_kat(sayi1: int, sayi2: int) -> int:
    """
    İki tam sayının EKOK'unu döndürür: |a*b| / ebob(a, b).

    >>> en_kucuk_ortak_kat(4, 6)
    12
    >>> en_kucuk_ortak_kat(21, 6)
    42
    >>> en_kucuk_ortak_kat(0, 5)
    Traceback (most recent call last):
        ...
    ValueError: EKOK sıfır içeren girdi için tanımsız
    """
    if sayi1 == 0 or sayi2 == 0:
        raise ValueError("EKOK sıfır içeren girdi için tanımsız")
    # Önce bölüp sonra çarpmak ara sonucun büyümesini sınırlar.
    return abs(sayi1) // en_buyuk_ortak_bolen(sayi1, sayi2) * abs(sayi2)


if __name__ == "__main__":
    import doctest

    doctest.testmod()
