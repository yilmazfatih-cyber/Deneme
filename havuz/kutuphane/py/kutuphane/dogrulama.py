"""dogrulama — Türkiye'ye özgü kimlik ve iletişim verilerinin doğrulanması: TCKN, VKN, IBAN (TR ve genel mod-97),
telefon (TR cep/sabit → E.164), plaka, posta kodu, kart numarası (Luhn), e-posta (pragmatik), URL.
Algoritmalar tanımlarından kurulmuştur; sınama için "geçerli ama uydurma" üreteçler de buradadır.

Kullanım:
    validate_tckn("10000000146")                      # True
    validate_iban("TR33 0006 1005 1978 6457 8413 26")  # True (boşluklar yok sayılır)
    normalize_phone_tr("0 (532) 123 45 67")           # "+905321234567"   (geçersizse None)
    normalize_plate("34abc123")                       # "34 ABC 123"   (i → I; plakada İ yoktur)
    validate_email("ayse@ornek.com.tr")               # True
    generate_tckn(random.Random(1))                   # her çağrıda geçerli, uydurma bir TCKN

Sınırlar: Bu işlevler yalnız BİÇİM ve SAĞLAMA hanesini denetler; numaranın gerçekten birine/bir bankaya ait olduğunu
söyleyemez (bunun için NVİ/GİB servisleri gerekir). VKN algoritması yaygın yayımlanmış tanımdan yazıldı; resmî GİB
belgesiyle karşılaştırılamadı. IBAN ülke uzunlukları tablosu SWIFT kaydından ezberden yazıldı (doğrulanmadı);
tabloda olmayan ülkede yalnız mod-97 ve 15–34 uzunluk denetlenir. Telefon: operatör önekleri ayrıca denetlenmez
(5xx cep sayılır); 444'lü numaralar desteklenmez. Plaka: yalnız sivil biçimler; resmî/diplomatik plakalar dışarıda.
E-posta: tırnaklı yerel kısım ve IP adresli alan reddedilir. URL: kullanıcı bilgisi (user@host) ve IPv6 reddedilir.

Genişletme: Yeni ülke IBAN uzunluğu `_IBAN_LENGTHS`'e, yeni alan kodu `_AREA_CODES`'a eklenir. Her yeni doğrulayıcı
bir üreteç ve `vektorler/dogrulama.json` örnekleriyle gelir; aynı örnek TypeScript eşini de sınar.
"""

from __future__ import annotations

import random as _random
import re
from typing import Literal

__all__ = [
    "PhoneType",
    "format_iban",
    "format_phone_tr",
    "generate_card_number",
    "generate_iban_tr",
    "generate_phone_tr",
    "generate_tckn",
    "generate_vkn",
    "luhn_check",
    "normalize_email",
    "normalize_iban",
    "normalize_phone_tr",
    "normalize_plate",
    "phone_type_tr",
    "validate_card_number",
    "validate_email",
    "validate_iban",
    "validate_iban_tr",
    "validate_phone_tr",
    "validate_plate",
    "validate_postal_code",
    "validate_tckn",
    "validate_url",
    "validate_vkn",
]

PhoneType = Literal["mobile", "landline", "special"]

# İl alan kodları (İstanbul'da iki tane: 212 Avrupa, 216 Anadolu).
_AREA_CODES = frozenset(
    [
        "212",
        "216",
        "222",
        "224",
        "226",
        "228",
        "232",
        "236",
        "242",
        "246",
        "248",
        "252",
        "256",
        "258",
        "262",
        "264",
        "266",
        "272",
        "274",
        "276",
        "282",
        "284",
        "286",
        "288",
        "312",
        "318",
        "322",
        "324",
        "326",
        "328",
        "332",
        "338",
        "342",
        "344",
        "346",
        "348",
        "352",
        "354",
        "356",
        "358",
        "362",
        "364",
        "366",
        "368",
        "370",
        "372",
        "374",
        "376",
        "378",
        "380",
        "382",
        "384",
        "386",
        "388",
        "412",
        "414",
        "416",
        "422",
        "424",
        "426",
        "428",
        "432",
        "434",
        "436",
        "438",
        "442",
        "446",
        "452",
        "454",
        "456",
        "458",
        "462",
        "464",
        "466",
        "472",
        "474",
        "476",
        "478",
        "482",
        "484",
        "486",
        "488",
    ]
)
_SPECIAL_PREFIXES = ("850", "800", "900")

