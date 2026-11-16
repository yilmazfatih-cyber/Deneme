"""LZ77: veriyi "geride şu kadar önceki şu uzunlukta parçayı kopyala" komutlarıyla sıkıştırır.

Fikir:
    Kodlayıcı, son `window` baytlık geçmişte, şimdiki konumdan başlayan EN UZUN eşleşmeyi arar.
    Çıktı belirteçleri (offset, uzunluk, sonraki bayt) üçlüsüdür: "offset bayt geri git, uzunluk
    kadar kopyala, sonra bu baytı ekle". Eşleşme yoksa (0, 0, bayt) yazılır. Kopyanın kaynağı
    hedefle çakışabilir (offset < uzunluk): "ab" + (2, 6) → "abababab" — çözücü bayt bayt
    kopyaladığı için bu doğal olarak çalışır. Son belirteçte sonraki bayt olmayabilir (−1).
    DEFLATE (zip, gzip, PNG) bu fikri Huffman kodlamasıyla birleştirir.
    Bu sürüm eşleşmeyi doğrudan tarar (anlaşılır ama yavaş); gerçek kodlayıcılar karma zinciri
    kullanır.

Karmaşıklık: sıkıştırma O(n · window · lookahead) (doğrudan tarama); açma O(n); yer O(window)
Ne zaman: tekrarlayan metin/veri; sıkıştırma algoritmalarını öğrenmek; basit gömülü sıkıştırıcı.
Ne zaman değil: gerçek kullanımda `zlib` / `lzma` (C ile yazılmış, karma zincirli, Huffman'lı).
Bağımlılık: yok
Genişletme: eşleşme aramasını hızlandırmak için 3 baytlık önekleri konum listelerine eşleyen bir
    sözlük (karma zinciri) tutun; belirteçleri `huffman.py` ile kodlayın.

Örnek:
    >>> tokens = lz77_compress(b"abababab")
    >>> tokens, lz77_decompress(tokens)
    ([(0, 0, 97), (0, 0, 98), (2, 6, -1)], b'abababab')
"""

from __future__ import annotations

from collections.abc import Sequence

Token = tuple[int, int, int]  # (geri uzaklık, uzunluk, sonraki bayt; yoksa −1)


def lz77_compress(data: bytes, window: int = 4096, lookahead: int = 32) -> list[Token]:
    """Veriyi LZ77 belirteçlerine çevirir."""
    if window < 1 or lookahead < 1:
        raise ValueError("pencere ve ileri bakış en az 1 olmalı")
    tokens: list[Token] = []
    i = 0
    while i < len(data):
        best_length, best_offset = 0, 0
        for start in range(max(0, i - window), i):
            length = 0
            # start + length ≥ i olabilir: kopya kendi çıktısıyla çakışabilir (ör. "aaaa")
            while (
                length < lookahead
                and i + length < len(data)
                and data[start + length] == data[i + length]
            ):
                length += 1
            if length > best_length:
                best_length, best_offset = length, i - start
        if i + best_length < len(data):
            tokens.append((best_offset, best_length, data[i + best_length]))
            i += best_length + 1
        else:  # verinin sonuna dek eşleşti: sonraki bayt yok
            tokens.append((best_offset, best_length, -1))
            i += best_length
    return tokens


def lz77_decompress(tokens: Sequence[Token]) -> bytes:
    """Belirteçlerden veriyi geri kurar (çakışan kopyalar bayt bayt yapılır)."""
    out = bytearray()
    for offset, length, nxt in tokens:
        if length and not 0 < offset <= len(out):
            raise ValueError(f"geçersiz geri uzaklık {offset} (çıktı uzunluğu {len(out)})")
        start = len(out) - offset
        for k in range(length):
            out.append(out[start + k])
        if nxt >= 0:
            out.append(nxt)
    return bytes(out)
