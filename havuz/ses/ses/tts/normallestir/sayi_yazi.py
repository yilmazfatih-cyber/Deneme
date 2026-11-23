"""sayi_yazi — sayıyı Türkçe yazıya çevirir ("bin iki yüz otuz dört"), sıra sayısı ("dördüncü"), tutarın yazıyla
yazılışı ("yalnız bin iki yüz otuz dört lira elli kuruş"), Türkçe sayı biçimini ayrıştırır/biçimler.

Kaynak: havuz/kutuphane/py/kutuphane/sayi_yazi.py (değiştirilmeden kopyalandı; düzeltme gerekirse
önce kaynağında yapın, sonra buraya yeniden kopyalayın). Kim kullanır: tts/normallestir/kurallar.py.

Kullanım:
    number_to_words(1234)                     # "bin iki yüz otuz dört"   ("bir bin" değil)
    ordinal_words(24)                         # "yirmi dördüncü"
    amount_to_words(123450)                   # "yalnız bin iki yüz otuz dört lira elli kuruş"  (girdi KURUŞ)
    decimal_to_words("3,05")                  # "üç virgül sıfır beş"

Sınırlar: Tam sayılar en çok 999 kentilyon (10^21 − 1). `amount_to_words` float kabul etmez: tutarı kuruş
cinsinden tam sayı verin (12,50 TL → 1250).

Genişletme: Daha büyük basamak adı `_SCALES` listesinin sonuna eklenir. Yeni para birimi `_CURRENCIES`'e eklenir.
"""

from __future__ import annotations

import re

__all__ = [
    "NumberFormatError",
    "amount_to_words",
    "decimal_to_words",
    "format_number_tr",
    "number_to_words",
    "ordinal_words",
    "parse_number_tr",
]


class NumberFormatError(ValueError):
    """Sayı biçimi bozuk ya da desteklenmiyorsa fırlatılır; ileti ne yapılacağını söyler."""


_ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
_SCALES = ["", "bin", "milyon", "milyar", "trilyon", "katrilyon", "kentilyon"]
_CURRENCIES = {
    "TRY": ("lira", "kuruş"),
    "USD": ("dolar", "sent"),
    "EUR": ("avro", "sent"),
    "GBP": ("sterlin", "peni"),
}
_VOWELS = "aeıioöuü"
_WS = " \t\n\r\f\v\xa0"


def _integer_digits(value: int | str) -> tuple[bool, str]:
    """Girdiyi (negatif mi, rakamlar) ikilisine çevirir; tam sayı değilse açıklayıcı hata verir."""
    if isinstance(value, bool) or not isinstance(value, int | str):
        raise NumberFormatError(
            f"{value!r} tam sayı değil. Ondalık için decimal_to_words, tutar için kuruş (int) verin."
        )
    text = str(value) if isinstance(value, int) else value.strip(_WS)
    match = re.fullmatch("([+-]?)([0-9]+)", text)
    if not match:
        raise NumberFormatError(
            f'"{text}" bir tam sayı değil. Yalnız rakam (ve başta - işareti) kullanın.'
        )
    digits = match.group(2).lstrip("0") or "0"
    return match.group(1) == "-" and digits != "0", digits


