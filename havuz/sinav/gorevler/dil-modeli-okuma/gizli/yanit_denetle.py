"""Gizli sınav denetimi (dil-modeli-okuma): YANIT.txt'deki beş yanıt kurallara uyuyor mu?

Sınavın Python'uyla çalışır: `python yanit_denetle.py YANIT.txt` (çalışma klasörü temelin kopyası).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from exam.answers import Rule, main

RULES = (
    Rule(1, "<|son|> kimliği", all_of=(r"(?<![\d.,])1(?![\d.,]\d)",)),
    Rule(
        2,
        "top-p varsayılanları",
        all_of=(r"0[.,]95", r"\b1([.,]0)?\b"),
        any_of=(("aynı değil", "farklı", "hayır", "değil"),),
    ),
    Rule(3, "bağlam dolunca", any_of=(("yarı", "// ?2", "half"),)),
    Rule(
        4,
        "öğrenme oranı",
        all_of=(r"optim\.py",),
        any_of=(("ısınma", "warmup"), ("kosinüs", "cosine")),
    ),
    Rule(5, "kapı", all_of=("8430",)),
)

if __name__ == "__main__":
    raise SystemExit(main(RULES))
