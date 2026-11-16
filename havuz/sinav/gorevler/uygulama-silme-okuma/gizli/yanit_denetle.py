"""Gizli sınav denetimi (uygulama-silme-okuma): YANIT.txt'deki beş yanıt kurallara uyuyor mu?

Sınavın Python'uyla çalışır: `python yanit_denetle.py YANIT.txt` (çalışma klasörü temelin kopyası).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from exam.answers import Rule, main

RULES = (
    Rule(
        1,
        "silme işareti",
        all_of=("deleted",),
        any_of=(("silinmez", "silinmiyor", "hayır", "işaret", "mezar"),),
    ),
    Rule(
        2,
        "kalıcı temizlik",
        any_of=(
            (
                "temizlenmez",
                "temizlenmiyor",
                "silinmez",
                "silinmiyor",
                "hiç",
                "uygulanmadı",
                "süresiz",
            ),
        ),
        none_of=(r"\b90\b", r"\b30\b"),
        unless=("uygulanmadı", "uygulanmamış", "tasarım", "öneri"),
    ),
    Rule(3, "işlev ve dosya", all_of=("removeRecord", "restoreRecord", r"records\.ts")),
    Rule(4, "protokol sürümü", all_of=(r"\b1\b", r"sync\.ts")),
    Rule(
        5,
        "işaret silinirse",
        any_of=(
            (
                "görmez",
                "göremez",
                "kaçır",
                "haberi olmaz",
                "bilmez",
                "yerelde",
                "kalmaya devam",
                "göstermeye devam",
                "diril",
                "yeniden doğ",
            ),
        ),
    ),
)

if __name__ == "__main__":
    raise SystemExit(main(RULES))