# Ülke koduna göre IBAN uzunluğu (SWIFT IBAN kaydı; ezberden — doğrulanmadı).
_IBAN_LENGTHS = {
    "AD": 24, "AE": 23, "AL": 28, "AT": 20, "AZ": 28, "BA": 20, "BE": 16, "BG": 22, "BH": 22, "BR": 29,
    "BY": 28, "CH": 21, "CR": 22, "CY": 28, "CZ": 24, "DE": 22, "DK": 18, "DO": 28, "EE": 20, "EG": 29,
    "ES": 24, "FI": 18, "FO": 18, "FR": 27, "GB": 22, "GE": 22, "GI": 23, "GL": 18, "GR": 27, "GT": 28,
    "HR": 21, "HU": 28, "IE": 22, "IL": 23, "IQ": 23, "IS": 26, "IT": 27, "JO": 30, "KW": 30, "KZ": 20,
    "LB": 28, "LC": 32, "LI": 21, "LT": 20, "LU": 20, "LV": 21, "MC": 27, "MD": 24, "ME": 22, "MK": 19,
    "MR": 27, "MT": 31, "MU": 30, "NL": 18, "NO": 15, "PK": 24, "PL": 28, "PS": 29, "PT": 25, "QA": 29,
    "RO": 24, "RS": 22, "SA": 24, "SC": 31, "SE": 24, "SI": 19, "SK": 24, "SM": 27, "ST": 25, "SV": 28,
    "TL": 23, "TN": 24, "TR": 26, "UA": 29, "VA": 22, "VG": 24, "XK": 20,
}  # fmt: skip

_PLATE_LETTERS = "ABCDEFGHIJKLMNOPRSTUVYZ"  # Ç Ğ İ Ö Ş Ü Q W X kullanılmaz
_PLATE_DIGITS = {1: (4, 5), 2: (3, 4), 3: (2, 3)}
_EMAIL_LOCAL_SPECIALS = "!#$%&'*+/=?^_`{|}~-"


def _is_digits(text: str, length: int | None = None) -> bool:
    return bool(re.fullmatch("[0-9]+", text)) and (length is None or len(text) == length)


# ---------------------------------------------------------------------------------------------
# TCKN ve VKN
# ---------------------------------------------------------------------------------------------


def _tckn_check_digits(first9: list[int]) -> tuple[int, int]:
    odd = sum(first9[0:9:2])
    even = sum(first9[1:8:2])
    d10 = (odd * 7 - even) % 10
    return d10, (sum(first9) + d10) % 10


def validate_tckn(value: str) -> bool:
    """T.C. Kimlik No: 11 hane, ilk hane 0 olamaz, 10. ve 11. haneler sağlama."""
    text = value.strip()
    if not _is_digits(text, 11) or text[0] == "0":
        return False
    digits = [int(ch) for ch in text]
    return (digits[9], digits[10]) == _tckn_check_digits(digits[:9])


def _vkn_check_digit(first9: list[int]) -> int:
    total = 0
    for i, digit in enumerate(first9):
        tmp = (digit + 9 - i) % 10
        v = (tmp * 2 ** (9 - i)) % 9
        if tmp != 0 and v == 0:
            v = 9
        total += v
    return (10 - total % 10) % 10


def validate_vkn(value: str) -> bool:
    """Vergi Kimlik No: 10 hane, son hane sağlama (GİB algoritması; resmî belgeyle karşılaştırılmadı)."""
    text = value.strip()
    if not _is_digits(text, 10):
        return False
    digits = [int(ch) for ch in text]
    return digits[9] == _vkn_check_digit(digits[:9])


# ---------------------------------------------------------------------------------------------
# IBAN
# ---------------------------------------------------------------------------------------------


