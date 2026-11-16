"""Çalışma uzunluğu kodlaması (RLE): art arda yinelenen öğeleri (öğe, adet) çiftleriyle yazar.

Fikir:
    "AAAABBBCCD" → [("A", 4), ("B", 3), ("C", 2), ("D", 1)]. Uzun tekrarlar tek bir çifte iner.
    Tekrar yoksa çıktı girdiden BÜYÜK olur (her öğeye bir adet eklenir); RLE bu yüzden yalnız
    uzun aynı-değer koşuları olan verilerde (tek renkli bölgeli görüntü, faks, seyrek bit
    eşlemleri) işe yarar. Bayt sürümü: her koşu (adet 1–255, bayt) olarak iki bayta yazılır;
    255'ten uzun koşular bölünür.

Karmaşıklık: kodlama ve çözme O(n); yer O(koşu sayısı)
Ne zaman: düz renkli görüntüler (BMP/TGA/PCX RLE), faks, başka bir sıkıştırmanın ön/son adımı
    (BWT + hareket-başa + RLE, bzip2'de olduğu gibi).
Ne zaman değil: genel metin/veri için (`zlib`, LZ77 + Huffman) çok daha iyi sıkıştırır.
Bağımlılık: yok
Genişletme: tekrarsız bölümleri "değişmez blok" olarak işaretleyen PackBits biçimi, rastgele
    veride büyümeyi en çok 1/128'e sınırlar.

Örnek:
    >>> rle_encode("AAAABBBCCD")
    [('A', 4), ('B', 3), ('C', 2), ('D', 1)]
    >>> rle_decode([("ş", 3), ("e", 1)]), rle_encode_bytes(b"\\x00" * 300)
    ('şşşe', b'\\xff\\x00-\\x00')
"""

from __future__ import annotations

from collections.abc import Sequence


def rle_encode(text: str) -> list[tuple[str, int]]:
    """Metni (karakter, adet) koşularına çevirir."""
    runs: list[tuple[str, int]] = []
    for char in text:
        if runs and runs[-1][0] == char:
            runs[-1] = (char, runs[-1][1] + 1)
        else:
            runs.append((char, 1))
    return runs


def rle_decode(runs: Sequence[tuple[str, int]]) -> str:
    """Koşulardan metni geri kurar."""
    if any(count < 1 for _, count in runs):
        raise ValueError("koşu adedi en az 1 olmalı")
    return "".join(char * count for char, count in runs)


def rle_encode_bytes(data: bytes) -> bytes:
    """Baytları (adet, bayt) ikilileri olarak kodlar; adet 1–255."""
    out = bytearray()
    i = 0
    while i < len(data):
        j = i
        while j < len(data) and data[j] == data[i] and j - i < 255:
            j += 1
        out += bytes((j - i, data[i]))
        i = j
    return bytes(out)


def rle_decode_bytes(encoded: bytes) -> bytes:
    """`rle_encode_bytes` çıktısını çözer."""
    if len(encoded) % 2:
        raise ValueError("kodlanmış veri çift uzunlukta olmalı (adet, bayt ikilileri)")
    out = bytearray()
    for k in range(0, len(encoded), 2):
        count, value = encoded[k], encoded[k + 1]
        if count == 0:
            raise ValueError(f"{k}. konumda geçersiz adet 0")
        out += bytes([value]) * count
    return bytes(out)
