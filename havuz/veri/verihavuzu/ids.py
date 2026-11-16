"""Sağlama (kontrol hanesi) algoritmaları: TCKN, VKN, IBAN (mod 97) ve Luhn (kart numarası).

Bu dosya yalnız BİÇİM ve SAĞLAMA denetler; bir numaranın gerçekten birine ait olup
olmadığını söyleyemez. Sentetik üreteçler (``sentetik/identifiers.py``) ve kalite denetimleri
(``kalite/checks.py``, ``kalite/pii.py``) buradaki işlevleri kullanır.
Algoritmalar tanımından yazılmıştır ve testlerde bağımsız bir gerçeklemeyle (python-stdnum)
rastgele binlerce numara üzerinde karşılaştırılır (``tests/test_ids.py``).
Genişletme: yeni bir numara türü için ``x_check_digit`` + ``is_valid_x`` çifti ekleyin, sonra
``kalite/checks.py`` içindeki ``VALIDATORS`` sözlüğüne kaydedin.
"""

from __future__ import annotations

import re

_SEPARATORS = re.compile(r"[\s\-]")
_IBAN_TR = re.compile(r"TR\d{2}\d{5}\d[0-9A-Z]{16}")


def compact(value: str) -> str:
    """Boşluk ve tireleri atar: "TR33 0006 1005 ..." → "TR330006100..."."""
    return _SEPARATORS.sub("", value)


# --- T.C. Kimlik Numarası -------------------------------------------------------------------


def tckn_check_digits(first9: str) -> str:
    """İlk 9 haneden 10. ve 11. haneyi hesaplar.

    Kural: 10. hane = ((1,3,5,7,9. hanelerin toplamı × 7) − (2,4,6,8. hanelerin toplamı)) mod 10
           11. hane = (ilk 10 hanenin toplamı) mod 10
    """
    if len(first9) != 9 or not first9.isdigit() or first9[0] == "0":
        raise ValueError("TCKN gövdesi 9 rakam olmalı ve 0 ile başlamamalı.")
    digits = [int(ch) for ch in first9]
    odd_sum = sum(digits[0::2])  # 1, 3, 5, 7, 9. haneler
    even_sum = sum(digits[1::2])  # 2, 4, 6, 8. haneler
    d10 = (odd_sum * 7 - even_sum) % 10
    d11 = (sum(digits) + d10) % 10
    return f"{d10}{d11}"


def is_valid_tckn(value: str) -> bool:
    """11 haneli, 0 ile başlamayan ve iki sağlama hanesi tutan numara mı?"""
    if len(value) != 11 or not value.isascii() or not value.isdigit() or value[0] == "0":
        return False
    return tckn_check_digits(value[:9]) == value[9:]


# --- Vergi Kimlik Numarası ------------------------------------------------------------------


def vkn_check_digit(first9: str) -> str:
    """İlk 9 haneden 10. (sağlama) haneyi hesaplar.

    Soldan k. hane (k = 1..9) için: t = (hane + 10 − k) mod 10;
    t sıfır değilse katkı = (t × 2^(10−k)) mod 9, sonuç 0 çıkarsa 9 alınır.
    Sağlama hanesi = (10 − (katkıların toplamı mod 10)) mod 10.
    """
    if len(first9) != 9 or not first9.isascii() or not first9.isdigit():
        raise ValueError("VKN gövdesi 9 rakam olmalı.")
    total = 0
    for k, ch in enumerate(first9, start=1):
        t = (int(ch) + 10 - k) % 10
        if t != 0:
            part = (t * 2 ** (10 - k)) % 9
            total += 9 if part == 0 else part
    return str((10 - total % 10) % 10)


def is_valid_vkn(value: str) -> bool:
    """10 haneli ve sağlama hanesi tutan numara mı?"""
    if len(value) != 10 or not value.isascii() or not value.isdigit():
        return False
    return vkn_check_digit(value[:9]) == value[9]


# --- IBAN (ISO 13616, mod 97-10) ------------------------------------------------------------


def _iban_to_int(rearranged: str) -> int:
    """Harfleri sayıya çevirir (A=10 … Z=35) ve tek bir tam sayı olarak okur."""
    return int("".join(str(int(ch, 36)) for ch in rearranged))


def iban_check_digits(country: str, bban: str) -> str:
    """Ülke kodu ve BBAN'dan (ülke içi hesap bölümü) iki sağlama hanesini hesaplar."""
    if not (len(country) == 2 and country.isascii() and country.isalpha() and country.isupper()):
        raise ValueError("Ülke kodu iki büyük harf olmalı (örnek: TR).")
    if not bban or not bban.isascii() or not bban.isalnum() or bban != bban.upper():  # tr-ok
        raise ValueError("BBAN yalnız rakam ve büyük harf içermeli.")
    remainder = _iban_to_int(bban + country + "00") % 97
    return f"{98 - remainder:02d}"


def is_valid_iban(value: str) -> bool:
    """Genel IBAN denetimi (her ülke): biçim + mod 97 sağlaması. Boşluklar hoş görülür."""
    iban = compact(value)
    if not (15 <= len(iban) <= 34) or not iban.isascii() or not iban.isalnum():
        return False
    if iban != iban.upper() or not iban[:2].isalpha() or not iban[2:4].isdigit():  # tr-ok
        return False
    return _iban_to_int(iban[4:] + iban[:4]) % 97 == 1


def is_valid_iban_tr(value: str) -> bool:
    """Türkiye IBAN'ı mı? 26 karakter: TR + 2 sağlama + 5 banka kodu + 1 rezerv + 16 hesap."""
    iban = compact(value)
    return bool(_IBAN_TR.fullmatch(iban)) and is_valid_iban(iban)


def format_iban(value: str) -> str:
    """Okunaklı yazım: dörtlü gruplar ("TR33 0006 1005 1978 6457 8413 26")."""
    iban = compact(value)
    return " ".join(iban[i : i + 4] for i in range(0, len(iban), 4))


# --- Luhn (kart numaraları) -----------------------------------------------------------------


def _luhn_sum(digits: str) -> int:
    """Sağdan başlayarak her ikinci haneyi iki katına çıkarır (9'dan büyükse 9 çıkarır), toplar."""
    total = 0
    for index, ch in enumerate(reversed(digits)):
        number = int(ch)
        if index % 2 == 1:
            number *= 2
            if number > 9:
                number -= 9
        total += number
    return total


def luhn_check_digit(body: str) -> str:
    """Sağlama hanesi olmayan gövde için Luhn hanesini hesaplar."""
    if not body or not body.isascii() or not body.isdigit():
        raise ValueError("Gövde yalnız rakam içermeli.")
    return str((10 - _luhn_sum(body + "0") % 10) % 10)


def is_valid_luhn(value: str) -> bool:
    """Luhn sağlaması tutuyor mu? (Uzunluk denetimi yapmaz; yalnız rakam bekler.)"""
    return bool(value) and value.isascii() and value.isdigit() and _luhn_sum(value) % 10 == 0


def is_valid_card_number(value: str) -> bool:
    """Kart numarası biçimi: boşluk/tire atıldıktan sonra 13–19 rakam ve Luhn tutuyor."""
    digits = compact(value)
    return 13 <= len(digits) <= 19 and is_valid_luhn(digits)
