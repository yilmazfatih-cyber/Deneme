"""Sayıyı Türkçe yazıya çevirir: 1234 → "bin iki yüz otuz dört"; tutar → "… lira … kuruş".

Fatura, makbuz ve çek metinlerinde ("yalnız …") kullanılır. Sözcükler ``tr/sayi_sozcukleri.json``
ile aynıdır; bir test ikisinin uyuştuğunu denetler.
Türkçe'ye özgü kurallar: 100 "bir yüz" değil "yüz", 1000 "bir bin" değil "bin" okunur;
ama 1 000 000 "bir milyon" okunur.
Genişletme: daha büyük basamak gerekiyorsa ``_SCALES`` listesine ekleyin (katrilyondan sonrası yok).
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

_ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
_SCALES = ["", "bin", "milyon", "milyar", "trilyon", "katrilyon"]
MAX_NUMBER = 10 ** (3 * len(_SCALES)) - 1


def _three_digits(number: int) -> list[str]:
    """0–999 arası sayının sözcükleri (0 için boş liste)."""
    words: list[str] = []
    hundreds, rest = divmod(number, 100)
    tens, ones = divmod(rest, 10)
    if hundreds:
        if hundreds > 1:
            words.append(_ONES[hundreds])
        words.append("yüz")
    if tens:
        words.append(_TENS[tens])
    if ones:
        words.append(_ONES[ones])
    return words


def number_to_words(number: int, *, joined: bool = False) -> str:
    """Tam sayıyı yazıya çevirir. ``joined=True`` sözcükleri bitişik yazar (çek/senet biçimi)."""
    if isinstance(number, bool) or not isinstance(number, int):
        raise TypeError("Tam sayı bekleniyordu.")
    if abs(number) > MAX_NUMBER:
        raise ValueError(f"Sayı çok büyük; en fazla {MAX_NUMBER} desteklenir.")
    if number == 0:
        return _ONES[0]
    words: list[str] = []
    remaining = abs(number)
    groups: list[int] = []
    while remaining:
        remaining, group = divmod(remaining, 1000)
        groups.append(group)
    for index in range(len(groups) - 1, -1, -1):
        group = groups[index]
        if group == 0:
            continue
        if index == 1 and group == 1:
            words.append("bin")  # "bir bin" denmez
            continue
        words.extend(_three_digits(group))
        if _SCALES[index]:
            words.append(_SCALES[index])
    if number < 0:
        words.insert(0, "eksi")
    return ("" if joined else " ").join(words)


def amount_to_words(
    amount: Decimal | int | str,
    *,
    major: str = "lira",
    minor: str = "kuruş",
    joined: bool = False,
) -> str:
    """Para tutarını yazıya çevirir: ``Decimal("1250.5")`` → "bin iki yüz elli lira elli kuruş".

    Tutar iki ondalık basamağa yuvarlanır (yarım yukarı). ``float`` kabul edilmez: 0.1 + 0.2
    gibi hatalar faturaya yanlış kuruş yazdırır; ``Decimal`` ya da metin verin.
    """
    if isinstance(amount, float):
        raise TypeError("float yerine Decimal ya da metin verin (örnek: Decimal('12.50')).")
    value = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "eksi " if value < 0 else ""
    whole, fraction = divmod(abs(value), 1)
    cents = int(fraction * 100)
    text = f"{number_to_words(int(whole), joined=joined)} {major}"
    if cents:
        text += f" {number_to_words(cents, joined=joined)} {minor}"
    return sign + text
