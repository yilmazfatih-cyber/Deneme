"""LZW: tekrar eden dizileri sözlüğe ekleyerek sıkıştırır; çözücü sözlüğü kendisi yeniden kurar.

Fikir:
    Sözlük 256 tek baytla başlar. Kodlayıcı, sözlükte bulunan en uzun w dizisini okur; w'nin kodunu
    yazar ve w + (sonraki bayt) dizisini yeni bir kodla sözlüğe ekler. Çözücü aynı sözlüğü
    yalnız kodları okuyarak, bir adım geriden yeniden kurar; sözlüğün kendisini göndermek gerekmez.
    Tek ince durum ("KwKwK"): çözücü henüz eklemediği bir kodu okuyabilir; bu yalnız kod, önceki
    dizi + önceki dizinin ilk baytı olduğunda olur ve öyle çözülür.
    GIF ve eski Unix `compress` bunu kullanır. Bu sürümde kod genişliği sınırsızdır (liste döner);
    gerçek biçimler değişken bit genişliği ve sözlük sıfırlama ekler.

Karmaşıklık: sıkıştırma ve açma O(n) (sözlük erişimi sabit beklenen); yer O(sözlük boyu)
Ne zaman: tekrar eden kalıplı veri, basit ve patentsiz (artık) bir sözlük sıkıştırıcı gerektiğinde.
Ne zaman değil: modern genel amaçlı sıkıştırma için `zlib`/`lzma`/zstd çok daha iyi oran verir.
Bağımlılık: yok
Genişletme: kodları bit akışına yazmak için sözlük boyu 2^k'yı geçtikçe genişliği 1 bit artırın;
    sözlük 4096'yı aşınca sıfırlayın (GIF).

Örnek:
    >>> codes = lzw_compress(b"TOBEORNOTTOBEORTOBEORNOT")
    >>> codes
    [84, 79, 66, 69, 79, 82, 78, 79, 84, 256, 258, 260, 265, 259, 261, 263]
    >>> lzw_decompress(codes)
    b'TOBEORNOTTOBEORTOBEORNOT'
"""

from __future__ import annotations

from collections.abc import Sequence


def lzw_compress(data: bytes) -> list[int]:
    """Baytları LZW kodlarına çevirir."""
    dictionary = {bytes([i]): i for i in range(256)}
    codes: list[int] = []
    current = b""
    for byte in data:
        extended = current + bytes([byte])
        if extended in dictionary:
            current = extended
            continue
        codes.append(dictionary[current])
        dictionary[extended] = len(dictionary)
        current = bytes([byte])
    if current:
        codes.append(dictionary[current])
    return codes


def lzw_decompress(codes: Sequence[int]) -> bytes:
    """LZW kodlarını baytlara çözer."""
    if not codes:
        return b""
    dictionary = {i: bytes([i]) for i in range(256)}
    if codes[0] not in dictionary:
        raise ValueError(f"ilk kod tek bayt olmalı (bulunan {codes[0]})")
    previous = dictionary[codes[0]]
    out = bytearray(previous)
    for code in codes[1:]:
        if code in dictionary:
            entry = dictionary[code]
        elif code == len(dictionary):  # KwKwK: henüz eklenmemiş kod
            entry = previous + previous[:1]
        else:
            raise ValueError(f"geçersiz kod {code} (sözlük boyu {len(dictionary)})")
        out += entry
        dictionary[len(dictionary)] = previous + entry[:1]
        previous = entry
    return bytes(out)
