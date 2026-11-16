"""Eklemeli sıralama: her öğeyi soldaki sıralı kısma, yerini bulana dek kaydırarak yerleştirir.

Fikir:
    Elinizdeki iskambil kâğıtlarını sıralar gibi: soldaki kısım her zaman sıralıdır; sıradaki
    öğe alınır, kendisinden büyük olanlar birer sağa kaydırılır ve öğe açılan boşluğa konur.
    Girdi neredeyse sıralıysa her öğe az kayar ve süre O(n + ters çevrim sayısı)'na iner.
    Küçük dizilerde (n ≲ 32) sabit maliyeti çok düşük olduğundan Timsort ve introsort gibi
    karma algoritmalar küçük parçaları bununla sıralar.

Karmaşıklık: zaman en kötü/ortalama O(n²), en iyi (sıralı girdi) O(n); ek yer O(1) (yerinde)
Kararlılık: kararlı (eşit anahtarlar özgün sırasını korur; yalnız kesin büyükler kaydırılır)
Ne zaman: çok küçük ya da neredeyse sıralı diziler; çevrimiçi (öğeler tek tek geliyorsa).
Ne zaman değil: büyük ve karışık dizilerde; gerçek kodda `sorted()` (Timsort) kullanın.
Bağımlılık: yok
Genişletme: kaydırma yerine ikili aramayla konum bulmak karşılaştırmayı O(n log n)'e indirir
    ama taşıma yine O(n²) kalır.

Örnek:
    >>> insertion_sort([5, 2, 4, 6, 1, 3])
    [1, 2, 3, 4, 5, 6]
    >>> insertion_sort([("ali", 3), ("can", 1), ("ece", 3)], key=lambda p: p[1])
    [('can', 1), ('ali', 3), ('ece', 3)]
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, TypeVar

T = TypeVar("T")


def _identity(value: Any) -> Any:
    return value


def insertion_sort(items: Sequence[T], key: Callable[[T], Any] | None = None) -> list[T]:
    """Yeni, sıralı bir liste döndürür (girdi değişmez)."""
    get_key = key if key is not None else _identity
    result = list(items)
    keys = [get_key(item) for item in result]
    for i in range(1, len(result)):
        item, item_key = result[i], keys[i]
        j = i - 1
        while j >= 0 and item_key < keys[j]:  # yalnız KESİN büyükleri kaydır → kararlı
            result[j + 1], keys[j + 1] = result[j], keys[j]
            j -= 1
        result[j + 1], keys[j + 1] = item, item_key
    return result