def normalize_iban(value: str) -> str:
    """Boşlukları ve tireleri atar, harfleri büyütür (ASCII): "tr33 0006…" → "TR330006…"."""
    return re.sub(r"[\s-]+", "", value).upper()  # harf: IBAN yalnız ASCII harf içerir


def _mod97(text: str) -> int:
    remainder = 0
    for ch in text:
        chunk = str(ord(ch) - 55) if ch >= "A" else ch  # A=10 … Z=35
        for digit in chunk:
            remainder = (remainder * 10 + int(digit)) % 97
    return remainder


def validate_iban(value: str) -> bool:
    """IBAN: biçim + ülke uzunluğu (tablodaysa) + ISO 13616 mod-97 sağlaması."""
    iban = normalize_iban(value)
    if not re.fullmatch("[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", iban):
        return False
    expected = _IBAN_LENGTHS.get(iban[:2])
    if expected is not None and len(iban) != expected:
        return False
    return _mod97(iban[4:] + iban[:4]) == 1


def validate_iban_tr(value: str) -> bool:
    """Türk IBAN'ı: TR + 2 sağlama + 5 banka kodu + 1 ayrılmış hane (0) + 16 hesap no; toplam 26."""
    iban = normalize_iban(value)
    return bool(re.fullmatch("TR[0-9]{7}0[0-9A-Z]{16}", iban)) and validate_iban(iban)


def format_iban(value: str) -> str:
    """4'lü gruplar: "TR33 0006 1005 1978 6457 8413 26"."""
    iban = normalize_iban(value)
    return " ".join(iban[i : i + 4] for i in range(0, len(iban), 4))


def _iban_with_check(country: str, bban: str) -> str:
    check = 98 - _mod97(f"{bban}{country}00")
    return f"{country}{check:02d}{bban}"


# ---------------------------------------------------------------------------------------------
# Telefon
# ---------------------------------------------------------------------------------------------


def _phone_kind(nsn: str) -> PhoneType | None:
    if nsn.startswith("5"):
        return "mobile"
    if nsn[:3] in _AREA_CODES:
        return "landline"
    if nsn[:3] in _SPECIAL_PREFIXES:
        return "special"
    return None


def normalize_phone_tr(value: str) -> str | None:
    """TR telefonunu E.164 biçimine çevirir: "0532 123 45 67" → "+905321234567". Geçersizse None."""
    text = value.strip()
    if not re.fullmatch(r"\+?[0-9 ()./-]+", text):
        return None
    digits = re.sub("[^0-9]", "", text)
    if text.startswith("+"):
        if not digits.startswith("90"):
            return None
        nsn = digits[2:]
    elif digits.startswith("0090"):
        nsn = digits[4:]
    elif digits.startswith("90") and len(digits) == 12:
        nsn = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        nsn = digits[1:]
    else:
        nsn = digits
    if not _is_digits(nsn, 10) or _phone_kind(nsn) is None:
        return None
    return f"+90{nsn}"


def validate_phone_tr(value: str) -> bool:
    return normalize_phone_tr(value) is not None


def phone_type_tr(value: str) -> PhoneType | None:
    """ "mobile" (5xx), "landline" (il alan kodu), "special" (0850/0800/0900) ya da geçersizse None."""
    e164 = normalize_phone_tr(value)
    return None if e164 is None else _phone_kind(e164[3:])


def format_phone_tr(value: str, *, international: bool = False) -> str | None:
    """ "0532 123 45 67" ya da `international=True` ile "+90 532 123 45 67". Geçersizse None."""
    e164 = normalize_phone_tr(value)
    if e164 is None:
        return None
    n = e164[3:]
    body = f"{n[:3]} {n[3:6]} {n[6:8]} {n[8:]}"
    return f"+90 {body}" if international else f"0{body}"


# ---------------------------------------------------------------------------------------------
# Plaka ve posta kodu
# ---------------------------------------------------------------------------------------------


