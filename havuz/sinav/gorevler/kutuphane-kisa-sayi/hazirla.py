"""Başlangıç: temiz temel (özellik ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: kütüphanede bu ad zaten varsa görev anlamını yitirir; aşağıdaki denetim bunu söyler.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if "formatCompactTr" in (kopya / "ts/src/sayi_yazi.ts").read_text(encoding="utf-8"):
        raise RuntimeError("kutuphane'de formatCompactTr zaten var; görevi güncelleyin.")
