"""Hamming kodu (8,4) SECDED: 4 veri biti → 8 bit; tek bit hatayı düzeltir, çift hatayı sezer.

Fikir:
    Hamming(7,4): 1, 2 ve 4. konumlar eşlik bitidir; p_k, konum numarasının k. biti 1 olan
    konumların XOR'unu sıfırlar. Alıcı aynı eşlikleri yeniden hesaplar; sonuçlar ikilik sayı
    olarak yan yana yazılınca ("sendrom") HATALI BİTİN KONUMUNU verir (0 = hata yok). O bit ters
    çevrilerek düzeltilir.
    Genişletilmiş (8,4): 0. konuma tüm 7 bitin eşliği eklenir. Sendrom ≠ 0 ve genel eşlik bozuk →
    tek hata (düzelt); sendrom ≠ 0 ama genel eşlik doğru → İKİ hata (düzeltilemez, bildir);
    sendrom = 0 ama genel eşlik bozuk → yalnız 0. bit bozulmuş.
    Bayt kodlama: her bayt iki yarıma (4 bit) bölünür, her yarım bir 8 bitlik kod sözcüğü olur.

Karmaşıklık: sözcük başına O(1); bayt dizisi için O(n); yer O(n) (veri iki katına çıkar)
Ne zaman: ECC bellekler, uzay/gömülü iletişim, QR benzeri hata düzeltme fikrini anlamak.
Ne zaman değil: patlama hataları ve yüksek gürültüde Reed-Solomon / LDPC gibi güçlü kodlar gerekir.
Bağımlılık: yok
Genişletme: (2^r − 1, 2^r − r − 1) genel Hamming kodu için eşlik konumlarını 1, 2, 4, …, 2^(r−1)
    olarak genişletin.

Örnek:
    >>> word = encode_nibble(0b1011)
    >>> decode_word(word), decode_word(word ^ 0b0010_0000), decode_word(word ^ 0b0010_0010)
    ((11, 'ok'), (11, 'corrected'), (None, 'double_error'))
"""

from __future__ import annotations

from collections.abc import Sequence

_DATA_POSITIONS = (3, 5, 6, 7)  # 1 tabanlı konumlar; 1, 2, 4 eşlik, 0 genel eşlik


def encode_nibble(nibble: int) -> int:
    """4 bitlik veriyi 8 bitlik kod sözcüğüne çevirir (bit i = konum i)."""
    if not 0 <= nibble < 16:
        raise ValueError("yarım bayt 0–15 arasında olmalı")
    bits = [0] * 8
    for k, position in enumerate(_DATA_POSITIONS):
        bits[position] = nibble >> k & 1
    for parity in (1, 2, 4):
        bits[parity] = sum(bits[p] for p in range(1, 8) if p & parity and p != parity) % 2
    bits[0] = sum(bits[1:]) % 2  # genel eşlik
    return sum(bit << i for i, bit in enumerate(bits))


def decode_word(word: int) -> tuple[int | None, str]:
    """(veri ya da None, durum): 'ok', 'corrected' (tek hata düzeltildi), 'double_error'."""
    if not 0 <= word < 256:
        raise ValueError("kod sözcüğü 0–255 arasında olmalı")
    bits = [word >> i & 1 for i in range(8)]
    syndrome = 0
    for parity in (1, 2, 4):
        if sum(bits[p] for p in range(1, 8) if p & parity) % 2:
            syndrome |= parity
    overall_ok = sum(bits) % 2 == 0
    status = "ok"
    if syndrome and overall_ok:
        return None, "double_error"
    if syndrome or not overall_ok:
        bits[syndrome] ^= 1  # sendrom 0 ise bozulan genel eşlik bitidir
        status = "corrected"
    return sum(bits[p] << k for k, p in enumerate(_DATA_POSITIONS)), status


def encode_bytes(data: bytes) -> bytes:
    """Her baytı iki kod sözcüğüne (düşük yarım, yüksek yarım) çevirir."""
    return bytes(encode_nibble(half) for byte in data for half in (byte & 0xF, byte >> 4))


def decode_bytes(words: Sequence[int]) -> tuple[bytes, int]:
    """(veri, düzeltilen hata sayısı). Çift hatalı sözcük varsa ValueError."""
    if len(words) % 2:
        raise ValueError("kod sözcüğü sayısı çift olmalı (her bayt iki sözcük)")
    out = bytearray()
    corrected = 0
    for i in range(0, len(words), 2):
        halves = []
        for word in words[i : i + 2]:
            value, status = decode_word(word)
            if value is None:
                raise ValueError(f"{i // 2}. baytta düzeltilemez çift bit hatası")
            corrected += status == "corrected"
            halves.append(value)
        out.append(halves[0] | halves[1] << 4)
    return bytes(out), corrected
