"""Türkiye'ye özgü kimlik ve hesap numaralarının sağlama (checksum) algoritmaları.

- TCKN: 11 hane, ilk hane 0 değil; 10. hane = ((1,3,5,7,9. haneler toplamı × 7) − (2,4,6,8. haneler toplamı)) mod 10;
  11. hane = ilk 10 hanenin toplamı mod 10.
- VKN: 10 hane; Gelir İdaresi algoritması (aşağıda).
- TR IBAN: "TR" + 24 hane (toplam 26 karakter), ISO 13616 mod-97 = 1.

Testlerde gerçek kişi numarası kullanılmaz: `generate_valid_*` fonksiyonları algoritmayla sahte numara üretir.
"""

from __future__ import annotations

import random
import re

_NON_DIGIT = re.compile(r"\D")


def _digits(value: str) -> str:
    return _NON_DIGIT.sub("", str(value))


# ----------------------------------------------------------------------------- TCKN


def _tckn_check_digits(first9: list[int]) -> tuple[int, int]:
    odd = first9[0] + first9[2] + first9[4] + first9[6] + first9[8]
    even = first9[1] + first9[3] + first9[5] + first9[7]
    d10 = (odd * 7 - even) % 10
    d11 = (sum(first9) + d10) % 10
    return d10, d11


def is_valid_tckn(value: str) -> bool:
    s = str(value).strip()
    if len(s) != 11 or not s.isdigit() or s[0] == "0":
        return False
    d = [int(c) for c in s]
    d10, d11 = _tckn_check_digits(d[:9])
    return d[9] == d10 and d[10] == d11


def generate_valid_tckn(seed: int | None = None) -> str:
    """Algoritmaya uyan SAHTE bir TCKN üretir (test ve demo için)."""
    rng = random.Random(seed)
    first9 = [rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(8)]
    d10, d11 = _tckn_check_digits(first9)
    return "".join(map(str, first9 + [d10, d11]))


# ----------------------------------------------------------------------------- VKN


def _vkn_check_digit(first9: list[int]) -> int:
    total = 0
    for i, digit in enumerate(first9, start=1):  # i: 1..9
        tmp = (digit + 10 - i) % 10
        if tmp == 0:
            v = 0
        else:
            v = (tmp * (2 ** (10 - i))) % 9
            if v == 0:
                v = 9
        total += v
    return (10 - (total % 10)) % 10


def is_valid_vkn(value: str) -> bool:
    s = str(value).strip()
    if len(s) != 10 or not s.isdigit():
        return False
    d = [int(c) for c in s]
    return _vkn_check_digit(d[:9]) == d[9]


def generate_valid_vkn(seed: int | None = None) -> str:
    rng = random.Random(seed)
    first9 = [rng.randint(0, 9) for _ in range(9)]
    return "".join(map(str, first9 + [_vkn_check_digit(first9)]))


# ----------------------------------------------------------------------------- IBAN


def _iban_mod97(iban: str) -> int:
    rearranged = iban[4:] + iban[:4]
    numeric = "".join(str(int(ch, 36)) for ch in rearranged)  # A=10 ... Z=35
    return int(numeric) % 97


def normalize_iban(value: str) -> str:
    return re.sub(r"[\s\-]", "", str(value)).upper()


def is_valid_tr_iban(value: str) -> bool:
    s = normalize_iban(value)
    if len(s) != 26 or not s.startswith("TR") or not s[2:].isdigit():
        return False
    return _iban_mod97(s) == 1


def generate_valid_tr_iban(seed: int | None = None) -> str:
    rng = random.Random(seed)
    bban = (
        "".join(str(rng.randint(0, 9)) for _ in range(5))
        + "0"
        + "".join(str(rng.randint(0, 9)) for _ in range(16))
    )
    check = 98 - _iban_mod97("TR00" + bban)
    return f"TR{check:02d}{bban}"


__all__ = [
    "generate_valid_tckn",
    "generate_valid_tr_iban",
    "generate_valid_vkn",
    "is_valid_tckn",
    "is_valid_tr_iban",
    "is_valid_vkn",
    "normalize_iban",
]
