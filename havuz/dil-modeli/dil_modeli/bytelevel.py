"""Bayt düzeyi BPE'nin iki yapı taşı: bayt <-> görünür karakter eşlemesi ve ön-bölme.

GPT-2'nin ve Hugging Face `tokenizers` kütüphanesindeki `ByteLevel` bileşeninin davranışını
saf Python'da yineler (eşlik: tests/test_tokenizer_parity.py). `tokenizer.py` ve
`tokenizer_train.py` kullanır; tarayıcıdaki karşılığı `tarayici/tokenizer.js`'tir.

Genişletme: Ön-bölme kuralını DEĞİŞTİRMEYİN; değişirse eğitilmiş her tokenizer ve
`tarayici/tokenizer.js` ile eşlik bozulur. Yeni bir kural gerekiyorsa yeni bir tokenizer
sınıfı yazın (örnek: `tokenizer_char.py`).
"""

from __future__ import annotations

import re
from functools import lru_cache

from . import unicode_classes


def _build_byte_to_char() -> list[str]:
    """GPT-2'nin `bytes_to_unicode` tablosu: 256 baytın her birine görünür bir karakter.

    Yazdırılabilir baytlar kendileriyle, boşluk ve denetim baytları U+0100'den başlayan
    karakterlerle gösterilir (ör. boşluk -> 'Ġ', satır sonu -> 'Ċ').
    """
    printable = [*range(0x21, 0x7F), *range(0xA1, 0xAD), *range(0xAE, 0x100)]
    table = [""] * 256
    for b in printable:
        table[b] = chr(b)
    extra = 0
    for b in range(256):
        if not table[b]:
            table[b] = chr(256 + extra)
            extra += 1
    return table


BYTE_TO_CHAR: list[str] = _build_byte_to_char()
CHAR_TO_BYTE: dict[str, int] = {ch: b for b, ch in enumerate(BYTE_TO_CHAR)}
# latin-1 ile çözülmüş bayt dizgesini bayt-düzeyi karakterlere çeviren tablo (hızlı yol).
_TRANSLATE = {b: ord(ch) for b, ch in enumerate(BYTE_TO_CHAR)}
_SURROGATES = re.compile("[\ud800-\udfff]")


def sanitize(text: str) -> str:
    """Eşsiz vekil kod noktalarını (UTF-8'e çevrilemez) U+FFFD ile değiştirir."""
    return text if text.isascii() else _SURROGATES.sub("�", text)


def to_bytelevel(text: str) -> str:
    """Metni UTF-8 baytlarına çevirip her baytı görünür karakteriyle yazar."""
    return text.encode("utf-8").decode("latin-1").translate(_TRANSLATE)


def from_bytelevel(token: str) -> bytes:
    """`to_bytelevel` işleminin tersi: bayt-düzeyi karakterlerden ham baytlar."""
    return bytes(CHAR_TO_BYTE[ch] for ch in token)


def parse_ranges(table: str) -> list[tuple[int, int]]:
    """'0041-005A 00AA' biçimindeki tabloyu [(0x41, 0x5A), (0xAA, 0xAA)] listesine çevirir."""
    ranges: list[tuple[int, int]] = []
    for item in table.split():
        low, _, high = item.partition("-")
        ranges.append((int(low, 16), int(high or low, 16)))
    return ranges


def _class_body(ranges: list[tuple[int, int]]) -> str:
    """Aralıkları düzenli ifade karakter sınıfının içine yazılacak metne çevirir."""
    parts: list[str] = []
    for lo, hi in ranges:
        parts.append(f"\\U{lo:08x}" if lo == hi else f"\\U{lo:08x}-\\U{hi:08x}")
    return "".join(parts)


@lru_cache(maxsize=1)
def pretokenize_pattern() -> re.Pattern[str]:
    """GPT-2 ön-bölme düzenli ifadesinin Python karşılığını kurar (ilk çağrıda, bir kez).

    Özgün ifade: 's|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+
    Python'un `re` modülü \\p{L} bilmez; ayrıca Unicode sürümü ortamdan ortama değişir. Bu yüzden
    sınıflar `unicode_classes.py` tablolarından kurulur (tarayıcı da aynı tabloları kullanır).
    Not: `\\s` de açıkça yazılır; Python ve JavaScript'in kendi `\\s` kümeleri farklıdır.
    """
    letter = _class_body(parse_ranges(unicode_classes.LETTER))
    number = _class_body(parse_ranges(unicode_classes.NUMBER))
    space = _class_body(parse_ranges(unicode_classes.WHITESPACE))
    pattern = (
        "'s|'t|'re|'ve|'m|'ll|'d"
        f"| ?[{letter}]+"
        f"| ?[{number}]+"
        f"| ?[^{space}{letter}{number}]+"
        f"|[{space}]+(?![^{space}])"
        f"|[{space}]+"
    )
    return re.compile(pattern)


def pretokenize(text: str) -> list[str]:
    """Metni BPE'nin ayrı ayrı işleyeceği parçalara böler; parçalar birleşince metni verir."""
    return pretokenize_pattern().findall(text)
