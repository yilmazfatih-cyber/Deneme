"""Kayan pencere en büyüğü/en küçüğü: k uzunluklu her pencerenin en büyüğü, toplam O(n).

Fikir:
    Çift uçlu bir kuyrukta yalnız "hâlâ en büyük olma şansı olan" dizinler tutulur; değerleri
    kuyruğun başından sonuna AZALAN sıradadır. Yeni öğe gelince, ondan küçük-eşit olanlar sondan
    atılır (yeni öğe onlardan hem büyük hem daha geç pencereden çıkacak: bir daha asla en büyük
    olamazlar). Pencereden düşen dizin baştan atılır. Pencerenin en büyüğü hep baştadır.
    Her dizin kuyruğa bir kez girip bir kez çıktığı için toplam iş O(n).

Karmaşıklık: zaman O(n); yer O(k)
Ne zaman: hareketli en yüksek/en düşük (borsa grafiği, sensör sınırları), DP en iyilemesi
    (`algoritma/dp/monotonic_queue_dp.py`), "en çok k uzunluklu pencerede…" soruları.
Ne zaman değil: pencere boyu değişken ve sorgular rastgele ise seyrek tablo
    (`algoritma/veri_yapilari/sparse_table.py`) ya da segment ağacı.
Bağımlılık: yok
Genişletme: en küçük için karşılaştırmayı ters çevirmek yeter (`sliding_window_min` bunu yapar).

Örnek:
    >>> sliding_window_max([1, 3, -1, -3, 5, 3, 6, 7], 3)
    [3, 3, 5, 5, 6, 7]
    >>> sliding_window_min([4, 2, 12, 3, 8], 2)
    [2, 2, 3, 3]
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence


def _window_extreme(values: Sequence[float], k: int, larger: bool) -> list[float]:
    if k < 1:
        raise ValueError("pencere uzunluğu en az 1 olmalı")
    window: deque[int] = deque()  # değerleri (en büyük için) azalan dizinler
    result: list[float] = []
    for i, value in enumerate(values):
        while window and (values[window[-1]] <= value if larger else values[window[-1]] >= value):
            window.pop()  # yeni öğe bunları geride bıraktı
        window.append(i)
        if window[0] <= i - k:
            window.popleft()  # pencereden düştü
        if i >= k - 1:
            result.append(values[window[0]])
    return result


def sliding_window_max(values: Sequence[float], k: int) -> list[float]:
    """values[i : i + k] pencerelerinin en büyükleri (n − k + 1 tane)."""
    return _window_extreme(values, k, larger=True)


def sliding_window_min(values: Sequence[float], k: int) -> list[float]:
    """values[i : i + k] pencerelerinin en küçükleri."""
    return _window_extreme(values, k, larger=False)
