"""Kimlik ve hesap numaraları için sağlama (checksum) denetimleri.

Yalnız biçim ve sağlama basamağı denetlenir; numaranın gerçekten birine ait olup olmadığı
bilinemez. Kim kullanır: guvenlik/maske.py (yanlış alarmı azaltmak için).
Genişletme: yeni bir numara türü → saf bir `xxx_gecerli(metin) -> bool` işlevi ekleyin ve
tests/test_guvenlik.py içine bilinen geçerli/geçersiz örnek yazın.
"""

from __future__ import annotations

import re

from yz.metin import buyuk_ascii

_RAKAM_DISI = re.compile(r"\D")


def yalniz_rakam(metin: str) -> str:
    """Boşluk, tire ve diğer ayraçları atar; yalnız rakamları bırakır."""
    return _RAKAM_DISI.sub("", metin)


def tckn_gecerli(metin: str) -> bool:
    """T.C. kimlik numarası: 11 rakam, ilk rakam 0 değil, 10. ve 11. rakam sağlama."""
    if not re.fullmatch(r"[1-9]\d{10}", metin):
        return False
    r = [int(h) for h in metin]
    onuncu = ((r[0] + r[2] + r[4] + r[6] + r[8]) * 7 - (r[1] + r[3] + r[5] + r[7])) % 10
    onbirinci = sum(r[:10]) % 10
    return r[9] == onuncu and r[10] == onbirinci


def vkn_gecerli(metin: str) -> bool:
    """Vergi kimlik numarası: 10 rakam, son rakam sağlama."""
    if not re.fullmatch(r"\d{10}", metin) or metin == "0000000000":
        return False
    r = [int(h) for h in metin]
    toplam = 0
    for i in range(9):
        ara = (r[i] + 9 - i) % 10
        deger = (ara * 2 ** (9 - i)) % 9
        if ara != 0 and deger == 0:
            deger = 9
        toplam += deger
    return (10 - toplam % 10) % 10 == r[9]


def iban_gecerli(metin: str) -> bool:
    """IBAN: ülke kodu + mod 97 sağlaması. TR için uzunluk tam 26 olmalıdır."""
    iban = buyuk_ascii(re.sub(r"\s+", "", metin))
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", iban):
        return False
    if iban.startswith("TR") and (len(iban) != 26 or not iban[2:].isdigit()):
        return False
    cevrilmis = iban[4:] + iban[:4]
    sayi = "".join(str(int(h, 36)) for h in cevrilmis)
    return int(sayi) % 97 == 1


def luhn_gecerli(metin: str) -> bool:
    """Kart numarası: 13–19 rakam ve Luhn sağlaması."""
    rakamlar = yalniz_rakam(metin)
    if not 13 <= len(rakamlar) <= 19 or len(set(rakamlar)) == 1:
        return False
    toplam = 0
    for i, h in enumerate(reversed(rakamlar)):
        d = int(h)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        toplam += d
    return toplam % 10 == 0


def telefon_gecerli(metin: str) -> bool:
    """Türkiye telefon numarası: (+90 | 0090 | 0) + 10 rakam; alan kodu 2–5 ile başlar."""
    rakamlar = yalniz_rakam(metin)
    if rakamlar.startswith("0090"):
        rakamlar = rakamlar[4:]
    elif rakamlar.startswith("90") and len(rakamlar) == 12:
        rakamlar = rakamlar[2:]
    elif rakamlar.startswith("0"):
        rakamlar = rakamlar[1:]
    return len(rakamlar) == 10 and rakamlar[0] in "2345"
