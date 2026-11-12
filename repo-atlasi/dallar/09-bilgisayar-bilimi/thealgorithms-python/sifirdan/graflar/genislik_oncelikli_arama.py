"""
Genişlik öncelikli arama (BFS): ağırlıksız bir grafta başlangıçtan katman
katman yayılır; bu yüzden bulduğu ilk yol, kenar sayısı en az olan yoldur.

Kaynak: https://en.wikipedia.org/wiki/Breadth-first_search

Karmaşıklık: O(V + E) zaman, O(V) bellek (kuyruk + ebeveyn tablosu).
Web tarayıcılarının (crawler) keşif kuyruğu da bu mantıkla çalışır.
"""

from collections import deque
from collections.abc import Hashable, Mapping, Sequence


def en_kisa_yol(
    komsuluk: Mapping[Hashable, Sequence[Hashable]], baslangic: Hashable, hedef: Hashable
) -> list[Hashable]:
    """
    Başlangıçtan hedefe en az kenarlı yolu döndürür; yol yoksa boş liste.
    Sözleşme: her düğüm sözlükte anahtar olarak bulunur (komşusu yoksa boş liste).

    >>> sehirler = {
    ...     "İstanbul": ["Bursa", "Kocaeli"],
    ...     "Kocaeli": ["Sakarya"],
    ...     "Bursa": ["Eskişehir"],
    ...     "Sakarya": ["Eskişehir"],
    ...     "Eskişehir": ["Ankara"],
    ...     "Ankara": [],
    ... }
    >>> en_kisa_yol(sehirler, "İstanbul", "Ankara")
    ['İstanbul', 'Bursa', 'Eskişehir', 'Ankara']
    >>> en_kisa_yol(sehirler, "Ankara", "İstanbul")
    []
    >>> en_kisa_yol(sehirler, "Bursa", "Bursa")
    ['Bursa']
    >>> en_kisa_yol(sehirler, "İzmir", "Ankara")
    Traceback (most recent call last):
        ...
    ValueError: başlangıç düğümü grafta yok: 'İzmir'
    """
    if baslangic not in komsuluk:
        raise ValueError(f"başlangıç düğümü grafta yok: {baslangic!r}")
    ebeveyn: dict[Hashable, Hashable | None] = {baslangic: None}
    kuyruk: deque[Hashable] = deque([baslangic])
    while kuyruk:
        dugum = kuyruk.popleft()
        if dugum == hedef:
            # Hedeften geriye, ebeveyn zinciri boyunca yürüyerek yolu kur.
            yol = [dugum]
            while (onceki := ebeveyn[yol[-1]]) is not None:
                yol.append(onceki)
            return yol[::-1]
        for komsu in komsuluk.get(dugum, ()):
            # Ziyaret işaretini kuyruğa eklerken koymak, aynı düğümün iki kez eklenmesini önler.
            if komsu not in ebeveyn:
                ebeveyn[komsu] = dugum
                kuyruk.append(komsu)
    return []


if __name__ == "__main__":
    import doctest

    doctest.testmod()
