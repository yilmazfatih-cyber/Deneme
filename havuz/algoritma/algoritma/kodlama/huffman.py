"""Huffman kodlaması: sık sembole kısa, seyrek sembole uzun bit dizisi veren en iyi önek kodu.

Fikir:
    Her sembol, sıklığı ağırlık olan bir yaprak düğümdür. En hafif İKİ düğüm sürekli birleştirilir
    (öncelik kuyruğu); yeni düğümün ağırlığı ikisinin toplamıdır. Tek düğüm kalınca kök odur.
    Kökten yaprağa giden yolda sol = 0, sağ = 1 yazılırsa her sembolün kodu çıkar. Hiçbir kod
    bir başkasının öneki olmadığından bit akışı ayraçsız çözülür. Toplam kod uzunluğu
    Σ sıklık·uzunluk, tüm önek kodları arasında EN KÜÇÜKTÜR (açgözlü seçim kanıtlıdır).
    Eşit ağırlıklarda belirlenimci olmak için kuyruğa sıra numarası da konur.
    Tek sembollü girdide kod "0" verilir (boş kod çözülemez).

Karmaşıklık: kod oluşturma O(k log k) (k = farklı sembol); kodlama/çözme O(n + toplam bit)
Ne zaman: DEFLATE (zip, PNG), JPEG ve MP3'ün entropi kodlama adımı; sembol sıklıkları belli ve
    çarpık dağılımlıysa.
Ne zaman değil: sıklıklar ikinin kuvvetlerinden çok uzaksa aritmetik/ANS kodlama daha iyidir;
    tekrar eden ÖRÜNTÜLER için önce LZ77 (`lz77.py`) gerekir.
Bağımlılık: yok
Genişletme: kod tablosunu küçük taşımak için "kanonik Huffman" (yalnız uzunlukları sakla, kodları
    uzunluk sırasıyla yeniden üret) kullanın.

Örnek:
    >>> code = huffman_code({"a": 45, "b": 13, "c": 12, "d": 16, "e": 9, "f": 5})
    >>> sorted((s, len(c)) for s, c in code.items())
    [('a', 1), ('b', 3), ('c', 3), ('d', 3), ('e', 4), ('f', 4)]
    >>> bits, table = huffman_encode("abracadabra")
    >>> len(bits), "".join(huffman_decode(bits, table))
    (23, 'abracadabra')
"""

from __future__ import annotations

import heapq
from collections import Counter
from collections.abc import Hashable, Iterable, Mapping
from typing import TypeVar

T = TypeVar("T", bound=Hashable)


def huffman_code(frequencies: Mapping[T, int]) -> dict[T, str]:
    """Sembol → bit dizgisi ("0"/"1") eşlemi. Sıklıklar pozitif olmalı."""
    if any(f <= 0 for f in frequencies.values()):
        raise ValueError("sıklıklar pozitif olmalı")
    leaves = list(frequencies.items())
    if not leaves:
        return {}
    left: list[int] = [-1] * len(leaves)  # düğüm → sol çocuk (yaprakta −1)
    right: list[int] = [-1] * len(leaves)
    heap = [
        (weight, node, node) for node, (_, weight) in enumerate(leaves)
    ]  # (ağırlık, sıra, düğüm)
    heapq.heapify(heap)
    while len(heap) > 1:
        w1, _, a = heapq.heappop(heap)
        w2, _, b = heapq.heappop(heap)
        node = len(left)
        left.append(a)
        right.append(b)
        heapq.heappush(heap, (w1 + w2, node, node))
    code: dict[T, str] = {}
    stack = [(heap[0][2], "")]
    while stack:  # kökten yapraklara: sol 0, sağ 1
        node, prefix = stack.pop()
        if node < len(leaves):
            code[leaves[node][0]] = prefix or "0"  # tek sembol: boş kod yerine "0"
        else:
            stack.append((left[node], prefix + "0"))
            stack.append((right[node], prefix + "1"))
    return code


def huffman_encode(symbols: Iterable[T]) -> tuple[str, dict[T, str]]:
    """(bit dizgisi, kod tablosu). Tablo, çözmek için gereklidir."""
    items = list(symbols)
    code = huffman_code(Counter(items))
    return "".join(code[s] for s in items), code


def huffman_decode(bits: str, code: Mapping[T, str]) -> list[T]:
    """Bit dizgisini sembol listesine çözer (metin için: "".join(...))."""
    reverse = {c: s for s, c in code.items()}
    out: list[T] = []
    current = ""
    for bit in bits:
        current += bit
        if current in reverse:
            out.append(reverse[current])
            current = ""
    if current:
        raise ValueError("bit dizisi bir kodun ortasında bitti (eksik ya da bozuk veri)")
    return out
