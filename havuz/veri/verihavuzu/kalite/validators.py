"""Tekil değer denetimleri: bir metin TCKN mi, IBAN mı, e-posta mı, posta kodu mu?

Şema sözleşmesi (``schema.py``), tablo denetimleri (``checks.py``) ve kişisel veri taraması
(``pii.py``) aynı sözlüğü kullanır; böylece "geçerli TCKN" her yerde aynı anlama gelir.
Her denetim ``str -> bool`` imzalıdır ve hata fırlatmaz.
Genişletme: yeni bir denetim için işlevi yazın ve ``VALIDATORS`` sözlüğüne
"YENİ DENETİM BURAYA" satırının üstüne ekleyin; ``tests/test_validators.py`` içine en az bir
geçerli ve bir geçersiz örnek koyun (kural testi her anahtarın örneği olduğunu denetler).
"""

from __future__ import annotations

import re
from collections.abc import Callable

from verihavuzu import geo, ids

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
_PHONE_E164_TR = re.compile(r"\+90[2-5]\d{9}")
_MOBILE_E164_TR = re.compile(r"\+905\d{9}")


def is_email(value: str) -> bool:
    """Basit e-posta biçimi (kutu@alan.uzantı). Adresin var olduğunu göstermez."""
    return bool(_EMAIL.fullmatch(value)) and ".." not in value


def is_phone_tr(value: str) -> bool:
    """Uluslararası yazımla Türkiye numarası: +90 ve ardından 2–5 ile başlayan 10 hane."""
    return bool(_PHONE_E164_TR.fullmatch(value))


def is_mobile_tr(value: str) -> bool:
    """Uluslararası yazımla cep numarası: +905 ile başlar, toplam 13 karakter."""
    return bool(_MOBILE_E164_TR.fullmatch(value))


def is_plate(value: str) -> bool:
    """1–81 arası plaka kodu ("6" ve "06" kabul edilir)."""
    return value.isascii() and value.isdigit() and len(value) <= 2 and 1 <= int(value) <= 81


def is_province_name(value: str) -> bool:
    """81 ilden birinin adı mı (yazım farkları ve eski adlar hoş görülür)?"""
    return geo.find_province(value) is not None


VALIDATORS: dict[str, Callable[[str], bool]] = {
    "tckn": ids.is_valid_tckn,
    "vkn": ids.is_valid_vkn,
    "iban": ids.is_valid_iban,
    "iban_tr": ids.is_valid_iban_tr,
    "kart_no": ids.is_valid_card_number,
    "eposta": is_email,
    "telefon_tr": is_phone_tr,
    "cep_tr": is_mobile_tr,
    "posta_kodu": geo.is_postal_code,
    "plaka": is_plate,
    "il": is_province_name,
    # YENİ DENETİM BURAYA
}

VALIDATOR_LABELS: dict[str, str] = {
    "tckn": "T.C. kimlik numarası (11 hane, sağlamalı)",
    "vkn": "vergi kimlik numarası (10 hane, sağlamalı)",
    "iban": "IBAN (mod 97 sağlamalı)",
    "iban_tr": "Türkiye IBAN'ı (TR + 24 karakter, mod 97 sağlamalı)",
    "kart_no": "kart numarası (13–19 hane, Luhn sağlamalı)",
    "eposta": "e-posta adresi",
    "telefon_tr": "telefon numarası (+90 ile, 13 karakter)",
    "cep_tr": "cep telefonu numarası (+905 ile, 13 karakter)",
    "posta_kodu": "posta kodu (5 hane, ilk ikisi plaka kodu)",
    "plaka": "plaka kodu (1–81)",
    "il": "il adı",
}


def validate(kind: str, value: str) -> bool:
    """Adı verilen denetimi çalıştırır. Bilinmeyen ad için ``KeyError`` (seçenekleri söyler)."""
    try:
        validator = VALIDATORS[kind]
    except KeyError:
        options = ", ".join(sorted(VALIDATORS))
        raise KeyError(f"Bilinmeyen denetim: {kind}. Seçenekler: {options}") from None
    return validator(value)
