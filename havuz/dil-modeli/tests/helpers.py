"""Testlerin ortak yardımcıları: küçük, belirlenimci sahte derlem ve rastgele metin üretimi.

Genişletme: Yeni bir test rastgele metin isterse `random_text`i kullanın; tohum vermeyi unutmayın.
"""

from __future__ import annotations

import random
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"

# Rastgele metin için karakter havuzu: Türkçe harfler, rakam, noktalama, boşluk türleri, emoji,
# birleşen işaret, başka yazılar. Ön-bölme ve BPE eşlik testleri bunları karıştırır.
ALPHABET = [
    *"abcçdefgğhıijklmnoöprsştuüvyzABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ",
    *"0123456789",
    *" " * 12,
    *"\n\n\t\r",
    *".,;:!?'\"()-_/%+*=<>|",
    *["'d", "'s", "'t", "'ll", "'ve", "'re", "'m", "  ", "   ", " \n", "\r\n"],
    *[
        "🙂",
        "🇹🇷",
        "👨\u200d👩\u200d👧",
        "é",
        "e\u0301",
        "ß",
        "日本",
        "العربية",
        "\u00a0",
        "\u200b",
        "\u2028",
        "x\u0307",
    ],
    *["<|bas|>", "<|son|>", "<|", "|>", "<|asistan|>"],
]


def fixture_text() -> str:
    return (FIXTURES / "metin.txt").read_text(encoding="utf-8")


def make_corpus(lines: int = 400, seed: int = 0) -> list[str]:
    """Örnek metnin kelimelerini rastgele dizerek küçük bir derlem üretir (anlamsız ama tutarlı)."""
    words = fixture_text().split()
    rng = random.Random(seed)
    return [" ".join(rng.choice(words) for _ in range(rng.randint(3, 14))) for _ in range(lines)]


def random_text(rng: random.Random, max_len: int = 40) -> str:
    return "".join(rng.choice(ALPHABET) for _ in range(rng.randint(0, max_len)))
