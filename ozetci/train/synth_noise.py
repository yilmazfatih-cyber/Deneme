"""OCR hatası benzetimi: eğitim metnine denetimli gürültü ekler ki model taranmış belgeye dayanıklı olsun.

Türkçe'ye özgü karışıklıklar (ı/i, ş/s, ğ/g, I/l/1, O/0), satır sonu tireleri, bölünmüş kelimeler,
bitişik harf kalıntıları ve rastgele satır kırılmaları.
"""

from __future__ import annotations

import random

_CONFUSIONS = {
    "ı": ["i", "l", "1"],
    "i": ["ı", "l", "1"],
    "ş": ["s", "ş"],
    "ğ": ["g", "ğ"],
    "ç": ["c"],
    "ö": ["o", "6"],
    "ü": ["u"],
    "İ": ["I", "l"],
    "I": ["l", "1", "İ"],
    "l": ["1", "I"],
    "rn": ["m"],
    "m": ["rn"],
    "e": ["c"],
    "a": ["o"],
}


def _near_digit(text: str, i: int) -> bool:
    return any(0 <= j < len(text) and text[j].isdigit() for j in (i - 1, i, i + 1))


def add_ocr_noise(text: str, rate: float = 0.03, rng: random.Random | None = None) -> str:
    """Karakterlerin yaklaşık ``rate`` kadarını OCR tarzı bozar.

    Rakamlar ve rakama bitişik karakterler (tutar, tarih, numara) hiç değiştirilmez: özetin
    doğrulayacağı bilgiler eğitim girdisinde sağlam kalmalıdır.
    """
    rng = rng or random.Random(0)
    out = []
    i = 0
    while i < len(text):
        two = text[i : i + 2]
        ch = text[i]
        if _near_digit(text, i):
            out.append(ch)
            i += 1
            continue
        if two in _CONFUSIONS and rng.random() < rate:
            out.append(rng.choice(_CONFUSIONS[two]))
            i += 2
            continue
        if ch in _CONFUSIONS and rng.random() < rate:
            out.append(rng.choice(_CONFUSIONS[ch]))
        elif ch == " " and rng.random() < rate / 3:
            out.append(rng.choice(["", "  ", "\n", "- "]))  # boşluk kaybı, satır kırığı
        elif ch.isalpha() and rng.random() < rate / 6:
            out.append("")  # harf düşmesi
        else:
            out.append(ch)
        i += 1
    noisy = "".join(out)
    if rng.random() < 0.3:
        noisy = _hyphenate_random_lines(noisy, rng)
    return noisy


def _hyphenate_random_lines(text: str, rng: random.Random, width: int = 72) -> str:
    """Sabit genişlikte satır kır ve bazı kelimeleri tireyle böl (eski OCR çıktısı gibi)."""
    words = text.split(" ")
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            if len(w) > 6 and rng.random() < 0.3:
                k = rng.randint(2, len(w) - 2)
                lines.append((cur + " " + w[:k] + "-").strip())
                cur = w[k:]
                continue
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return "\n".join(lines)