def normalize_plate(value: str) -> str | None:
    """ "34abc123", "34-ABC-123" → "34 ABC 123". Geçersizse None. Küçük i/ı → I (plakada İ yoktur)."""
    text = re.sub(r"[\s-]+", "", value)
    text = re.sub("[iıİ]", "I", text).upper()  # harf: plaka harfleri ASCII; i/ı/İ önce I yapıldı
    match = re.fullmatch("(0[1-9]|[1-7][0-9]|8[01])([A-Z]{1,3})([0-9]{2,5})", text)
    if not match:
        return None
    province, letters, number = match.groups()
    low, high = _PLATE_DIGITS[len(letters)]
    if not low <= len(number) <= high or any(ch not in _PLATE_LETTERS for ch in letters):
        return None
    return f"{province} {letters} {number}"


def validate_plate(value: str) -> bool:
    return normalize_plate(value) is not None


def validate_postal_code(value: str) -> bool:
    """Posta kodu: 5 hane, ilk iki hane il kodu (01–81)."""
    return bool(re.fullmatch("(0[1-9]|[1-7][0-9]|8[01])[0-9]{3}", value.strip()))


# ---------------------------------------------------------------------------------------------
# Kart numarası (Luhn)
# ---------------------------------------------------------------------------------------------


def luhn_check(digits: str) -> bool:
    """Luhn (mod 10) sağlaması: sağdan her ikinci hane iki katına çıkarılır."""
    if not _is_digits(digits) or len(digits) < 2:
        return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
    return total % 10 == 0


def validate_card_number(value: str) -> bool:
    """Kart numarası: boşluk/tire atılır, 12–19 hane ve Luhn. (Kartın gerçekten var olduğunu söylemez.)"""
    digits = re.sub(r"[\s-]+", "", value)
    return _is_digits(digits) and 12 <= len(digits) <= 19 and luhn_check(digits)


# ---------------------------------------------------------------------------------------------
# E-posta ve URL
# ---------------------------------------------------------------------------------------------


def _is_ascii_alnum(ch: str) -> bool:
    return ch.isascii() and ch.isalnum()


def _is_unicode_alnum(ch: str) -> bool:
    return ord(ch) > 0x7F and ch.isalnum()


def _valid_domain(domain: str, allow_unicode: bool, require_tld: bool) -> bool:
    if not 0 < len(domain) <= 253:
        return False
    labels = domain.split(".")
    if require_tld and len(labels) < 2:
        return False
    for label in labels:
        if not 0 < len(label) <= 63 or label.startswith("-") or label.endswith("-"):
            return False
        allowed = (
            _is_ascii_alnum(ch) or ch == "-" or (allow_unicode and _is_unicode_alnum(ch))
            for ch in label
        )
        if not all(allowed):
            return False
    tld = labels[-1]
    if not require_tld:
        return True
    return tld.startswith("xn--") or (len(tld) >= 2 and tld.isalpha())


def validate_email(value: str, *, allow_unicode: bool = False) -> bool:
    """Pragmatik e-posta denetimi: yerel@alan.

    Yerel kısım en çok 64 karakter (harf, rakam, !#$%&'*+/=?^_`{|}~- ve aralarda tek nokta), alan adı en az iki
    etiket ve harflerden oluşan bir uzantı. `allow_unicode=True` → "ayşe@örnek.com".
    """
    text = value.strip()
    at = text.rfind("@")
    if at <= 0 or len(text) > 254:
        return False
    local, domain = text[:at], text[at + 1 :]
    if len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local:
        return False
    local_ok = all(
        _is_ascii_alnum(ch)
        or ch == "."
        or ch in _EMAIL_LOCAL_SPECIALS
        or (allow_unicode and _is_unicode_alnum(ch))
        for ch in local
    )
    return local_ok and _valid_domain(domain, allow_unicode, True)


def normalize_email(value: str) -> str:
    """Kenar boşluklarını atar ve alan adını küçük harfe çevirir (yerel kısma dokunmaz)."""
    text = value.strip()
    at = text.rfind("@")
    return text if at < 0 else text[: at + 1] + text[at + 1 :].lower()  # harf: alan adı ASCII/IDN


def _is_bad_url_char(ch: str) -> bool:
    """Boşluk ya da denetim karakteri mi? (C0/C1 denetimleri, DEL, Unicode boşlukları, BOM)"""
    c = ord(ch)
    return (
        c <= 0x20
        or 0x7F <= c <= 0xA0
        or c in (0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF)
        or 0x2000 <= c <= 0x200A
    )


