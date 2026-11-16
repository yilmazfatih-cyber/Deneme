"""CRC-32 (IEEE 802.3, zip/PNG/Ethernet): veri bozulmasını yakalayan 32 bitlik sağlama toplamı.

Fikir:
    Veri, katsayıları bitler olan dev bir çok terimli gibi düşünülür ve sabit bir üreteç çok
    terimliye (0x04C11DB7) GF(2)'de (toplama = XOR) bölünür; kalan CRC'dir. Tek bit, çift bit,
    tek sayıda bit ve 32 bitten kısa ardışık hata patlamalarının TAMAMI yakalanır.
    Bayt bayt hesap için 256 girdilik tablo önceden hesaplanır: her bayt, tablodan bir bakış ve
    birkaç kaydırmayla işlenir. Standart: bitler ters sırada (yansıtılmış polinom 0xEDB88320),
    başlangıç 0xFFFFFFFF, sonda yine 0xFFFFFFFF ile XOR. `crc` parametresi önceki parçanın
    sonucudur: parça parça hesap tek seferliğe eşittir (zlib.crc32 ile aynı arayüz).
    CRC KASITLI değişikliğe karşı koruma DEĞİLDİR (kolayca taklit edilir); onun için SHA-256.

Karmaşıklık: O(n) (bayt başına bir tablo bakışı); yer O(256) tablo
Ne zaman: dosya/paket bütünlüğü (kazara bozulma), zip/PNG/gzip biçimleri, gömülü iletişim.
Ne zaman değil: Python'da `zlib.crc32` (C) kullanın; güvenlik için kriptografik özet (hashlib).
Bağımlılık: yok
Genişletme: CRC-32C (Castagnoli, 0x82F63B78) için yalnız polinom sabitini değiştirin.

Örnek:
    >>> hex(crc32(b"123456789")), crc32(b"Merhaba") == crc32(b"haba", crc32(b"Mer"))
    ('0xcbf43926', True)
"""

from __future__ import annotations

_POLYNOMIAL = 0xEDB88320  # 0x04C11DB7'nin bit sırası ters çevrilmiş hâli


def _make_table() -> list[int]:
    table = []
    for byte in range(256):
        crc = byte
        for _ in range(8):
            crc = (crc >> 1) ^ _POLYNOMIAL if crc & 1 else crc >> 1
        table.append(crc)
    return table


_TABLE = _make_table()


def crc32(data: bytes, crc: int = 0) -> int:
    """CRC-32 (zlib.crc32 ile aynı); `crc` önceki parçanın sonucu (zincirleme)."""
    crc ^= 0xFFFFFFFF
    for byte in data:
        crc = (crc >> 8) ^ _TABLE[(crc ^ byte) & 0xFF]
    return crc ^ 0xFFFFFFFF


def crc32_bitwise(data: bytes) -> int:
    """Tablosuz, bit bit sürüm (yavaş; tablonun doğruluğunu göstermek için)."""
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ _POLYNOMIAL if crc & 1 else crc >> 1
    return crc ^ 0xFFFFFFFF
