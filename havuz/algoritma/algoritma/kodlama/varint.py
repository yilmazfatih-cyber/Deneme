"""Değişken uzunluklu tam sayı (varint, LEB128) ve zigzag: küçük sayıları az baytla yazar.

Fikir:
    Sayı 7'şer bitlik gruplara bölünür (en düşük grup önce). Her bayta 7 bit veri konur; en üst
    bit (0x80) "devamı var" işaretidir. 0–127 tek bayt, 128–16383 iki bayt… Protokol Buffers,
    SQLite, WebAssembly ve Git paket dosyaları bunu kullanır.
    Negatif sayılar: ikiye tümleyende −1 çok büyük görünür (10 bayt). Zigzag dönüşümü küçük
    mutlak değerli sayıları küçük doğal sayılara eşler: 0 → 0, −1 → 1, 1 → 2, −2 → 3 …
    (n ≥ 0 → 2n, n < 0 → −2n − 1). Önce zigzag, sonra varint.
    Çözücü bozuk veriyi (yarım kalmış sayı, gereğinden uzun kodlama) reddeder.

Karmaşıklık: kodlama/çözme O(bayt sayısı) = O(log₁₂₈ n); yer O(1)
Ne zaman: çoğu küçük olan tam sayıları yoğun saklamak/iletmek (sayaç, uzunluk alanı, kimlik farkı).
Ne zaman değil: değerler hep büyükse sabit genişlik (struct "<q") daha basit ve hızlıdır.
Bağımlılık: yok
Genişletme: sıralı kimlik listesi için önce farkları (delta) alın, sonra zigzag + varint.

Örnek:
    >>> encode_varint(1), encode_varint(300), decode_varint(b"\\xac\\x02")
    (b'\\x01', b'\\xac\\x02', (300, 2))
    >>> [zigzag_encode(n) for n in (0, -1, 1, -2, 2)], zigzag_decode(3)
    ([0, 1, 2, 3, 4], -2)
"""

from __future__ import annotations


def encode_varint(value: int) -> bytes:
    """Negatif olmayan tam sayıyı LEB128 baytlarına çevirir."""
    if value < 0:
        raise ValueError("varint negatif olamaz; önce zigzag_encode uygulayın")
    out = bytearray()
    while True:
        group = value & 0x7F
        value >>= 7
        if value:
            out.append(group | 0x80)  # devamı var
        else:
            out.append(group)
            return bytes(out)


def decode_varint(data: bytes, position: int = 0) -> tuple[int, int]:
    """(değer, sonraki konum). Yarım kalmış ya da gereğinden uzun kodlamada ValueError."""
    value = shift = 0
    start = position
    while True:
        if position >= len(data):
            raise ValueError(f"{start}. konumdaki varint yarım kalmış (veri bitti)")
        byte = data[position]
        position += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            if byte == 0 and position - start > 1:
                raise ValueError(f"{start}. konumdaki varint gereğinden uzun (sonda 0x00)")
            return value, position


def zigzag_encode(value: int) -> int:
    """İşaretli → işaretsiz: 0, −1, 1, −2, 2 … → 0, 1, 2, 3, 4 …"""
    return 2 * value if value >= 0 else -2 * value - 1


def zigzag_decode(value: int) -> int:
    """zigzag_encode'un tersi."""
    if value < 0:
        raise ValueError("zigzag kodu negatif olamaz")
    return value // 2 if value % 2 == 0 else -(value + 1) // 2