def validate_url(
    value: str,
    *,
    protocols: tuple[str, ...] | list[str] = ("http", "https"),
    require_tld: bool = True,
    allow_localhost: bool = False,
) -> bool:
    """URL denetimi: şema (varsayılan http/https) + "://" + alan adı | IPv4 | localhost + kapı + yol.

    Kullanıcı bilgisi (https://banka.com@kotu.com) ve boşluk/denetim karakteri reddedilir.
    """
    if len(value) > 2048 or any(_is_bad_url_char(ch) for ch in value):
        return False
    match = re.fullmatch(r"([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([/?#].*)?", value, re.DOTALL)
    if not match:
        return False
    if match.group(1).lower() not in protocols:  # harf: şema ASCII
        return False
    authority = match.group(2)
    if "@" in authority:
        return False
    host_port = re.fullmatch("(.*?)(?::([0-9]{1,5}))?", authority, re.DOTALL)
    host = (host_port.group(1) if host_port else "").lower()  # harf: alan adı
    port = host_port.group(2) if host_port else None
    if port is not None and not 1 <= int(port) <= 65535:
        return False
    if host == "localhost":
        return allow_localhost
    ipv4 = re.fullmatch(r"([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})", host)
    if ipv4:
        return all(int(octet) <= 255 and not re.match("0[0-9]", octet) for octet in ipv4.groups())
    return _valid_domain(host, True, require_tld)


# ---------------------------------------------------------------------------------------------
# Sınama için uydurma üreteçler (gerçek kişilere/hesaplara denk gelebilir; yalnız test verisi)
# ---------------------------------------------------------------------------------------------


def _random_digits(rng: _random.Random, count: int, non_zero_first: bool = False) -> list[int]:
    return [
        rng.randint(1, 9) if i == 0 and non_zero_first else rng.randint(0, 9) for i in range(count)
    ]


def generate_tckn(rng: _random.Random | None = None) -> str:
    """Geçerli ama uydurma TCKN. `rng` test için verilir (varsayılan yeni bir random.Random)."""
    first9 = _random_digits(rng or _random.Random(), 9, non_zero_first=True)
    return "".join(map(str, [*first9, *_tckn_check_digits(first9)]))


def generate_vkn(rng: _random.Random | None = None) -> str:
    """Geçerli ama uydurma VKN."""
    first9 = _random_digits(rng or _random.Random(), 9)
    return "".join(map(str, [*first9, _vkn_check_digit(first9)]))


def generate_iban_tr(rng: _random.Random | None = None, bank_code: str | None = None) -> str:
    """Geçerli ama uydurma TR IBAN; banka kodu verilebilir ("00061")."""
    source = rng or _random.Random()
    bank = bank_code if bank_code is not None else "".join(map(str, _random_digits(source, 5)))
    if not _is_digits(bank, 5):
        raise ValueError("Banka kodu 5 haneli olmalı.")
    return _iban_with_check("TR", bank + "0" + "".join(map(str, _random_digits(source, 16))))


def generate_card_number(
    rng: _random.Random | None = None, *, prefix: str = "4", length: int = 16
) -> str:
    """Luhn'u tutan uydurma kart numarası (varsayılan 4 ile başlayan 16 hane)."""
    if not _is_digits(prefix) or not 12 <= length <= 19 or len(prefix) >= length:
        raise ValueError("prefix yalnız rakam olmalı; uzunluk 12–19 arası ve önekten uzun olmalı.")
    source = rng or _random.Random()
    body = prefix + "".join(map(str, _random_digits(source, length - len(prefix) - 1)))
    check = next(d for d in range(10) if luhn_check(f"{body}{d}"))
    return f"{body}{check}"


def generate_phone_tr(rng: _random.Random | None = None) -> str:
    """Uydurma TR cep telefonu (E.164): "+905xxxxxxxxx"."""
    return "+905" + "".join(map(str, _random_digits(rng or _random.Random(), 9)))
