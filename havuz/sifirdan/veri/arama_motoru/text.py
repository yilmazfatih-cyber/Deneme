"""Metin çözümleme: Türkçe küçük harf, sözcüklere bölme (konum + karakter aralığı), durak sözcükler,
basit ek kırpma ya da karakter n-gram.

Türkçe tuzak: Python'da 'İ'.lower() == 'i̇' (i + birleşik nokta) ve 'I'.lower() == 'i' (yanlış: 'ı'
olmalı). `lower_tr` önce İ → i, I → ı çevirir, sonra küçültür.
Kesme işaretinden sonrası atılır ("Ankara'ya" → "ankara"). Konumlar durak sözcükleri de sayar: "ev
ve araba" → ev@0, araba@2. Böylece ifade araması durak sözcük atılmış olsa da doğru aralığı bilir.

Genişletme: daha iyi kök bulma için `Analyzer.stem`'i değiştirin (ör. Zemberek benzeri bir sözlüklü
çözümleyici); ek listesi `SUFFIXES`'tadır. Durak sözcük listesi `STOP_WORDS`'tadır.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Kesme işaretli özel adlar tek sözcüktür: "İstanbul'dan" → dizine "istanbul" girer.
_WORD = re.compile(r"\w+(?:['’]\w+)*", re.UNICODE)
_APOSTROPHE = re.compile(r"['’]")

STOP_WORDS = frozenset(
    """
    acaba ama ancak bazı belki ben biz bu bunu bunun şu şunu da de daha diye en gibi hem her hiç
    için ile ise kadar ki mi mı mu mü ne o onu onun sen siz şey ve veya ya yani çok çünkü bir iki
    """.split()
)

# Uzundan kısaya; her turda en uzun uyan ek atılır (en çok iki tur). Kaba ama öngörülebilir.
SUFFIXES = (
    "lerinden", "larından", "lerinde", "larında", "lerini", "larını", "lerine", "larına",
    "lerin", "ların", "leri", "ları", "ler", "lar",
    "nden", "ndan", "nde", "nda", "den", "dan", "ten", "tan", "nin", "nın", "nun", "nün",
    "de", "da", "te", "ta", "in", "ın", "un", "ün", "ye", "ya", "yi", "yı", "yu", "yü",
    "e", "a", "i", "ı", "u", "ü",
)  # fmt: skip


def lower_tr(text: str) -> str:
    """Türkçe küçük harf: 'İSTANBUL IŞIK' → 'istanbul ışık'."""
    return unicodedata.normalize("NFC", text).replace("İ", "i").replace("I", "ı").lower()


def upper_tr(text: str) -> str:
    """Türkçe büyük harf: 'istanbul ılık' → 'İSTANBUL ILIK'."""
    return unicodedata.normalize("NFC", text).replace("i", "İ").replace("ı", "I").upper()


@dataclass(frozen=True)
class Token:
    word: str  # küçük harfli yüzey biçimi ("kitapları")
    terms: tuple[str, ...]  # dizin terimleri (kök ya da n-gram'lar)
    position: int  # sözcük sırası (durak sözcükler de sayılır)
    start: int  # özgün metindeki karakter aralığı (vurgulama için)
    end: int


class Analyzer:
    """mode="stem": durak sözcükleri at + ek kırp. mode="ngram": sözcüğün karakter n-gram'ları."""

    def __init__(self, mode: str = "stem", ngram: int = 3, stop_words: bool = True) -> None:
        if mode not in ("stem", "ngram"):
            raise ValueError("mode 'stem' ya da 'ngram' olmalı")
        self.mode = mode
        self.ngram = ngram
        self.stop_words = stop_words

    def config(self) -> dict[str, object]:
        return {"mode": self.mode, "ngram": self.ngram, "stop_words": self.stop_words}

    def stem(self, word: str) -> str:
        """En çok iki tur ek kırpar; kök en az 2 harf (tek harfli ek için 4) kalır."""
        for _ in range(2):
            for suffix in SUFFIXES:
                minimum = 4 if len(suffix) == 1 else 2
                if word.endswith(suffix) and len(word) - len(suffix) >= minimum:
                    word = word[: -len(suffix)]
                    break
            else:
                break
        return word

    def terms_of(self, word: str) -> tuple[str, ...]:
        if self.mode == "stem":
            return (self.stem(word),)
        if len(word) <= self.ngram:
            return (word,)
        return tuple(word[i : i + self.ngram] for i in range(len(word) - self.ngram + 1))

    def tokens(self, text: str) -> list[Token]:
        """Metni sözcüklere böler; durak sözcükler atılır ama konum sayacı ilerler."""
        result: list[Token] = []
        text = unicodedata.normalize("NFC", text)
        for position, match in enumerate(_WORD.finditer(text)):
            word = lower_tr(_APOSTROPHE.split(match.group())[0])
            if self.stop_words and word in STOP_WORDS:
                continue
            result.append(Token(word, self.terms_of(word), position, match.start(), match.end()))
        return result
