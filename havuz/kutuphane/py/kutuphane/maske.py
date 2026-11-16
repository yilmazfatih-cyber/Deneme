"""maske — kişisel veriyi GÖSTERİMDE maskeler: TCKN "123******01", e-posta "a***@ornek.com", IBAN "TR** **** … 1326",
telefon "+90 532 *** ** 67", kart "**** **** **** 1111", ad "A*** Y***".

Kullanım:
    mask_tckn("12345678901")                  # "123******01"
    mask_email("ali.veli@ornek.com")          # "a***@ornek.com"
    mask_iban("TR330006100519786457841326")   # "TR** **** … 1326"   (style="full" → "TR** **** … **13 26")
    mask_card_number("4111 1111 1111 1111")   # "**** **** **** 1111"
    mask_middle("ABC-12345", keep_start=1, keep_end=2)   # "A**-***45" (ayırıcılar korunur)

Sınırlar: Maskeleme yalnız görüntü içindir; veriyi korumaz. Gerçek veriyi istemciye hiç göndermemek ya da şifrelemek
ayrı bir iştir. E-posta ve adda uzunluk sızmasın diye yıldız sayısı sabittir (***). Çok kısa değerler (açık
bırakılacak hane sayısı kadar ya da daha kısa) tümüyle maskelenir. Biçimi bozuk girdi de güvenli tarafta kalır.

Genişletme: Yeni veri türü için `mask_middle` üstüne kurulu küçük bir işlev yazın ve `vektorler/maske.json`
dosyasına örnek ekleyin; aynı örnek TypeScript eşini de sınar.
"""

from __future__ import annotations

import re
from typing import Literal

__all__ = [
    "mask_card_number",
    "mask_email",
    "mask_iban",
    "mask_middle",
    "mask_name",
    "mask_phone",
    "mask_tckn",
    "mask_vkn",
]


def mask_middle(text: str, *, keep_start: int = 0, keep_end: int = 0, char: str = "*") -> str:
    """Harf ve rakamları maskeler, ayırıcıları (boşluk, tire, nokta, @) korur.

    Baştan `keep_start`, sondan `keep_end` harf/rakam açık kalır. Açık kalacak sayı, toplam harf/rakam sayısına
    eşit ya da büyükse HEPSİ maskelenir.
    """
    total = sum(1 for ch in text if ch.isalnum())
    reveal = keep_start + keep_end < total
    out: list[str] = []
    seen = 0
    for ch in text:
        if not ch.isalnum():
            out.append(ch)
            continue
        seen += 1
        visible = reveal and (seen <= keep_start or seen > total - keep_end)
        out.append(ch if visible else char)
    return "".join(out)


def mask_tckn(value: str) -> str:
    """TCKN: ilk 3 ve son 2 hane açık → "123******01". 11 hane değilse yalnız son 2 hane açık kalır."""
    text = re.sub(r"\s+", "", value)
    if re.fullmatch("[0-9]{11}", text):
        return mask_middle(text, keep_start=3, keep_end=2)
    return mask_middle(text, keep_end=2)


def mask_vkn(value: str) -> str:
    """VKN: ilk 2 ve son 2 hane açık → "12******90"."""
    text = re.sub(r"\s+", "", value)
    if re.fullmatch("[0-9]{10}", text):
        return mask_middle(text, keep_start=2, keep_end=2)
    return mask_middle(text, keep_end=2)


def mask_email(value: str, *, mask_domain: bool = False) -> str:
    """E-posta: yerel kısmın ilk harfi + "***" → "a***@ornek.com".

    `mask_domain=True` → "a***@o***.com" (yalnız uzantı açık). "@" yoksa "***" döner.
    """
    text = value.strip()
    at = text.rfind("@")
    if at <= 0:
        return "***"
    domain = text[at + 1 :]
    if mask_domain:
        dot = domain.rfind(".")
        domain = f"{domain[0]}***{domain[dot:]}" if dot > 0 else "***"
    return f"{text[0]}***@{domain}"


def mask_iban(value: str, *, style: Literal["compact", "full"] = "compact") -> str:
    """IBAN: ülke kodu ve son 4 hane açık. "compact" → "TR** **** … 1326"; "full" → uzunluk korunur."""
    iban = re.sub(r"[\s-]+", "", value).upper()  # harf: IBAN ASCII
    if len(iban) < 8:
        return "****"
    if style == "compact":
        return f"{iban[:2]}** **** … {iban[-4:]}"
    masked = iban[:2] + "*" * (len(iban) - 6) + iban[-4:]
    return " ".join(masked[i : i + 4] for i in range(0, len(masked), 4))


def mask_phone(value: str) -> str:
    """Telefon: TR numarasında operatör/alan kodu ve son 2 hane açık → "+90 532 *** ** 67"."""
    digits = re.sub("[^0-9]", "", value)
    nsn: str | None = None
    if len(digits) == 12 and digits.startswith("90"):
        nsn = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        nsn = digits[1:]
    elif len(digits) == 10:
        nsn = digits
    if nsn is None:
        return mask_middle(value, keep_start=2, keep_end=2)
    return f"+90 {nsn[:3]} *** ** {nsn[8:]}"


def mask_card_number(value: str) -> str:
    """Kart numarası: yalnız son 4 hane açık; sağdan 4'lü gruplanır → "**** **** **** 1111"."""
    digits = re.sub("[^0-9]", "", value)
    if len(digits) < 8:
        return "****"
    masked = "*" * (len(digits) - 4) + digits[-4:]
    groups: list[str] = []
    end = len(masked)
    while end > 0:
        groups.insert(0, masked[max(0, end - 4) : end])
        end -= 4
    return " ".join(groups)


def mask_name(value: str) -> str:
    """Ad soyad: her sözcüğün ilk harfi + "***" → "A*** Y***"."""
    return " ".join(f"{word[0]}***" for word in value.split())
