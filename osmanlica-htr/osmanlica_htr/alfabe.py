"""Osmanlıca alfabe, metin normalleştirme ve karakter ↔ indeks eşlemesi.

Model Arap harfli Osmanlıca üretir; Latin çevriyazı ayrı bir adımdır. Harekeler
varsayılan olarak atılır çünkü arşiv belgelerinde nadiren yazılır ve CTC'nin
işini zorlaştırır.
"""

from __future__ import annotations

import unicodedata

# Temel Arap harfleri + Osmanlıcaya özgü eklemeler (پ چ ژ گ ڭ) + hemze biçimleri.
HARFLER = "ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوپچژگڭی"
# Osmanlı belgelerinde görülen diğer işaretler.
ISARETLER = "ـ،؛؟٪٫٬.:()«»-/ "
RAKAMLAR = "٠١٢٣٤٥٦٧٨٩0123456789"
HAREKELER = "ًٌٍَُِّْٰ"
# Farsça/Urduca biçimler → Osmanlı yazımında kullanılan karşılıkları.
ESDEGER = {
    # Son konumda ى / ي / ی aynı görünür; tek sembole indirgemek CTC'yi rahatlatır.
    # Kanonik biçim Farsça ye (U+06CC): baş/orta konumda noktalı, sonda noktasız çizilir — Osmanlı yazımı.
    "ي": "ی",
    "ى": "ی",
    "ک": "ك",  # Farsça kef → Arapça kef
    "ۀ": "ه",
    "۰": "٠", "۱": "١", "۲": "٢", "۳": "٣", "۴": "٤", "۵": "٥", "۶": "٦", "۷": "٧", "۸": "٨", "۹": "٩",
    "ە": "ه",
    "ٱ": "ا",
    "ٮ": "ب",
    "‌": "",  # ZWNJ
    "‍": "",  # ZWJ
    "‎": "",
    "‏": "",
    "\t": " ",
}

TEMEL_ALFABE = sorted(set(HARFLER + ISARETLER + RAKAMLAR))

BOSLUK = "<b>"  # CTC blank


def normallestir(metin: str, hareke_at: bool = True, tatvil_at: bool = True) -> str:
    """Sunum biçimlerini (FExx ligatürleri) çöz, eşdeğerleri birleştir, fazlalıkları at."""
    out = []
    for ch in metin:
        o = ord(ch)
        if 0xFB50 <= o <= 0xFDFF or 0xFE70 <= o <= 0xFEFF:
            ch = unicodedata.normalize("NFKC", ch)
        out.append(ch)
    s = "".join(out)
    for k, v in ESDEGER.items():
        s = s.replace(k, v)
    if hareke_at:
        s = "".join(c for c in s if c not in HAREKELER)
    if tatvil_at:
        s = s.replace("ـ", "")
    s = " ".join(s.split())
    return s


class Alfabe:
    """Karakter listesi; 0 indeksi CTC boşluğudur."""

    def __init__(self, karakterler: list[str] | None = None):
        chars = list(karakterler) if karakterler else list(TEMEL_ALFABE)
        if " " not in chars:
            chars.append(" ")
        self.karakterler = [BOSLUK] + sorted(set(chars))
        self._idx = {c: i for i, c in enumerate(self.karakterler)}

    def __len__(self) -> int:
        return len(self.karakterler)

    @property
    def blank(self) -> int:
        return 0

    def kodla(self, metin: str) -> list[int]:
        return [self._idx[c] for c in metin if c in self._idx]

    def coz(self, indeksler: list[int]) -> str:
        return "".join(self.karakterler[i] for i in indeksler if i != 0)

    def bilinmeyenler(self, metin: str) -> set[str]:
        return {c for c in metin if c not in self._idx}

    @classmethod
    def metinlerden(cls, metinler: list[str]) -> "Alfabe":
        chars = set(TEMEL_ALFABE)
        for m in metinler:
            chars.update(normallestir(m))
        return cls(sorted(chars))

    def to_json(self) -> list[str]:
        return self.karakterler[1:]

    @classmethod
    def from_json(cls, data: list[str]) -> "Alfabe":
        return cls(data)
