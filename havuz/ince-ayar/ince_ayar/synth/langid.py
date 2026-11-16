"""Dil sezgisi: bir metnin Türkçe olup olmadığını kaba ama açıklanabilir bir puanla tahmin eder.

Kim kullanır: sentetik veri hattının dil süzgeci (`synth/filters.py`).

Puan = T / (T + E + 1)
- T: Türkçe kanıtı olan sözcük sayısı (Türkçe'ye özgü harf içeren ya da sık Türkçe sözcük),
- E: sık İngilizce sözcük sayısı,
- +1: kanıtı az olan çok kısa metinleri temkinli tarafta tutar.
Varsayılan eşik 0,5'tir: Türkçe kanıtı, İngilizce kanıtından en az bir fazla olmalı.

Bilinen zaaf: Türkçe harf kullanmadan yazılmış kısa metin ("siparis hazir") reddedilebilir; başka
bir dilde ama Türkçe harfli metin (Azerice) kabul edilebilir. Bu bir **sezgidir**, dil tanıma modeli
değildir; reddedilenler `*.reddedilen.jsonl` dosyasında incelenebilir.

Genişletme: sözcük listelerine ekleme yapınca `tests/test_synth.py` içindeki dil örnekleri yeşil
kalmalıdır.
"""

from __future__ import annotations

import re

from ince_ayar.text_tr import lower_tr

TURKISH_LETTERS = frozenset("çğıöşü")
TURKISH_WORDS = frozenset(
    [
        "ve",
        "bir",
        "bu",
        "için",
        "ile",
        "da",
        "de",
        "mi",
        "mı",
        "mu",
        "mü",
        "ne",
        "çok",
        "daha",
        "olarak",
        "gibi",
        "ama",
        "veya",
        "her",
        "en",
        "olan",
        "sonra",
        "kadar",
        "nasıl",
        "neden",
        "şu",
        "ise",
        "değil",
        "var",
        "yok",
        "ben",
        "sen",
        "biz",
        "siz",
        "onlar",
        "ki",
        "ya",
        "hem",
        "göre",
        "üzere",
        "lütfen",
        "evet",
        "hayır",
        "hangi",
        "kaç",
        "nerede",
        "zaman",
        "önce",
        "şimdi",
        "gün",
        "yıl",
        "ay",
        "saat",
        "bunu",
        "şunu",
        "olur",
        "olabilir",
        "yapabilirsiniz",
        "edebilirsiniz",
        "gerekir",
    ]
)
ENGLISH_WORDS = frozenset(
    [
        "the",
        "and",
        "is",
        "are",
        "of",
        "to",
        "in",
        "for",
        "with",
        "that",
        "this",
        "you",
        "it",
        "on",
        "be",
        "as",
        "at",
        "by",
        "or",
        "an",
        "was",
        "not",
        "can",
        "will",
        "your",
        "have",
        "from",
        "what",
        "how",
        "when",
        "where",
        "which",
        "please",
        "thank",
        "yes",
        "no",
        "do",
        "does",
        "should",
        "would",
        "could",
    ]
)
_WORD = re.compile(r"\w+", re.UNICODE)


def turkish_score(text: str) -> float:
    """0–1 arası Türkçe puanı (bkz. dosya başlığı)."""
    words = _WORD.findall(lower_tr(text))
    turkish = sum(
        1 for word in words if word in TURKISH_WORDS or any(ch in TURKISH_LETTERS for ch in word)
    )
    english = sum(1 for word in words if word in ENGLISH_WORDS)
    return turkish / (turkish + english + 1)


def looks_turkish(text: str, threshold: float = 0.5) -> bool:
    return turkish_score(text) >= threshold
