"""
Düzenleme (Levenshtein) mesafesi: bir metni diğerine çevirmek için gereken en
az ekleme, silme ve değiştirme sayısı. Dinamik programlamanın klasik örneğidir:
d[i][j] = ilk metnin i harfli öneki ile ikincinin j harfli öneki arasındaki mesafe.

Kaynak: https://en.wikipedia.org/wiki/Levenshtein_distance

Karmaşıklık: O(m*n) zaman. Tablonun yalnızca bir önceki satırı gerektiği için
bellek O(min(m, n)) olur.
"""


def duzenleme_mesafesi(kaynak: str, hedef: str) -> int:
    """
    İki metin arasındaki Levenshtein mesafesini döndürür.

    >>> duzenleme_mesafesi("kedi", "kadı")
    2
    >>> duzenleme_mesafesi("kitap", "kitaplık")
    3
    >>> duzenleme_mesafesi("", "abc")
    3
    >>> duzenleme_mesafesi("aynı", "aynı")
    0
    >>> duzenleme_mesafesi("abc", 5)
    Traceback (most recent call last):
        ...
    TypeError: iki metin (str) bekleniyordu
    """
    if not isinstance(kaynak, str) or not isinstance(hedef, str):
        raise TypeError("iki metin (str) bekleniyordu")
    # Kısa olanı sütun yaparak satır uzunluğunu (yani belleği) en aza indiriyoruz.
    if len(kaynak) < len(hedef):
        kaynak, hedef = hedef, kaynak
    onceki_satir = list(range(len(hedef) + 1))
    for i, kaynak_harfi in enumerate(kaynak, start=1):
        satir = [i]
        for j, hedef_harfi in enumerate(hedef, start=1):
            satir.append(
                min(
                    onceki_satir[j] + 1,  # silme
                    satir[j - 1] + 1,  # ekleme
                    onceki_satir[j - 1] + (kaynak_harfi != hedef_harfi),  # değiştirme / eşleşme
                )
            )
        onceki_satir = satir
    return onceki_satir[-1]


if __name__ == "__main__":
    import doctest

    doctest.testmod()