def _group_words(group: int) -> list[str]:
    words: list[str] = []
    hundreds = group // 100
    if hundreds == 1:
        words.append("yüz")
    elif hundreds > 1:
        words += [_ONES[hundreds], "yüz"]
    if _TENS[(group // 10) % 10]:
        words.append(_TENS[(group // 10) % 10])
    if _ONES[group % 10]:
        words.append(_ONES[group % 10])
    return words


def _digits_to_words(digits: str) -> list[str]:
    if digits.strip("0") == "":
        return ["sıfır"]
    groups: list[int] = []
    end = len(digits)
    while end > 0:
        groups.insert(0, int(digits[max(0, end - 3) : end]))
        end -= 3
    if len(groups) > len(_SCALES):
        raise NumberFormatError(
            f"Sayı çok büyük: en çok {len(_SCALES) * 3} basamak (999 kentilyon) desteklenir."
        )
    words: list[str] = []
    for index, group in enumerate(groups):
        if group == 0:
            continue
        scale = _SCALES[len(groups) - 1 - index]
        if not (scale == "bin" and group == 1):  # "bir bin" değil "bin"
            words += _group_words(group)
        if scale:
            words.append(scale)
    return words


def number_to_words(value: int | str, *, joined: bool = False) -> str:
    """Tam sayıyı yazıya çevirir: 1234 → "bin iki yüz otuz dört", -5 → "eksi beş", 0 → "sıfır"."""
    negative, digits = _integer_digits(value)
    words = (["eksi"] if negative else []) + _digits_to_words(digits)
    return ("" if joined else " ").join(words)


def ordinal_words(value: int | str, *, joined: bool = False) -> str:
    """Sıra sayısı: 1 → "birinci", 4 → "dördüncü", 40 → "kırkıncı". Negatif sayı hata verir."""
    negative, digits = _integer_digits(value)
    if negative:
        raise NumberFormatError("Negatif sayının sıra sayısı olmaz.")
    base = ("" if joined else " ").join(_digits_to_words(digits))
    if base.endswith("dört"):
        return base[:-4] + "dördüncü"
    last_vowel = next((ch for ch in reversed(base) if ch in _VOWELS), "i")
    i = (
        "ı"
        if last_vowel in "aı"
        else "u"
        if last_vowel in "ou"
        else "ü"
        if last_vowel in "öü"
        else "i"
    )
    return f"{base}nc{i}" if base[-1] in _VOWELS else f"{base}{i}nc{i}"


def _split_turkish(text: str, reject_ambiguous: bool) -> tuple[str, str, str]:
    """Türkçe biçimli sayının (işaret, tam kısım, ondalık kısım) parçaları; biçim bozuksa hata."""
    trimmed = text.strip(_WS)
    if trimmed == "":
        raise NumberFormatError("Sayı boş olamaz.")
    sign = "-" if trimmed[0] in "-−" else ""
    body = trimmed[1:] if trimmed[0] in "+-−" else trimmed
    if reject_ambiguous and re.fullmatch("[0-9]{1,3}[.,][0-9]{3}", body):
        raise NumberFormatError(
            f'"{trimmed}" belirsiz: binlik ayırıcı mı, ondalık mı anlaşılmıyor. '
            "Türkçe biçimde yazın: 1.234 (bin iki yüz otuz dört) ya da 1,234."
        )
    if re.fullmatch(r"[0-9]{1,3}(,[0-9]{3})+\.[0-9]+", body):
        raise NumberFormatError(
            f'"{trimmed}" İngilizce biçimde görünüyor. Türkçe biçim: 1.234,56 (virgül ondalık).'
        )
    match = re.fullmatch(r"([0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,([0-9]+))?", body)
    if not match:
        hint = (
            "Nokta yalnız binlik ayırıcıdır ve üçlü grupları ayırır; ondalık için virgül kullanın (1.234,56)."
            if "." in body
            else "Yalnız rakam, binlik için nokta ve ondalık için tek virgül kullanın (1.234,56)."
        )
        raise NumberFormatError(f'"{trimmed}" Türkçe sayı biçiminde değil. {hint}')
    return sign, match.group(1).replace(".", ""), match.group(2) or ""


def decimal_to_words(text: str, *, joined: bool = False) -> str:
    """Ondalıklı Türkçe sayıyı yazıya çevirir: "3,05" → "üç virgül sıfır beş"."""
    sign, integer, fraction = _split_turkish(text, False)
    words = _digits_to_words(integer)
    if fraction:
        words.append("virgül")
        leading_zeros = len(fraction) - len(fraction.lstrip("0"))
        words += ["sıfır"] * leading_zeros
        if leading_zeros < len(fraction):
            words += _digits_to_words(fraction[leading_zeros:])
    is_zero = (integer + fraction).strip("0") == ""
    return ("" if joined else " ").join((["eksi"] if sign == "-" and not is_zero else []) + words)


def amount_to_words(
    kurus: int,
    *,
    currency: str | tuple[str, str] | dict[str, str] = "TRY",
    prefix: str = "yalnız",
    joined: bool = False,
) -> str:
    """Tutarı yazıyla yazar (fatura, çek, senet). Girdi KURUŞ cinsinden tam sayıdır.

    123450 → "yalnız bin iki yüz otuz dört lira elli kuruş", 50 → "yalnız elli kuruş", 0 → "yalnız sıfır lira".
    `currency`: "TRY", "USD", "EUR", "GBP" ya da ("Türk lirası", "kuruş") / {"major": ..., "minor": ...}.
    """
    if isinstance(kurus, bool) or not isinstance(kurus, int):
        raise NumberFormatError(
            f"Tutar kuruş cinsinden tam sayı olmalı (12,50 TL → 1250); verilen: {kurus!r}."
        )
    if kurus < 0:
        raise NumberFormatError("Tutar negatif olamaz.")
    if isinstance(currency, dict):
        names: tuple[str, str] | None = (currency["major"], currency["minor"])
    elif isinstance(currency, tuple):
        names = currency
    else:
        names = _CURRENCIES.get(currency)
    if names is None:
        raise NumberFormatError(
            f"Bilinmeyen para birimi: {currency}. (büyük, küçük) adlarını verin."
        )
    major, minor = divmod(kurus, 100)
    words = [prefix] if prefix else []
    if major > 0 or minor == 0:
        words += [*_digits_to_words(str(major)), names[0]]
    if minor > 0:
        words += [*_digits_to_words(str(minor)), names[1]]
    return ("" if joined else " ").join(words)


def parse_number_tr(text: str, *, reject_ambiguous: bool = False) -> float:
    """Türkçe biçimli sayıyı ayrıştırır: "1.234,56" → 1234.56, "1.234" → 1234.0, "-12,5" → -12.5.

    Bozuk ya da İngilizce biçim ("1.23", "1,234.56") açık hata verir. `reject_ambiguous=True` iken "1.234" ve
    "1,234" gibi iki türlü okunabilen girdiler de reddedilir (kaynağı belirsiz veri içe aktarırken kullanın).
    """
    sign, integer, fraction = _split_turkish(text, reject_ambiguous)
    value = float(f"{sign}{integer}{'.' + fraction if fraction else ''}")
    return 0.0 if value == 0 else value


def _plain_decimal(value: int | float | str) -> tuple[bool, str, str]:
    """Sayının düz ondalık yazımı (üssüz): 1e21 → ("", "1000…", ""), 1e-07 → ("0", "0000001")."""
    if isinstance(value, bool):
        raise NumberFormatError("Mantıksal değer sayı olarak biçimlenmez.")
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            raise NumberFormatError(f"Sonlu bir sayı verin (verilen: {value}).")
        text = repr(value)
    elif isinstance(value, int):
        text = str(value)
    else:
        text = value.strip(_WS)
    match = re.fullmatch(r"(-?)([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?", text)
    if not match:
        raise NumberFormatError(
            f'"{text}" bir sayı değil (metin girdide nokta ondalık ayırıcıdır).'
        )
    digits = match.group(2) + (match.group(3) or "")
    point = len(match.group(2)) + int(match.group(4) or "0")
    padded = "0" * (1 - point) + digits if point <= 0 else digits.ljust(point, "0")
    at = 1 if point <= 0 else point
    integer = padded[:at].lstrip("0") or "0"
    return match.group(1) == "-", integer, padded[at:].rstrip("0")


def _increment_digits(digits: str) -> str:
    """Rakam dizisine 1 ekler: "199" → "200", "99" → "100"."""
    return str(int(digits) + 1).zfill(len(digits)) if digits else "1"


def format_number_tr(
    value: int | float | str, *, decimals: int | None = None, grouping: bool = True
) -> str:
    """Türkçe biçimler: 1234.56 → "1.234,56".

    `decimals` verilirse o kadar ondalığa yarım-yukarı (sıfırdan uzağa) yuvarlar ve eksik sıfırları tamamlar.
    `grouping=False` → binlik nokta konmaz. Metin girdi "1234.5" biçiminde olur.
    """
    negative, integer, fraction = _plain_decimal(value)
    if decimals is not None:
        if isinstance(decimals, bool) or not isinstance(decimals, int) or not 0 <= decimals <= 20:
            raise NumberFormatError("decimals 0 ile 20 arasında bir tam sayı olmalı.")
        if len(fraction) > decimals:
            kept = integer + fraction[:decimals]
            rounded = _increment_digits(kept) if fraction[decimals] >= "5" else kept
            integer = rounded[: len(rounded) - decimals]
            fraction = rounded[len(rounded) - decimals :]
        fraction = fraction.ljust(decimals, "0")
    integer = integer or "0"
    if (integer + fraction).strip("0") == "":
        negative = False
    grouped = integer if not grouping else f"{int(integer):,}".replace(",", ".")
    return ("-" if negative else "") + grouped + ("," + fraction if fraction else "")
